import { useCallback, useSyncExternalStore } from "react";
import type { CatalogModel } from "@inborn/core";
import { getVault, type VaultEntry, type VaultStore } from "./store";

/** Re-renders on every vault change (progress ticks included); returns the store for commands. */
export function useVault(): { vault: VaultStore; entries: VaultEntry[]; version: number } {
  const vault = getVault();
  const subscribe = useCallback((cb: () => void) => vault.subscribe(cb), [vault]);
  const version = useSyncExternalStore(subscribe, () => tick(vault), () => 0);
  return { vault, entries: vault.entries(), version };
}

/** The model the engine will load next, or null when nothing is installed. */
export function useInstalledModel(): { model: CatalogModel; path: string } | null {
  const { vault } = useVault();
  return vault.activeModel();
}

/* useSyncExternalStore needs a changing snapshot; a counter bumped per notification is enough. */
const counters = new WeakMap<VaultStore, number>();
const subscribed = new WeakSet<VaultStore>();
function tick(vault: VaultStore): number {
  if (!subscribed.has(vault)) {
    subscribed.add(vault);
    vault.subscribe(() => counters.set(vault, (counters.get(vault) ?? 0) + 1));
  }
  return counters.get(vault) ?? 0;
}
