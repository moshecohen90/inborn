import { useEffect } from "react";
import { isTauri } from "../adapters/tauri";
import { primeHead, readHead, registerBlob } from "./files";
import { nameOfPath, type DroppedEntry } from "./dropped";

const DROPPED_EVENT = "inborn:documents-dropped";

type TauriGlobal = { core: { invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> } };
const invoke = <T,>(cmd: string, args?: Record<string, unknown>): Promise<T> => (window as Window & { __TAURI__?: TauriGlobal }).__TAURI__!.core.invoke<T>(cmd, args);

/** Files dropped on the desktop window (adapters/tauri.ts relays the Rust event onto `window`). */
export function useDocumentDrop(onDrop: (paths: string[]) => void): void {
  useEffect(() => {
    if (!isTauri()) return;
    const listener = (e: Event) => {
      const detail = (e as CustomEvent<unknown>).detail;
      const paths = Array.isArray(detail) ? detail.filter((p): p is string => typeof p === "string") : [];
      if (paths.length) onDrop(paths);
    };
    window.addEventListener(DROPPED_EVENT, listener);
    return () => window.removeEventListener(DROPPED_EVENT, listener);
  }, [onDrop]);
}

/**
 * The desktop's document library is blob-backed like the browser's, so a dropped OS path is read through Rust
 * (`documents_read`, which serves only paths this window was actually given) and registered as a blob.
 */
export async function openDropped(path: string): Promise<(DroppedEntry & { uri: string }) | null> {
  try {
    const bytes = await invoke<ArrayBuffer>("documents_read", { path });
    const uri = registerBlob(new Blob([bytes]), nameOfPath(path));
    await primeHead(uri);
    return { path, uri, head: readHead(uri, 64) };
  } catch (e: unknown) {
    console.warn(`[documents] dropped file unreadable: ${path}`, e);
    return null;
  }
}
