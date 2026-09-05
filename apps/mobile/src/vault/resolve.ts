import { Platform } from "react-native";
import type { LocalLM, ModelRef } from "@inborn/core";
import { LlamaRnLM } from "../adapters/llamaRn";
import { getVault } from "./store";

export interface ResolvedEngine {
  engine: LocalLM;
  model: ModelRef;
}

/** The vault's answer to "which file does the engine load": the default installed model, or null when nothing is installed. */
export function resolveEngine(): ResolvedEngine | null {
  if (Platform.OS === "web") return null;
  const active = getVault().activeModel();
  if (!active) return null;
  console.log(`[inborn] engine model ${active.model.id} from ${active.path}`);
  return { engine: new LlamaRnLM(), model: { id: active.model.id, uri: active.path } };
}
