import { File, Paths } from "expo-file-system";
import type { Embedder } from "@inborn/core";
import { LlamaRnEmbedder } from "../adapters/llamaRn";
import { getVault } from "../vault/store";

/** Catalog id of the default document-index model (spec §6.2). */
export const EMBED_MODEL_ID = "embed-nomic";
/** M1-style dev fallback: a GGUF pushed by hand as Documents/embed.gguf. */
export const DEV_EMBED_FILE = "embed.gguf";

export interface ResolvedEmbedder {
  embedder: Embedder & { unload(): Promise<void>; loadMs?: number };
  path: string;
}

/** The vault's installed companion first, then the dev fallback file; null means "install the document index". */
export function resolveEmbedder(): ResolvedEmbedder | null {
  const vault = getVault();
  const state = vault.state(EMBED_MODEL_ID);
  if (state.kind === "ready") return { embedder: new LlamaRnEmbedder(EMBED_MODEL_ID, state.path), path: state.path };
  const dev = new File(Paths.document, DEV_EMBED_FILE);
  if (dev.exists) return { embedder: new LlamaRnEmbedder(EMBED_MODEL_ID, dev.uri), path: dev.uri };
  return null;
}

/** Starts the vault delivery for the companion (Play pack on Android, HTTPS on iOS); the vault screens show progress. */
export function installEmbedder(): Promise<unknown> {
  return getVault().install(EMBED_MODEL_ID);
}

/** Fires when the index model becomes ready in the vault (installed from any screen), so the library can pick it up without a relaunch. */
export function watchEmbedder(onReady: () => void): () => void {
  const vault = getVault();
  return vault.subscribe(() => {
    if (vault.state(EMBED_MODEL_ID).kind === "ready") onReady();
  });
}
