import { File, Paths } from "expo-file-system";
import type { Engine } from "./index";
import { LlamaRnLM } from "./llamaRn";

/** M1 dev path: a GGUF pushed by hand into the app's document directory (README "Run on a phone"). The catalog replaces this in M2. */
export const DEV_MODEL_FILE = "instant.gguf";
/** Headless device runs write their measurements here; read back with `devicectl device copy from` / `adb exec-out run-as … cat`. */
export const DEV_RESULT_FILE = "dev-run.json";

export function devModelEngine(): Engine | null {
  const file = new File(Paths.document, DEV_MODEL_FILE);
  if (!file.exists) return null;
  return { engine: new LlamaRnLM(), model: { id: "instant", uri: file.uri } };
}

export function writeDevResult(result: Record<string, unknown>): void {
  new File(Paths.document, DEV_RESULT_FILE).write(JSON.stringify(result));
}
