import type { DocKind } from "../rag/types";
import { can } from "./gates";
import { paywallFor } from "./moments";
import type { LicenceTier } from "./types";

/**
 * The Work formats (§7.3 row 8: "ייבוא DOCX/XLSX/HTML" into vaults). DOCX and CSV are **not** here: §7.3 row 1 names
 * PDF/TXT/MD/DOCX/CSV/code as the Free single attachment, and the more specific row wins. §7.3 row 5's Pro "table
 * understanding (CSV/XLSX)" is the RAG capability inside the Pro library, not the intake door.
 */
export const WORK_DOC_KINDS: readonly DocKind[] = ["xlsx", "html"];

export const isWorkKind = (kind: DocKind): boolean => WORK_DOC_KINDS.includes(kind);

export type IntakeVerdict = { kind: "ok" } | { kind: "paywall"; moment: "document" | "office" };

/**
 * The one answer for every file that enters the library, whatever door it came through: the attach sheet's picker, the
 * S40 library, or a share-in from another app (§7.7). A door that decides for itself walks past the Free file cap
 * (§7.3 row 1) or the Work formats (§7.3 row 8) — which is exactly what the share target did.
 */
export function fileIntake(tier: LicenceTier, kind: DocKind, attachedCount: number): IntakeVerdict {
  if (paywallFor(tier, { kind: "document", existing: attachedCount })) return { kind: "paywall", moment: "document" };
  if (isWorkKind(kind) && !can(tier, "officeIngest")) return { kind: "paywall", moment: "office" };
  return { kind: "ok" };
}
