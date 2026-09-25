import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

export interface EscapeKey {
  key: string;
  preventDefault(): void;
  stopPropagation(): void;
}
export interface KeyTarget {
  addEventListener(type: "keydown" | "keyup", fn: (e: EscapeKey) => void, capture: boolean): void;
  removeEventListener(type: "keydown" | "keyup", fn: (e: EscapeKey) => void, capture: boolean): void;
}

/**
 * react-native-web's Modal listens for Esc only once its entry animation ends (it turns "active" on animationend,
 * 250 ms), so Esc in that window did nothing (F396). Until then the newest opening modal takes Esc here, and the
 * matching keyup is swallowed so the modal underneath, already active, does not close with it.
 */
export function createEarlyEscape(target: KeyTarget) {
  const opening: (() => void)[] = [];
  const swallowUp = (e: EscapeKey) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    target.removeEventListener("keyup", swallowUp, true);
  };
  const onDown = (e: EscapeKey) => {
    const close = opening[opening.length - 1];
    if (e.key !== "Escape" || !close) return;
    e.preventDefault();
    e.stopPropagation();
    target.addEventListener("keyup", swallowUp, true);
    close();
  };
  return {
    /** Registers an opening modal; the returned function unregisters it. */
    add(close: () => void): () => void {
      if (!opening.length) target.addEventListener("keydown", onDown, true);
      opening.push(close);
      return () => {
        const i = opening.lastIndexOf(close);
        if (i >= 0) opening.splice(i, 1);
        if (!opening.length) target.removeEventListener("keydown", onDown, true);
      };
    },
  };
}

let shared: ReturnType<typeof createEarlyEscape> | null = null;

/** Esc closes a web modal from its first frame. Pass the returned callback as the Modal's `onShow`. */
export function useEarlyEscape(visible: boolean, onClose: () => void): () => void {
  const [shown, setShown] = useState(false);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!visible) setShown(false);
  }, [visible]);
  useEffect(() => {
    const win = (globalThis as { window?: KeyTarget }).window;
    if (Platform.OS !== "web" || !visible || shown || !win) return;
    shared ??= createEarlyEscape(win);
    return shared.add(() => close.current());
  }, [visible, shown]);
  return useCallback(() => setShown(true), []);
}
