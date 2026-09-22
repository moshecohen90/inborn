import { File } from "expo-file-system";
import { fileIntake, paywallFor, type LicenceTier } from "@inborn/core";
import { FREE_PAGE_CAP, type DocumentLibrary } from "./library";
import { PICK_TYPES, pickedName, sniffPicked } from "./office";

export type PickOutcome = { kind: "cancelled" } | { kind: "paywall"; moment: "document" | "office" } | { kind: "error"; error: string } | { kind: "imported"; id: string };

/** The attach sheet's "Add a file": pick, route by kind (Excel/HTML are Work), import into the library, hand back the id. */
export async function pickIntoLibrary(library: DocumentLibrary, tier: LicenceTier, attachedCount: number): Promise<PickOutcome> {
  /* The count moment is knowable before the picker opens; `fileIntake` below is still the authoritative answer. */
  if (paywallFor(tier, { kind: "document", existing: attachedCount })) return { kind: "paywall", moment: "document" };
  const picked = await File.pickFileAsync({ multipleFiles: false, mimeTypes: PICK_TYPES });
  if (picked.canceled) return { kind: "cancelled" };
  const name = pickedName(picked.result.uri, picked.result.name);
  const verdict = fileIntake(tier, sniffPicked(picked.result.uri, name), attachedCount);
  if (verdict.kind === "paywall") return verdict;
  const doc = await library.importFile(picked.result.uri, name, { pageCap: tier === "free" ? FREE_PAGE_CAP : undefined });
  if (doc.status === "failed" || doc.status === "empty") return { kind: "error", error: doc.error ?? doc.status };
  return { kind: "imported", id: doc.id };
}
