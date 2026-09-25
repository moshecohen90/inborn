import { BUNDLED_MANIFEST, type Embedder } from "@inborn/core";
import { isTauri, listModels, TauriEmbedder } from "../adapters/tauri";
import { WllamaEmbedder } from "../adapters/wllama";
import { ALLOWED_MODEL_ORIGINS } from "../web/boot";
import { WebModelDelivery, fetchCompanion, type WebModelSource } from "../web/modelDelivery";
import { modelStatus, opfsSupported, opfsUri, readyModelStatus } from "../web/opfs";
import type { IndexModelState } from "./indexModel";

export const EMBED_MODEL_ID = "embed-e5";
export const DEV_EMBED_FILE = "embed.gguf";

export interface ResolvedEmbedder {
  embedder: Embedder & { unload(): Promise<void>; loadMs?: number };
  path: string;
  /** The model's trained context; llama.cpp aborts past it, so the chunker must be told. */
  contextTokens: number;
}

const catalogEntry = () => BUNDLED_MANIFEST.models.find((m) => m.id === EMBED_MODEL_ID);
const contextTokens = (): number => catalogEntry()?.contextLength ?? 512;
const catalogFile = (): string => catalogEntry()?.file ?? "multilingual-e5-large-instruct-Q6_K.gguf";
const catalogBytes = (): number => catalogEntry()?.bytes ?? 0;

let resolved: ResolvedEmbedder | null | undefined;
let install: IndexModelState = { kind: "missing", bytes: catalogBytes() };
const listeners = new Set<() => void>();

function setInstall(next: IndexModelState): void {
  install = next;
  for (const l of listeners) l();
}

/** Where the browser fetches the model: the served catalog's companion (the dev host's file, or the CDN in production). */
const webSource = (): Promise<WebModelSource | null> => fetchCompanion(EMBED_MODEL_ID, [...ALLOWED_MODEL_ORIGINS]);

/** Desktop: the vault directory (any GGUF whose name matches the catalog file); web: the verified OPFS copy. */
export async function resolveEmbedderAsync(): Promise<ResolvedEmbedder | null> {
  if (resolved !== undefined) return resolved;
  const file = catalogFile();
  if (isTauri()) {
    const files = await listModels().catch(() => []);
    const hit = files.find((f) => f.path.endsWith(file) || f.id === EMBED_MODEL_ID || /multilingual-e5/i.test(f.id));
    resolved = hit ? { embedder: new TauriEmbedder(EMBED_MODEL_ID, hit.path), path: hit.path, contextTokens: contextTokens() } : null;
    setInstall(resolved ? { kind: "ready" } : { kind: "unavailable" });
    return resolved;
  }
  /* The browser reads the model from OPFS only, the way the chat model is read: dev host and CDN are fetched alike. */
  const status = opfsSupported() ? await modelStatus(file).catch(() => ({ kind: "missing" as const })) : { kind: "missing" as const };
  resolved = status.kind === "ready" ? { embedder: new WllamaEmbedder(EMBED_MODEL_ID, opfsUri(file), contextTokens()), path: opfsUri(file), contextTokens: contextTokens() } : null;
  if (resolved) setInstall({ kind: "ready" });
  else if (install.kind !== "downloading") {
    /* Said up front: a host that does not serve the model gets no Download button to find that out with. */
    const source = opfsSupported() ? await webSource().catch(() => null) : null;
    if (!source) setInstall({ kind: "unavailable" });
    else if (install.kind === "failed") setInstall({ ...install, bytes: source.bytes });
    else setInstall({ kind: "missing", bytes: source.bytes });
  }
  return resolved;
}

export function resolveEmbedder(): ResolvedEmbedder | null {
  return resolved ?? null;
}

export const indexModelState = (): IndexModelState => install;

export function subscribeIndexModel(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Fires once the index model has landed, so the library loads it and rebuilds the word indexes (round 93). */
export function watchEmbedder(onChange: () => void): () => void {
  let last = install.kind;
  return subscribeIndexModel(() => {
    if (install.kind === last) return;
    last = install.kind;
    if (install.kind === "ready") onChange();
  });
}

const delivery = new WebModelDelivery();

/** Downloads the index model into OPFS (resuming a partial file) and verifies it; the state carries progress and the failure. */
export async function installEmbedder(): Promise<void> {
  if (isTauri() || install.kind === "downloading" || install.kind === "ready") return;
  const source = await webSource();
  if (!source || !opfsSupported()) return setInstall({ kind: "unavailable" });
  setInstall({ kind: "downloading", bytes: 0, total: source.bytes });
  const end = await delivery.download(source, (e) => {
    if (e.type === "progress") setInstall({ kind: "downloading", bytes: e.have, total: e.total ?? source.bytes });
  });
  if (end.type === "error") return setInstall({ kind: "failed", error: end.message, bytes: source.bytes });
  if (end.type === "paused") return setInstall({ kind: "missing", bytes: source.bytes });
  const status = await readyModelStatus(source.file);
  if (status.kind !== "ready") return setInstall({ kind: "failed", error: "stored file does not match after verification", bytes: source.bytes });
  resolved = undefined;
  await resolveEmbedderAsync();
}

export function cancelEmbedderInstall(): void {
  delivery.cancel();
}
