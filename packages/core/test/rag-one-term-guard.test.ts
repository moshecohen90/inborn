import { describe, expect, it } from "vitest";
import catalog from "../src/catalog/manifest.json";
import {
  Bm25Index,
  buildCitations,
  buildRagPrompt,
  citationsForAnswer,
  groundedCitations,
  isRelevant,
  isWeakTerm,
  relevanceDoors,
  RELEVANCE_DOORS,
  UNMEASURED_DOORS,
  type DocumentRecord,
  type RetrievalHit,
} from "../src/rag";
import shipped from "./fixtures/rag/e5-cosines.json";
import years from "./fixtures/rag/one-term-e5.json";

/**
 * F365. Under e5 every off-topic cosine sits above nomic's 0.5, so round 70's "one shared word, corroborated by the
 * cosine" door let a single year cite an unrelated passage: "一九九八年のワールドカップで優勝したのはどこですか？" against a
 * company report that says 一九六二年 came back in strict mode with SOURCES (QA I12). Every cosine here is the shipped
 * embedder's (docs/qa/fix-corroboration-door/one-term.md).
 */
interface OneDoc {
  id: string;
  lang: string;
  text: string;
  questions: Array<{ kind: "on" | "off"; q: string; cosine: number }>;
}
interface SixDoc {
  id: string;
  answers: number;
  chunks: string[];
  questions: Array<{ kind: "on" | "off"; q: string; cosines: number[] }>;
}
const E5 = relevanceDoors("embed-e5");
const YEARS = years.docs as OneDoc[];
const SIX = shipped.multi as SixDoc[];

const record = (id: string, chunks: number): DocumentRecord => ({ id, name: `${id}.txt`, kind: "txt", bytes: 200, pages: 1, addedAt: 0, status: "indexed", indexedPages: 1, chunkCount: chunks, flaggedLines: 0, ocrPages: 0 });

function hits(docId: string, chunks: string[], question: string, cosines: number[]): RetrievalHit[] {
  const index = new Bm25Index();
  chunks.forEach((c, i) => index.add(`${docId}#${i}`, c));
  const lexical = new Map(index.search(question, 10).map((h) => [h.id, h]));
  return chunks.map((text, i) => {
    const id = `${docId}#${i}`;
    return { chunk: { id, docId, page: 1, ord: i, text, start: 0, end: text.length, tokens: 60 }, score: 1, cosine: cosines[i]!, bm25: lexical.get(id)?.score ?? 0, bm25Terms: lexical.get(id)?.matched ?? 0 };
  });
}

const prompt = (docId: string, chunks: string[], question: string, cosines: number[], strict: boolean, embedderId?: string) =>
  buildRagPrompt({ question, hits: hits(docId, chunks, question, cosines), docs: new Map([[docId, record(docId, chunks.length)]]), strict, nCtx: 8192, nonce: "n", ...(embedderId ? { embedderId } : {}) });

describe("F365 · a number is not a shared word", () => {
  it("years, counts, units, numeral bigrams and lone CJK characters are weak; words are not", () => {
    for (const t of ["1998", "1200", "40km", "1998년", "10th", "1990s", "gb", "一九", "九八", "八年", "年に", "年度", "千二", "〇", "年", "名で"]) expect([t, isWeakTerm(t)]).toEqual([t, true]);
    for (const t of ["warehouse", "aoba", "倉庫", "公司", "収益", "창고", "מחסן", "b2b", "covid19"]) expect([t, isWeakTerm(t)]).toEqual([t, false]);
  });

  it("a year alone matches zero terms; beside a content word it counts", () => {
    const index = new Bm25Index();
    index.add("p", "Aoba Trading was founded in 1998 in Sendai.");
    expect(index.search("Who won the 1998 World Cup?")[0]!.matched).toBe(0);
    expect(index.search("What did Aoba do in 1998?")[0]!.matched).toBe(2);
  });

  it("the verifier's exact turn: the Japanese 1998 question against the whole company report is refused in strict mode and gets no passage outside it", () => {
    const d = YEARS.find((x) => x.id === "nenji-whole")!;
    const off = d.questions.find((q) => q.kind === "off")!;
    expect(off.q).toBe("一九九八年のワールドカップで優勝したのはどこですか？");
    expect(hits(d.id, [d.text], off.q, [off.cosine])[0]!.bm25Terms).toBe(0);
    expect(prompt(d.id, [d.text], off.q, [off.cosine], true).noAnswer).toBe(true);
    expect(prompt(d.id, [d.text], off.q, [off.cosine], false).citations).toEqual([]);
    const on = d.questions.find((q) => q.kind === "on")!;
    expect(prompt(d.id, [d.text], on.q, [on.cosine], true).citations.length).toBe(1);
  });

  it("no off-topic question that shares only a year or a number is cited, in any of nine languages, in either mode", () => {
    const cited: string[] = [];
    for (const d of YEARS) for (const q of d.questions.filter((x) => x.kind === "off")) for (const strict of [false, true]) if (prompt(d.id, [d.text], q.q, [q.cosine], strict).citations.length) cited.push(`${d.id} ${strict} ${q.q}`);
    expect(YEARS.flatMap((d) => d.questions.filter((q) => q.kind === "off")).length).toBe(19);
    expect(cited).toEqual([]);
  });

  it("round 70's six-chunk sets: the three one-year citations are gone", () => {
    const cited = SIX.flatMap((d) => d.questions.filter((q) => q.kind === "off" && prompt(d.id, d.chunks, q.q, q.cosines, true).used.length).map((q) => `${d.id} ${q.q}`));
    expect(cited).toEqual([]);
    /* They cleared round 70's door only through the year: the numbers the old rule saw. */
    const mcJa = SIX.find((d) => d.id === "mc-ja")!;
    const q = mcJa.questions.find((x) => x.kind === "off" && x.q.startsWith("一九九八"))!;
    expect(q.cosines[1]!).toBeGreaterThan(0.5);
    expect(q.cosines[1]!).toBeLessThan(E5.corroborate);
  });

  it("what the weak rule costs: a question that shares only a year with its answer needs the cosine alone", () => {
    const cost = YEARS.flatMap((d) => d.questions.filter((q) => q.kind === "on" && prompt(d.id, [d.text], q.q, [q.cosine], true).noAnswer).map((q) => `${d.lang}:${q.q}`));
    expect(cost.length).toBe(8);
    for (const c of cost) expect(c).toMatch(/1998|一九九八/u);
  });
});

describe("F365 · the doors belong to the embedder that measured them", () => {
  it("e5's row, with the margins it was set from", () => {
    expect(E5).toEqual({ alone: 0.82, corroborate: 0.815, minBm25: 2.0 });
    /* The highest off-topic cosine with one shared term, over round 70's sets and this round's year set, is 0.8107. */
    expect(Number((E5.corroborate - 0.8107).toFixed(4))).toBe(0.0043);
  });

  it("the old 0.5 corroboration is nomic's alone, and under e5 it no longer corroborates anything", () => {
    expect(relevanceDoors("embed-nomic").corroborate).toBe(0.5);
    const h = (cosine: number, bm25: number, bm25Terms: number): RetrievalHit => ({ chunk: { id: "c", docId: "d", page: 1, ord: 0, text: "t", start: 0, end: 1, tokens: 1 }, score: 1, cosine, bm25, bm25Terms });
    expect(isRelevant(h(0.8107, 0.9, 1), E5)).toBe(false);
    expect(isRelevant(h(E5.corroborate, 0.9, 1), E5)).toBe(true);
    expect(isRelevant(h(0.8107, 0.9, 1), relevanceDoors("embed-nomic"))).toBe(true);
  });

  it("every embedding model in the catalog has a measured row, so a swap cannot inherit another model's numbers", () => {
    const embedders = (catalog.models as Array<{ id: string; role?: string }>).filter((m) => m.role === "embedding").map((m) => m.id);
    expect(embedders.length).toBeGreaterThan(0);
    for (const id of embedders) expect([id, id in RELEVANCE_DOORS]).toEqual([id, true]);
  });

  it("an embedder nobody measured gets no cosine door: only two shared words cite", () => {
    expect(relevanceDoors("embed-next")).toBe(UNMEASURED_DOORS);
    const d = YEARS.find((x) => x.id === "yr-en")!;
    const on = d.questions.find((q) => q.q === "How large is the warehouse?")!;
    expect(prompt(d.id, [d.text], on.q, [0.99], true, "embed-next").noAnswer).toBe(true);
    expect(prompt(d.id, [d.text], on.q, [0.99], true, "embed-e5").noAnswer).toBe(false);
  });
});

/**
 * F366. The door is the first defence; the second is what the user sees under the answer. A SOURCES strip under an
 * answer that took nothing from the passage is a fabricated citation, in either mode.
 */
describe("F366 · strict mode says not found unless a passage states it", () => {
  it("the strict instruction names the shared-number trap and forbids answering around it", () => {
    const d = YEARS.find((x) => x.id === "yr-en")!;
    const system = prompt(d.id, [d.text], "How large is the warehouse?", [0.84], true).messages[0]!.content;
    expect(system).toContain("Answer only with what a passage states.");
    expect(system).toContain("shares a name, number or year with the question but does not state the fact asked");
    const loose = prompt(d.id, [d.text], "How large is the warehouse?", [0.84], false).messages[0]!.content;
    expect(loose).not.toContain("Answer only with what a passage states.");
  });
});

describe("F366 · no SOURCES strip under an answer that took nothing from the passage", () => {
  const nenji = YEARS.find((x) => x.id === "nenji-whole")!;
  const chunks = nenji.text.split("\n\n");
  const used = hits("nenji", chunks, "x", chunks.map(() => 0.9));
  const citations = buildCitations(used, new Map([["nenji", record("nenji", chunks.length)]]));
  const q = "一九九八年のワールドカップで優勝したのはどこですか？";

  it("the non-strict fabrication the verifier saw keeps no chip", () => {
    expect(groundedCitations("一九九八年のワールドカップで優勝したのは日本を代表したチームです", q, used, citations)).toEqual([]);
    expect(groundedCitations("Japan won the 1998 World Cup.", "Who won the 1998 World Cup?", hits("en", ["Aoba Trading was founded in 1998 in Sendai."], "x", [0.9]), buildCitations(hits("en", ["Aoba Trading was founded in 1998 in Sendai."], "x", [0.9]), new Map()))).toEqual([]);
  });

  it("an answer that only repeats the question, or shares only a number with the passage, keeps no chip", () => {
    expect(groundedCitations("一九九八年のワールドカップ", q, used, citations)).toEqual([]);
    expect(groundedCitations("It was in 1962.", "When?", hits("e", ["Founded in 1962 in Sendai."], "x", [0.9]), buildCitations(hits("e", ["Founded in 1962 in Sendai."], "x", [0.9]), new Map()))).toEqual([]);
  });

  it("an answer taken from a passage keeps that passage's chip and only it, and its [n] still points at it", () => {
    const kept = groundedCitations("青葉商事の社員数は三百八十二名で、主要拠点は仙台と福岡です。[1]", "従業員は全部で何人ですか？", used, citations);
    expect(kept.map((c) => c.n)).toEqual([1]);
    expect(citationsForAnswer("…仙台と福岡です。[1]", kept)).toEqual({ shown: kept, cited: true });
    const board = groundedCitations("取締役会は七名で、そのうち三名が社外取締役です。[6]", "取締役は何人ですか？", used, citations);
    expect(board.map((c) => c.n)).toEqual([6]);
    expect(citationsForAnswer("…社外取締役です。[6]", board).shown.map((c) => c.n)).toEqual([6]);
  });

  it("an answer in the UI language over a passage in another script is not judged by words it cannot share", () => {
    expect(groundedCitations("Aoba Trading has 382 employees.", "How many employees?", used.slice(0, 1), citations.slice(0, 1)).map((c) => c.n)).toEqual([1]);
  });
});
