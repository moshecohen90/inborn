import { useSyncExternalStore } from "react";
import type { Citation } from "@inborn/core";

/** What the right-hand panel of the desktop shell is showing (spec §8.9: "document/citation panel"). */
export type SidePanel = { kind: "citation"; citation: Citation } | { kind: "documents" };

let current: SidePanel | null = null;
const listeners = new Set<() => void>();

const emit = (): void => {
  for (const l of [...listeners]) l();
};

export function openSidePanel(panel: SidePanel): void {
  current = panel;
  emit();
}

export function closeSidePanel(): void {
  if (!current) return;
  current = null;
  emit();
}

export function useSidePanel(): SidePanel | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => current,
    () => current,
  );
}
