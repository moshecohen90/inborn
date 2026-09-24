/* wllama's package "main" points at its TypeScript sources; esm/ carries the built JS plus .d.ts. */
import { LoggerWithoutDebug, LogLevel, Wllama } from "@wllama/wllama/esm/index.js";
import type { ChatCompletionChunk, ChatCompletionMessage, ChatCompletionParams } from "@wllama/wllama/esm/index.js";
import { ANSWER_CEILING, sampling, type Capabilities, type Delta, type Embedder, type GenOpts, type LoadOptions, type LocalLM, type Message, type ModelRef, type Session, type Stats } from "@inborn/core";
import { fileOfUri, modelFile } from "../web/opfs";

/* Copied out of node_modules by `pnpm wasm` (apps/mobile/package.json): always our origin, never a CDN. */
const WASM_PATHS = { default: "/wllama/wllama.wasm" };
const COMPAT_PATHS = { worker: "/wllama/compat/wllama.js", wasm: "/wllama/compat/wllama.wasm" };

/** llama-server streams Qwen "thinking" as reasoning_content, which wllama's chunk type leaves out. */
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

const isAbort = (e: unknown): boolean => e instanceof Error && e.name === "AbortError";

/** wllama adapter (llama.cpp in WebAssembly, WebGPU when the browser has an adapter). Loads the GGUF from our own origin only. */
export class WllamaLM implements LocalLM {
  readonly id = "wllama" as const;
  private wllama: Wllama | null = null;
  private session: Session | null = null;
  private last: Stats = { tokPerSec: 0, ttftMs: 0, ctxUsed: 0, memMB: 0 };

  capabilities(): Capabilities {
    /* One llama-server context is either chat or embeddings, never both; RAG gets its own session later. */
    return { vision: false, tools: false, embeddings: false, maxContext: this.session?.nCtx ?? 4096 };
  }

  async load(model: ModelRef, opts: LoadOptions): Promise<Session> {
    await this.unload();
    const started = performance.now();
    const [threads, layers] = [threadCount(opts.threads), await gpuLayers(opts.gpuLayers)];
    const wllama = new Wllama(WASM_PATHS, { logger: LoggerWithoutDebug, allowOffline: true });
    wllama.setCompat(COMPAT_PATHS);
    const params = { n_ctx: opts.nCtx, n_threads: threads, n_gpu_layers: layers, jinja: true, chat_template: model.chatTemplate, log_level: LogLevel.WARN };
    const opfs = fileOfUri(model.uri);
    /* opfs:// is the delivered GGUF on this device (src/web/opfs.ts): no network, wllama reads the File in slices. */
    if (opfs) await wllama.loadModel([await modelFile(opfs)], params);
    else await wllama.loadModelFromUrl(model.uri, params);
    this.wllama = wllama;
    this.session = { model, nCtx: opts.nCtx };
    console.info(
      `[wllama] loaded ${model.id} in ${Math.round(performance.now() - started)} ms · threads=${wllama.getNumThreads()} isolated=${globalThis.crossOriginIsolated} gpuLayers=${layers} nCtx=${opts.nCtx} libllama=${Wllama.getLibllamaVersion()}`,
    );
    return this.session;
  }

  async unload(): Promise<void> {
    const wllama = this.wllama;
    this.wllama = null;
    this.session = null;
    await wllama?.exit();
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
    const sampler = sampling(opts);
    /* The wasm server reads llama-server's names (repeat_penalty, repeat_last_n); the typed penalty_* fields are ignored. */
    const request: ChatCompletionParams & { stream: true; stop?: string[]; repeat_penalty: number; repeat_last_n: number } = {
      messages: messages.map(toWllamaMessage),
      stream: true,
      abortSignal: signal,
      max_tokens: opts.maxTokens ?? ANSWER_CEILING,
      temperature: sampler.temperature,
      top_p: sampler.topP,
      repeat_penalty: sampler.repeatPenalty,
      repeat_last_n: sampler.repeatLastN,
      stop: opts.stop,
      chat_template_kwargs: { enable_thinking: opts.reasoning ?? true },
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
        if (chunk.timings) tokPerSec = chunk.timings.predicted_per_second;
      }
    } catch (e: unknown) {
      if (!isAbort(e)) throw e;
    }
    /* A stopped stream never gets the final usage/timings chunk; one streamed chunk is one token. */
    completionTokens ||= chunks;
    if (!tokPerSec && completionTokens) tokPerSec = (completionTokens * 1000) / Math.max(1, performance.now() - started - ttft);
    this.last = { tokPerSec, ttftMs: ttft, ctxUsed: promptTokens + completionTokens, memMB: this.last.memMB };
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
