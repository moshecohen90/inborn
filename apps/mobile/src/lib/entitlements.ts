import { useSyncExternalStore } from "react";
import type { Entitlements } from "@inborn/core";
import { DEV_TIER } from "../licence/devFlags";

/* The simple Pro/Free shape the chat screens read; the licence manager (src/licence) feeds it from the verified tier. */
let current: Entitlements = { pro: DEV_TIER !== null };
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
