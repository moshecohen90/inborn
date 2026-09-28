/* wllama's package "main" points at its TypeScript sources; esm/ carries the built JS plus .d.ts. */
import { LoggerWithoutDebug, LogLevel, Wllama } from "@wllama/wllama/esm/index.js";
import type { ChatCompletionChunk, ChatCompletionMessage, ChatCompletionParams } from "@wllama/wllama/esm/index.js";
import { ANSWER_CEILING, prefillText, sampling, type Capabilities, type Delta, type Embedder, type GenOpts, type LoadOptions, type LocalLM, type Message, type ModelRef, type Session, type Stats } from "@inborn/core";
import { fileOfUri, modelFile } from "../web/opfs";
import { recordPhotoMs } from "../extensions/timeHint";
import { photoForEngine } from "../images/vision";

/* Copied out of node_modules by `pnpm wasm` (apps/mobile/package.json): always our origin, never a CDN. */
const WASM_PATHS = { default: "/wllama/wllama.wasm" };
const COMPAT_PATHS = { worker: "/wllama/compat/wllama.js", wasm: "/wllama/compat/wllama.wasm" };

/** llama-server streams Qwen "thinking" as reasoning_content, which wllama's chunk type leaves out. */
/** llama-server's sampler fields the wasm reads (F414). */
interface ServerSampling {
  dry_multiplier: number;
  dry_base: number;
  dry_allowed_length: number;
  dry_penalty_last_n: number;
  dry_sequence_breakers: string[];
  presence_penalty: number;
  frequency_penalty: number;
}

type ChunkDelta = ChatCompletionChunk["choices"][number]["delta"] & { reasoning_content?: string | null };
type GpuNavigator = Navigator & { gpu?: { requestAdapter(): Promise<unknown | null> } };
type MemoryPerformance = Performance & { measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }> };

/* WASM threads need SharedArrayBuffer, which the browser only hands out under COOP/COEP (spec §4.4); wllama fixes the count at load, so GenOpts.threads waits for the next load. */
const threadCount = (requested: number | undefined): number =>
  globalThis.crossOriginIsolated ? Math.max(1, requested ?? Math.floor((navigator.hardwareConcurrency || 2) / 2)) : 1;

async function gpuLayers(requested: number | undefined): Promise<number> {
  const gpu = (navigator as GpuNavigator).gpu;
  if (requested === 0 || !gpu) return 0;
  const adapter = await Promise.race([gpu.requestAdapter(), new Promise<null>((r) => setTimeout(() => r(null), 3000))]).catch(() => null);
  return adapter ? (requested ?? 99) : 0;
}

function toWllamaMessage(m: Message): ChatCompletionMessage {
  if (m.role === "tool") throw new Error("tool messages need tool calling, which the web tier does not support");
  return { role: m.role, content: m.content };
}

/**
 * A stored photo as the bytes wllama hands the projector. The page's CSP allows `connect-src 'self'` only, so a
 * data: URL is decoded here instead of fetched.
 */
async function imageBytes(uri: string): Promise<ArrayBuffer> {
  const comma = uri.indexOf(",");
  if (uri.startsWith("data:") && comma > 0) {
    const meta = uri.slice(5, comma);
    const body = uri.slice(comma + 1);
    if (!meta.endsWith(";base64")) return new TextEncoder().encode(decodeURIComponent(body)).buffer as ArrayBuffer;
    const bin = atob(body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }
  const res = await fetch(uri);
  if (!res.ok) throw new Error(`photo unreadable (${res.status})`);
  return res.arrayBuffer();
}

/* Photos are 1024 px, or 512 px on the CPU path (F417), when they get here; 512 image tokens is what the phones use, and fewer misread text. */
const IMAGE_MAX_TOKENS = 512;
/* wllama 3.6.1 never returns from an image encode with 3 or more WASM threads (round 105, headless Chromium); 2 works. */
const VISION_MAX_THREADS = 2;

const isAbort = (e: unknown): boolean => e instanceof Error && e.name === "AbortError";

/** wllama adapter (llama.cpp in WebAssembly, WebGPU when the browser has an adapter). Loads the GGUF from our own origin only. */
export class WllamaLM implements LocalLM {
  readonly id = "wllama" as const;
  private wllama: Wllama | null = null;
  private session: Session | null = null;
  private last: Stats = { tokPerSec: 0, ttftMs: 0, ctxUsed: 0, memMB: 0 };
  private opts: LoadOptions | null = null;
  private mmproj: string | null = null;
  private vision = false;
  private onGpu = false;
  /** Timings of the last load and the last photo turn, for the headless measurement (round 105). */
  devInfo: Record<string, unknown> = {};

  capabilities(): Capabilities {
    /* One llama-server context is either chat or embeddings, never both; RAG gets its own session later. */
    return { vision: this.vision, tools: false, embeddings: false, maxContext: this.session?.nCtx ?? 4096, continuation: true };
  }

  private async start(model: ModelRef, opts: LoadOptions, mmproj: string | null): Promise<Wllama> {
    const started = performance.now();
    const layers = await gpuLayers(opts.gpuLayers);
    const threads = mmproj ? Math.min(VISION_MAX_THREADS, threadCount(opts.threads)) : threadCount(opts.threads);
    const wllama = new Wllama(WASM_PATHS, { logger: LoggerWithoutDebug, allowOffline: true });
    wllama.setCompat(COMPAT_PATHS);
    const params = { n_ctx: opts.nCtx, n_threads: threads, n_gpu_layers: layers, jinja: true, chat_template: model.chatTemplate, log_level: LogLevel.WARN, ...(mmproj ? { image_max_tokens: IMAGE_MAX_TOKENS } : {}) };
    const opfs = fileOfUri(model.uri);
    const projector = mmproj ? fileOfUri(mmproj) : null;
    /* opfs:// is the delivered GGUF on this device (src/web/opfs.ts): no network, wllama reads the File in slices.
       wllama tells the projector from the model by its GGUF architecture (clip), so the order does not matter. */
    if (opfs) await wllama.loadModel([await modelFile(opfs), ...(projector ? [await modelFile(projector)] : [])], params);
    else await wllama.loadModelFromUrl(mmproj ? { url: model.uri, mmprojUrl: mmproj } : model.uri, params);
    const ms = Math.round(performance.now() - started);
    this.devInfo = { ...this.devInfo, loadMs: ms, gpuLayers: layers, threads: wllama.getNumThreads(), vision: !!mmproj };
    console.info(
      `[wllama] loaded ${model.id}${mmproj ? " + projector" : ""} in ${ms} ms · threads=${wllama.getNumThreads()} isolated=${globalThis.crossOriginIsolated} gpuLayers=${layers} nCtx=${opts.nCtx} libllama=${Wllama.getLibllamaVersion()}`,
    );
    return wllama;
  }

  async load(model: ModelRef, opts: LoadOptions): Promise<Session> {
    await this.unload();
    this.wllama = await this.start(model, opts, null);
    this.opts = opts;
    this.session = { model, nCtx: opts.nCtx };
    return this.session;
  }

  /**
   * Round 105: the photo projector joins the loaded model. llama-server takes the projector only at load, so the
   * model is loaded again with both files; the session object stays, so the chat never sees a new one.
   */
  async enableVision(mmprojUri: string): Promise<boolean> {
    const session = this.session;
    if (!session || !this.opts) throw new Error("model not loaded");
    if (this.vision && this.mmproj === mmprojUri) return true;
    const old = this.wllama;
    this.wllama = null;
    await old?.exit();
    try {
      const wllama = await this.start(session.model, this.opts, mmprojUri);
      this.wllama = wllama;
      this.vision = wllama.supportInputModality("image");
      this.onGpu = (this.devInfo.gpuLayers as number) > 0;
    } catch (e: unknown) {
      console.warn("[wllama] projector did not load", e instanceof Error ? e.message : e);
      this.vision = false;
      this.wllama = await this.start(session.model, this.opts, null);
    }
    this.mmproj = this.vision ? mmprojUri : null;
    return this.vision;
  }

  async unload(): Promise<void> {
    const wllama = this.wllama;
    this.wllama = null;
    this.session = null;
    this.opts = null;
    this.vision = false;
    this.onGpu = false;
    this.mmproj = null;
    await wllama?.exit();
  }

  private async toRequestMessages(messages: Message[]): Promise<ChatCompletionMessage[]> {
    const out: ChatCompletionMessage[] = [];
    for (const m of messages) {
      if (!m.images?.length || !this.vision || m.role !== "user") {
        out.push(toWllamaMessage(m));
        continue;
      }
      const images = await Promise.all(m.images.map(async (uri) => imageBytes(await photoForEngine(uri, this.onGpu))));
      out.push({ role: "user", content: [...images.map((data) => ({ type: "image" as const, data })), { type: "text" as const, text: m.content }] } as ChatCompletionMessage);
    }
    return out;
  }

  async *generate(session: Session, messages: Message[], opts: GenOpts, signal: AbortSignal): AsyncIterable<Delta> {
    const wllama = this.wllama;
    if (!wllama || session !== this.session) throw new Error("model not loaded");
    const started = performance.now();
    let ttft = 0;
    let tokPerSec = 0;
    let promptTokens = 0;
    let completionTokens = 0;
    let chunks = 0;
    let timings: { cache_n?: number; prompt_n?: number } | null = null;
    const sampler = sampling(opts);
    const photos = messages.reduce((n, m) => n + (this.vision && m.role === "user" ? (m.images?.length ?? 0) : 0), 0);
    const wireMessages = await this.toRequestMessages(messages);
    /* F443: llama-server opens the assistant turn with this message (continue_final_message) and streams only what follows. */
    const cont = opts.continueFrom;
    if (cont) wireMessages.push({ role: "assistant", content: prefillText(cont.text), ...(cont.reasoning ? { reasoning_content: cont.reasoning } : {}) } as ChatCompletionMessage);
    /* The wasm server reads llama-server's names (repeat_penalty, dry_*, presence_penalty…); the typed penalty_* fields are ignored. */
    const request: ChatCompletionParams & { stream: true; stop?: string[]; repeat_penalty: number; repeat_last_n: number; continue_final_message?: boolean; add_generation_prompt?: boolean } & ServerSampling = {
      messages: wireMessages,
      stream: true,
      abortSignal: signal,
      max_tokens: opts.maxTokens ?? ANSWER_CEILING,
      temperature: sampler.temperature,
      top_p: sampler.topP,
      repeat_penalty: sampler.repeatPenalty,
      repeat_last_n: sampler.repeatLastN,
      dry_multiplier: sampler.dryMultiplier,
      dry_base: sampler.dryBase,
      dry_allowed_length: sampler.dryAllowedLength,
      dry_penalty_last_n: sampler.dryPenaltyLastN,
      dry_sequence_breakers: sampler.drySequenceBreakers,
      presence_penalty: sampler.presencePenalty,
      frequency_penalty: sampler.frequencyPenalty,
      stop: opts.stop,
      chat_template_kwargs: { enable_thinking: opts.reasoning ?? true },
      ...(cont ? { continue_final_message: true, add_generation_prompt: false } : {}),
    };
    try {
      for await (const chunk of await wllama.createChatCompletion(request)) {
        const delta = chunk.choices[0]?.delta as ChunkDelta | undefined;
        const reasoning = delta?.reasoning_content;
        const text = delta?.content;
        if (!ttft && (reasoning || text)) ttft = performance.now() - started;
        if (reasoning) yield { reasoning };
        if (text) {
          chunks++;
          yield { text };
        }
        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens;
          completionTokens = chunk.usage.completion_tokens;
        }
        if (chunk.timings) {
          tokPerSec = chunk.timings.predicted_per_second;
          timings = chunk.timings as { cache_n?: number; prompt_n?: number };
        }
      }
    } catch (e: unknown) {
      if (!isAbort(e)) throw e;
    }
    /* A stopped stream never gets the final usage/timings chunk; one streamed chunk is one token. */
    completionTokens ||= chunks;
    if (!tokPerSec && completionTokens) tokPerSec = (completionTokens * 1000) / Math.max(1, performance.now() - started - ttft);
    this.last = { tokPerSec, ttftMs: ttft, ctxUsed: promptTokens + completionTokens, memMB: this.last.memMB };
    if (photos) {
      /* Time to first token is the photo's encode plus the prompt's prefill: the number the hold card's hint is honest about. */
      this.devInfo = { ...this.devInfo, photoTurn: { photos, ttftMs: Math.round(ttft), totalMs: Math.round(performance.now() - started), completionTokens } };
      recordPhotoMs(ttft, session.model.id);
      console.info(`[wllama] photo turn · photos=${photos} ttft=${Math.round(ttft)} ms total=${Math.round(performance.now() - started)} ms tokens=${completionTokens}`);
    }
    /* Not behind a flag: the QA harness reads how much of a resumed turn the cache already held. */
    if (cont) console.info(`[wllama] continue · prefill=${cont.text.length} chars cached=${timings?.cache_n ?? "?"} evaluated=${timings?.prompt_n ?? "?"} ttft=${Math.round(ttft)} ms tokens=${completionTokens}`);
    this.measureMemory();
    yield { done: { promptTokens, completionTokens, ttftMs: ttft, tokPerSec } };
  }

  async embed(): Promise<Float32Array[]> {
    throw new Error("wllama: embeddings need a session loaded with embeddings=true; the chat session cannot embed");
  }

  stats(): Stats {
    return this.last;
  }

  /* Only defined under cross-origin isolation; it settles late, so the value lands in the next stats() read. */
  private measureMemory(): void {
    (performance as MemoryPerformance).measureUserAgentSpecificMemory?.().then(
      (m) => (this.last = { ...this.last, memMB: Math.round(m.bytes / 1048576) }),
      () => undefined,
    );
  }
}

/** Embedding companion on a second wllama instance loaded with `embeddings: true` (a chat instance cannot embed). */
export class WllamaEmbedder implements Embedder {
  private wllama: Wllama | null = null;
  private loading: Promise<Wllama> | null = null;
  loadMs = 0;

  constructor(
    readonly id: string,
    private readonly uri: string,
    /* llama.cpp aborts on a sequence past the model's trained context, so this comes from the catalog, never a constant. */
    private readonly contextTokens = 512,
  ) {}

  private ready(): Promise<Wllama> {
    if (this.wllama) return Promise.resolve(this.wllama);
    return (this.loading ??= (async () => {
      const started = performance.now();
      const wllama = new Wllama(WASM_PATHS, { logger: LoggerWithoutDebug, allowOffline: true });
      wllama.setCompat(COMPAT_PATHS);
      const n = this.contextTokens;
      const params = { embeddings: true, pooling_type: "mean" as const, n_ctx: n, n_batch: n, n_ubatch: n, n_threads: threadCount(undefined), log_level: LogLevel.WARN };
      const opfs = fileOfUri(this.uri);
      if (opfs) await wllama.loadModel([await modelFile(opfs)], params);
      else await wllama.loadModelFromUrl(this.uri, params);
      this.loadMs = Math.round(performance.now() - started);
      console.info(`[wllama] embedder ${this.id} loaded in ${this.loadMs} ms`);
      this.wllama = wllama;
      this.loading = null;
      return wllama;
    })());
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    const wllama = await this.ready();
    const out: Float32Array[] = [];
    for (const t of texts) {
      const r = await wllama.createEmbedding({ input: t });
      const v = r.data[0]?.embedding;
      if (!Array.isArray(v)) throw new Error("wllama: no embedding returned");
      out.push(Float32Array.from(v));
    }
    return out;
  }

  async unload(): Promise<void> {
    const w = this.wllama;
    this.wllama = null;
    await w?.exit();
  }
}
