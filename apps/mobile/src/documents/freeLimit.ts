import { can, limits, type LicenceTier } from "@inborn/core";

/** What Free keeps in the library, for the line under the Documents header; null when the tier has no limit. */
export function freeDocumentLimit(tier: LicenceTier, pageCap: number): { count: number; pages: number } | null {
  return can(tier, "documents") ? null : { count: limits(tier).filesPerChat, pages: pageCap };
}
