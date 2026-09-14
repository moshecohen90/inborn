import { useSyncExternalStore } from "react";
import { MIN_FREE_BYTES_TO_CHAT } from "@inborn/core";
import { freeDiskBytes } from "../vault/device";

/**
 * One switch for "the disk is full" (QA R4-F13): any writer that hits ENOSPC flips it, the §8.8 strip shows
 * `state.storageFull`, and a poll clears it once the device has room again and runs the writers' retries.
 */
const POLL_MS = 10_000;

let full = false;
let poller: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();
const retries = new Set<() => void>();

const publish = () => {
  for (const l of listeners) l();
};

export const isStorageFull = (): boolean => full;

export function reportStorageFull(): void {
  if (!full) {
    full = true;
    console.warn(`[storage] disk full · ${freeDiskBytes()} bytes free`);
    publish();
  }
  if (!poller) poller = setInterval(check, POLL_MS);
}

/** A write to retry once space is back (the prefs file keeps its last unsaved value this way). */
export function onSpaceBack(retry: () => void): () => void {
  retries.add(retry);
  return () => retries.delete(retry);
}

/** True when the device has too little room for a new chat; flips the strip on so the user learns why nothing was sent. */
export function chatBlockedByStorage(): boolean {
  if (freeDiskBytes() >= MIN_FREE_BYTES_TO_CHAT) return false;
  reportStorageFull();
  return true;
}

function check(): void {
  if (freeDiskBytes() < MIN_FREE_BYTES_TO_CHAT) return;
  if (poller) clearInterval(poller);
  poller = null;
  full = false;
  publish();
  for (const r of [...retries]) r();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const useStorageFull = (): boolean => useSyncExternalStore(subscribe, isStorageFull, isStorageFull);

/** Tests: reset the switch. */
export function resetStorageFullForTests(): void {
  if (poller) clearInterval(poller);
  poller = null;
  full = false;
  retries.clear();
}
