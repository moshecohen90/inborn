import { File, Paths } from "expo-file-system";

export const PREFS_FILE = "prefs.json";
const file = () => new File(Paths.document, PREFS_FILE);

export function readPrefsRaw(): unknown {
  try {
    const f = file();
    return f.exists ? JSON.parse(f.textSync()) : null;
  } catch {
    return null;
  }
}

export function writePrefsRaw(value: unknown): void {
  file().write(JSON.stringify(value));
}

export function deletePrefs(): void {
  const f = file();
  if (f.exists) f.delete();
}
