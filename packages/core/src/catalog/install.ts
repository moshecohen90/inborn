/** Install state of one catalog model on this device (spec §8.4 states, §10.1 #2/#5/#6/#8). Pure reducer. */
export type DeliverySource = "bundled" | "play" | "apple" | "https" | "hf" | "import";

export type InstallState =
  | { kind: "not-installed" }
  | { kind: "needs-space"; requiredBytes: number; freeBytes: number }
  | { kind: "delivering"; via: DeliverySource; bytes: number; total: number; paused: boolean; waitingForWifi: boolean; needsConfirmation: boolean }
  | { kind: "verifying"; via: DeliverySource; bytes: number }
  | { kind: "ready"; path: string; bytes: number; sha256: string; via: DeliverySource }
  | { kind: "corrupt"; reason: CorruptReason; via: DeliverySource }
  | { kind: "quarantined"; path: string; bytes: number; sha256: string; via: DeliverySource }
  | { kind: "failed"; error: string; via: DeliverySource; retryable: boolean };

export type CorruptReason = "hash-mismatch" | "not-gguf" | "truncated" | "unsupported-arch" | "engine-too-old";

export type InstallEvent =
  | { type: "request"; via: DeliverySource; requiredBytes: number; freeBytes: number }
  | { type: "progress"; bytes: number; total: number }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "waiting-for-wifi" }
  | { type: "needs-confirmation" }
  | { type: "cancel" }
  | { type: "delivered"; bytes: number }
  | { type: "verified"; path: string; bytes: number; sha256: string }
  | { type: "rejected"; reason: CorruptReason }
  | { type: "error"; error: string; retryable: boolean }
  /** The disk filled while bytes were moving; the part stays on disk and a later request resumes it (QA R4-F14). */
  | { type: "no-space"; requiredBytes: number; freeBytes: number }
  | { type: "load-crashed" }
  | { type: "load-ok" }
  | { type: "removed" };

export const NOT_INSTALLED: InstallState = { kind: "not-installed" };

/* Spec §5.4 (size × 1.1) and §10.1 #5 (never within 2 GB of a full disk): the stricter one wins. */
export const DISK_RESERVE_BYTES = 2 * 1024 ** 3;
export const requiredFreeBytes = (bytes: number): number => Math.max(Math.ceil(bytes * 1.1), bytes + DISK_RESERVE_BYTES);

/** Illegal events leave the state untouched, so a late progress tick after a cancel cannot revive a download. */
export function transition(state: InstallState, event: InstallEvent): InstallState {
  switch (event.type) {
    case "request": {
      if (state.kind === "ready" || state.kind === "quarantined" || state.kind === "delivering" || state.kind === "verifying") return state;
      if (event.freeBytes < event.requiredBytes) return { kind: "needs-space", requiredBytes: event.requiredBytes, freeBytes: event.freeBytes };
      return { kind: "delivering", via: event.via, bytes: 0, total: 0, paused: false, waitingForWifi: false, needsConfirmation: false };
    }
    case "progress":
      return state.kind === "delivering" ? { ...state, bytes: event.bytes, total: event.total, waitingForWifi: false, needsConfirmation: false } : state;
    case "pause":
      return state.kind === "delivering" ? { ...state, paused: true } : state;
    case "resume":
      return state.kind === "delivering" ? { ...state, paused: false, waitingForWifi: false, needsConfirmation: false } : state;
    case "waiting-for-wifi":
      return state.kind === "delivering" ? { ...state, waitingForWifi: true } : state;
    case "needs-confirmation":
      return state.kind === "delivering" ? { ...state, needsConfirmation: true } : state;
    case "cancel":
      return state.kind === "delivering" || state.kind === "needs-space" || state.kind === "failed" ? NOT_INSTALLED : state;
    case "delivered":
      return state.kind === "delivering" ? { kind: "verifying", via: state.via, bytes: event.bytes } : state;
    case "verified":
      return state.kind === "verifying" ? { kind: "ready", path: event.path, bytes: event.bytes, sha256: event.sha256, via: state.via } : state;
    case "rejected":
      return state.kind === "verifying" || state.kind === "delivering" ? { kind: "corrupt", reason: event.reason, via: state.via } : state;
    case "error":
      return state.kind === "delivering" || state.kind === "verifying" ? { kind: "failed", error: event.error, via: state.via, retryable: event.retryable } : state;
    case "no-space":
      return state.kind === "delivering" || state.kind === "verifying" ? { kind: "needs-space", requiredBytes: event.requiredBytes, freeBytes: event.freeBytes } : state;
    case "load-crashed":
      return state.kind === "ready" ? { kind: "quarantined", path: state.path, bytes: state.bytes, sha256: state.sha256, via: state.via } : state;
    case "load-ok":
      return state.kind === "quarantined" ? { kind: "ready", path: state.path, bytes: state.bytes, sha256: state.sha256, via: state.via } : state;
    case "removed":
      return NOT_INSTALLED;
  }
}

export const isInstalled = (s: InstallState): s is Extract<InstallState, { kind: "ready" | "quarantined" }> => s.kind === "ready" || s.kind === "quarantined";
export const isBusy = (s: InstallState): boolean => s.kind === "delivering" || s.kind === "verifying";
