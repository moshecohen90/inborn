import { devBuild } from "../licence/devFlags";

/**
 * QA only (round 130): the app sees no network while the Mac keeps its own, so a script can flip offline → online
 * mid-run. The bridge's `network` step is the only caller; a store bundle refuses it because `devBuild()` is false
 * there whatever its environment said (QA F257).
 */
let offline = false;
const listeners = new Set<(offline: boolean) => void>();

export const simulatedOffline = (): boolean => offline;

/** False when this build may not pretend: the switch stays where it was. */
export function setSimulatedOffline(on: boolean, allowed: boolean = devBuild()): boolean {
  if (!allowed) return false;
  if (offline !== on) {
    offline = on;
    for (const l of listeners) l(on);
  }
  return true;
}

export function onSimulatedOffline(listener: (offline: boolean) => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** A transfer running when the switch goes off fails as iOS fails it on a lost path: cancelled, with the platform's text. */
export function dropOnSimulatedOffline(task: { state: string; cancel: () => void }): { dropped: () => boolean; stop: () => void } {
  let dropped = false;
  const stop = onSimulatedOffline((on) => {
    if (!on || task.state !== "active") return;
    /* After a beat, as URLSession does: a path listener that parks the task first wins, like on a real phone. */
    setTimeout(() => {
      if (task.state !== "active") return;
      dropped = true;
      task.cancel();
    }, DROP_AFTER_MS);
  });
  return { dropped: () => dropped, stop };
}

const DROP_AFTER_MS = 1_000;

/* What iOS hands a download with no network (NSURLErrorNotConnectedToInternet / NetworkConnectionLost), as expo-file-system words it. */
export const NOT_CONNECTED = "Unable to download a file: The Internet connection appears to be offline.";
export const CONNECTION_LOST = "Unable to download a file: The network connection was lost.";
/** React Native's fetch rejection with no network. */
export const FETCH_FAILED = "Network request failed";
