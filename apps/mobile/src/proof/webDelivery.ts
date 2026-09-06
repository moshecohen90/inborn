import type { TransferRecord } from "@inborn/core";
import { webBoot } from "../web/boot";
import { webTransfers } from "../web/transfers";

export interface WebDelivery {
  name: string;
  bytes: number;
  /** Where the tab fetched the model from: this page's own origin unless the manifest allow-listed another host. */
  origin: string;
  /** The stored file's sha256 equals the manifest's. */
  verified: boolean;
}

/** Web: the model on disk in OPFS and where it came from, for S50 "last delivery". */
export function lastWebDelivery(): WebDelivery | null {
  let boot;
  try {
    boot = webBoot();
  } catch {
    return null;
  }
  if (!boot.source || boot.status.kind !== "ready") return null;
  const { source, status } = boot;
  return { name: source.name, bytes: status.meta.bytes, origin: new URL(source.url, location.origin).origin, verified: !!source.sha256 && source.sha256 === status.meta.sha256 };
}

/** Transfers from earlier page loads, so the exit meter counts the model download this tab once made. */
export const priorTransfers = (): TransferRecord[] => webTransfers();
