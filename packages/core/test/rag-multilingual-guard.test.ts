import { describe, expect, it } from "vitest";
import { Bm25Index, buildRagPrompt, DEFAULT_MIN_COSINE_ALONE, type DocumentRecord, type RetrievalHit } from "../src/rag";
import shipped from "./fixtures/rag/e5-cosines.json";
import old from "./fixtures/rag/cjk-cosines.json";

/**
 * F334. The shipped embedder (multilingual-e5-large-instruct Q6_K) on round 70's own questions, through the real
 * lexical index and the real prompt builder, in both modes. Every cosine is the one the phone computes
 * (docs/qa/embed-multilingual/measure.md; regenerate with rag-multilingual-measure.test.ts).
 */
interface OneDoc {
  id: string;
  lang: string;
  text: string;
  questions: Array<{ kind: "on" | "off"; q: string; cosine: number }>;
}
interface SixDoc {
  id: string;
  lang: string;
  answers: number;
  chunks: string[];
  questions: Array<{ kind: "on" | "off"; q: string; cosines: number[] }>;
}
const ONE = shipped.docs as OneDoc[];
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

const citedIn = (docId: string, chunks: string[], question: string, cosines: number[], strict: boolean, embedderId = "embed-e5") =>
  buildRagPrompt({ question, hits: hits(docId, chunks, question, cosines), docs: new Map([[docId, record(docId, chunks.length)]]), strict, nCtx: 8192, nonce: "n", embedderId }).used.map((h) => h.chunk.ord);

describe("F334 · one-passage documents in nine languages", () => {
  for (const strict of [false, true]) {
    it(`strict=${strict}: 50 of 57 on-topic questions cite the passage and 0 of 102 off-topic ones do`, () => {
      const on = ONE.flatMap((d) => d.questions.filter((q) => q.kind === "on").map((q) => citedIn(d.id, [d.text], q.q, [q.cosine], strict).length > 0));
      const offCited = ONE.flatMap((d) => d.questions.filter((q) => q.kind === "off" && citedIn(d.id, [d.text], q.q, [q.cosine], strict).length).map((q) => `${d.id} ${q.q}`));
      expect([on.length, on.filter(Boolean).length]).toEqual([57, 50]);
      expect(ONE.flatMap((d) => d.questions.filter((q) => q.kind === "off")).length).toBe(102);
      expect(offCited).toEqual([]);
    });
  }

  it("German, which the old embedder never cited, is 3/3; French is still the weakest at 1/3", () => {
    const byLang: Record<string, string> = {};
    for (const lang of [...new Set(ONE.map((d) => d.lang))].sort()) {
      const qs = ONE.filter((d) => d.lang === lang).flatMap((d) => d.questions.filter((q) => q.kind === "on").map((q) => citedIn(d.id, [d.text], q.q, [q.cosine], true).length > 0));
      byLang[lang] = `${qs.filter(Boolean).length}/${qs.length}`;
    }
    expect(byLang).toEqual({ de: "3/3", en: "7/10", es: "2/3", fr: "1/3", he: "5/5", ja: "13/14", ko: "6/6", pt: "3/3", zh: "10/10" });
  });

  it("the door sits above every off-topic cosine measured, with the margin stated", () => {
    const off = ONE.flatMap((d) => d.questions.filter((q) => q.kind === "off").map((q) => q.cosine));
    const offSix = SIX.flatMap((d) => d.questions.filter((q) => q.kind === "off").flatMap((q) => q.cosines));
    const top = Math.max(...off, ...offSix);
    expect(top).toBe(0.8176);
    expect(Number((DEFAULT_MIN_COSINE_ALONE - top).toFixed(4))).toBe(0.0024);
  });
});

describe("F334 · six-chunk documents: the right passage, not just a passage", () => {
  const on = SIX.flatMap((d) => d.questions.filter((q) => q.kind === "on").map((q) => ({ d, q })));
  const off = SIX.flatMap((d) => d.questions.filter((q) => q.kind === "off").map((q) => ({ d, q })));

  it("the embedder ranks the answering chunk first for 20 of 21 on-topic questions", () => {
    const first = on.filter(({ d, q }) => q.cosines.indexOf(Math.max(...q.cosines)) === d.answers);
    expect([on.length, first.length]).toEqual([21, 20]);
  });

  for (const strict of [false, true]) {
    it(`strict=${strict}: 17 of 21 cite the answering chunk and none cites only a wrong one`, () => {
      const cited = on.map(({ d, q }) => citedIn(d.id, d.chunks, q.q, q.cosines, strict));
      /* 18 before F365: "Which cities host the main sites?" shares one word with its chunk at cosine 0.7664. */
      expect(cited.filter((c, i) => c.includes(on[i]!.d.answers)).length).toBe(17);
      expect(cited.filter((c, i) => c.length > 0 && !c.includes(on[i]!.d.answers)).length).toBe(0);
    });

    it(`strict=${strict}: no off-topic question is cited (F365 closed the 3 one-word ones: two years, one "que")`, () => {
      const cited = off.filter(({ d, q }) => citedIn(d.id, d.chunks, q.q, q.cosines, strict).length).map(({ d, q }) => `${d.id} ${q.q}`);
      expect(cited).toEqual([]);
    });
  }
});

describe("F334 · the same door on the old embedder's numbers adds nothing, which is why round 70 closed it", () => {
  it("nomic-embed-text-v1.5 cites nothing off-topic at the door, and its recall stays at round 70's 29 of 57", () => {
    const docs = old.docs as OneDoc[];
    expect(Math.max(...docs.flatMap((d) => d.questions.filter((q) => q.kind === "off").map((q) => q.cosine)))).toBeLessThan(DEFAULT_MIN_COSINE_ALONE);
    const on = docs.flatMap((d) => d.questions.filter((q) => q.kind === "on").map((q) => citedIn(d.id, [d.text], q.q, [q.cosine], true, "embed-nomic").length > 0));
    expect(on.filter(Boolean).length).toBe(29);
  });
});
