import type { LocalLM, ModelRef } from "@inborn/core";

export interface ResolvedEngine {
  engine: LocalLM;
  model: ModelRef;
}

/* Browsers and the Tauri shell pick their engine in adapters/devModel.web.ts; keeping this file out of the web bundle
   keeps llama.rn's TurboModule off it too, which react-native-web cannot evaluate. */
export function resolveEngine(): ResolvedEngine | null {
  return null;
}
