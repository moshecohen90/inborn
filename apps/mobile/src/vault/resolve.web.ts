import type { LocalLM, ModelRef } from "@inborn/core";

export interface ResolvedEngine {
  engine: LocalLM;
  model: ModelRef;
}

/* The browser tier runs wllama, and importing the llama.rn adapter here would evaluate TurboModuleRegistry.get("RNLlama") in the web bundle. */
export function resolveEngine(): ResolvedEngine | null {
  return null;
}
