import { describe, expect, it } from "vitest";
import { Bm25Index, buildRagPrompt, DEFAULT_MIN_COSINE_ALONE, isRelevant, type DocumentRecord, type RetrievalHit } from "../src/rag";
import shipped from "./fixtures/rag/e5-cosines.json";
import old from "./fixtures/rag/cjk-cosines.json";

/**
 * F334. The shipped embedder (multilingual-e5-large-instruct Q6_K) on round 70's own questions, through the real
 * lexical index and the real prompt builder, in both modes. Every cosine is the one the phone computes
 * (docs/qa/embed-multilingual/measure.md; regenerate with rag-multilingual-measure.test.ts). Since F363 the set carries
 * accented de/fr/es/pt text, the round-70 accent-less questions as `sloppy` typing variants, and zh-Hant documents.
 */
interface OneDoc {
  id: string;
  lang: string;
  text: string;
  questions: Array<{ kind: "on" | "off"; q: string; cosine: number; sloppy?: boolean }>;
}
interface SixDoc {
  id: string;
  lang: string;
  answers: number;
  chunks: string[];
  questions: Array<{ kind: "on" | "off"; q: string; cosines: number[]; sloppy?: boolean }>;
}
const ONE = shipped.docs as OneDoc[];
/* Round 81's accent-less French question asks for "sieges" in a passage that says "bureaux", so only its cosine (0.777) could cite it. */
const EXPECTED_BY_LANG: Record<string, string> = {
  de: "5/5",
  "de (no accents)": "4/4",
  en: "8/10",
  es: "3/5",
  "es (no accents)": "2/4",
  fr: "6/6",
  "fr (no accents)": "1/2",
  he: "5/5",
  ja: "13/14",
  ko: "6/6",
  pt: "5/5",
  "pt (no accents)": "3/3",
  zh: "10/10",
  "zh-Hant": "10/10",
};
/* What the word index cites without the cosine standing alone: the half the accent fold moves (F367). */
const EXPECTED_LEXICAL_BY_LANG: Record<string, string> = {
  de: "0/5",
  "de (no accents)": "2/4",
  en: "4/10",
  es: "1/5",
  "es (no accents)": "2/4",
  fr: "1/6",
  "fr (no accents)": "1/2",
  he: "3/5",
  ja: "8/14",
  ko: "3/6",
  pt: "3/5",
  "pt (no accents)": "2/3",
  zh: "7/10",
  "zh-Hant": "8/10",
};
/** The questions whose only word in common with their passage is accented there. */
const FOLDED_ONLY: Record<string, string> = {
  "de-report": "Wo liegen die Hauptburos?",
  "es-report": "¿Segun el reporte, cuantos empleados hay?",
  "fr-report": "Combien d'employes compte la societe?",
  "pt-report": "Em que cidades estao os escritorios?",
};
/** F368: the German question whose only shared word has an umlaut the typist spelled "ue", and the French one whose only shared word is elided in the passage ("d'Aoba"). */
const SPELLED_ONLY: Record<string, string> = {
  "de-report": "Wo liegen die Hauptbueros?",
  "fr-report": "Combien de gens travaillent chez Aoba?",
};
const SIX = shipped.multi as SixDoc[];

const record = (id: string, chunks: number): DocumentRecord => ({ id, name: `${id}.txt`, kind: "txt", bytes: 200, pages: 1, addedAt: 0, status: "indexed", indexedPages: 1, chunkCount: chunks, flaggedLines: 0, ocrPages: 0 });

/** Every chunk of a document as a hit for `question`, scored by the real lexical index and carrying its measured cosine. */
function hits(docId: string, chunks: string[], question: string, cosines: number[]): RetrievalHit[] {
  const index = new Bm25Index();
  chunks.forEach((c, i) => index.add(`${docId}#${i}`, c));
  const lexical = new Map(index.search(question, 10).map((h) => [h.id, h]));
  return chunks.map((text, i) => {
    const id = `${docId}#${i}`;
    return { chunk: { id, docId, page: 1, ord: i, text, start: 0, end: text.length, tokens: 60 }, score: 1, cosine: cosines[i]!, bm25: lexical.get(id)?.score ?? 0, bm25Terms: lexical.get(id)?.matched ?? 0 };
  });
}

const citedIn = (docId: string, chunks: string[], question: string, cosines: number[], strict: boolean) =>
  buildRagPrompt({ question, hits: hits(docId, chunks, question, cosines), docs: new Map([[docId, record(docId, chunks.length)]]), strict, nCtx: 8192, nonce: "n" }).used.map((h) => h.chunk.ord);

const labelOf = (lang: string, q: { sloppy?: boolean }) => (q.sloppy ? `${lang} (no accents)` : lang);

describe("F363 · the fixtures cover what users of the launch locales type", () => {
  it("zh-Hant has its own one-passage and six-chunk documents, written in Traditional glyphs", () => {
    const hant = [...ONE.filter((d) => d.lang === "zh-Hant").map((d) => d.text), ...SIX.filter((d) => d.lang === "zh-Hant").flatMap((d) => d.chunks)];
    expect([ONE.filter((d) => d.lang === "zh-Hant").length, SIX.filter((d) => d.lang === "zh-Hant").length]).toEqual([2, 1]);
    for (const t of hant) expect(t).toMatch(/[們為這營萬數據於會]/u);
    for (const t of hant) expect(t).not.toMatch(/[们为这营万数据于会]/u);
  });

  it("every German, French, Spanish and Portuguese document is typed with its accents, and keeps its accent-less questions", () => {
    for (const d of ONE.filter((x) => ["de", "fr", "es", "pt"].includes(x.lang))) {
      expect([d.id, /[äöüßéèêàçñãõóíúâô]/u.test(d.text)]).toEqual([d.id, true]);
      expect([d.id, d.questions.some((q) => q.kind === "on" && q.sloppy), d.questions.some((q) => q.kind === "on" && !q.sloppy && /[äöüßéèêàçñãõóíúáâô]/iu.test(q.q))]).toEqual([d.id, true, true]);
    }
    for (const d of SIX.filter((x) => ["de", "fr"].includes(x.lang))) expect([d.id, d.chunks.every((c, i) => i === 5 || /[äöüßéèêàçñ]/u.test(c))]).toEqual([d.id, true]);
  });
});

describe("F334 · one-passage documents in nine languages", () => {
  for (const strict of [false, true]) {
    it(`strict=${strict}: 81 of 89 on-topic questions cite the passage and 0 of 143 off-topic ones do`, () => {
      const on = ONE.flatMap((d) => d.questions.filter((q) => q.kind === "on").map((q) => citedIn(d.id, [d.text], q.q, [q.cosine], strict).length > 0));
      const offCited = ONE.flatMap((d) => d.questions.filter((q) => q.kind === "off" && citedIn(d.id, [d.text], q.q, [q.cosine], strict).length).map((q) => `${d.id} ${q.q}`));
      expect([on.length, on.filter(Boolean).length]).toEqual([89, 81]);
      expect(ONE.flatMap((d) => d.questions.filter((q) => q.kind === "off")).length).toBe(143);
      expect(offCited).toEqual([]);
    });
  }

  it("per language, accented and accent-less typing apart, and zh-Hant beside zh", () => {
    const byLang: Record<string, [number, number]> = {};
    for (const d of ONE)
      for (const q of d.questions.filter((x) => x.kind === "on")) {
        const cur = (byLang[labelOf(d.lang, q)] ??= [0, 0]);
        cur[0] += citedIn(d.id, [d.text], q.q, [q.cosine], true).length > 0 ? 1 : 0;
        cur[1]++;
      }
    expect(Object.fromEntries(Object.entries(byLang).map(([k, [a, b]]) => [k, `${a}/${b}`]))).toEqual(EXPECTED_BY_LANG);
  });

  it("F367: the word index alone finds a question typed without the accents its passage has", () => {
    for (const [id, q] of Object.entries(FOLDED_ONLY)) {
      const d = ONE.find((x) => x.id === id)!;
      expect([id, d.questions.some((x) => x.q === q && x.kind === "on" && x.sloppy)]).toEqual([id, true]);
      expect([id, q, hits(d.id, [d.text], q, [0])[0]!.bm25Terms]).toEqual([id, q, 1]);
    }
  });

  it("F368: the word index alone finds an umlaut typed as a digraph and a word behind an elided article", () => {
    for (const [id, q] of Object.entries(SPELLED_ONLY)) {
      const d = ONE.find((x) => x.id === id)!;
      expect([id, d.questions.some((x) => x.q === q && x.kind === "on")]).toEqual([id, true]);
      expect([id, q, hits(d.id, [d.text], q, [0])[0]!.bm25Terms]).toEqual([id, q, 1]);
    }
  });

  it("F367: per language, what the lexical rule cites on its own", () => {
    const byLang: Record<string, [number, number]> = {};
    for (const d of ONE)
      for (const q of d.questions.filter((x) => x.kind === "on")) {
        const h = hits(d.id, [d.text], q.q, [q.cosine])[0]!;
        const lexical = isRelevant(h, undefined, undefined, Infinity);
        const cur = (byLang[labelOf(d.lang, q)] ??= [0, 0]);
        cur[0] += lexical ? 1 : 0;
        cur[1]++;
      }
    expect(Object.fromEntries(Object.entries(byLang).map(([k, [a, b]]) => [k, `${a}/${b}`]))).toEqual(EXPECTED_LEXICAL_BY_LANG);
  });

  it("the door sits above every off-topic cosine measured, with the margin stated", () => {
    const off = ONE.flatMap((d) => d.questions.filter((q) => q.kind === "off").map((q) => q.cosine));
    const offSix = SIX.flatMap((d) => d.questions.filter((q) => q.kind === "off").flatMap((q) => q.cosines));
    const top = Math.max(...off, ...offSix);
    expect(top).toBe(0.8177);
    expect(Number((DEFAULT_MIN_COSINE_ALONE - top).toFixed(4))).toBe(0.0023);
  });
});

describe("F334 · six-chunk documents: the right passage, not just a passage", () => {
  const on = SIX.flatMap((d) => d.questions.filter((q) => q.kind === "on").map((q) => ({ d, q })));
  const off = SIX.flatMap((d) => d.questions.filter((q) => q.kind === "off").map((q) => ({ d, q })));

  it("the embedder ranks the answering chunk first for 25 of 27 on-topic questions", () => {
    const first = on.filter(({ d, q }) => q.cosines.indexOf(Math.max(...q.cosines)) === d.answers);
    expect([on.length, first.length]).toEqual([27, 25]);
  });

  for (const strict of [false, true]) {
    it(`strict=${strict}: 25 of 27 cite the answering chunk and none cites only a wrong one`, () => {
      const cited = on.map(({ d, q }) => citedIn(d.id, d.chunks, q.q, q.cosines, strict));
      expect(cited.filter((c, i) => c.includes(on[i]!.d.answers)).length).toBe(25);
      expect(cited.filter((c, i) => c.length > 0 && !c.includes(on[i]!.d.answers)).length).toBe(0);
    });

    it(`strict=${strict}: the 3 off-topic questions still cited are the lexical half's, never the cosine's`, () => {
      const cited = off.filter(({ d, q }) => citedIn(d.id, d.chunks, q.q, q.cosines, strict).length);
      expect(cited.map(({ d }) => d.id)).toEqual(["mc-ja", "mc-zh", "mc-zhHant"]);
      for (const { d, q } of cited) for (const h of hits(d.id, d.chunks, q.q, q.cosines)) expect(h.cosine).toBeLessThanOrEqual(DEFAULT_MIN_COSINE_ALONE);
    });
  }
});

describe("F334 · the same door on the old embedder's numbers adds nothing, which is why round 70 closed it", () => {
  it("nomic-embed-text-v1.5 cites nothing off-topic at the door, and its recall stays at the lexical rule's 39 of 83", () => {
    const docs = old.docs as OneDoc[];
    expect(Math.max(...docs.flatMap((d) => d.questions.filter((q) => q.kind === "off").map((q) => q.cosine)))).toBeLessThan(DEFAULT_MIN_COSINE_ALONE);
    const on = docs.flatMap((d) => d.questions.filter((q) => q.kind === "on").map((q) => citedIn(d.id, [d.text], q.q, [q.cosine], true).length > 0));
    expect(on.filter(Boolean).length).toBe(39);
  });
});
