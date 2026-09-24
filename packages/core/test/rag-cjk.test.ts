import { describe, expect, it } from "vitest";
import { Bm25Index, buildRagPrompt, DEFAULT_MIN_BM25, DEFAULT_MIN_COSINE, DEFAULT_MIN_COSINE_ALONE, isCjkFunctionTerm, words, type DocumentRecord, type RetrievalHit } from "../src/rag";

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

/** One chunk per passage, scored by the real BM25 index, with the cosine fixed where the caller wants it. */
function hitsFor(question: string, passages: Array<{ id: string; docId: string; text: string }>, cosine = UNDER_FLOOR): RetrievalHit[] {
  const index = new Bm25Index();
  for (const p of passages) index.add(p.id, p.text);
  const lexical = new Map(index.search(question, 10).map((h) => [h.id, h]));
  return passages.map((p) => ({
    chunk: { id: p.id, docId: p.docId, page: 1, ord: 0, text: p.text, start: 0, end: p.text.length, tokens: 40 },
    score: 1,
    cosine,
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
const KO_ONE = "한빛물산의 2025년도 연례 보고서에 따르면 직원 수는 삼백팔십이 명이며, 주요 거점은 대전과 부산 두 곳이다.";
const EN_ONE = "According to Aoba Trading's 2025 annual report the company employs three hundred and eighty-two people, and its two main offices are in Sendai and Fukuoka.";
const koDoc = doc("ko", "연례보고서.txt");
const enDoc = doc("en", "annual-report.txt");

/** Above the corroboration floor and at the cosine-alone door: no measured off-topic question of either embedder reaches it (QA F282, F334). */
const OVER_FLOOR = DEFAULT_MIN_COSINE_ALONE;

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

/**
 * F363. zh-Hant is the launch locale, and its glue is written in Traditional glyphs (我們, 這個, 什麼, 會, 為) that the
 * Simplified-only glue class did not know, so 我們/可以 counted as a content word shared with any text: the real
 * fixture's off-topic question matched one term and the cosine corroborated it into a citation.
 */
const ZH_HANT_ONE = "本公司二〇二四年度的營收為三千萬元，比上一年度成長百分之十二。我們可以在下一年度繼續維持這樣的成長。";
const ZH_HANT_OFF = "我們什麼時候可以去巴黎旅遊？";

describe("F363 · Traditional Chinese glue is glue", () => {
  it("every Simplified glue glyph's Traditional form is glue too", () => {
    const pairs = "们們 这這 么麼 对對 为為 吗嗎 让讓 从從 与與 于於 还還 会會 过過 时時 着著 个個 两兩 来來 没沒".split(" ");
    for (const [simplified, traditional] of pairs.map((p) => [...p])) {
      expect([simplified, isCjkFunctionTerm(simplified!)]).toEqual([simplified, true]);
      expect([traditional, isCjkFunctionTerm(traditional!)]).toEqual([traditional, true]);
    }
    expect(isCjkFunctionTerm("我們")).toBe(true);
    expect(isCjkFunctionTerm("營收")).toBe(false);
  });

  it("the off-topic question shares no term with the passage in either script, so a corroborating cosine cites nothing", () => {
    for (const [text, question] of [[ZH_ONE, "我们什么时候可以去巴黎旅游？"], [ZH_HANT_ONE, ZH_HANT_OFF]] as const) {
      const only = { id: "z1", docId: "zh", text };
      /* Corroborating but not enough alone, under whichever doors ship. */
      const hits = hitsFor(question, [only], DEFAULT_MIN_COSINE_ALONE);
      expect([question, hits[0]!.bm25Terms]).toEqual([question, 0]);
      expect(buildRagPrompt({ question, hits, docs: new Map([["zh", zhDoc]]), strict: true, nCtx: 4096, nonce: "n" }).citations).toEqual([]);
    }
  });

  it("the on-topic Traditional question still shares its content words", () => {
    const [hit] = hitsFor("本公司二〇二四年度的營收是多少？", [{ id: "z1", docId: "zh", text: ZH_HANT_ONE }]);
    expect(hit!.bm25Terms).toBeGreaterThanOrEqual(2);
  });
});

/**
 * F327. Both blocks above pin the cosine *under* its floor, so neither could see the floor's other door: on the
 * OnePlus 6T the off-topic Japanese turn came back cited anyway, over `cosine >= 0.5` alone (QA F261, F282). The
 * old embedder scored an off-topic question against a same-language passage at 0.53–0.76 and the shipped one tops out
 * at 0.8176, so the cosine is pinned at the cosine-alone door here and the passage must still be dropped.
 */
describe("F327 · the cosine cannot carry a one-passage document up to the door on its own", () => {
  for (const [label, record, text, offTopic, onTopic] of [
    ["Japanese", jaDoc, JA_ONE, "一九九八年のワールドカップで優勝したのはどこですか？", "当社の年度の収益はいくらですか？"],
    ["Chinese", zhDoc, ZH_ONE, "我们什么时候可以去巴黎旅游？", "公司的年度收入增长了多少？"],
    ["Korean", koDoc, KO_ONE, "1998년 월드컵에서 우승한 나라는 어디입니까?", "한빛물산의 직원 수는 몇 명입니까?"],
    ["English", enDoc, EN_ONE, "Who won the 1998 football World Cup?", "How many people does Aoba Trading employ?"],
  ] as const) {
    const docs = new Map([[record.id, record]]);
    const only = { id: `${record.id}1`, docId: record.id, text };

    it(`${label}: the off-topic question shares no content word with the passage`, () => {
      expect(hitsFor(offTopic, [only], OVER_FLOOR)[0]!.bm25Terms).toBe(0);
    });

    for (const strict of [false, true]) {
      it(`${label}: strict=${strict}, a cosine of ${OVER_FLOOR} does not put the passage under the answer`, () => {
        const p = buildRagPrompt({ question: offTopic, hits: hitsFor(offTopic, [only], OVER_FLOOR), docs, strict, nCtx: 4096, nonce: "n" });
        expect(p.used).toEqual([]);
        expect(p.citations).toEqual([]);
        expect(p.messages[1]?.content ?? "").not.toContain(text);
        expect(strict ? p.noAnswer : p.messages[0]!.content).toStrictEqual(strict ? true : expect.stringContaining("contain nothing about this question"));
      });

      it(`${label}: strict=${strict}, the on-topic question is cited whichever side of the floor the cosine is on`, () => {
        for (const cosine of [UNDER_FLOOR, OVER_FLOOR]) {
          const p = buildRagPrompt({ question: onTopic, hits: hitsFor(onTopic, [only], cosine), docs, strict, nCtx: 4096, nonce: "n" });
          expect([cosine, p.citations.length]).toEqual([cosine, 1]);
          expect(p.messages[1]!.content).toContain(text);
        }
      });
    }
  }
});
