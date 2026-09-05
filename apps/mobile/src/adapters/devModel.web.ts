import type { Engine } from "./index";
import { WllamaLM } from "./wllama";
import { ChromeNanoLM, CHROME_MODEL_ID } from "../web/chromeNano";
import { prepareWebBoot, webBoot, webReady } from "../web/boot";
import { opfsUri } from "../web/opfs";

/**
 * Web engine choice (spec §14.3): wllama over the GGUF kept in OPFS, or Chrome's Prompt API when the user switched
 * it on. `prepareDevModel()` runs the web boot (gate, manifest, OPFS status) before the first createEngine().
 */
export function prepareDevModel(): Promise<void> {
  return prepareWebBoot().then(() => undefined);
}

export function devModelEngine(): Engine | null {
  const boot = webBoot();
  if (boot.engine === "chrome-nano") return { engine: new ChromeNanoLM(), model: { id: CHROME_MODEL_ID, uri: "chrome://prompt-api" } };
  if (!webReady(boot) || !boot.source) return null;
  const { id, file, chatTemplate } = boot.source;
  return { engine: new WllamaLM(), model: { id, uri: opfsUri(file), ...(chatTemplate ? { chatTemplate } : {}) } };
}
