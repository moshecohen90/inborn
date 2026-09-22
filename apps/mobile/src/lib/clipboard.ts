import { Platform } from "react-native";
import * as Clipboard from "expo-clipboard";
import { ExpiringClipboard, type Pasteboard } from "./clipboardExpiry";

type WebClipboard = { writeText(t: string): Promise<void>; readText?(): Promise<string> };
const webClipboard = (): WebClipboard | undefined => (globalThis as { navigator?: { clipboard?: WebClipboard } }).navigator?.clipboard;

const web: Pasteboard = {
  write: async (t) => {
    await webClipboard()?.writeText(t);
  },
  read: async () => {
    const read = webClipboard()?.readText;
    if (!read) return null;
    try {
      return await read.call(webClipboard());
    } catch {
      // Reading the clipboard is permission-gated in the browser; a refusal means we cannot prove the text is still ours.
      return null;
    }
  },
  clear: async () => {
    await webClipboard()?.writeText("");
  },
};

const native: Pasteboard = {
  write: async (t) => {
    await Clipboard.setStringAsync(t);
  },
  read: () => Clipboard.getStringAsync(),
  clear: async () => {
    await Clipboard.setStringAsync("");
  },
};

/** Local pasteboard only (§7.5); the expiry timer is driven by the Security setting through `setClipboardExpiry`. */
const clipboard = new ExpiringClipboard(Platform.OS === "web" ? web : native);

/** S52 › Security › clipboard expiry: 0 = Off, otherwise clear the pasteboard this many seconds after a copy. */
export const setClipboardExpiry = (seconds: number): void => clipboard.setExpiry(seconds);

export const copyText = (text: string): Promise<void> => clipboard.copy(text);
