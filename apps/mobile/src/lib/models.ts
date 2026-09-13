import { BUNDLED_MANIFEST } from "@inborn/core";

/** Friendly model names for chips and labels (§8.2: "friendly name only, no size"), taken from the catalog so the chip never disagrees with the vault. */
const NAMES: Record<string, string> = Object.fromEntries(BUNDLED_MANIFEST.models.map((m) => [m.id, m.name.toUpperCase()]));
NAMES.null = "DEV";

export const IMPORT_PREFIX = "import:";
const QUANT_SUFFIX = /[-_.](?:i?q\d[a-z0-9_]*|f16|f32|bf16|fp16)$/i;

/** "import:Qwen3.5-0.8B-Q4_K_M.gguf" → "Qwen3.5-0.8B": the file name without extension and quantization tag (§6.6 import). */
export function importDisplayName(id: string): string {
  const file = id.startsWith(IMPORT_PREFIX) ? id.slice(IMPORT_PREFIX.length) : id;
  const base = file.replace(/\.gguf$/i, "").replace(/\.bin$/i, "");
  const trimmed = base.replace(QUANT_SUFFIX, "");
  return (trimmed || base).replace(/[_]+/g, " ").trim();
}

export const modelLabel = (id: string): string => NAMES[id] ?? (id.startsWith(IMPORT_PREFIX) ? importDisplayName(id).toUpperCase() : id.toUpperCase());
export const modelNames = (): Record<string, string> => ({ ...NAMES });

/** The engine used when no model is installed yet (packages/core NullLM); it answers with one fixed line and loads nothing. */
export const NULL_MODEL_ID = "null";

/** The chat's load log line, naming its subject; null for the no-model engine, which has nothing to report (QA F16). Shape `<engine> loaded … in N ms` is what scripts/web-smoke.mjs reads. */
export function describeLoad(engineId: string, modelId: string, uri: string, ms: number): string | null {
  if (modelId === NULL_MODEL_ID || engineId === NULL_MODEL_ID) return null;
  return `[inborn] ${engineId} loaded model ${modelLabel(modelId)} (${modelId}) from ${uri} in ${ms} ms`;
}
