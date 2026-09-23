import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Round 48 (F205). `apple.description` bullet 2 named Android in all eight locales, which is an App Store
 * Review Guideline 2.3.10 metadata rejection in every storefront at once, and the checker was blind to it.
 * These tests run the real script, first on the real listings and then on a sabotaged copy of them.
 */
const repo = join(__dirname, "../../..");
const CHECKER = join(repo, "docs/store/scripts/check-store-copy.mjs");
const STORE = join(repo, "docs/store");
const LOCALES = readdirSync(STORE).filter((f) => /^listing\..+\.json$/.test(f));

/** Only the shape these tests reach into; the real listings carry a good deal more. */
interface Listing {
  apple: { name: string; subtitle: string; promotional_text: string; description: string; whats_new: string; keywords: string };
  google: { title: string; short_description: string; full_description: string };
  screenshots: { headline: string; subline: string }[];
  reviewer_notes: string;
}

function run(dir: string) {
  const r = spawnSync(process.execPath, [CHECKER, dir], { encoding: "utf8" });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

/** A copy of the eight listings, with `edit` applied to each one, so the guard can be watched failing. */
function sabotage(edit: (data: Listing) => void): string {
  const dir = mkdtempSync(join(tmpdir(), "inborn-store-"));
  for (const f of LOCALES) {
    cpSync(join(STORE, f), join(dir, f));
    const data = JSON.parse(readFileSync(join(dir, f), "utf8")) as Listing;
    edit(data);
    writeFileSync(join(dir, f), JSON.stringify(data, null, 2));
  }
  return dir;
}

describe("F205 · no Apple field names Android, and no Play field names Apple", () => {
  it("the eight listings as they stand pass the whole check", () => {
    const { code, out } = run(STORE);
    expect(out).toContain("PASS");
    expect(code).toBe(0);
  });

  it("the words are gone from every Apple field of every locale", () => {
    for (const f of LOCALES) {
      const apple = (JSON.parse(readFileSync(join(STORE, f), "utf8")) as Listing).apple as unknown as Record<string, string>;
      for (const [field, text] of Object.entries(apple)) {
        expect(text, `${f} apple.${field}`).not.toMatch(/\bandroid\b|\bgoogle play\b/i);
      }
    }
  });

  it("a copy with Android put back into apple.description fails, once per locale, naming the field", () => {
    const dir = sabotage((d) => {
      d.apple.description = `${d.apple.description}\n- Android: open the permissions page and look.`;
    });
    const { code, out } = run(dir);
    expect(code).toBe(1);
    expect(out.match(/apple\.description names the other platform \("Android"\)/g)).toHaveLength(LOCALES.length);
    expect(out).toContain("Guideline 2.3.10");
  });

  it("the same guard fires on apple.whats_new, apple.keywords and a shared screenshot line", () => {
    const cases: [string, (d: Listing) => void][] = [
      ["apple.whats_new", (d) => (d.apple.whats_new += "\n- On Android there is no Internet permission.")],
      ["apple.keywords", (d) => (d.apple.keywords = "android,offline")],
      ["screenshots[0].subline", (d) => (d.screenshots[0]!.subline = "Also on Android.")],
    ];
    for (const [path, edit] of cases) {
      const { code, out } = run(sabotage(edit));
      expect(code, path).toBe(1);
      expect(out, path).toContain(`${path} names the other platform`);
    }
  });

  it("and in the other direction: an Apple platform name in Play copy fails too", () => {
    const dir = sabotage((d) => {
      d.google.full_description = `${d.google.full_description}\n- Also on the App Store for iPhone.`;
    });
    const { code, out } = run(dir);
    expect(code).toBe(1);
    expect(out.match(/google\.full_description names the other platform/g)).toHaveLength(LOCALES.length);
  });

  it("reviewer_notes may still name both platforms, because a reviewer needs them", () => {
    const notes = (JSON.parse(readFileSync(join(STORE, "listing.en.json"), "utf8")) as Listing).reviewer_notes;
    expect(notes).toMatch(/\bAndroid\b/);
    expect(run(STORE).code).toBe(0);
  });
});
