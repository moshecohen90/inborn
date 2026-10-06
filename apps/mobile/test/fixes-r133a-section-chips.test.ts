import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { initI18n } from "@inborn/i18n";
import { citationLabel, citationsForAnswer, type Citation, type PageWords } from "@inborn/core";

/**
 * Round 133A (Moshe, Build 37): a summary of a 9-page PDF showed chips "p.1", "p.3", "p.5", "p.8", as if only those
 * pages were read. Each chip is a section of pages; it now names the whole range.
 */
const cite = (n: number, page: number, pageTo?: number): Citation => ({ n, docId: "d", docName: "file.pdf", kind: "pdf", page, ...(pageTo ? { pageTo } : {}), chunkId: `c${n}`, snippet: "" });

async function wordsFor(lang: string): Promise<PageWords> {
  const i18n = await initI18n(lang);
  return { page: i18n.t("documents.cite.page"), sheet: i18n.t("documents.cite.sheet"), part: i18n.t("documents.cite.part") };
}

describe("round 133A · a section's chip names its pages", () => {
  let en: PageWords;
  beforeAll(async () => {
    en = await wordsFor("en");
  });

  it("a range prints p.1–2, one page prints as before", () => {
    expect(citationLabel(cite(1, 1, 2), en)).toBe("file.pdf · p.1–2");
    expect(citationLabel(cite(1, 4), en)).toBe("file.pdf · p.4");
    expect(citationLabel(cite(1, 4, 4), en)).toBe("file.pdf · p.4");
  });

  it("the range follows each locale's page word", async () => {
    expect(citationLabel(cite(1, 5, 7), await wordsFor("de"))).toBe("file.pdf · S. 5–7");
    expect(citationLabel(cite(1, 5, 7), await wordsFor("ja"))).toBe("file.pdf · p.5–7");
  });

  it("unnumbered chips keep p.1–2 and p.3–4 apart, and still fold two passages of one page", () => {
    const all = [cite(1, 1, 2), cite(2, 3, 4), cite(3, 5), cite(4, 5), cite(5, 1)];
    const { shown, cited } = citationsForAnswer("The file sets the rent.", all);
    expect(cited).toBe(false);
    expect(shown.map((c) => citationLabel(c, en))).toEqual(["file.pdf · p.1–2", "file.pdf · p.3–4", "file.pdf · p.5", "file.pdf · p.1"]);
  });

  it("every chip and passage line prints its label through citationLabel", () => {
    const src = readFileSync(join(__dirname, "../src/documents/Citations.tsx"), "utf8");
    expect(src.match(/citationLabel\((c|citation), words\)/g)?.length).toBe(4);
    expect(src).not.toMatch(/\.page\}/);
  });
});
