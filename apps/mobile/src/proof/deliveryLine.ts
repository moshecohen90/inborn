import type { DeliverySource } from "@inborn/core";

/**
 * Which "last delivery" line the Proof screen prints. The source is read off the delivery the way
 * `onboarding/modelStep.ts` does it, never guessed from the platform: F206 shipped "Apple-hosted asset
 * pack" for a file our own CDN served, on the one screen whose whole job is literal accuracy.
 */
export function deliveryKey(source: DeliverySource): string {
  switch (source) {
    case "play":
      return "proof.delivery.play";
    case "apple":
      return "proof.delivery.apple";
    case "hf":
      return "proof.delivery.hf";
    case "https":
      return "proof.delivery.https";
    case "import":
      return "proof.delivery.imported";
    case "bundled":
      return "proof.delivery.builtin";
  }
}

/** What the vault's newest install looks like to the delivery strip once nothing is downloading (F206). */
export type DoneDelivery = { name: string; status: "done"; progress: 1; totalBytes: number; source: DeliverySource };

/* Without this the strip goes straight from "verifying" back to null and the done branch is dead code. */
export function doneDelivery(last: { name: string; bytes: number; via: DeliverySource } | null): DoneDelivery | null {
  return last ? { name: last.name.toUpperCase(), status: "done", progress: 1, totalBytes: last.bytes, source: last.via } : null;
}
