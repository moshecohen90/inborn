import accounting from "./packs/accounting.json";
import legal from "./packs/legal.json";
import medical from "./packs/medical.json";
import therapy from "./packs/therapy.json";

/**
 * Profession packs (spec §7.6 "ספריית תבניות", §7.9 Work): four static packs, each a declaration the professional
 * can read before using the tool and a handful of templates with `{{placeholders}}`. Static JSON in the bundle,
 * nothing fetched; the wording never claims compliance certifications (§7.9: never "HIPAA-compliant").
 */

export type PackId = "legal" | "therapy" | "medical" | "accounting";

export interface PackTemplate {
  id: string;
  title: string;
  /** One line under the title in the picker. */
  purpose: string;
  /** Prompt body with `{{placeholder}}` slots, inserted into the composer. */
  body: string;
}

export interface ProfessionPack {
  id: PackId;
  name: string;
  /** For whom, in one line. */
  audience: string;
  /** The pack's declaration: what the tool is and is not (shown before first use, printable). */
  declaration: string;
  templates: PackTemplate[];
}

export const PACKS: readonly ProfessionPack[] = [legal, therapy, medical, accounting] as ProfessionPack[];
export const PACK_IDS: readonly PackId[] = PACKS.map((p) => p.id);

export const findPack = (id: string): ProfessionPack | undefined => PACKS.find((p) => p.id === id);

const PLACEHOLDER = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g;

/** Distinct placeholder names in order of first appearance. */
export function placeholdersOf(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(PLACEHOLDER)) if (!out.includes(m[1]!)) out.push(m[1]!);
  return out;
}

/** Fills what was given; unfilled slots stay visible as `[name]` so the user sees what is still missing. */
export function fillTemplate(body: string, values: Readonly<Record<string, string>>): string {
  return body.replace(PLACEHOLDER, (_, name: string) => {
    const v = values[name]?.trim();
    return v ? v : `[${name.replace(/_/g, " ")}]`;
  });
}

/** Words the packs must never use (marketing and declarations alike, §7.9). */
export const FORBIDDEN_CLAIMS: readonly RegExp[] = [/hipaa[- ]compliant/i, /\bprivileged\b/i, /certified/i, /guarantee/i];

export function packClaimsAreHonest(pack: ProfessionPack): boolean {
  const text = [pack.declaration, pack.name, pack.audience, ...pack.templates.flatMap((t) => [t.title, t.purpose, t.body])].join("\n");
  return FORBIDDEN_CLAIMS.every((re) => !re.test(text));
}
