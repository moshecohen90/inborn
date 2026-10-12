import { useEffect } from "react";

/** URLs the OS hands us as the registered `.gguf` handler (spec §7.2): file:// on iOS, content:// or file:// on Android. */
export function isGgufOpenUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (lower.startsWith("inborn://")) return false;
  return lower.startsWith("file:") || lower.startsWith("content:");
}

const listeners: Array<(url: string) => void> = [];
let pending: string | null = null;

/**
 * Every URL the OS opens the app with passes through the router's native-intent hook. A model file is "taken" by the
 * screen that imports (the one mounted last: model step or vault), or "held" until one is up; a route is `false`.
 */
export function offerOpenedFile(url: string): "taken" | "held" | false {
  if (!isGgufOpenUrl(url)) return false;
  const last = listeners.at(-1);
  if (!last) {
    pending = url;
    return "held";
  }
  last(url);
  return "taken";
}

/** Delivers the file the app was opened with, and every later "open with Inborn" while this screen is up. */
export function useGgufOpenHandler(onOpen: (url: string) => void): void {
  useEffect(() => {
    listeners.push(onOpen);
    const held = pending;
    pending = null;
    if (held) onOpen(held);
    return () => {
      const i = listeners.lastIndexOf(onOpen);
      if (i >= 0) listeners.splice(i, 1);
    };
  }, [onOpen]);
}

/** Tests only. */
export function resetOpenedFiles(): void {
  listeners.length = 0;
  pending = null;
}
