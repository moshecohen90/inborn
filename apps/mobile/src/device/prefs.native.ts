import { File, Paths } from "expo-file-system";
import type { DevicePrefs } from "./prefs";

export type { DevicePrefs } from "./prefs";

const file = () => new File(Paths.document, "device-prefs.json");

export function loadPrefs(): DevicePrefs {
  try {
    const f = file();
    return f.exists ? (JSON.parse(f.textSync()) as DevicePrefs) : {};
  } catch {
    return {};
  }
}

export function savePrefs(prefs: DevicePrefs): void {
  try {
    file().write(JSON.stringify(prefs));
  } catch (e: unknown) {
    console.warn("[inborn] device prefs not saved", e);
  }
}
