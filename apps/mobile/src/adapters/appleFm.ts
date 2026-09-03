import type { Capabilities, Delta, GenOpts, LoadOptions, LocalLM, Message, ModelRef, Session, Stats } from "@autark/core";

/** Apple Foundation Models (iOS 26+, Apple silicon). Stub until the native module lands in M1; the engine is picked automatically (spec §5.2). */
export class AppleFmLM implements LocalLM {
  readonly id = "apple-fm" as const;
  capabilities(): Capabilities {
    return { vision: false, tools: true, embeddings: false, maxContext: 4096 };
  }
  async load(_model: ModelRef, _opts: LoadOptions): Promise<Session> {
    throw new Error("Apple Foundation Models adapter not implemented yet (M1)");
  }
  async unload(): Promise<void> {}
  generate(_s: Session, _m: Message[], _o: GenOpts, _signal: AbortSignal): AsyncIterable<Delta> {
    return { [Symbol.asyncIterator]: () => ({ next: async () => { throw new Error("not implemented"); } }) };
  }
  async embed(_texts: string[]): Promise<Float32Array[]> {
    throw new Error("not supported");
  }
  stats(): Stats {
    return { tokPerSec: 0, ttftMs: 0, ctxUsed: 0, memMB: 0 };
  }
}
