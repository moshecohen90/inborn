import { initLlama } from "llama.rn";
import type { Capabilities, Delta, GenOpts, LoadOptions, LocalLM, Message, ModelRef, Session, Stats } from "@inborn/core";

type Ctx = Awaited<ReturnType<typeof initLlama>>;

/** llama.rn adapter (iOS + Android GGUF). Streams through a small queue so the callback API becomes AsyncIterable. */
export class LlamaRnLM implements LocalLM {
  readonly id = "llama.rn" as const;
  private ctx: Ctx | null = null;
  private session: Session | null = null;
  private last: Stats = { tokPerSec: 0, ttftMs: 0, ctxUsed: 0, memMB: 0 };

  capabilities(): Capabilities {
    return { vision: false, tools: false, embeddings: true, maxContext: this.session?.nCtx ?? 4096 };
  }

  async load(model: ModelRef, opts: LoadOptions): Promise<Session> {
    await this.unload();
    this.ctx = await initLlama({
      model: model.uri,
      n_ctx: opts.nCtx,
      n_gpu_layers: opts.gpuLayers ?? 99,
      n_threads: opts.threads,
      use_mlock: true,
    });
    this.session = { model, nCtx: opts.nCtx };
    return this.session;
  }

  async unload(): Promise<void> {
    if (this.ctx) {
      await this.ctx.release();
      this.ctx = null;
    }
    this.session = null;
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
    ctx
      .completion(
        {
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          n_predict: opts.maxTokens ?? 1024,
          temperature: opts.temperature ?? 0.7,
          top_p: opts.topP ?? 0.9,
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
        const tps = res.timings?.predicted_per_second ?? 0;
        this.last = { tokPerSec: tps, ttftMs: ttft, ctxUsed: (res.tokens_evaluated ?? 0) + (res.tokens_predicted ?? 0), memMB: 0 };
        push({ done: { promptTokens: res.tokens_evaluated ?? 0, completionTokens: res.tokens_predicted ?? 0, ttftMs: ttft, tokPerSec: tps } });
      })
      .catch((e: unknown) => {
        failure = e;
      })
      .finally(() => {
        finished = true;
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
}
