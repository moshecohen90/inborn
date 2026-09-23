import { fileIntake, paywallFor, type LicenceTier } from "@inborn/core";
import { FREE_PAGE_CAP, type DocumentLibrary } from "./library";
import { chooseFile } from "./chooseFile";
import { PICK_TYPES, pickedName, sniffPicked } from "./office";
import type { PickOutcome } from "./pickOutcome";

export type { PickOutcome } from "./pickOutcome";

/** The web door into the library: same gate, same order as the phone's (importPicker.ts), over a blob instead of a URI. */
export async function pickIntoLibrary(library: DocumentLibrary, tier: LicenceTier, attachedCount: number, incognito = false): Promise<PickOutcome> {
  if (paywallFor(tier, { kind: "document", existing: attachedCount })) return { kind: "paywall", moment: "document" };
  const file = await chooseFile(PICK_TYPES);
  if (!file) return { kind: "cancelled" };
  const name = pickedName(file.uri, file.name);
  const verdict = fileIntake(tier, sniffPicked(file.uri, name), attachedCount);
  if (verdict.kind === "paywall") return verdict;
  const doc = await library.importFile(file.uri, name, { pageCap: tier === "free" ? FREE_PAGE_CAP : undefined, incognito });
  if (doc.status === "failed" || doc.status === "empty") return { kind: "error", error: doc.error ?? doc.status };
  return { kind: "imported", id: doc.id };
}
