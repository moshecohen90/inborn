import type { DroppedEntry } from "./dropped";

/** Phones and tablets have no window to drop a file on; the desktop implementation is drop.web.ts (§8.9). */
export function useDocumentDrop(_onDrop: (paths: string[]) => void): void {
  /* nothing to listen to */
}

export async function openDropped(_path: string): Promise<(DroppedEntry & { uri: string }) | null> {
  return null;
}
