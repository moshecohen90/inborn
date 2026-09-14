import { File, Paths } from "expo-file-system";
import { isNoSpaceError } from "@inborn/core";
import { recoverPrefs } from "./prefsTypes";
import { onSpaceBack, reportStorageFull } from "./storageFull";

export const PREFS_FILE = "prefs.json";
/* Written after every successful primary write; read only when prefs.json is missing or does not parse (QA F12). */
export const PREFS_BACKUP_FILE = "prefs.bak.json";
const file = () => new File(Paths.document, PREFS_FILE);
const backup = () => new File(Paths.document, PREFS_BACKUP_FILE);

function readJson(f: File): unknown {
  try {
    return f.exists ? JSON.parse(f.textSync()) : null;
  } catch (e: unknown) {
    console.warn(`[prefs] ${f.name} unreadable`, e);
    return null;
  }
}

export function readPrefsRaw(): unknown {
  return recoverPrefs(readJson(file()), readJson(backup()));
}

/* The value a full disk refused; written by the next call or once the disk has room (QA R4-F13). */
let unsaved: string | null = null;
let retryArmed = false;

function writeBoth(json: string): void {
  file().write(json);
  try {
    backup().write(json);
  } catch (e: unknown) {
    console.warn("[prefs] backup not written", e);
  }
}

export function writePrefsRaw(value: unknown): void {
  const json = JSON.stringify(value);
  try {
    writeBoth(json);
    unsaved = null;
  } catch (e: unknown) {
    if (!isNoSpaceError(e)) throw e;
    if (unsaved === null) console.warn("[prefs] disk full, prefs kept in memory until space returns");
    unsaved = json;
    reportStorageFull();
    if (!retryArmed) {
      retryArmed = true;
      onSpaceBack(flushUnsaved);
    }
  }
}

function flushUnsaved(): void {
  if (unsaved === null) return;
  try {
    writeBoth(unsaved);
    unsaved = null;
    console.log("[prefs] written after the disk had room again");
  } catch (e: unknown) {
    if (!isNoSpaceError(e)) console.warn("[prefs] retry failed", e);
  }
}

export function deletePrefs(): void {
  unsaved = null;
  for (const f of [file(), backup()]) if (f.exists) f.delete();
}
