import { NullLM, type LocalLM, type ModelRef } from "@inborn/core";
import { devModelEngine } from "./devModel";

/** Await once before the first createEngine(): the vault scans its files (phones) or the web asks its host for a GGUF. */
export { prepareEngine } from "./prepare";

export interface Engine {
  engine: LocalLM;
  model: ModelRef;
}

/** Phones load the vault's default installed model with llama.rn (devModel.native.ts), browsers wllama when the host serves one (devModel.web.ts); with nothing installed the in-memory engine streams. */
export function createEngine(): Engine {
  return (
    devModelEngine() ?? {
      engine: new NullLM("Nothing leaves this phone. No model is installed yet: open the vault to add one.", 60),
      model: { id: "null", uri: "bundled://null" },
    }
  );
}
