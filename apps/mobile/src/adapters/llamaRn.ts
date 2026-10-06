import { initLlama, type JinjaFormattedChatResult } from "llama.rn";
import { isDevice } from "expo-device";
import { Platform } from "react-native";
import { ANSWER_CEILING, continuationPrompt, pastPrefill, prefillText, sampling } from "@inborn/core";
import { phoneImageMaxTokens } from "./imageTokens";
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
    return { vision: this.vision, tools: false, embeddings: true, maxContext: this.session?.nCtx ?? 4096, continuation: true };
  }

  /** Attaches the multimodal projector (spec §6.2 vision companion) to the loaded model; false when the model has no vision. */
  async enableVision(mmprojPath: string): Promise<boolean> {
    const ctx = this.ctx;
    if (!ctx) throw new Error("model not loaded");
    if (this.vision && this.mmproj === mmprojPath) return true;
    try {
      const imageMaxTokens = phoneImageMaxTokens(this.session?.model.id, this.session?.nCtx ?? 4096);
      /* The simulator's Metal driver traps inside the projector's buffer upload (xpc misuse); real iPhones and Android take the GPU. */
      this.vision = await ctx.initMultimodal({ path: mmprojPath, use_gpu: Platform.OS !== "ios" || isDevice, image_max_tokens: imageMaxTokens });
      this.devInfo.imageMaxTokens = imageMaxTokens;
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
    /* llama.rn streams the parsed content/reasoning as accumulated strings, so emit only what is new; with a prefill (F443) they start with it. */
    const cont = opts.continueFrom;
    const baseText = cont ? prefillText(cont.text) : "";
    const baseReasoning = cont?.reasoning?.trim() ?? "";
    let sentText = 0;
    let sentReasoning = 0;
    const emit = (parsedContent: string | undefined, parsedReasoning: string | undefined) => {
      const content = parsedContent === undefined ? undefined : pastPrefill(parsedContent, baseText);
      const reasoning = parsedReasoning === undefined ? undefined : pastPrefill(parsedReasoning, baseReasoning);
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
    /* The picture before the words, as Qwen-VL was trained and as wllama sends it: after a long passage block the small models answered as if blind (round 131). */
    const wire = messages.map((m) => (m.images?.length && this.vision ? { role: m.role, content: [...m.images.map((url) => ({ type: "image_url", image_url: { url } })), { type: "text", text: m.content }] } : { role: m.role, content: m.content }));
    const enableThinking = opts.reasoning ?? true;
    /* F443: this JSI has no continue_final_message, so the rendered history plus the prefill goes as a raw prompt; prefill_text lets the parser read the whole turn. */
    let input: Record<string, unknown> = { messages: wire };
    let stop = opts.stop ?? [];
    if (cont) {
      const formatted = await ctx.getFormattedChat(wire, undefined, { jinja: true, enable_thinking: enableThinking, reasoning_format: "auto", add_generation_prompt: true });
      if (formatted.type === "jinja") {
        const j = formatted as JinjaFormattedChatResult;
        const tags = j.thinking_start_tag && j.thinking_end_tag ? { start: j.thinking_start_tag, end: j.thinking_end_tag } : undefined;
        const turn = continuationPrompt(j.prompt, j.generation_prompt ?? "", cont, tags);
        input = {
          prompt: turn.prompt,
          generation_prompt: turn.generation,
          prefill_text: turn.prefill,
          ...(typeof j.chat_format === "number" ? { chat_format: j.chat_format } : {}),
          ...(j.chat_parser ? { chat_parser: j.chat_parser } : {}),
          ...(j.preserved_tokens ? { preserved_tokens: j.preserved_tokens } : {}),
          ...(j.has_media ? { media_paths: j.media_paths } : {}),
        };
        stop = [...stop, ...(j.additional_stops ?? [])];
      } else input = { prompt: formatted.prompt + prefillText(cont.text), ...(formatted.has_media ? { media_paths: formatted.media_paths } : {}) };
    }
    this.inflight = ctx
      .completion(
        {
          ...input,
          n_predict: opts.maxTokens ?? ANSWER_CEILING,
          n_threads: opts.threads,
          temperature: sampler.temperature,
          top_p: sampler.topP,
          penalty_repeat: sampler.repeatPenalty,
          penalty_last_n: sampler.repeatLastN,
          penalty_present: sampler.presencePenalty,
          penalty_freq: sampler.frequencyPenalty,
          dry_multiplier: sampler.dryMultiplier,
          dry_base: sampler.dryBase,
          dry_allowed_length: sampler.dryAllowedLength,
          dry_penalty_last_n: sampler.dryPenaltyLastN,
          dry_sequence_breakers: sampler.drySequenceBreakers,
          stop,
          enable_thinking: enableThinking,
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
      /* embedding() keeps the previous call's tokens and decodes only the part after the shared prefix into an empty cache. */
      await ctx.clearCache(false);
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
  /* 2: vectors stored before r134b were embedded without the previous text's shared prefix, so those indexes are rebuilt. */
  readonly revision = 2;
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
      const ctx = await initLlama({ model: this.uri, embedding: true, n_ctx: n, n_batch: n, n_ubatch: n, n_parallel: 1, pooling_type: "mean", embd_normalize: 2, n_gpu_layers: 99, use_mlock: false });
      await ctx.parallel.enable({ n_parallel: 1, n_batch: n });
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
    for (const t of texts) {
      /* Not ctx.embedding(): it decodes only what follows the previous text's shared prefix, and clearCache cannot reset that on a BERT model (no KV memory). */
      const { promise } = await ctx.parallel.embedding(t);
      out.push(Float32Array.from((await promise).embedding));
    }
    return out;
  }

  async unload(): Promise<void> {
    const ctx = this.ctx;
    this.ctx = null;
    await ctx?.release();
  }
}
