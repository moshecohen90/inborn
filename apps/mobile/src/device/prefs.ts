import type { UserOverride } from "@inborn/core";

/** S52 › Performance choices and the "explained once" flag; on the web they live in localStorage, phones use prefs.native.ts. */
export type DevicePrefs = Partial<UserOverride> & { explained?: boolean };

const KEY = "inborn.device.prefs";

export function loadPrefs(): DevicePrefs {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw ? (JSON.parse(raw) as DevicePrefs) : {};
  } catch {
    return {};
  }
}

export function savePrefs(prefs: DevicePrefs): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* private mode or no storage: the choice lasts for this run only */
  }
}
