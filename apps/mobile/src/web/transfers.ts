import type { TransferRecord } from "@inborn/core";

const KEY = "inborn.web.transfers";

/** Model downloads this origin completed, kept across reloads: the worker's fetch never shows in the page's resource timing. */
export function webTransfers(): TransferRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TransferRecord[]) : [];
  } catch {
    return [];
  }
}

export function recordWebTransfer(r: TransferRecord): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...webTransfers(), r]));
  } catch {
    /* no localStorage: the proof page then only shows what this session saw */
  }
}
