/** Where one extension stands on this device: the hold card, the vault's Extensions section and the Documents screen read this. */
export type ExtensionState =
  | { kind: "missing"; bytes: number }
  | { kind: "downloading"; bytes: number; total: number; keepOpen?: boolean }
  /** The phones only: a parked transfer the user resumes from the card. */
  | { kind: "paused"; bytes: number; total: number }
  /** No connection (Airplane Mode): the transfer waits and starts or continues by itself when one is back. */
  | { kind: "offline"; bytes: number; total: number }
  /** The phones only: waiting for Wi-Fi, a size confirmation or space, which the vault explains. */
  | { kind: "stuck" }
  | { kind: "ready"; bundled?: boolean }
  | { kind: "failed"; error: string; bytes: number }
  /** Nothing on this platform can fetch it (a host that does not serve it, a browser without OPFS). */
  | { kind: "unavailable" };

export const extensionPercent = (s: ExtensionState): number => ((s.kind === "downloading" || s.kind === "paused" || s.kind === "offline") && s.total > 0 ? Math.floor((s.bytes / s.total) * 100) : 0);

/** A held turn goes out on its own the moment its extension becomes ready. */
export const extensionReleases = (before: string | undefined, now: string): boolean => before !== undefined && before !== "ready" && now === "ready";
