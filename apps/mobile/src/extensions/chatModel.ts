import { BUNDLED_MANIFEST, type CatalogModel } from "@inborn/core";
import { chooseWebModel, onStoredModels, refreshStoredModels, webBoot, type WebBoot } from "../web/boot";
import { WebModelDelivery } from "../web/modelDelivery";
import { readyModelStatus } from "../web/opfs";
import { recordWebTransfer } from "../web/transfers";
import type { ExtensionState } from "./state";

/* Uses the door's own downloader (OPFS worker, sha256, GGUF magic), so a model fetched from the photo card is verified the same way. */
export type SeeingModel = Pick<CatalogModel, "id" | "bytes" | "vision">;

const states = new Map<string, ExtensionState>();
const deliveries = new Map<string, WebModelDelivery>();
const listeners = new Set<() => void>();

function boot(): WebBoot | null {
  try {
    return webBoot();
  } catch {
    return null;
  }
}

const choiceOf = (id: string) => boot()?.choices.find((c) => c.source.id === id);

function set(id: string, next: ExtensionState): ExtensionState {
  states.set(id, next);
  for (const l of listeners) l();
  return next;
}

export function subscribeChatModels(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/* A model removed in the vault is not "ready" because this page once downloaded it: the OPFS walk decides. */
onStoredModels(() => {
  for (const [id, s] of states) if (s.kind === "ready" || s.kind === "missing") states.delete(id);
  for (const l of listeners) l();
});

/* Chrome's built-in engine has no projector to hand, so it offers none. */
export function offeredChatModels(_pro: boolean): SeeingModel[] {
  const b = boot();
  if (!b || b.engine === "chrome-nano") return [];
  return b.choices.map((c) => ({ id: c.source.id, bytes: c.source.bytes, vision: BUNDLED_MANIFEST.models.find((m) => m.id === c.source.id)?.vision === true }));
}

export function chatModelState(id: string): ExtensionState {
  const known = states.get(id);
  if (known) return known;
  const c = choiceOf(id);
  if (!c) return { kind: "unavailable" };
  return c.installed ? { kind: "ready" } : { kind: "missing", bytes: c.source.bytes };
}

export async function installChatModel(id: string): Promise<ExtensionState> {
  const c = choiceOf(id);
  if (!c) return set(id, { kind: "unavailable" });
  const now = chatModelState(id);
  if (now.kind === "ready" || now.kind === "downloading") return now;
  const delivery = deliveries.get(id) ?? new WebModelDelivery();
  deliveries.set(id, delivery);
  const bytes = c.source.bytes;
  set(id, { kind: "downloading", bytes: 0, total: bytes });
  const end = await delivery.download(c.source, (e) => {
    if (e.type === "progress") set(id, { kind: "downloading", bytes: e.have, total: e.total ?? bytes });
  });
  if (end.type === "error") return set(id, { kind: "failed", error: end.message, bytes });
  if (end.type === "paused") return set(id, { kind: "missing", bytes });
  recordWebTransfer({ host: new URL(c.source.url, location.origin).host, bytesOut: 0, bytesIn: end.have, at: Date.now(), purpose: "model" });
  const status = await readyModelStatus(c.source.file);
  if (status.kind !== "ready") return set(id, { kind: "failed", error: "stored file does not match after verification", bytes });
  c.installed = true;
  await refreshStoredModels().catch(() => undefined);
  return set(id, { kind: "ready" });
}

export function cancelChatModel(id: string): void {
  deliveries.get(id)?.cancel();
}

/* The browser picks its engine once per page load, so a switch is a reload. */
export async function switchChatModel(id: string): Promise<boolean> {
  if (!(await chooseWebModel(id))) return false;
  location.assign("/");
  return true;
}
