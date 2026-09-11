/**
 * Emergency wipe (spec §5.7) with "Also delete downloaded models" off: every model file survives, wherever the
 * vault keeps it, not only a top-level `*.gguf`. Pure decision; the platform walks its directories.
 */

/** Directories the vault and the Play joiner own; their contents (shards, companions, vault.json, .part files) are model state. */
export const MODEL_DIRECTORIES: readonly string[] = ["models", "assetpacks-joined"];

const MODEL_FILE = /\.(gguf|bin)$/i;

export interface WipeEntry {
  name: string;
  directory: boolean;
}

/** True when the top-level entry must be kept because it is a model, a model directory, or a dev model push. */
export function keepOnWipe(entry: WipeEntry, keepModels: boolean): boolean {
  if (!keepModels) return false;
  return entry.directory ? MODEL_DIRECTORIES.includes(entry.name) : MODEL_FILE.test(entry.name);
}
