//! Native llama.cpp engine behind the `LocalLM` contract (spec §5.2): one worker thread owns the
//! model and its context; Tauri commands talk to it over a channel and stream deltas back.

use std::num::NonZeroU32;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::sync::OnceLock;
use std::time::Instant;

use llama_cpp_2::context::params::{LlamaContextParams, LlamaPoolingType};
use llama_cpp_2::context::LlamaContext;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::{AddBos, LlamaChatMessage, LlamaModel};
use llama_cpp_2::sampling::LlamaSampler;
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::State;
use tokio::sync::oneshot;

#[cfg(feature = "cuda")]
pub const BACKEND: &str = "cuda";
#[cfg(all(feature = "vulkan", not(feature = "cuda")))]
pub const BACKEND: &str = "vulkan";
#[cfg(all(target_os = "macos", not(any(feature = "cuda", feature = "vulkan"))))]
pub const BACKEND: &str = "metal";
#[cfg(not(any(feature = "cuda", feature = "vulkan", target_os = "macos")))]
pub const BACKEND: &str = "cpu";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadRequest {
  pub path: String,
  pub n_ctx: u32,
  pub gpu_layers: Option<u32>,
  pub threads: Option<i32>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LoadedInfo {
  pub load_ms: u64,
  pub n_ctx: u32,
  pub n_ctx_train: u32,
  pub gpu: bool,
  pub backend: &'static str,
  pub threads: i32,
  pub desc: String,
  pub size_mb: u64,
  pub n_params: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbedRequest {
  pub path: String,
  pub texts: Vec<String>,
}

#[derive(Deserialize, Clone)]
pub struct WireMessage {
  pub role: String,
  pub content: String,
}

#[derive(Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GenOpts {
  pub max_tokens: Option<u32>,
  pub temperature: Option<f32>,
  pub top_p: Option<f32>,
  pub stop: Option<Vec<String>>,
  pub reasoning: Option<bool>,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
  pub prompt_tokens: u32,
  pub completion_tokens: u32,
  pub ttft_ms: f64,
  pub tok_per_sec: f64,
}

/// Mirrors `Delta` in `@inborn/core`; `error` is the one extra field the adapter turns into a rejection.
#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Delta {
  #[serde(skip_serializing_if = "Option::is_none")]
  pub text: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub reasoning: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub done: Option<Usage>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<String>,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
  pub tok_per_sec: f64,
  pub ttft_ms: f64,
  pub ctx_used: u32,
  pub mem_mb: u64,
}

/// Milliseconds since the engine thread started, so the log shows what the first launch spends on Metal setup.
fn uptime_ms() -> u128 {
  static START: OnceLock<Instant> = OnceLock::new();
  START.get_or_init(Instant::now).elapsed().as_millis()
}

enum Cmd {
  Load(LoadRequest, oneshot::Sender<Result<LoadedInfo, String>>),
  Embed(EmbedRequest, oneshot::Sender<Result<Vec<Vec<f32>>, String>>),
  Generate(Vec<WireMessage>, GenOpts, Channel<Delta>, Arc<AtomicBool>, oneshot::Sender<Result<Usage, String>>),
  Unload(oneshot::Sender<()>),
}

pub struct Engine {
  tx: Mutex<mpsc::Sender<Cmd>>,
  abort: Arc<AtomicBool>,
  busy: AtomicBool,
  stats: Mutex<Stats>,
}

impl Engine {
  pub fn start() -> Self {
    let (tx, rx) = mpsc::channel();
    std::thread::Builder::new().name("inborn-llama".into()).spawn(move || worker(rx)).expect("engine thread");
    Engine { tx: Mutex::new(tx), abort: Arc::new(AtomicBool::new(false)), busy: AtomicBool::new(false), stats: Mutex::new(Stats::default()) }
  }

  fn send(&self, cmd: Cmd) -> Result<(), String> {
    self.tx.lock().map_err(|e| e.to_string())?.send(cmd).map_err(|_| "engine thread is gone".to_string())
  }

  /// Used by the tray "Quit" and by exit handling so the weights are released before the process ends.
  pub fn unload_blocking(&self) {
    self.abort.store(true, Ordering::Relaxed);
    let (reply, wait) = oneshot::channel();
    if self.send(Cmd::Unload(reply)).is_ok() {
      let _ = wait.blocking_recv();
    }
  }
}

struct Loaded {
  // Declared before `model` so it drops first: the context borrows the (boxed, address-stable) model.
  ctx: LlamaContext<'static>,
  model: Box<LlamaModel>,
  bos: String,
}

fn worker(rx: mpsc::Receiver<Cmd>) {
  uptime_ms();
  let mut backend = match LlamaBackend::init() {
    Ok(b) => b,
    Err(e) => {
      eprintln!("[inborn] llama backend failed: {e}");
      return;
    }
  };
  if !cfg!(debug_assertions) {
    backend.void_logs();
  }
  eprintln!("[inborn] +{} ms {} backend ready", uptime_ms(), BACKEND);
  let mut loaded: Option<Loaded> = None;
  let mut embedder: Option<EmbedLoaded> = None;
  while let Ok(cmd) = rx.recv() {
    match cmd {
      Cmd::Embed(req, reply) => {
        if embedder.as_ref().map(|e| e.path != req.path).unwrap_or(true) {
          embedder = None;
          match load_embedder(&backend, &req.path) {
            Ok(e) => embedder = Some(e),
            Err(e) => {
              let _ = reply.send(Err(e));
              continue;
            }
          }
        }
        let result = embed(embedder.as_mut().expect("embedder loaded"), &req.texts);
        let _ = reply.send(result);
      }
      Cmd::Load(req, reply) => {
        loaded = None;
        let result = load(&backend, &req);
        let _ = reply.send(result.map(|(l, info)| {
          loaded = Some(l);
          info
        }));
      }
      Cmd::Generate(messages, opts, channel, abort, reply) => {
        let result = match loaded.as_mut() {
          Some(l) => generate(l, &messages, &opts, &channel, &abort),
          None => Err("model not loaded".into()),
        };
        if let Err(e) = &result {
          let _ = channel.send(Delta { error: Some(e.clone()), ..Default::default() });
        }
        let _ = reply.send(result);
      }
      Cmd::Unload(reply) => {
        loaded = None;
        embedder = None;
        let _ = reply.send(());
      }
    }
  }
}

fn default_threads() -> i32 {
  let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4) as i32;
  (cores / 2).clamp(2, 8)
}

fn load(backend: &LlamaBackend, req: &LoadRequest) -> Result<(Loaded, LoadedInfo), String> {
  let started = Instant::now();
  let gpu_layers = req.gpu_layers.unwrap_or(999);
  let threads = req.threads.unwrap_or_else(default_threads);
  let model_params = LlamaModelParams::default().with_n_gpu_layers(gpu_layers).with_use_mlock(true);
  let model = Box::new(LlamaModel::load_from_file(backend, &req.path, &model_params).map_err(|e| e.to_string())?);
  let n_ctx = req.n_ctx.max(512);
  let ctx_params = LlamaContextParams::default()
    .with_n_ctx(NonZeroU32::new(n_ctx))
    .with_n_batch(512)
    .with_n_threads(threads)
    .with_n_threads_batch(threads)
    .with_no_perf(false);
  let ctx = model.new_context(backend, ctx_params).map_err(|e| e.to_string())?;
  // SAFETY: the model lives in a Box whose address never moves and `Loaded` drops the context first.
  let ctx: LlamaContext<'static> = unsafe { std::mem::transmute::<LlamaContext<'_>, LlamaContext<'static>>(ctx) };
  let bos_id = model.token_bos();
  let mut decoder = encoding_rs::UTF_8.new_decoder();
  let bos = if bos_id.0 < 0 { String::new() } else { model.token_to_piece(bos_id, &mut decoder, true, None).unwrap_or_default() };
  let desc = model.meta_val_str("general.name").unwrap_or_else(|_| "GGUF".into());
  let info = LoadedInfo {
    load_ms: started.elapsed().as_millis() as u64,
    n_ctx: ctx.n_ctx(),
    n_ctx_train: model.n_ctx_train(),
    gpu: backend.supports_gpu_offload() && gpu_layers > 0,
    backend: BACKEND,
    threads,
    desc,
    size_mb: model.size() / 1_048_576,
    n_params: model.n_params(),
  };
  eprintln!("[inborn] +{} ms loaded {} ({} MB) in {} ms · backend={} gpu={} threads={} nCtx={}", uptime_ms(), req.path, info.size_mb, info.load_ms, BACKEND, info.gpu, threads, info.n_ctx);
  Ok((Loaded { ctx, model, bos }, info))
}

struct EmbedLoaded {
  // Same drop order as `Loaded`: the context borrows the boxed model.
  ctx: LlamaContext<'static>,
  model: Box<LlamaModel>,
  path: String,
  n_ctx: usize,
}

/// The embedding companion gets its own model + context: one llama context is either chat or embeddings.
fn load_embedder(backend: &LlamaBackend, path: &str) -> Result<EmbedLoaded, String> {
  let started = Instant::now();
  let model_params = LlamaModelParams::default().with_n_gpu_layers(999);
  let model = Box::new(LlamaModel::load_from_file(backend, path, &model_params).map_err(|e| e.to_string())?);
  // A BERT past its trained positions aborts llama.cpp (GGML_ASSERT in get_rows), so tokens are cut at n_ctx_train.
  let n_ctx: u32 = 2048.min(model.n_ctx_train().max(1));
  // Non-causal (BERT) attention needs the whole sequence in one micro-batch.
  let ctx_params = LlamaContextParams::default()
    .with_n_ctx(NonZeroU32::new(n_ctx))
    .with_n_batch(n_ctx)
    .with_n_ubatch(n_ctx)
    .with_n_threads(default_threads())
    .with_n_threads_batch(default_threads())
    .with_embeddings(true)
    .with_pooling_type(LlamaPoolingType::Mean);
  let ctx = model.new_context(backend, ctx_params).map_err(|e| e.to_string())?;
  // SAFETY: as for `Loaded`: the model is boxed (stable address) and dropped after the context.
  let ctx: LlamaContext<'static> = unsafe { std::mem::transmute::<LlamaContext<'_>, LlamaContext<'static>>(ctx) };
  eprintln!("[inborn] +{} ms embedding model {} loaded in {} ms · n_embd={}", uptime_ms(), path, started.elapsed().as_millis(), model.n_embd());
  Ok(EmbedLoaded { ctx, model, path: path.to_string(), n_ctx: n_ctx as usize })
}

fn embed(e: &mut EmbedLoaded, texts: &[String]) -> Result<Vec<Vec<f32>>, String> {
  let mut out = Vec::with_capacity(texts.len());
  for text in texts {
    let mut tokens = e.model.str_to_token(text, AddBos::Always).map_err(|err| err.to_string())?;
    tokens.truncate(e.n_ctx);
    let mut batch = LlamaBatch::new(e.n_ctx, 1);
    for (i, t) in tokens.iter().enumerate() {
      batch.add(*t, i as i32, &[0], true).map_err(|err| err.to_string())?;
    }
    e.ctx.clear_kv_cache();
    e.ctx.decode(&mut batch).map_err(|err| err.to_string())?;
    let v = e.ctx.embeddings_seq_ith(0).map_err(|err| err.to_string())?;
    let norm = v.iter().map(|x| x * x).sum::<f32>().sqrt().max(1e-12);
    out.push(v.iter().map(|x| x / norm).collect());
  }
  Ok(out)
}

fn render_jinja(src: &str, messages: &[WireMessage], reasoning: bool, bos: &str) -> Result<String, minijinja::Error> {
  let mut env = minijinja::Environment::new();
  minijinja_contrib::add_to_environment(&mut env);
  env.set_unknown_method_callback(minijinja_contrib::pycompat::unknown_method_callback);
  env.add_template_owned("chat", src.to_string())?;
  let msgs: Vec<minijinja::Value> = messages
    .iter()
    .map(|m| minijinja::context! { role => m.role.as_str(), content => m.content.as_str() })
    .collect();
  env.get_template("chat")?.render(minijinja::context! {
    messages => msgs,
    add_generation_prompt => true,
    enable_thinking => reasoning,
    bos_token => bos,
    eos_token => "",
  })
}

/// The GGUF's own Jinja template (thinking switch included); llama.cpp's built-in renderer is the fallback.
fn render_prompt(loaded: &Loaded, messages: &[WireMessage], reasoning: bool) -> Result<String, String> {
  let template = loaded.model.chat_template(None).map_err(|e| format!("model has no chat template: {e}"))?;
  let src = template.to_str().map_err(|e| e.to_string())?;
  match render_jinja(src, messages, reasoning, &loaded.bos) {
    Ok(prompt) => Ok(prompt),
    Err(e) => {
      eprintln!("[inborn] jinja template failed ({e}); using llama.cpp's template renderer");
      let chat = messages
        .iter()
        .map(|m| LlamaChatMessage::new(m.role.clone(), m.content.clone()))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
      let mut prompt = loaded.model.apply_chat_template(&template, &chat, true).map_err(|e| e.to_string())?;
      if !reasoning && src.contains("enable_thinking") {
        prompt.push_str("<think>\n\n</think>\n\n");
      }
      Ok(prompt)
    }
  }
}

fn sampler(opts: &GenOpts) -> LlamaSampler {
  let temperature = opts.temperature.unwrap_or(0.7);
  if temperature <= 0.0 {
    return LlamaSampler::greedy();
  }
  let seed = rand::random::<u32>();
  LlamaSampler::chain_simple([
    LlamaSampler::top_k(40),
    LlamaSampler::top_p(opts.top_p.unwrap_or(0.9), 1),
    LlamaSampler::min_p(0.05, 1),
    LlamaSampler::temp(temperature),
    LlamaSampler::dist(seed),
  ])
}

const THINK_OPEN: &str = "<think>";
const THINK_CLOSE: &str = "</think>";

/// Splits the stream into reasoning and answer text; a tag can arrive split across tokens, so a partial tail is held back.
struct ThinkParser {
  buf: String,
  thinking: bool,
  after_close: bool,
}

impl ThinkParser {
  fn new() -> Self {
    ThinkParser { buf: String::new(), thinking: false, after_close: false }
  }

  fn push(&mut self, piece: &str, out: &mut Vec<Delta>) {
    self.buf.push_str(piece);
    loop {
      let tag = if self.thinking { THINK_CLOSE } else { THINK_OPEN };
      if let Some(at) = self.buf.find(tag) {
        let before = self.buf[..at].to_string();
        self.emit(&before, out);
        self.buf.drain(..at + tag.len());
        self.thinking = !self.thinking;
        self.after_close = !self.thinking;
        continue;
      }
      let keep = (1..tag.len()).rev().find(|&n| self.buf.ends_with(&tag[..n])).unwrap_or(0);
      let ready = self.buf[..self.buf.len() - keep].to_string();
      self.emit(&ready, out);
      self.buf.drain(..self.buf.len() - keep);
      return;
    }
  }

  fn flush(&mut self, out: &mut Vec<Delta>) {
    let rest = std::mem::take(&mut self.buf);
    self.emit(&rest, out);
  }

  fn emit(&mut self, s: &str, out: &mut Vec<Delta>) {
    let s = if self.after_close && !self.thinking {
      let trimmed = s.trim_start();
      if trimmed.is_empty() {
        return;
      }
      self.after_close = false;
      trimmed
    } else {
      s
    };
    if s.is_empty() {
      return;
    }
    if self.thinking {
      out.push(Delta { reasoning: Some(s.to_string()), ..Default::default() });
    } else {
      out.push(Delta { text: Some(s.to_string()), ..Default::default() });
    }
  }
}

fn generate(loaded: &mut Loaded, messages: &[WireMessage], opts: &GenOpts, channel: &Channel<Delta>, abort: &AtomicBool) -> Result<Usage, String> {
  let started = Instant::now();
  let prompt = render_prompt(loaded, messages, opts.reasoning.unwrap_or(true))?;
  let tokens = loaded.model.str_to_token(&prompt, AddBos::Never).map_err(|e| e.to_string())?;
  let n_ctx = loaded.ctx.n_ctx() as usize;
  if tokens.len() + 16 > n_ctx {
    return Err(format!("the conversation ({} tokens) does not fit the {n_ctx}-token context", tokens.len()));
  }
  let budget = (opts.max_tokens.unwrap_or(1024) as usize).min(n_ctx - tokens.len() - 1);
  let stops = opts.stop.clone().unwrap_or_default();
  let hold = stops.iter().map(|s| s.len()).max().unwrap_or(1).saturating_sub(1);

  loaded.ctx.clear_kv_cache();
  loaded.ctx.reset_timings();
  let n_batch = loaded.ctx.n_batch().max(1) as usize;
  let mut batch = LlamaBatch::new(n_batch, 1);
  let mut pos: i32 = 0;
  for chunk in tokens.chunks(n_batch) {
    if abort.load(Ordering::Relaxed) {
      return finish(loaded, channel, tokens.len(), 0, 0.0, None);
    }
    batch.clear();
    let ends_prompt = pos as usize + chunk.len() == tokens.len();
    for (i, t) in chunk.iter().enumerate() {
      batch.add(*t, pos + i as i32, &[0], ends_prompt && i + 1 == chunk.len()).map_err(|e| e.to_string())?;
    }
    loaded.ctx.decode(&mut batch).map_err(|e| e.to_string())?;
    pos += chunk.len() as i32;
  }

  let mut sampler = sampler(opts);
  let mut decoder = encoding_rs::UTF_8.new_decoder();
  let mut parser = ThinkParser::new();
  let mut deltas: Vec<Delta> = Vec::new();
  let mut pending = String::new();
  let mut ttft_ms = 0.0;
  let mut first_token: Option<Instant> = None;
  let mut n_gen: u32 = 0;
  'gen: while (n_gen as usize) < budget {
    let token = sampler.sample(&loaded.ctx, batch.n_tokens() - 1);
    sampler.accept(token);
    if loaded.model.is_eog_token(token) {
      break;
    }
    if first_token.is_none() {
      ttft_ms = started.elapsed().as_secs_f64() * 1000.0;
      first_token = Some(Instant::now());
    }
    n_gen += 1;
    let piece = loaded.model.token_to_piece(token, &mut decoder, true, None).map_err(|e| e.to_string())?;
    deltas.clear();
    parser.push(&piece, &mut deltas);
    for d in deltas.drain(..) {
      if let Some(text) = d.text {
        pending.push_str(&text);
        if let Some(at) = stops.iter().filter_map(|s| pending.find(s.as_str())).min() {
          pending.truncate(at);
          if !pending.is_empty() {
            channel.send(Delta { text: Some(std::mem::take(&mut pending)), ..Default::default() }).map_err(|e| e.to_string())?;
          }
          break 'gen;
        }
        if pending.len() > hold {
          let cut = floor_char(&pending, pending.len() - hold);
          let ready: String = pending.drain(..cut).collect();
          if !ready.is_empty() {
            channel.send(Delta { text: Some(ready), ..Default::default() }).map_err(|e| e.to_string())?;
          }
        }
      } else {
        channel.send(d).map_err(|e| e.to_string())?;
      }
    }
    if abort.load(Ordering::Relaxed) {
      break;
    }
    batch.clear();
    batch.add(token, pos, &[0], true).map_err(|e| e.to_string())?;
    pos += 1;
    loaded.ctx.decode(&mut batch).map_err(|e| e.to_string())?;
  }
  deltas.clear();
  parser.flush(&mut deltas);
  for d in deltas.drain(..) {
    if let Some(text) = d.text {
      pending.push_str(&text);
    } else {
      channel.send(d).map_err(|e| e.to_string())?;
    }
  }
  if !pending.is_empty() {
    channel.send(Delta { text: Some(pending), ..Default::default() }).map_err(|e| e.to_string())?;
  }
  finish(loaded, channel, tokens.len(), n_gen, ttft_ms, first_token)
}

fn floor_char(s: &str, mut i: usize) -> usize {
  while i > 0 && !s.is_char_boundary(i) {
    i -= 1;
  }
  i
}

fn finish(loaded: &mut Loaded, channel: &Channel<Delta>, prompt_tokens: usize, completion_tokens: u32, ttft_ms: f64, first_token: Option<Instant>) -> Result<Usage, String> {
  let timings = loaded.ctx.timings();
  // Decode rate from the first sampled token to the last, the same window wllama and llama.rn report.
  let tok_per_sec = match first_token {
    Some(t0) if completion_tokens > 1 => (completion_tokens - 1) as f64 / t0.elapsed().as_secs_f64().max(1e-6),
    _ => if timings.t_eval_ms() > 0.0 { timings.n_eval() as f64 * 1000.0 / timings.t_eval_ms() } else { 0.0 },
  };
  let usage = Usage { prompt_tokens: prompt_tokens as u32, completion_tokens, ttft_ms, tok_per_sec };
  eprintln!(
    "[inborn] +{} ms generated {} tokens · {:.1} tok/s · TTFT {:.0} ms · prompt {} tokens at {:.1} tok/s",
    uptime_ms(),
    completion_tokens,
    tok_per_sec,
    ttft_ms,
    prompt_tokens,
    if timings.t_p_eval_ms() > 0.0 { timings.n_p_eval() as f64 * 1000.0 / timings.t_p_eval_ms() } else { 0.0 }
  );
  channel.send(Delta { done: Some(usage.clone()), ..Default::default() }).map_err(|e| e.to_string())?;
  Ok(usage)
}

#[tauri::command]
pub async fn lm_load(engine: State<'_, Engine>, request: LoadRequest) -> Result<LoadedInfo, String> {
  let (reply, wait) = oneshot::channel();
  engine.send(Cmd::Load(request, reply))?;
  let info = wait.await.map_err(|_| "engine thread is gone".to_string())??;
  *engine.stats.lock().map_err(|e| e.to_string())? = Stats { mem_mb: info.size_mb, ..Default::default() };
  Ok(info)
}

#[tauri::command]
pub async fn lm_generate(engine: State<'_, Engine>, messages: Vec<WireMessage>, opts: GenOpts, on_delta: Channel<Delta>) -> Result<Usage, String> {
  if engine.busy.swap(true, Ordering::AcqRel) {
    return Err("a generation is already running".into());
  }
  engine.abort.store(false, Ordering::Relaxed);
  let (reply, wait) = oneshot::channel();
  let sent = engine.send(Cmd::Generate(messages, opts, on_delta, engine.abort.clone(), reply));
  let result = match sent {
    Ok(()) => wait.await.map_err(|_| "engine thread is gone".to_string()).and_then(|r| r),
    Err(e) => Err(e),
  };
  engine.busy.store(false, Ordering::Release);
  let usage = result?;
  if let Ok(mut stats) = engine.stats.lock() {
    *stats = Stats { tok_per_sec: usage.tok_per_sec, ttft_ms: usage.ttft_ms, ctx_used: usage.prompt_tokens + usage.completion_tokens, mem_mb: stats.mem_mb };
  }
  Ok(usage)
}

/// Embeddings for the document index (spec §5.5); loads the companion model on first use and keeps it until unload.
#[tauri::command]
pub async fn lm_embed(engine: State<'_, Engine>, request: EmbedRequest) -> Result<Vec<Vec<f32>>, String> {
  let (reply, wait) = oneshot::channel();
  engine.send(Cmd::Embed(request, reply))?;
  wait.await.map_err(|_| "engine thread is gone".to_string())?
}

#[tauri::command]
pub fn lm_abort(engine: State<'_, Engine>) {
  engine.abort.store(true, Ordering::Relaxed);
}

#[tauri::command]
pub fn lm_stats(engine: State<'_, Engine>) -> Result<Stats, String> {
  Ok(engine.stats.lock().map_err(|e| e.to_string())?.clone())
}

#[tauri::command]
pub async fn lm_unload(engine: State<'_, Engine>) -> Result<(), String> {
  engine.abort.store(true, Ordering::Relaxed);
  let (reply, wait) = oneshot::channel();
  engine.send(Cmd::Unload(reply))?;
  wait.await.map_err(|_| "engine thread is gone".to_string())?;
  *engine.stats.lock().map_err(|e| e.to_string())? = Stats::default();
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  fn run(pieces: &[&str]) -> (String, String) {
    let mut p = ThinkParser::new();
    let mut out = Vec::new();
    for piece in pieces {
      p.push(piece, &mut out);
    }
    p.flush(&mut out);
    let text: String = out.iter().filter_map(|d| d.text.clone()).collect();
    let reasoning: String = out.iter().filter_map(|d| d.reasoning.clone()).collect();
    (text, reasoning)
  }

  #[test]
  fn splits_reasoning_even_when_tags_arrive_in_pieces() {
    assert_eq!(run(&["<thi", "nk>plan", "</th", "ink>\n\nanswer"]), ("answer".into(), "plan".into()));
  }

  #[test]
  fn plain_text_passes_through() {
    assert_eq!(run(&["hello ", "<b>world"]), ("hello <b>world".into(), String::new()));
  }
}
