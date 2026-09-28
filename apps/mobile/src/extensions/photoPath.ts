import { useSyncExternalStore } from "react";
import type { PathPiece, PhotoPath } from "@inborn/core";
import { cancelChatModel, chatModelState, installChatModel, subscribeChatModels } from "./chatModel";
import type { ExtensionState } from "./state";
import { cancelExtension, extensionState, installExtension, resumeExtension, subscribeExtensions } from "./store";

const pieceState = (p: PathPiece): ExtensionState => (p.kind === "pack" ? extensionState(p.id) : chatModelState(p.id));

export const pendingPiece = (path: PhotoPath): PathPiece | null => path.missing.find((p) => pieceState(p).kind !== "ready") ?? null;

/* The pieces report as one download, so the card never shows a second one starting. */
export function pathState(path: PhotoPath): ExtensionState {
  const states = path.missing.map(pieceState);
  if (states.every((s) => s.kind === "ready")) return { kind: "ready" };
  const blocking = states.find((s) => s.kind === "failed" || s.kind === "unavailable" || s.kind === "stuck");
  if (blocking) return blocking.kind === "failed" ? { ...blocking, bytes: path.bytes } : blocking;
  const have = states.reduce((n, s, i) => n + (s.kind === "ready" ? path.missing[i]!.bytes : s.kind === "downloading" || s.kind === "paused" ? s.bytes : 0), 0);
  const running = states.find((s) => s.kind === "downloading" || s.kind === "paused");
  if (running?.kind === "downloading") return { kind: "downloading", bytes: have, total: path.bytes, ...(running.keepOpen ? { keepOpen: true } : {}) };
  if (running?.kind === "paused") return { kind: "paused", bytes: have, total: path.bytes };
  if (have > 0) return { kind: "downloading", bytes: have, total: path.bytes };
  return { kind: "missing", bytes: path.bytes };
}

export async function installPath(path: PhotoPath, resume = false): Promise<ExtensionState> {
  for (const p of path.missing) {
    if (pieceState(p).kind === "ready") continue;
    const end = p.kind === "pack" ? await (resume ? resumeExtension(p.id) : installExtension(p.id)) : await installChatModel(p.id);
    if (end.kind !== "ready") return pathState(path);
  }
  return pathState(path);
}

export function cancelPath(path: PhotoPath): void {
  for (const p of path.missing) (p.kind === "pack" ? cancelExtension : cancelChatModel)(p.id);
}

const subscribe = (listener: () => void): (() => void) => {
  const a = subscribeExtensions(listener);
  const b = subscribeChatModels(listener);
  return () => {
    a();
    b();
  };
};

export function usePathState(path: PhotoPath | null): ExtensionState | null {
  const snapshot = (): string => (path ? JSON.stringify(pathState(path)) : "null");
  return JSON.parse(useSyncExternalStore(subscribe, snapshot, snapshot)) as ExtensionState | null;
}
