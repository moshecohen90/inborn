/** Web: the browser's own storage; nothing here leaves the origin. */
const KEY = "inborn.prefs";

export function readPrefsRaw(): unknown {
  try {
    const s = globalThis.localStorage?.getItem(KEY);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

export function writePrefsRaw(value: unknown): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(value));
  } catch {
    /* private mode: prefs last for the tab */
  }
}

export function deletePrefs(): void {
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch {
    /* nothing to delete */
  }
}
