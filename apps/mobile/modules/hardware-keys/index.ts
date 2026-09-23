import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

interface NativeHardwareKeys {
  setEnabled(on: boolean): void;
  addListener(event: "onEnter", listener: (e: { deviceId: number }) => void): { remove(): void };
}

/** Android has a native module that sees the physical keyboard (QA T28); the browser and the desktop shell use the DOM. */
const native = requireOptionalNativeModule<NativeHardwareKeys>("HardwareKeys");
const web = Platform.OS === "web";

export const hasHardwareEnter = (): boolean => native !== null || (web && finePointer());

/**
 * A browser cannot be asked whether a keyboard is physical, so the pointer stands in for it: a touch-only phone keeps
 * Enter as a newline, while anything with a mouse, a trackpad or a keyboard case sends with it (QA F108). Read each
 * time the capture is armed, so attaching a trackpad takes effect on the next focus rather than on the next launch.
 */
function finePointer(): boolean {
  const mm = (globalThis as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia;
  if (!mm) return true;
  try {
    return mm("(any-pointer: fine)").matches;
  } catch {
    return true;
  }
}

/** The parts of a keydown the decision below reads; a real `KeyboardEvent` satisfies it. */
export interface EnterKey {
  key: string;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
}

/** Enter sends. Shift+Enter — and any other modifier — breaks the line, and a keystroke an IME is still composing is neither. */
export function sendsOnEnter(e: EnterKey): boolean {
  if (e.key !== "Enter") return false;
  if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return false;
  return !e.isComposing && e.keyCode !== 229;
}

function captureWebEnter(onEnter: () => boolean): () => void {
  const doc = (globalThis as { document?: Document }).document;
  if (!doc || !finePointer()) return () => undefined;
  const listener = (raw: Event) => {
    const e = raw as KeyboardEvent;
    if (!sendsOnEnter(e)) return;
    const el = doc.activeElement;
    if (!el || (el.tagName !== "TEXTAREA" && el.tagName !== "INPUT")) return;
    /* Only swallow the newline when there really was something to send, so Enter on an empty draft still breaks the line. */
    if (onEnter()) e.preventDefault();
  };
  doc.addEventListener("keydown", listener, true);
  return () => doc.removeEventListener("keydown", listener, true);
}

/** Turns the Enter capture on while a composer is focused; returns the off switch. `onEnter` reports whether it sent. */
export function captureHardwareEnter(onEnter: () => boolean): () => void {
  if (web) return captureWebEnter(onEnter);
  if (!native) return () => undefined;
  native.setEnabled(true);
  const sub = native.addListener("onEnter", () => void onEnter());
  return () => {
    sub.remove();
    native.setEnabled(false);
  };
}
