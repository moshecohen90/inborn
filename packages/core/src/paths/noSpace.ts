/** The platform's "disk full" errors, from any layer that writes: the prefs file, SQLite (SQLITE_FULL), a download task (QA R4-F13/F14). */
const NO_SPACE = /ENOSPC|No space left on device|database or disk is full|SQLITE_FULL|disk is full/i;

/** Below this, a chat is not started: the first row plus the FTS index need room to land (spec §10.1 #6). */
export const MIN_FREE_BYTES_TO_CHAT = 50 * 1024 * 1024;

export function isNoSpaceError(e: unknown): boolean {
  for (let cur: unknown = e, i = 0; cur && i < 5; cur = (cur as { cause?: unknown }).cause, i++) {
    if (NO_SPACE.test(cur instanceof Error ? cur.message : String(cur))) return true;
  }
  return false;
}
