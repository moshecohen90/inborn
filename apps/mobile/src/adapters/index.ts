import { NullLM, type LocalLM, type ModelRef } from "@autark/core";
import { devModelEngine } from "./devModel";

export interface Engine {
  engine: LocalLM;
  model: ModelRef;
}

/** Phones run llama.rn when a GGUF is present (devModel.native.ts); everything else streams from the in-memory engine until M2 (wllama, Apple FM). */
export function createEngine(): Engine {
  return (
    devModelEngine() ?? {
      engine: new NullLM("Nothing leaves this phone. This is the week-0 skeleton streaming from an in-memory engine.", 60),
      model: { id: "null", uri: "bundled://null" },
    }
  );
}
