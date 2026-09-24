import { File, Paths } from "expo-file-system";
import { BUNDLED_MANIFEST, type Embedder } from "@inborn/core";
import { LlamaRnEmbedder } from "../adapters/llamaRn";
import { getVault } from "../vault/store";

/** Catalog id of the document-index model (spec §6.2). */
export const EMBED_MODEL_ID = "embed-e5";
/** M1-style dev fallback: a GGUF pushed by hand as Documents/embed.gguf. */
export const DEV_EMBED_FILE = "embed.gguf";

export interface ResolvedEmbedder {
  embedder: Embedder & { unload(): Promise<void>; loadMs?: number };
  path: string;
  /** The model's trained context; llama.cpp aborts past it, so the chunker must be told. */
  contextTokens: number;
}

const contextTokens = (): number => BUNDLED_MANIFEST.models.find((m) => m.id === EMBED_MODEL_ID)?.contextLength ?? 512;

/** The vault's installed companion first, then the dev fallback file; null means "install the document index". */
export function resolveEmbedder(): ResolvedEmbedder | null {
  const vault = getVault();
  const state = vault.state(EMBED_MODEL_ID);
  const ctx = contextTokens();
  if (state.kind === "ready" && new File(state.path).exists) return { embedder: new LlamaRnEmbedder(EMBED_MODEL_ID, state.path, ctx), path: state.path, contextTokens: ctx };
  const dev = new File(Paths.document, DEV_EMBED_FILE);
  if (dev.exists) return { embedder: new LlamaRnEmbedder(EMBED_MODEL_ID, dev.uri, ctx), path: dev.uri, contextTokens: ctx };
  return null;
}

/** Starts the vault delivery for the companion (Play pack on Android, HTTPS on iOS); the vault screens show progress. */
export function installEmbedder(): Promise<unknown> {
  return getVault().install(EMBED_MODEL_ID);
}

const readyPath = (): string | null => {
  const s = getVault().state(EMBED_MODEL_ID);
  return s.kind === "ready" ? s.path : null;
};

/** Fires when the index model appears in or leaves the vault (installed or removed from any screen), so the library follows without a relaunch. */
export function watchEmbedder(onChange: () => void): () => void {
  let last = readyPath();
  return getVault().subscribe(() => {
    const now = readyPath();
    if (now === last) return;
    last = now;
    onChange();
  });
}
