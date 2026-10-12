import type { CatalogModel } from "@inborn/core";
import { openedFileName } from "./openedName";
import type { VaultStore } from "./store";

type T = (key: string, options?: Record<string, unknown>) => string;

const REASON_KEY = {
  "not-gguf": "vault.import.notGguf",
  truncated: "vault.import.truncated",
  "unsupported-arch": "vault.import.unsupportedArch",
  "engine-too-old": "vault.import.engineTooOld",
  "no-space": "vault.import.noSpace",
  "copy-failed": "vault.import.copyFailed",
} as const;

/**
 * One import, one line for the screen (model step and vault alike): the vault's verdict in the reader's words, never the
 * platform's exception text (F349). `model` is set when the file is in.
 */
export async function importModel(t: T, vault: VaultStore, uri: string, name?: string): Promise<{ line: string; model?: CatalogModel }> {
  try {
    const r = await vault.importFile(uri, name ?? openedFileName(uri));
    if (r.ok) return { line: t("vault.import.ok", { name: r.model.name }), model: r.model };
    return { line: t(REASON_KEY[r.reason], { arch: "?" }) };
  } catch (e: unknown) {
    console.warn("[vault] import", e);
    return { line: t(REASON_KEY["copy-failed"]) };
  }
}
