import { UNBUILT_FEATURES, can, limits, type Feature, type Limits } from "./gates";
import type { LicenceTier } from "./types";

/**
 * The Free / Pro / Work table (spec §7.3). One row = one thing a person can point at, and every cell is computed from
 * the same `can()` / `limits()` the screens ask, so the table can never promise a tier something the gates refuse.
 */
export type CompareRow =
  /** Never gated (§12.3: Free is a complete product), so the row reads "included" in all three columns. */
  | { id: string; kind: "always" }
  | { id: string; kind: "feature"; feature: Feature }
  | { id: string; kind: "limit"; limit: keyof Limits };

export const COMPARE_ROWS: readonly CompareRow[] = [
  { id: "chat", kind: "always" },
  { id: "privacy", kind: "always" },
  { id: "offline", kind: "always" },
  { id: "files", kind: "limit", limit: "filesPerChat" },
  { id: "ocr", kind: "feature", feature: "ocr" },
  { id: "strict", kind: "feature", feature: "strictDocuments" },
  { id: "personas", kind: "limit", limit: "personas" },
  { id: "photos", kind: "limit", limit: "imagesPerMessage" },
  { id: "memory", kind: "feature", feature: "memory" },
  { id: "folders", kind: "feature", feature: "folders" },
  { id: "models", kind: "feature", feature: "proModels" },
  { id: "voice", kind: "feature", feature: "voiceConversation" },
  { id: "stats", kind: "feature", feature: "detailedStats" },
  { id: "vaults", kind: "feature", feature: "clientVaults" },
  { id: "redaction", kind: "feature", feature: "redaction" },
  { id: "office", kind: "feature", feature: "officeIngest" },
  { id: "audit", kind: "feature", feature: "auditLog" },
  { id: "signed", kind: "feature", feature: "signedExport" },
];

export type CompareCell = { kind: "yes" } | { kind: "no" } | { kind: "count"; n: number } | { kind: "unlimited" };

export function compareCell(row: CompareRow, tier: LicenceTier): CompareCell {
  if (row.kind === "always") return { kind: "yes" };
  if (row.kind === "feature") return can(tier, row.feature) ? { kind: "yes" } : { kind: "no" };
  const n = limits(tier)[row.limit];
  return Number.isFinite(n) ? { kind: "count", n } : { kind: "unlimited" };
}

/** The tiers the table shows, in column order. */
export const COMPARE_TIERS: readonly LicenceTier[] = ["free", "pro", "work"];

/** A row for a capability this build does not ship would be a promise, not proof (§2.3). */
export const compareRowShips = (row: CompareRow): boolean => row.kind !== "feature" || !UNBUILT_FEATURES.includes(row.feature);

/**
 * Rows whose tick the web build cannot honour: `documents/extract.ts` has no OCR, so "text from scans and photos" is a
 * native-app capability. The table marks them there rather than showing a ✓ a browser reader cannot act on (§2.3).
 */
export const COMPARE_APP_ONLY: readonly string[] = ["ocr"];
