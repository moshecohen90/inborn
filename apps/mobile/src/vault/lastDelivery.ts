import type { DeliverySource } from "@inborn/core";

/** The newest file the vault holds, which is what the Proof screen's LAST DELIVERY line names. */
export type DeliveredInstall = { id: string; name: string; bytes: number; via: DeliverySource; at: number };
export type DeliveryCandidate = DeliveredInstall & { ready: boolean };

/* A record whose file is gone, or that never finished, is not a delivery: Proof must not name a file this phone cannot load (F206). */
export function newestDelivery(candidates: DeliveryCandidate[]): DeliveredInstall | null {
  let best: DeliveredInstall | null = null;
  for (const c of candidates) {
    if (!c.ready || !c.name || !(c.at > 0)) continue;
    if (!best || c.at > best.at) best = { id: c.id, name: c.name, bytes: c.bytes, via: c.via, at: c.at };
  }
  return best;
}
