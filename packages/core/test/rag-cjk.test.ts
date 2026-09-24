import { describe, expect, it } from "vitest";
import { Bm25Index, buildRagPrompt, DEFAULT_MIN_BM25, DEFAULT_MIN_COSINE, words, type DocumentRecord, type RetrievalHit } from "../src/rag";

/**
 * F195. The F161 relevance floor is `cosine >= 0.5 || bm25Terms >= 2 || (bm25Terms >= 1 && bm25 >= 2.0)`. Chinese and
 * Japanese are written without spaces, so the lexical half could never fire: the whole sentence was one token. A
 * zh/ja user whose embedding landed just under the cosine floor lost every passage AND was told their documents said
 * nothing about their own question.
 *
 * Everything below runs the real lexical index, with the cosine pinned just under the floor so only the lexical half
 * can carry the passage.
 */
const UNDER_FLOOR = DEFAULT_MIN_COSINE - 0.01;

const doc = (id: string, name: string): DocumentRecord => ({ id, name, kind: "pdf", bytes: 100, pages: 1, addedAt: 0, status: "indexed", indexedPages: 1, chunkCount: 1, flaggedLines: 0, ocrPages: 0 });

const zhDoc = doc("zh", "年报.pdf");
const jaDoc = doc("ja", "年次報告.pdf");

const ZH_PASSAGE = "本公司二零二四年度收入为三千万元，比上一年度增长百分之十二。";
const JA_PASSAGE = "当社の二〇二四年度の収益は三千万円で、前年度より十二パーセント増加しました。";
/** Same language, another subject: the floor must still drop it. */
const ZH_OTHER = "员工餐厅的午餐时间是中午十二点到下午一点。";
const JA_OTHER = "社員食堂の昼休みは正午から午後一時までです。";

/** One chunk per passage, scored by the real BM25 index, with the cosine fixed below the floor. */
function hitsFor(question: string, passages: Array<{ id: string; docId: string; text: string }>): RetrievalHit[] {
  const index = new Bm25Index();
  for (const p of passages) index.add(p.id, p.text);
  const lexical = new Map(index.search(question, 10).map((h) => [h.id, h]));
  return passages.map((p) => ({
    chunk: { id: p.id, docId: p.docId, page: 1, ord: 0, text: p.text, start: 0, end: p.text.length, tokens: 40 },
    score: 1,
    cosine: UNDER_FLOOR,
    bm25: lexical.get(p.id)?.score ?? 0,
    bm25Terms: lexical.get(p.id)?.matched ?? 0,
  }));
}

describe("BM25 tokenisation of unspaced scripts", () => {
  it("cuts a Chinese sentence into terms instead of one token", () => {
    expect(words("本公司二零二四年度收入")).not.toEqual(["本公司二零二四年度收入"]);
    expect(words("本公司二零二四年度收入")).toContain("本公");
    expect(words("本公司二零二四年度收入")).toContain("收入");
  });

  it("cuts a Japanese sentence the same way, kana and kanji alike", () => {
    expect(words("当社の収益は増加しました")).toContain("収益");
    expect(words("当社の収益は増加しました")).toContain("しま");
  });

  it("keeps the latin half of a mixed token and the spaced scripts untouched", () => {
    expect(words("iPhone15の価格")).toEqual(expect.arrayContaining(["iphone15", "の価", "価格"]));
    expect(words("The pier rests on 128 piles")).toEqual(["the", "pier", "rests", "on", "128", "piles"]);
    expect(words("החברה מדווחת על הכנסות")).toEqual(["החברה", "מדווחת", "על", "הכנסות"]);
  });
});

describe("F195 · an on-topic CJK question keeps its passages and its citations", () => {
  for (const [label, docs, question, passage, other] of [
    ["Chinese", new Map([[zhDoc.id, zhDoc]]), "公司的年度收入是多少？", { id: "zh1", docId: "zh", text: ZH_PASSAGE }, { id: "zh2", docId: "zh", text: ZH_OTHER }],
    ["Japanese", new Map([[jaDoc.id, jaDoc]]), "当社の年度の収益はいくらですか？", { id: "ja1", docId: "ja", text: JA_PASSAGE }, { id: "ja2", docId: "ja", text: JA_OTHER }],
  ] as const) {
    it(`${label}: the passage survives the relevance floor with the cosine under it`, () => {
      const [onTopic] = hitsFor(question, [passage]);
      expect(onTopic!.cosine).toBeLessThan(DEFAULT_MIN_COSINE);
      expect(onTopic!.bm25Terms).toBeGreaterThanOrEqual(2);
    });

    it(`${label}: strict mode answers from the document instead of "not found"`, () => {
      const p = buildRagPrompt({ question, hits: hitsFor(question, [passage]), docs, strict: true, nCtx: 4096, nonce: "n" });
      expect(p.noAnswer).toBe(false);
      expect(p.used).toHaveLength(1);
      expect(p.citations).toHaveLength(1);
      expect(p.messages[1]!.content).toContain(passage.text);
    });

    it(`${label}: outside strict mode the answer carries the passage and cites it`, () => {
      const p = buildRagPrompt({ question, hits: hitsFor(question, [passage]), docs, strict: false, nCtx: 4096, nonce: "n" });
      expect(p.used.map((h) => h.chunk.id)).toEqual([passage.id]);
      expect(p.citations).toHaveLength(1);
      expect(p.messages[0]!.content).not.toContain("contain nothing about this question");
    });

    it(`${label}: an unrelated passage in the same language is still dropped`, () => {
      const hits = hitsFor(question, [passage, other]);
      const p = buildRagPrompt({ question, hits, docs, strict: false, nCtx: 4096, nonce: "n" });
      expect(p.used.map((h) => h.chunk.id)).toEqual([passage.id]);
    });

    it(`${label}: a question about something else keeps citing nothing`, () => {
      const off = label === "Chinese" ? "谁赢得了一九九八年世界杯足球赛？" : "一九九八年のワールドカップで優勝したのはどこですか？";
      const p = buildRagPrompt({ question: off, hits: hitsFor(off, [passage]), docs, strict: false, nCtx: 4096, nonce: "n" });
      expect(p.used).toEqual([]);
      expect(p.citations).toEqual([]);
    });
  }
});

/**
 * F278. Real ja/zh documents end their sentences in grammatical glue ("…ためです。", "我们可以…"), and the F195 bigrams
 * cut that glue into terms like です / した / 我们 / 可以 that any two texts of the language share. Two of them cleared
 * `bm25Terms >= 2`, so an off-topic question was handed the document's one passage as a citation (QA F261).
 *
 * One passage per document on purpose: with a single chunk the IDF is the same constant for every term
 * (ln(1 + 0.5/1.5) ≈ 0.288), so the score clause cannot tell a particle from a content word either.
 */
const JA_ONE = "当社の二〇二四年度の収益は三千万円で、前年度より十二パーセント増加しました。これは新製品の販売が好調だったためです。";
const ZH_ONE = "本公司二零二四年度收入为三千万元，比上一年度增长百分之十二。我们可以在下一年度继续保持这个增长。";

describe("F278 · a one-passage CJK document does not cite itself for an off-topic question", () => {
  for (const [label, record, text, offTopic, onTopic] of [
    ["Japanese", jaDoc, JA_ONE, "一九九八年のワールドカップで優勝したのはどこですか？", "当社の年度の収益はいくらですか？"],
    ["Chinese", zhDoc, ZH_ONE, "我们什么时候可以去巴黎旅游？", "公司的年度收入增长了多少？"],
  ] as const) {
    const docs = new Map([[record.id, record]]);
    const only = { id: `${record.id}1`, docId: record.id, text };

    it(`${label}: the glue the question shares with the passage is not counted as a lexical match`, () => {
      const [hit] = hitsFor(offTopic, [only]);
      expect(hit!.bm25Terms).toBeLessThan(2);
      expect(hit!.bm25).toBeLessThan(DEFAULT_MIN_BM25);
    });

    it(`${label}: outside strict mode the off-topic question cites nothing`, () => {
      const p = buildRagPrompt({ question: offTopic, hits: hitsFor(offTopic, [only]), docs, strict: false, nCtx: 4096, nonce: "n" });
      expect(p.used).toEqual([]);
      expect(p.citations).toEqual([]);
      expect(p.messages[0]!.content).toContain("contain nothing about this question");
    });

    it(`${label}: strict mode answers nothing rather than quoting the one passage`, () => {
      const p = buildRagPrompt({ question: offTopic, hits: hitsFor(offTopic, [only]), docs, strict: false, nCtx: 4096, nonce: "n" });
      expect(buildRagPrompt({ question: offTopic, hits: hitsFor(offTopic, [only]), docs, strict: true, nCtx: 4096, nonce: "n" }).noAnswer).toBe(true);
      expect(p.messages[1]?.content ?? "").not.toContain(text);
    });

    it(`${label}: the on-topic question on the same one-passage document still cites it`, () => {
      const [hit] = hitsFor(onTopic, [only]);
      expect(hit!.cosine).toBeLessThan(DEFAULT_MIN_COSINE);
      expect(hit!.bm25Terms).toBeGreaterThanOrEqual(2);
      const p = buildRagPrompt({ question: onTopic, hits: hitsFor(onTopic, [only]), docs, strict: true, nCtx: 4096, nonce: "n" });
      expect(p.noAnswer).toBe(false);
      expect(p.used.map((h) => h.chunk.id)).toEqual([only.id]);
      expect(p.citations).toHaveLength(1);
      expect(p.messages[1]!.content).toContain(text);
    });
  }
});
