import type { Engine } from "./index";

/** Web and desktop have no local GGUF engine yet (wllama / Tauri land in M2). */
export function devModelEngine(): Engine | null {
  return null;
}
