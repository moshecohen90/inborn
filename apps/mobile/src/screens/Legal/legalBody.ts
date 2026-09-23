/* The repo copies open with a title, an edit note and an identity block (effective date, licensor/publisher, contact)
   before the first section heading. The screen used to start at that heading, so Terms named no licensor, no phone and
   no effective date on the device while §14 still pointed at "the effective date at the top" (F97). Split here rather
   than in the screen so a test can read exactly what the device shows without pulling React Native in. */

/** A header line that states a fact: `Label: value`. */
const FACT = /^([A-Z][A-Za-z ]{1,30}): *(\S.*)$/;
/** `Spec basis` carries the edit note the screen already shows its own way; `Status` is the draft banner, never shown. */
const NOT_SHOWN = new Set(["Spec basis", "Status"]);

export type LegalScreen = { meta: string[]; body: string };

/** What the Legal screen renders: the identity block under the title, then the text from the first `##` heading. */
export function legalScreen(source: string): LegalScreen {
  const lines = source.split("\n");
  const first = lines.findIndex((l) => /^##\s/.test(l));
  const meta = (first > 0 ? lines.slice(0, first) : [])
    .map((l) => FACT.exec(l.replace(/\*\*/g, "").trim()))
    .filter((m): m is RegExpExecArray => m !== null && !NOT_SHOWN.has(m[1]!))
    .map((m) => `${m[1]}: ${m[2]}`);
  return { meta, body: (first > 0 ? lines.slice(first) : lines).join("\n").trim() };
}

export function legalBody(source: string): string {
  return legalScreen(source).body;
}
