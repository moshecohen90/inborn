import { requireOptionalNativeModule } from "expo";

interface NativeBackgroundTask {
  isSupported(): boolean;
  begin(name: string): number;
  end(token: number): void;
  remaining(): number;
  addListener?(event: "onExpire", listener: (e: { token: number }) => void): { remove(): void };
}

const native = requireOptionalNativeModule<NativeBackgroundTask>("BackgroundTask");

/** What the device guard needs from the platform; `begin` returns -1 when the OS grants nothing. */
export interface BackgroundTaskApi {
  begin(name: string): number;
  end(token: number): void;
}

/**
 * iOS only (spec §10.3 #21): asks UIApplication for wall-clock time so an answer that is still streaming survives the
 * app leaving the screen. Android keeps the process scheduled without one and ships no foreground service for 1.0
 * (README "Fixes round 27"), and the browser has nothing of the kind, so this is a no-op on both.
 */
export const backgroundTask: BackgroundTaskApi = {
  begin: (name) => native?.begin(name) ?? -1,
  end: (token) => native?.end(token),
};

export const canHoldBackgroundTask = (): boolean => native?.isSupported() ?? false;

/** Seconds iOS says are left before the hold expires; -1 in the foreground, on Android and on the web. */
export const backgroundTimeRemaining = (): number => native?.remaining() ?? -1;

/** iOS is about to reclaim the hold: the caller must stop generating now rather than be killed. */
export function onBackgroundTaskExpire(listener: (token: number) => void): () => void {
  const sub = native?.addListener?.("onExpire", (e) => listener(e.token));
  return () => sub?.remove();
}
