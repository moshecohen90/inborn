import type { TransferRecord } from "@inborn/core";

/* The vault's network layer runs before AppServices mounts (boot scan, resumed downloads): records wait here until the log subscribes. */
const listeners = new Set<(r: TransferRecord) => void>();
let backlog: TransferRecord[] = [];

/** Every request the app itself makes (model bytes, Hugging Face search) lands in the S50 network log through here. */
export function recordTransfer(r: Omit<TransferRecord, "at"> & { at?: number }): void {
  const record: TransferRecord = { ...r, at: r.at ?? Date.now() };
  if (listeners.size === 0) backlog.push(record);
  for (const l of listeners) l(record);
}

export function subscribeTransfers(l: (r: TransferRecord) => void): () => void {
  listeners.add(l);
  return () => void listeners.delete(l);
}

export function drainTransfers(): TransferRecord[] {
  const out = backlog;
  backlog = [];
  return out;
}
