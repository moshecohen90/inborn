import { Platform } from "react-native";
import * as Clipboard from "expo-clipboard";

/** Local pasteboard only (§7.5); expiry is a Security setting that lands with M6. */
export async function copyText(text: string): Promise<void> {
  if (Platform.OS === "web") {
    const nav = (globalThis as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } }).navigator;
    if (nav?.clipboard) await nav.clipboard.writeText(text);
    return;
  }
  await Clipboard.setStringAsync(text);
}
