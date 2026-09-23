import { fileIntake, type DocumentRecord, type IntakeVerdict, type LicenceTier } from "@inborn/core";

/**
 * Tapping a document already in the library attaches it to the chat: the fourth door in, after the picker, the S40
 * library and a share-in, and the only one that asked no gate (QA F129). A licence that stops paying keeps whatever the
 * library already holds, so Free went on attaching the whole shelf, Work formats included.
 *
 * It lives beside the two pickers rather than inside one, because a platform file is invisible to the other platform:
 * as part of `importPicker.ts` it was missing from the browser bundle and the row threw (QA F163).
 */
export function planLibraryAttach(tier: LicenceTier, documents: readonly DocumentRecord[], id: string, attachedCount: number): IntakeVerdict {
  const doc = documents.find((d) => d.id === id);
  return doc ? fileIntake(tier, doc.kind, attachedCount) : { kind: "ok" };
}

/** The line that says what a refused file tap was: the Work formats and the Free per-chat cap have their own sentence. */
export const fileRefusalKey = (moment: "document" | "office"): string => (moment === "office" ? "quick.fileWork" : "quick.filePro");

/**
 * What the attach sheet renders for one library row, from the same call the tap will make (QA F199).
 *
 * The row's lock used to come from the count gate alone while the format half ran only after the tap, so a `.xlsx`
 * row rendered unlocked on Free and refused when pressed. Two gates for one decision.
 */
export function attachRowLock(tier: LicenceTier, documents: readonly DocumentRecord[], id: string, attachedCount: number, attached: boolean): { locked: boolean; moment: "document" | "office" | null } {
  if (attached) return { locked: false, moment: null };
  const verdict = planLibraryAttach(tier, documents, id, attachedCount);
  return verdict.kind === "paywall" ? { locked: true, moment: verdict.moment } : { locked: false, moment: null };
}
