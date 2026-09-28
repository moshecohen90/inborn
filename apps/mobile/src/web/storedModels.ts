import type { ModelStatus } from "./opfs";

/** One text model as this browser holds it (F445): the vault, the Model sheet and the door print this and nothing else. */
export type StoredState =
  | { kind: "in-use"; bytes: number }
  | { kind: "installed"; bytes: number }
  | { kind: "partial"; have: number; bytes: number }
  | { kind: "missing"; bytes: number };

/** `current` is the model the page runs; it is in use only once its file is verified here. A ready file counts its own bytes. */
export function storedState(status: ModelStatus, catalogBytes: number, current: boolean): StoredState {
  if (status.kind === "ready") return { kind: current ? "in-use" : "installed", bytes: status.meta.bytes };
  if (status.kind === "partial") return { kind: "partial", have: status.have, bytes: catalogBytes };
  return { kind: "missing", bytes: catalogBytes };
}

/** A file that takes room and is not the one the page runs. */
export const removable = (s: StoredState): boolean => s.kind === "installed" || s.kind === "partial";

export interface StoredLine {
  key: string;
  params: Record<string, string>;
}

export function storedLine(s: StoredState, size: (bytes: number) => string): StoredLine {
  switch (s.kind) {
    case "in-use":
      return { key: "vault.web.row.inUse", params: { size: size(s.bytes) } };
    case "installed":
      return { key: "vault.web.row.installed", params: { size: size(s.bytes) } };
    case "partial":
      return { key: "vault.web.row.partial", params: { done: size(s.have), size: size(s.bytes) } };
    case "missing":
      return { key: "vault.web.row.missing", params: { size: size(s.bytes) } };
  }
}
