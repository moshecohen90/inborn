import { File, Paths } from "expo-file-system";
import { recoverPrefs } from "./prefsTypes";

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

export function writePrefsRaw(value: unknown): void {
  const json = JSON.stringify(value);
  file().write(json);
  try {
    backup().write(json);
  } catch (e: unknown) {
    console.warn("[prefs] backup not written", e);
  }
}

export function deletePrefs(): void {
  for (const f of [file(), backup()]) if (f.exists) f.delete();
}
