import type { Capabilities, Delta, GenOpts, LoadOptions, LocalLM, Message, ModelRef, Session, Stats } from "./types";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** In-memory engine for tests and the dev build: streams a canned reply token by token, honours abort. */
export class NullLM implements LocalLM {
  readonly id = "null" as const;
  private session: Session | null = null;
  private last: Stats = { tokPerSec: 0, ttftMs: 0, ctxUsed: 0, memMB: 0 };

  constructor(private readonly reply = "Nothing leaves this phone.", private readonly delayMs = 0) {}

  capabilities(): Capabilities {
    return { vision: false, tools: false, embeddings: true, maxContext: 4096 };
  }

  async load(model: ModelRef, opts: LoadOptions): Promise<Session> {
    this.session = { model, nCtx: opts.nCtx };
    return this.session;
  }

  async unload(): Promise<void> {
    this.session = null;
  }

  async *generate(session: Session, messages: Message[], opts: GenOpts, signal: AbortSignal): AsyncIterable<Delta> {
    if (this.session !== session) throw new Error("session not loaded");
    const started = Date.now();
    const words = this.reply.split(" ");
    const max = opts.maxTokens ?? words.length;
    let emitted = 0;
    let ttft = 0;
    for (const w of words.slice(0, max)) {
      if (signal.aborted) break;
      if (this.delayMs) await sleep(this.delayMs);
      if (signal.aborted) break;
      if (!emitted) ttft = Date.now() - started;
      emitted++;
      yield { text: (emitted > 1 ? " " : "") + w };
    }
    const elapsed = Math.max(1, Date.now() - started);
    const promptTokens = messages.reduce((n, m) => n + m.content.split(/\s+/).length, 0);
    this.last = { tokPerSec: (emitted * 1000) / elapsed, ttftMs: ttft, ctxUsed: promptTokens + emitted, memMB: 0 };
    yield { done: { promptTokens, completionTokens: emitted, ttftMs: ttft, tokPerSec: this.last.tokPerSec } };
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    return texts.map((t) => {
      const v = new Float32Array(8);
      for (let i = 0; i < t.length; i++) v[i % 8] = (v[i % 8] ?? 0) + t.charCodeAt(i) / 1000;
      return v;
    });
  }

  stats(): Stats {
    return this.last;
  }
}
