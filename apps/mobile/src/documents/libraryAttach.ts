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
