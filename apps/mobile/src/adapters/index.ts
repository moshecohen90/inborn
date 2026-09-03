import { NullLM, type LocalLM } from "@autark/core";

/** Dev builds stream from the in-memory engine; real engines are selected in M1 (llama.rn on phones, Apple FM when available). */
export function createEngine(): LocalLM {
  return new NullLM("Nothing leaves this phone. This is the week-0 skeleton streaming from an in-memory engine.", 60);
}
