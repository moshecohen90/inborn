import { describe, expect, it } from "vitest";
import { Bm25Index, buildRagPrompt, isRelevant, relevanceDoors, type DocumentRecord, type RetrievalHit } from "../src/rag";
import measured from "./fixtures/rag/cjk-cosines.json";

/**
 * F327. F195 and F278 both closed the lexical door of the relevance floor and both pinned the cosine below its own
 * floor to do it, so neither test could see the other door: on the OnePlus 6T a one-passage Japanese file was still
 * cited for an off-topic Japanese question, over `cosine >= 0.5` alone (QA F261, F282).
 *
 * Every cosine here is the real one, measured off-device with nomic-embed-text-v1.5, the embedder the app shipped until
 * round 72 (see the fixture's header): 12 one-passage documents in 9 languages, 57 on-topic and 102 off-topic
 * questions. The shipped multilingual embedder is guarded on the same questions in rag-multilingual-guard.test.ts.
 */
interface Fixture {
  id: string;
  lang: string;
  text: string;
  questions: Array<{ kind: "on" | "off"; q: string; cosine: number }>;
}
const FIXTURES = measured.docs as Fixture[];
/* These cosines are nomic's, so they are judged by nomic's own doors. */
const NOMIC = relevanceDoors("embed-nomic");
const E5 = relevanceDoors("embed-e5");
const byId = (id: string): Fixture => FIXTURES.find((d) => d.id === id)!;

const record = (f: Fixture): DocumentRecord => ({ id: f.id, name: `${f.id}.txt`, kind: "txt", bytes: 200, pages: 1, addedAt: 0, status: "indexed", indexedPages: 1, chunkCount: 1, flaggedLines: 0, ocrPages: 0 });

/** The one chunk of a one-passage document, scored by the real lexical index and carrying its real cosine. */
function hitFor(f: Fixture, question: string, cosine: number): RetrievalHit {
  const index = new Bm25Index();
  index.add(f.id, f.text);
  const lexical = index.search(question, 10).find((h) => h.id === f.id);
  return {
    chunk: { id: f.id, docId: f.id, page: 1, ord: 0, text: f.text, start: 0, end: f.text.length, tokens: 60 },
    score: 1,
    cosine,
    bm25: lexical?.score ?? 0,
    bm25Terms: lexical?.matched ?? 0,
  };
}

const ask = (f: Fixture, question: string, cosine: number, strict: boolean) =>
  buildRagPrompt({ question, hits: [hitFor(f, question, cosine)], docs: new Map([[f.id, record(f)]]), strict, nCtx: 4096, nonce: "n", embedderId: "embed-nomic" });

describe("F327 · the embedding half cannot cite a passage on its own", () => {
  it("the 6T's own off-topic Japanese turn is no longer cited, in either mode", () => {
    const f = byId("ja-device");
    const off = f.questions.find((q) => q.kind === "off")!;
    /* The exact turn of F282: the cosine cleared the old floor and no term of the question is in the passage. */
    expect(off.cosine).toBeGreaterThanOrEqual(NOMIC.corroborate);
    expect(hitFor(f, off.q, off.cosine).bm25Terms).toBe(0);
    expect(ask(f, off.q, off.cosine, false).citations).toEqual([]);
    expect(ask(f, off.q, off.cosine, false).messages[1]?.content ?? "").not.toContain(f.text);
    expect(ask(f, off.q, off.cosine, true).noAnswer).toBe(true);
  });

  it("no off-topic question in any of the nine languages is cited, in either mode", () => {
    const cited: string[] = [];
    for (const f of FIXTURES)
      for (const q of f.questions.filter((x) => x.kind === "off"))
        for (const strict of [false, true])
          if (ask(f, q.q, q.cosine, strict).citations.length) cited.push(`${f.id} strict=${strict} ${q.q}`);
    expect(cited).toEqual([]);
  });

  it("the old floor cited most of them, which is the bug", () => {
    const wasCited = FIXTURES.flatMap((f) => f.questions.filter((q) => q.kind === "off").map((q) => hitFor(f, q.q, q.cosine))).filter((h) => h.cosine >= NOMIC.corroborate || h.bm25Terms >= 2 || (h.bm25Terms >= 1 && h.bm25 >= NOMIC.minBm25));
    expect(wasCited.length).toBeGreaterThan(80);
  });

  it("the question that shares a word with the passage is still cited, in every language that has one", () => {
    const kept = new Set<string>();
    for (const f of FIXTURES)
      for (const q of f.questions.filter((x) => x.kind === "on"))
        for (const strict of [false, true]) if (ask(f, q.q, q.cosine, strict).citations.length) kept.add(f.lang);
    expect([...kept].sort()).toEqual(["en", "es", "he", "ja", "ko", "pt", "zh"]);
  });

  it("the device's own on-topic turns, the ones QA ran on hardware, still cite", () => {
    for (const [id, question] of [
      ["ja-device", "青葉商事の社員数は何名ですか？"],
      ["ja-f278", "当社の年度の収益はいくらですか？"],
      ["zh-f278", "本公司二零二四年度的收入是多少？"],
      ["zh-f195", "公司的年度收入是多少？"],
      ["ko-report", "한빛물산의 직원 수는 몇 명입니까?"],
      ["en-report", "How many people does Aoba Trading employ?"],
    ] as const) {
      const f = byId(id);
      const q = f.questions.find((x) => x.q === question)!;
      for (const strict of [false, true]) {
        const p = ask(f, q.q, q.cosine, strict);
        expect([id, strict, p.citations.length]).toEqual([id, strict, 1]);
        expect(p.messages[1]!.content).toContain(f.text);
      }
      expect(ask(f, q.q, q.cosine, true).noAnswer).toBe(false);
    }
  });

  it("the cosine still corroborates a single shared word, and replaces it only above the cosine-alone door (F334)", () => {
    const h = (cosine: number, bm25: number, bm25Terms: number): RetrievalHit => ({ chunk: { id: "c", docId: "d", page: 1, ord: 0, text: "t", start: 0, end: 1, tokens: 1 }, score: 1, cosine, bm25, bm25Terms });
    expect(isRelevant(h(NOMIC.alone, 0, 0), NOMIC)).toBe(false);
    expect(isRelevant(h(NOMIC.alone + 0.001, 0, 0), NOMIC)).toBe(true);
    expect(isRelevant(h(0.1, 0.9, 1), NOMIC)).toBe(false);
    expect(isRelevant(h(0.6, 0.9, 1), NOMIC)).toBe(true);
    expect(isRelevant(h(0.1, 3.2, 1), NOMIC)).toBe(true);
    expect(isRelevant(h(0.1, 0.9, 2), NOMIC)).toBe(true);
    /* Under e5 every off-topic cosine is above nomic's 0.5, so one word needs e5's own corroboration door (F365). */
    expect(isRelevant(h(0.6, 0.9, 1))).toBe(false);
    expect(isRelevant(h(E5.corroborate - 0.001, 0.9, 1))).toBe(false);
    expect(isRelevant(h(E5.corroborate, 0.9, 1))).toBe(true);
  });
});

/**
 * The measurement the rule is set from. An off-topic question that shares no word with the passage still clears the
 * old 0.5 floor in every script, and its band overlaps the on-topic one everywhere, so no floor separates the two:
 * the bands are asserted from both sides, so a future embedder change cannot quietly invalidate the rule.
 */
describe("F327 · why no cosine floor was chosen instead", () => {
  const zero = FIXTURES.flatMap((f) => f.questions.map((q) => ({ ...q, lang: f.lang, terms: hitFor(f, q.q, q.cosine).bm25Terms }))).filter((q) => q.terms === 0);
  const band = (kind: "on" | "off", langs: string[]) => {
    const c = zero.filter((q) => q.kind === kind && langs.includes(q.lang)).map((q) => q.cosine);
    return { min: Math.min(...c), max: Math.max(...c), n: c.length };
  };
  const CJK = ["ja", "zh", "ko"];
  const LATIN = ["en", "de", "es", "fr", "pt"];

  it("in ja/zh/ko an off-topic question with no shared word scores above the old 0.5 floor almost always", () => {
    const off = band("off", CJK);
    expect(off.n).toBeGreaterThan(40);
    expect(off.min).toBeGreaterThan(0.39);
    expect(off.max).toBeGreaterThan(NOMIC.corroborate);
    /* It overlaps the on-topic band, so raising the floor drops on-topic questions before it drops these. */
    expect(off.max).toBeGreaterThan(band("on", CJK).min);
  });

  it("the same overlap holds in the Latin-script languages, only lower", () => {
    const off = band("off", LATIN);
    const on = band("on", LATIN);
    expect(off.max).toBeGreaterThan(on.min);
    expect(on.max).toBeGreaterThan(off.max);
  });

  it("the lexical half separates what the cosine cannot: no off-topic question matches a single content word", () => {
    const offTerms = FIXTURES.flatMap((f) => f.questions.filter((q) => q.kind === "off").map((q) => hitFor(f, q.q, q.cosine).bm25Terms));
    expect(Math.max(...offTerms)).toBe(0);
  });
});
