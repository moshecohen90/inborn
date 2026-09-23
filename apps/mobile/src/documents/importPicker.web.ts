import { fileIntake, paywallFor, type LicenceTier } from "@inborn/core";
import { FREE_PAGE_CAP, type DocumentLibrary } from "./library";
import { primeHead, registerBlob } from "./files";
import { PICK_TYPES, pickedName, sniffPicked } from "./office";
import type { PickOutcome } from "./pickOutcome";

export type { PickOutcome } from "./pickOutcome";

/**
 * A browser has no `File.pickFileAsync`: expo-file-system's web build resolves to nothing, and `File.pickFileAsync`
 * turns the TypeError that follows into `canceled: true`, so "Add a file" reported a cancelled pick every time and
 * said nothing (QA F100). The chooser is therefore an `<input type="file">` of our own, clicked with nothing awaited
 * above it so it stays inside the gesture that opened it.
 */
function chooseFile(): Promise<globalThis.File | null> {
  const doc = (globalThis as { document?: Document }).document;
  if (!doc) return Promise.resolve(null);
  const input = doc.createElement("input");
  input.type = "file";
  input.accept = PICK_TYPES.join(",");
  input.multiple = false;
  input.style.display = "none";
  doc.body.appendChild(input);
  const picked = new Promise<globalThis.File | null>((resolve) => {
    let settled = false;
    const done = (file: globalThis.File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };
    input.addEventListener("change", () => done(input.files?.[0] ?? null));
    /* Chrome/Safari fire `cancel` on dismiss; a browser without it leaves the hidden input parked until the tab goes. */
    input.addEventListener("cancel", () => done(null));
  });
  input.click();
  return picked;
}

/** The web door into the library: same gate, same order as the phone's (importPicker.ts), over a blob instead of a URI. */
export async function pickIntoLibrary(library: DocumentLibrary, tier: LicenceTier, attachedCount: number, incognito = false): Promise<PickOutcome> {
  if (paywallFor(tier, { kind: "document", existing: attachedCount })) return { kind: "paywall", moment: "document" };
  const file = await chooseFile();
  if (!file) return { kind: "cancelled" };
  const uri = registerBlob(file, file.name);
  await primeHead(uri);
  const name = pickedName(uri, file.name);
  const verdict = fileIntake(tier, sniffPicked(uri, name), attachedCount);
  if (verdict.kind === "paywall") return verdict;
  const doc = await library.importFile(uri, name, { pageCap: tier === "free" ? FREE_PAGE_CAP : undefined, incognito });
  if (doc.status === "failed" || doc.status === "empty") return { kind: "error", error: doc.error ?? doc.status };
  return { kind: "imported", id: doc.id };
}
