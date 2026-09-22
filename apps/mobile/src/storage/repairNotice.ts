import { useSyncExternalStore } from "react";
import type { RepairOutcome } from "@inborn/core";

/**
 * The database was damaged and the app did something about it. The user is told once, in the §8.8 strip, because
 * the alternative the app used to have — deleting the file and opening a new one — looked exactly like "my chats
 * are gone" with nothing on screen to explain it.
 */
let outcome: RepairOutcome | null = null;
const listeners = new Set<() => void>();

export const repairOutcome = (): RepairOutcome | null => outcome;

export function reportRepair(next: RepairOutcome): void {
  outcome = next;
  console.warn(`[storage] chat database ${next.kind} · kept ${next.copied} rows · lost ${next.lost} · old file ${next.quarantined || "not kept"}`);
  for (const l of listeners) l();
}

export function dismissRepair(): void {
  if (!outcome) return;
  outcome = null;
  for (const l of listeners) l();
}

export const subscribeRepair = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const useRepairOutcome = (): RepairOutcome | null => useSyncExternalStore(subscribeRepair, repairOutcome, repairOutcome);
