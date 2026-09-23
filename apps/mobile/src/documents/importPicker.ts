import { File } from "expo-file-system";
import { fileIntake, paywallFor, type DocumentRecord, type IntakeVerdict, type LicenceTier } from "@inborn/core";
import { FREE_PAGE_CAP, type DocumentLibrary } from "./library";
import { PICK_TYPES, pickedName, sniffPicked } from "./office";

export type PickOutcome = { kind: "cancelled" } | { kind: "paywall"; moment: "document" | "office" } | { kind: "error"; error: string } | { kind: "imported"; id: string };

/** The attach sheet's "Add a file": pick, route by kind (Excel/HTML are Work), import into the library, hand back the id.
 *  `incognito` keeps the document in RAM for the session (§5.7), never in the encrypted library. */
export async function pickIntoLibrary(library: DocumentLibrary, tier: LicenceTier, attachedCount: number, incognito = false): Promise<PickOutcome> {
  /* The count moment is knowable before the picker opens; `fileIntake` below is still the authoritative answer. */
  if (paywallFor(tier, { kind: "document", existing: attachedCount })) return { kind: "paywall", moment: "document" };
  const picked = await File.pickFileAsync({ multipleFiles: false, mimeTypes: PICK_TYPES });
  if (picked.canceled) return { kind: "cancelled" };
  const name = pickedName(picked.result.uri, picked.result.name);
  const verdict = fileIntake(tier, sniffPicked(picked.result.uri, name), attachedCount);
  if (verdict.kind === "paywall") return verdict;
  const doc = await library.importFile(picked.result.uri, name, { pageCap: tier === "free" ? FREE_PAGE_CAP : undefined, incognito });
  if (doc.status === "failed" || doc.status === "empty") return { kind: "error", error: doc.error ?? doc.status };
  return { kind: "imported", id: doc.id };
}

/**
 * Tapping a document already in the library attaches it to the chat: the fourth door in, after the picker, the S40
 * library and a share-in, and the only one that asked no gate (QA F129). A licence that stops paying keeps whatever the
 * library already holds, so Free went on attaching the whole shelf, Work formats included.
 */
export function planLibraryAttach(tier: LicenceTier, documents: readonly DocumentRecord[], id: string, attachedCount: number): IntakeVerdict {
  const doc = documents.find((d) => d.id === id);
  return doc ? fileIntake(tier, doc.kind, attachedCount) : { kind: "ok" };
}
