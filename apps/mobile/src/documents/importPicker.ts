import type { LicenceTier } from "@inborn/core";
import { chooseFile, type ChosenFile } from "./chooseFile";
import { FREE_PAGE_CAP, type DocumentLibrary } from "./library";
import { PICK_TYPES, pickedName, sniffPicked } from "./office";
import { runPick } from "./pickPlan";
import type { PickOutcome } from "./pickOutcome";

export type { PickOutcome } from "./pickOutcome";

/** The attach sheet's "Add a file": pick, route by kind (Excel/HTML are Work), import into the library, hand back the id.
 *  `incognito` keeps the document in RAM for the session (§5.7), never in the encrypted library. */
export async function pickIntoLibrary(library: DocumentLibrary, tier: LicenceTier, attachedCount: number, incognito = false, choose: () => Promise<ChosenFile | null> = () => chooseFile(PICK_TYPES)): Promise<PickOutcome> {
  return runPick(tier, attachedCount, {
    choose,
    nameOf: (file) => pickedName(file.uri, file.name),
    kindOf: sniffPicked,
    importFile: (uri, name) => library.importFile(uri, name, { pageCap: tier === "free" ? FREE_PAGE_CAP : undefined, incognito }),
  });
}
