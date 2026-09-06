import type { DeliverySource } from "@inborn/core";

/** Where a catalog model's bytes may be on this device, in the order the engine prefers them. */
export interface ModelCandidates {
  /** Inside the app bundle (iOS, `<App>.app/<id>.gguf`), read-only, present from install. */
  bundled?: string | null;
  /** `Documents/instant.gguf`, put there by hand for a dev run (README "iOS device run"). */
  documents?: string | null;
  /** Delivered by the platform (Play pack, HTTPS download) into the vault directory. */
  downloaded?: string | null;
}

export interface ModelLocation {
  via: DeliverySource | "dev";
  path: string;
}

/**
 * Bundled beats everything: it is the copy the store signed. A hand-pushed dev file beats a download so a developer
 * can test a build without the bundle against the exact file they pushed. Null when nothing is there.
 */
export function pickModelLocation(c: ModelCandidates): ModelLocation | null {
  if (c.bundled) return { via: "bundled", path: c.bundled };
  if (c.documents) return { via: "dev", path: c.documents };
  if (c.downloaded) return { via: "https", path: c.downloaded };
  return null;
}
