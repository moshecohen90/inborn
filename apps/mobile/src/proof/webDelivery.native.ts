import type { TransferRecord } from "@inborn/core";
import type { WebDelivery } from "./webDelivery";

export type { WebDelivery };

/** Phones get their models from the store or the vault, never from a page origin (see Proof "last delivery"). */
export const lastWebDelivery = (): WebDelivery | null => null;
export const priorTransfers = (): TransferRecord[] => [];
