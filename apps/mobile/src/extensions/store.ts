import { findExtension } from "@inborn/core";
import { isTauri } from "../adapters/tauri";
import { ALLOWED_MODEL_ORIGINS } from "../web/boot";
import { WebModelDelivery, fetchCompanion, type WebModelSource } from "../web/modelDelivery";
import { deleteModel, modelStatus, opfsSupported, opfsUri, readyModelStatus } from "../web/opfs";
import type { ExtensionState } from "./state";

/**
 * Browser (and desktop shell) side of the extensions (round 105): one resumable downloader, one state per registry
 * entry, all through the round-93 path (the catalog's `companions` URL, the OPFS worker with sha256 and the GGUF magic
 * check). Nothing here knows which extension it is handling.
 */
const states = new Map<string, ExtensionState>();
const deliveries = new Map<string, WebModelDelivery>();
const refreshing = new Map<string, Promise<ExtensionState>>();
const listeners = new Set<() => void>();

const initial = (id: string): ExtensionState => ({ kind: "missing", bytes: findExtension(id)?.bytes ?? 0 });

export const extensionState = (id: string): ExtensionState => states.get(id) ?? initial(id);

function set(id: string, next: ExtensionState): ExtensionState {
  states.set(id, next);
  for (const l of listeners) l();
  return next;
}

export function subscribeExtensions(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** The browser removes what it downloaded; the phones' packs belong to the app. */
export const canRemoveExtensions = true;

const source = (id: string): Promise<WebModelSource | null> => fetchCompanion(id, [...ALLOWED_MODEL_ORIGINS]).catch(() => null);

/** Reads OPFS (and, when the file is not there, whether this host can deliver it). Concurrent callers share one read. */
export function refreshExtension(id: string): Promise<ExtensionState> {
  const running = refreshing.get(id);
  if (running) return running;
  const job = (async (): Promise<ExtensionState> => {
    const ext = findExtension(id);
    if (!ext || isTauri() || !opfsSupported()) return set(id, { kind: "unavailable" });
    const status = await modelStatus(ext.file).catch(() => ({ kind: "missing" as const }));
    if (status.kind === "ready") return set(id, { kind: "ready" });
    const current = extensionState(id);
    if (current.kind === "downloading") return current;
    /* Said up front: a host that does not list the file gets no Download button to find that out with. */
    const src = await source(id);
    if (!src) return set(id, { kind: "unavailable" });
    return set(id, current.kind === "failed" ? { ...current, bytes: src.bytes } : { kind: "missing", bytes: src.bytes });
  })().finally(() => refreshing.delete(id));
  refreshing.set(id, job);
  return job;
}

/** The OPFS path once verified, for the engine to open; null otherwise. */
export function extensionUri(id: string): string | null {
  const ext = findExtension(id);
  return ext && extensionState(id).kind === "ready" ? opfsUri(ext.file) : null;
}

/** A browser has no store between it and the catalog host. */
export const storeReachable = (): boolean => true;

/** Downloads into OPFS (resuming a partial file) and verifies; the state carries progress and the F349 failure. */
export async function installExtension(id: string): Promise<ExtensionState> {
  const now = extensionState(id);
  if (isTauri() || now.kind === "downloading" || now.kind === "ready") return now;
  const src = await source(id);
  if (!src || !opfsSupported()) return set(id, { kind: "unavailable" });
  const delivery = deliveries.get(id) ?? new WebModelDelivery();
  deliveries.set(id, delivery);
  set(id, { kind: "downloading", bytes: 0, total: src.bytes });
  const end = await delivery.download(src, (e) => {
    if (e.type === "progress") set(id, { kind: "downloading", bytes: e.have, total: e.total ?? src.bytes });
  });
  if (end.type === "error") return set(id, { kind: "failed", error: end.message, bytes: src.bytes });
  if (end.type === "paused") return set(id, { kind: "missing", bytes: src.bytes });
  const status = await readyModelStatus(src.file);
  if (status.kind !== "ready") return set(id, { kind: "failed", error: "stored file does not match after verification", bytes: src.bytes });
  return set(id, { kind: "ready" });
}

/** After the emergency wipe: OPFS was emptied, so every state is read from it again. */
export function forgetExtensions(): void {
  for (const d of deliveries.values()) d.cancel();
  states.clear();
  deliveries.clear();
  refreshing.clear();
  for (const l of listeners) l();
}

export function cancelExtension(id: string): void {
  deliveries.get(id)?.cancel();
}

/** The phones resume a parked transfer; a browser's cancelled download simply starts again with a Range request. */
export const resumeExtension = (id: string): Promise<ExtensionState> => installExtension(id);

export async function removeExtension(id: string): Promise<ExtensionState> {
  const ext = findExtension(id);
  if (!ext) return extensionState(id);
  cancelExtension(id);
  await deleteModel(ext.file);
  set(id, initial(id));
  return refreshExtension(id);
}
