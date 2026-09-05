import { NullLM, type LocalLM, type ModelRef } from "@inborn/core";
import { devModelEngine } from "./devModel";
import { tauriEngine } from "./tauri";

/** Await once before the first createEngine(): the web has to ask its host whether a GGUF is served. */
export { prepareEngine } from "./prepare";

export interface Engine {
  engine: LocalLM;
  model: ModelRef;
}

/** Desktop runs the native engine when the vault has a GGUF (tauri.ts), phones llama.rn when a GGUF is present (devModel.native.ts), browsers wllama when the host serves one (devModel.web.ts); everything else streams from the in-memory engine. */
export function createEngine(): Engine {
  return (
    tauriEngine() ??
    devModelEngine() ?? {
      engine: new NullLM("Nothing leaves this phone. This is the week-0 skeleton streaming from an in-memory engine.", 60),
      model: { id: "null", uri: "bundled://null" },
    }
  );
}
