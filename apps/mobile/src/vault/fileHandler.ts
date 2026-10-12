import { useEffect } from "react";

/** URLs the OS hands us as the registered `.gguf` handler (spec §7.2): file:// on iOS, content:// or file:// on Android. */
export function isGgufOpenUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (lower.startsWith("inborn://")) return false;
  return lower.startsWith("file:") || lower.startsWith("content:");
}

const listeners = new Set<(url: string) => void>();
let pending: string | null = null;

/**
 * Every URL the OS opens the app with passes through the router's native-intent hook; a model file is taken here, held
 * until the screen that imports (model step, vault) is up, and never treated as a route. True when the URL was a file.
 */
export function offerOpenedFile(url: string): boolean {
  if (!isGgufOpenUrl(url)) return false;
  if (listeners.size === 0) pending = url;
  else for (const l of listeners) l(url);
  return true;
}

/** Delivers the file the app was opened with, and every later "open with Inborn" while this screen is up. */
export function useGgufOpenHandler(onOpen: (url: string) => void): void {
  useEffect(() => {
    listeners.add(onOpen);
    const held = pending;
    pending = null;
    if (held) onOpen(held);
    return () => {
      listeners.delete(onOpen);
    };
  }, [onOpen]);
}

/** Tests only. */
export function resetOpenedFiles(): void {
  listeners.clear();
  pending = null;
}
