import { updateHeld } from "./updateHold";

export type OfflineState = "unsupported" | "installing" | "ready" | "failed";

/** Only a real http(s) origin gets the service worker; the desktop shell and file:// have nothing to precache. */
const eligible = (): boolean => typeof navigator !== "undefined" && "serviceWorker" in navigator && /^https?:$/.test(location.protocol);

/** A second hand-over reload this soon after the last one is a loop, not a deploy. */
export const RELOAD_GUARD_MS = 30_000;
const RELOADED_AT = "inborn.sw.reloadedAt";

export type UpdateDecision = "ignore" | "reload" | "offer";

/**
 * F404. A new worker took control (skipWaiting + clientsClaim), so what is on screen came from the old precache. The
 * first control of a never-controlled page is the install, not a deploy. Work in flight is never thrown away by a
 * reload: the page offers one instead.
 */
export function onNewController(s: { wasControlled: boolean; busy: boolean; lastReloadAt: number | null; now: number }): UpdateDecision {
  if (!s.wasControlled) return "ignore";
  if (s.busy) return "offer";
  if (s.lastReloadAt !== null && s.now - s.lastReloadAt >= 0 && s.now - s.lastReloadAt < RELOAD_GUARD_MS) return "offer";
  return "reload";
}

function readReloadedAt(): number | null {
  try {
    const v = Number(sessionStorage.getItem(RELOADED_AT));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function writeReloadedAt(now: number): void {
  try {
    sessionStorage.setItem(RELOADED_AT, String(now));
  } catch {
    /* no sessionStorage: the guard then cannot hold, and the next hand-over offers instead of reloading */
  }
}

/**
 * Registers the Workbox-generated `/sw.js` (apps/web/build.mjs) that precaches the export, so a reload with no
 * network still boots the app: the "airplane-mode test" in the browser (spec §4.4). Resolves with the state; never throws.
 * `onUpdateReady` is called when a new build took over but reloading now would cut work in flight.
 */
export async function registerServiceWorker(onState: (s: OfflineState) => void, onUpdateReady: () => void = () => undefined): Promise<OfflineState> {
  if (!eligible()) {
    onState("unsupported");
    return "unsupported";
  }
  const sw = navigator.serviceWorker;
  let wasControlled = !!sw.controller;
  sw.addEventListener("controllerchange", () => {
    const now = Date.now();
    const decision = onNewController({ wasControlled, busy: updateHeld(), lastReloadAt: readReloadedAt(), now });
    wasControlled = true;
    if (decision === "reload") {
      writeReloadedAt(now);
      location.reload();
    } else if (decision === "offer") onUpdateReady();
  });
  try {
    const reg = await sw.register("/sw.js", { scope: "/" });
    /* A tab left open for days otherwise only learns of a deploy on its next navigation. */
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void reg.update().catch(() => undefined);
    });
    if (reg.active && !reg.installing && !reg.waiting) {
      onState("ready");
      return "ready";
    }
    onState("installing");
    await sw.ready;
    onState("ready");
    return "ready";
  } catch {
    /* A dev host without sw.js (expo start) lands here; the app still works, only not offline. */
    onState("failed");
    return "failed";
  }
}
