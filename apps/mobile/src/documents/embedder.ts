import { BUNDLED_MANIFEST, type Embedder } from "@inborn/core";
import { isTauri, listModels, TauriEmbedder } from "../adapters/tauri";
import { WllamaEmbedder } from "../adapters/wllama";
import { modelStatus, opfsUri } from "../web/opfs";

export const EMBED_MODEL_ID = "embed-e5";
export const DEV_EMBED_FILE = "embed.gguf";

export interface ResolvedEmbedder {
  embedder: Embedder & { unload(): Promise<void>; loadMs?: number };
  path: string;
  /** The model's trained context; llama.cpp aborts past it, so the chunker must be told. */
  contextTokens: number;
}

const contextTokens = (): number => BUNDLED_MANIFEST.models.find((m) => m.id === EMBED_MODEL_ID)?.contextLength ?? 512;

const catalogFile = (): string => BUNDLED_MANIFEST.models.find((m) => m.id === EMBED_MODEL_ID)?.file ?? "multilingual-e5-large-instruct-Q6_K.gguf";

let resolved: ResolvedEmbedder | null | undefined;

/** Desktop: the vault directory (any GGUF whose name matches the catalog file); web: the OPFS copy, else the host's /models/<file>. */
export async function resolveEmbedderAsync(): Promise<ResolvedEmbedder | null> {
  if (resolved !== undefined) return resolved;
  const file = catalogFile();
  if (isTauri()) {
    const files = await listModels().catch(() => []);
    const hit = files.find((f) => f.path.endsWith(file) || f.id === EMBED_MODEL_ID || /multilingual-e5/i.test(f.id));
    resolved = hit ? { embedder: new TauriEmbedder(EMBED_MODEL_ID, hit.path), path: hit.path, contextTokens: contextTokens() } : null;
    return resolved;
  }
  const status = await modelStatus(file).catch(() => ({ kind: "missing" as const }));
  if (status.kind === "ready") {
    resolved = { embedder: new WllamaEmbedder(EMBED_MODEL_ID, opfsUri(file), contextTokens()), path: opfsUri(file), contextTokens: contextTokens() };
    return resolved;
  }
  /* Dev hosts (scripts/serve-web.mjs) serve .models/ under /models; one HEAD decides, like the chat model at boot. */
  try {
    const r = await fetch(`/models/${file}`, { method: "HEAD" });
    resolved = r.ok ? { embedder: new WllamaEmbedder(EMBED_MODEL_ID, `/models/${file}`, contextTokens()), path: `/models/${file}`, contextTokens: contextTokens() } : null;
  } catch {
    resolved = null;
  }
  return resolved;
}

export function resolveEmbedder(): ResolvedEmbedder | null {
  return resolved ?? null;
}

export function installEmbedder(): Promise<unknown> {
  return Promise.resolve();
}
