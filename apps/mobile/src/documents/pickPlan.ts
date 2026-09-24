import { fileIntake, paywallFor, type DocKind, type DocumentRecord, type LicenceTier } from "@inborn/core";
import type { ChosenFile } from "./chooseFile";
import type { PickOutcome } from "./pickOutcome";

/** What the pick needs from the platform: the chooser, the real name behind the URI, the kind, and the import. */
export interface PickDeps {
  choose(): Promise<ChosenFile | null>;
  nameOf(file: ChosenFile): string;
  kindOf(uri: string, name: string): DocKind;
  importFile(uri: string, name: string): Promise<Pick<DocumentRecord, "id" | "status" | "error">>;
}

/**
 * The order the "Add a file" door runs in, once for every platform: count gate → pick → kind gate → import.
 *
 * It was written out twice, in `importPicker.ts` and `importPicker.web.ts`, and the two halves were policed by a
 * symbol-parity test rather than by anything that ran the gates (round 47). The platform split it existed for is
 * `chooseFile.ts` / `chooseFile.web.ts`, which both hand back the same `ChosenFile`.
 */
export async function runPick(tier: LicenceTier, attachedCount: number, deps: PickDeps): Promise<PickOutcome> {
  /* The count moment is knowable before the picker opens; `fileIntake` below is still the authoritative answer. */
  if (paywallFor(tier, { kind: "document", existing: attachedCount })) return { kind: "paywall", moment: "document" };
  const file = await deps.choose();
  if (!file) return { kind: "cancelled" };
  const name = deps.nameOf(file);
  const kind = deps.kindOf(file.uri, name);
  if (kind === "image") return { kind: "photo", uri: file.uri, name };
  const verdict = fileIntake(tier, kind, attachedCount);
  if (verdict.kind === "paywall") return verdict;
  const doc = await deps.importFile(file.uri, name);
  if (doc.status === "failed" || doc.status === "empty") return { kind: "error", error: doc.error ?? doc.status };
  return { kind: "imported", id: doc.id };
}
