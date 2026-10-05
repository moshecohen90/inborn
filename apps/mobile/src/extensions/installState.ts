import type { InstallState } from "@inborn/core";
import { keepOpenNote } from "../vault/keepOpen";
import type { ExtensionState } from "./state";

/** A vault install state as the extension card reads it: a pause resumes, no connection waits on the card, Wi-Fi, confirmation and space go to the vault. */
export function fromInstallState(s: InstallState, bytes: number, os: string): ExtensionState {
  switch (s.kind) {
    case "ready":
      return { kind: "ready", bundled: s.via === "bundled" };
    case "delivering":
      if (s.paused) return { kind: "paused", bytes: s.bytes, total: s.total || bytes };
      if (s.waitingForNetwork) return { kind: "offline", bytes: s.bytes, total: s.total || bytes };
      if (s.waitingForWifi || s.needsConfirmation) return { kind: "stuck" };
      return { kind: "downloading", bytes: s.bytes, total: s.total || bytes, keepOpen: keepOpenNote(os, s) };
    case "verifying":
      return { kind: "downloading", bytes, total: bytes };
    case "needs-space":
      return { kind: "stuck" };
    case "failed":
      return { kind: "failed", error: s.error, bytes };
    default:
      /* not-installed, corrupt, quarantined: the same Download starts over. */
      return { kind: "missing", bytes };
  }
}
