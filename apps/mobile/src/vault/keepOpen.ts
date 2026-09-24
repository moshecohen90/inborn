import type { InstallState } from "@inborn/core";

/** How long the progress row says "Resumed" after a parked iPhone download continues. */
export const RESUMED_NOTE_MS = 4_000;

/**
 * The iPhone download runs in the app's own session and parks when the app leaves the screen (F370); Android's keeps
 * going in the background and the web and desktop have no such pause, so only the iPhone card warns.
 */
export function keepOpenNote(os: string, state: InstallState): boolean {
  return os === "ios" && state.kind === "delivering" && !state.paused && !state.waitingForWifi && !state.needsConfirmation;
}

export const justResumed = (state: InstallState, now: number): boolean => state.kind === "delivering" && !!state.resumedAt && now - state.resumedAt < RESUMED_NOTE_MS;
