import { useSyncExternalStore } from "react";
import type { Entitlements } from "@inborn/core";

/* Placeholder until the paywall stream (M6) wires Play Billing / StoreKit; EXPO_PUBLIC_PRO=1 unlocks Pro paths in dev builds only. */
let current: Entitlements = { pro: __DEV__ && process.env.EXPO_PUBLIC_PRO === "1" };
const listeners = new Set<() => void>();

export function setEntitlements(next: Entitlements): void {
  current = next;
  for (const l of listeners) l();
}

export const getEntitlements = (): Entitlements => current;

export function useEntitlements(): Entitlements {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getEntitlements,
    getEntitlements,
  );
}
