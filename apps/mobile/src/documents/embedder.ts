import { BUNDLED_MANIFEST, findExtension, type Embedder } from "@inborn/core";
import { isTauri, listModels, TauriEmbedder } from "../adapters/tauri";
import { WllamaEmbedder } from "../adapters/wllama";
import { cancelExtension, extensionState, installExtension, refreshExtension, subscribeExtensions } from "../extensions/store";
import { opfsUri } from "../web/opfs";
import type { IndexModelState } from "./indexModel";

export const EMBED_MODEL_ID = "embed-e5";
export const DEV_EMBED_FILE = "embed.gguf";

export interface ResolvedEmbedder {
  embedder: Embedder & { unload(): Promise<void>; loadMs?: number };
  path: string;
  /** The model's trained context; llama.cpp aborts past it, so the chunker must be told. */
  contextTokens: number;
}

const contextTokens = (): number => BUNDLED_MANIFEST.models.find((m) => m.id === EMBED_MODEL_ID)?.contextLength ?? 512;
const extensionFile = (): string => findExtension(EMBED_MODEL_ID)?.file ?? "multilingual-e5-large-instruct-Q6_K.gguf";

let resolved: ResolvedEmbedder | null | undefined;
/* The desktop shell installs the index model from its vault directory, not through the browser's extension downloader. */
let desktop: IndexModelState | null = null;
const desktopListeners = new Set<() => void>();

/** Desktop: the vault directory (any GGUF whose name matches the file); web: the verified OPFS copy of the extension. */
export async function resolveEmbedderAsync(): Promise<ResolvedEmbedder | null> {
  /* A null answer is stale the moment the extension lands: the library asks again from the "ready" notification. */
  if (resolved !== undefined && !(resolved === null && !isTauri() && extensionState(EMBED_MODEL_ID).kind === "ready")) return resolved;
  const file = extensionFile();
  if (isTauri()) {
    const files = await listModels().catch(() => []);
    const hit = files.find((f) => f.path.endsWith(file) || f.id === EMBED_MODEL_ID || /multilingual-e5/i.test(f.id));
    resolved = hit ? { embedder: new TauriEmbedder(EMBED_MODEL_ID, hit.path), path: hit.path, contextTokens: contextTokens() } : null;
    desktop = resolved ? { kind: "ready" } : { kind: "unavailable" };
    for (const l of desktopListeners) l();
    return resolved;
  }
  /* The browser reads the model from OPFS only, the way the chat model is read: dev host and CDN are fetched alike. */
  const state = await refreshExtension(EMBED_MODEL_ID);
  resolved = state.kind === "ready" ? { embedder: new WllamaEmbedder(EMBED_MODEL_ID, opfsUri(file), contextTokens()), path: opfsUri(file), contextTokens: contextTokens() } : null;
  return resolved;
}

export function resolveEmbedder(): ResolvedEmbedder | null {
  return resolved ?? null;
}

export const indexModelState = (): IndexModelState => desktop ?? extensionState(EMBED_MODEL_ID);

export function subscribeIndexModel(listener: () => void): () => void {
  desktopListeners.add(listener);
  const off = subscribeExtensions(listener);
  return () => {
    desktopListeners.delete(listener);
    off();
  };
}

/** Fires once the index model has landed, so the library loads it and rebuilds the word indexes (round 93). */
export function watchEmbedder(onChange: () => void): () => void {
  let last = indexModelState().kind;
  return subscribeIndexModel(() => {
    const now = indexModelState().kind;
    if (now === last) return;
    last = now;
    if (now === "ready") onChange();
  });
}

/** Downloads the index model through the extension downloader (OPFS, resumable, verified). */
export async function installEmbedder(): Promise<void> {
  if (isTauri()) return;
  const state = await installExtension(EMBED_MODEL_ID);
  if (state.kind !== "ready") return;
  resolved = undefined;
  await resolveEmbedderAsync();
}

export function cancelEmbedderInstall(): void {
  cancelExtension(EMBED_MODEL_ID);
}
