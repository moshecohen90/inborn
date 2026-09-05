import type { Engine } from "./index";
import { isTauri, writeDevResult as writeTauriDevResult } from "./tauri";
import { WllamaLM } from "./wllama";

/** M1 dev path on the web: the host serves the GGUF next to the bundle (scripts/serve-web.mjs). The catalog replaces this in M2. */
export const DEV_MODEL_URL = "/models/instant.gguf";

let served = false;
let probe: Promise<void> | null = null;

/* A browser cannot look at a file system, so createEngine() needs this HEAD answered first (see prepareEngine). */
export function prepareDevModel(): Promise<void> {
  probe ??= fetch(DEV_MODEL_URL, { method: "HEAD" }).then(
    (r) => void (served = r.ok),
    () => void (served = false),
  );
  return probe;
}

export function devModelEngine(): Engine | null {
  if (!served) return null;
  return { engine: new WllamaLM(), model: { id: "instant", uri: DEV_MODEL_URL } };
}

/** Headless measurement channel: the desktop shell writes `dev-run.json` into its app data dir; a plain browser only logs. */
export function writeDevResult(result: Record<string, unknown>): void {
  if (isTauri()) writeTauriDevResult(result);
  else console.info("[dev-run]", JSON.stringify(result));
}
