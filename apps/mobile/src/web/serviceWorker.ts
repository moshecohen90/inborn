export type OfflineState = "unsupported" | "installing" | "ready" | "failed";

/** Only a real http(s) origin gets the service worker; the desktop shell and file:// have nothing to precache. */
const eligible = (): boolean => typeof navigator !== "undefined" && "serviceWorker" in navigator && /^https?:$/.test(location.protocol);

/**
 * Registers the Workbox-generated `/sw.js` (apps/web/build.mjs) that precaches the export, so a reload with no
 * network still boots the app: the "airplane-mode test" in the browser (spec §4.4). Resolves with the state; never throws.
 */
export async function registerServiceWorker(onState: (s: OfflineState) => void): Promise<OfflineState> {
  if (!eligible()) {
    onState("unsupported");
    return "unsupported";
  }
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    if (reg.active && !reg.installing && !reg.waiting) {
      onState("ready");
      return "ready";
    }
    onState("installing");
    await navigator.serviceWorker.ready;
    onState("ready");
    return "ready";
  } catch {
    /* A dev host without sw.js (expo start) lands here; the app still works, only not offline. */
    onState("failed");
    return "failed";
  }
}
