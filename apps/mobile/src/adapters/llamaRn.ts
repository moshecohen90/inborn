import { initLlama } from "llama.rn";
import { isDevice } from "expo-device";
import { Platform } from "react-native";
import { ANSWER_CEILING, sampling } from "@inborn/core";
import type { BenchTimings, Capabilities, Delta, Embedder, GenOpts, LoadOptions, LocalLM, Message, ModelRef, Session, Stats } from "@inborn/core";

type Ctx = Awaited<ReturnType<typeof initLlama>>;

/** llama.rn adapter (iOS + Android GGUF). Streams through a small queue so the callback API becomes AsyncIterable. */
export class LlamaRnLM implements LocalLM {
  readonly id = "llama.rn" as const;
  private ctx: Ctx | null = null;
  private session: Session | null = null;
  private last: Stats = { tokPerSec: 0, ttftMs: 0, ctxUsed: 0, memMB: 0 };
  private inflight: Promise<unknown> | null = null;
  private vision = false;
  private mmproj: string | null = null;
  devInfo: Record<string, unknown> = {};

  capabilities(): Capabilities {
    return { vision: this.vision, tools: false, embeddings: true, maxContext: this.session?.nCtx ?? 4096 };
  }

  /** Attaches the multimodal projector (spec §6.2 vision companion) to the loaded model; false when the model has no vision. */
  async enableVision(mmprojPath: string): Promise<boolean> {
    const ctx = this.ctx;
    if (!ctx) throw new Error("model not loaded");
    if (this.vision && this.mmproj === mmprojPath) return true;
    try {
      /* Photos are capped at 1024 px before they get here; 512 image tokens keeps prefill in seconds on a phone CPU. */
      /* The simulator's Metal driver traps inside the projector's buffer upload (xpc misuse); real iPhones and Android take the GPU. */
      this.vision = await ctx.initMultimodal({ path: mmprojPath, use_gpu: Platform.OS !== "ios" || isDevice, image_max_tokens: 512 });
    } catch (e: unknown) {
      if (__DEV__) console.warn("[llama.rn] initMultimodal", e);
      this.vision = false;
    }
    this.mmproj = this.vision ? mmprojPath : null;
    return this.vision;
  }

  async load(model: ModelRef, opts: LoadOptions): Promise<Session> {
    await this.unload();
    this.ctx = await initLlama({
      model: model.uri,
      n_ctx: opts.nCtx,
      n_gpu_layers: opts.gpuLayers ?? 99,
      n_threads: opts.threads,
      use_mlock: true,
      /* The prompt builder keeps every request under n_ctx itself; a shifting context would break image token positions. */
      ctx_shift: false,
    });
    const { gpu, reasonNoGPU, devices, model: m } = this.ctx;
    this.devInfo = { gpu, reasonNoGPU, devices, desc: m.desc, sizeMB: Math.round(m.size / 1048576), nParams: m.nParams };
    if (__DEV__) console.log("[llama.rn] loaded", JSON.stringify(this.devInfo));
    this.session = { model, nCtx: opts.nCtx };
    return this.session;
  }

  async unload(): Promise<void> {
    /* stopCompletion() only flags the native loop; releasing the context while it still computes (image chunks take seconds) segfaults in ggml. */
    if (this.inflight) await this.inflight.catch(() => undefined);
    if (this.ctx) {
      await this.ctx.release();
      this.ctx = null;
    }
    this.session = null;
    this.vision = false;
    this.mmproj = null;
  }

  async *generate(session: Session, messages: Message[], opts: GenOpts, signal: AbortSignal): AsyncIterable<Delta> {
    const ctx = this.ctx;
    if (!ctx || session !== this.session) throw new Error("model not loaded");
    const queue: Delta[] = [];
    let wake: (() => void) | null = null;
    let finished = false;
    let failure: unknown = null;
    const push = (d: Delta) => {
      queue.push(d);
      wake?.();
    };
    const started = Date.now();
    let ttft = 0;
    /* llama.rn streams the parsed content/reasoning as accumulated strings, so emit only what is new. */
    let sentText = 0;
    let sentReasoning = 0;
    const emit = (content: string | undefined, reasoning: string | undefined) => {
      if (reasoning && reasoning.length > sentReasoning) {
        push({ reasoning: reasoning.slice(sentReasoning) });
        sentReasoning = reasoning.length;
      }
      if (content && content.length > sentText) {
        push({ text: content.slice(sentText) });
        sentText = content.length;
      }
    };
    const onAbort = () => void ctx.stopCompletion();
    signal.addEventListener("abort", onAbort, { once: true });
    const sampler = sampling(opts);
    this.inflight = ctx
      .completion(
        {
          messages: messages.map((m) => (m.images?.length && this.vision ? { role: m.role, content: [{ type: "text", text: m.content }, ...m.images.map((url) => ({ type: "image_url", image_url: { url } }))] } : { role: m.role, content: m.content })),
          n_predict: opts.maxTokens ?? ANSWER_CEILING,
          n_threads: opts.threads,
          temperature: sampler.temperature,
          top_p: sampler.topP,
          penalty_repeat: sampler.repeatPenalty,
          penalty_last_n: sampler.repeatLastN,
          stop: opts.stop ?? [],
          enable_thinking: opts.reasoning ?? true,
          reasoning_format: "auto",
        },
        (data) => {
          if (!ttft) ttft = Date.now() - started;
          if (data.accumulated_text === undefined) push({ text: data.token });
          else emit(data.content, data.reasoning_content);
        },
      )
      .then((res) => {
        emit(res.content, res.reasoning_content);
        this.devInfo.timings = res.timings;
        if (__DEV__) console.log("[llama.rn] timings", JSON.stringify(res.timings));
        const tps = res.timings?.predicted_per_second ?? 0;
        this.last = { tokPerSec: tps, ttftMs: ttft, ctxUsed: (res.tokens_evaluated ?? 0) + (res.tokens_predicted ?? 0), memMB: 0 };
        push({ done: { promptTokens: res.tokens_evaluated ?? 0, completionTokens: res.tokens_predicted ?? 0, ttftMs: ttft, tokPerSec: tps } });
      })
      .catch((e: unknown) => {
        failure = e;
      })
      .finally(() => {
        finished = true;
        this.inflight = null;
        wake?.();
      });
    try {
      while (true) {
        const d = queue.shift();
        if (d) {
          yield d;
          if (d.done) return;
          continue;
        }
        if (failure) throw failure;
        if (finished) return;
        await new Promise<void>((r) => (wake = r));
        wake = null;
      }
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    const ctx = this.ctx;
    if (!ctx) throw new Error("model not loaded");
    const out: Float32Array[] = [];
    for (const t of texts) {
      const r = await ctx.embedding(t);
      out.push(Float32Array.from(r.embedding));
    }
    return out;
  }

  stats(): Stats {
    return this.last;
  }

  /** llama.cpp's own bench (S31): one sequence, one repetition; tracked as in-flight so an unload waits for it. */
  async bench(pp: number, tg: number): Promise<BenchTimings> {
    const ctx = this.ctx;
    if (!ctx) throw new Error("model not loaded");
    const run = ctx.bench(pp, tg, 1, 1);
    this.inflight = run;
    try {
      const r = await run;
      if (__DEV__) console.log("[llama.rn] bench", JSON.stringify(r));
      return { promptTokPerSec: r.speedPp, genTokPerSec: r.speedTg };
    } finally {
      this.inflight = null;
    }
  }
}

/**
 * Embedding companion on its own llama.rn context: a context is either chat or embeddings, never both.
 * Loaded on first use, released by `unload()` (the document library calls it when indexing is idle).
 */
export class LlamaRnEmbedder implements Embedder {
  private ctx: Ctx | null = null;
  private loading: Promise<Ctx> | null = null;
  loadMs = 0;

  constructor(
    readonly id: string,
    private readonly uri: string,
    /* llama.cpp aborts on a sequence past the model's trained context, so this comes from the catalog, never a constant. */
    private readonly contextTokens = 512,
  ) {}

  private ready(): Promise<Ctx> {
    if (this.ctx) return Promise.resolve(this.ctx);
    return (this.loading ??= (async () => {
      const started = Date.now();
      const n = this.contextTokens;
      /* Non-causal (BERT) attention needs the whole sequence in one micro-batch, so n_batch = n_ubatch = n_ctx. */
      const ctx = await initLlama({ model: this.uri, embedding: true, n_ctx: n, n_batch: n, n_ubatch: n, pooling_type: "mean", embd_normalize: 2, n_gpu_layers: 99, use_mlock: false });
      this.loadMs = Date.now() - started;
      if (__DEV__) console.log(`[llama.rn] embedder ${this.id} loaded in ${this.loadMs} ms`);
      this.ctx = ctx;
      this.loading = null;
      return ctx;
    })());
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    const ctx = await this.ready();
    const out: Float32Array[] = [];
    for (const t of texts) out.push(Float32Array.from((await ctx.embedding(t)).embedding));
    return out;
  }

  async unload(): Promise<void> {
    const ctx = this.ctx;
    this.ctx = null;
    await ctx?.release();
  }
}
