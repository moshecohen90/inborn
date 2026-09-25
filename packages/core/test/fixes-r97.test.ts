import { describe, expect, it } from "vitest";
import { continuationSeparator, detectLoop, guardLoops, repetitionRequest, type Delta, type GuardedDelta } from "../src/index";

/* F389 (web pass F8): the request and the answer the guard cut to one line. */
const FOX = "The quick brown fox jumps over the lazy dog.";
const FOX_ASK = `Repeat exactly this sentence five times, each on its own line: ${FOX}`;
const FOX_FIVE = Array(5).fill(FOX).join("\n");

const ZH_LINE = "今天天氣很好，我們去公園散步吧。";
const ZH_ASK = `請把這句話重複五遍，每遍一行：${ZH_LINE}`;
const ZH_FIVE = Array(5).fill(ZH_LINE).join("\n");

/* The round 86 degenerate loop, docs/qa/fix-loop-guard. */
const JA_UNIT = "1998 年ワールドカップの優勝は日本を、日本は 1998 年ワールドカップを日本を優勝したのはどこですか？";
const JA_ASK = "一九九八年のワールドカップで優勝したのはどこですか？";
const JA_LOOP = `${JA_UNIT} ${JA_UNIT} ${JA_UNIT} 199`;

async function* chunks(text: string, size = 5): AsyncGenerator<Delta> {
  const cps = Array.from(text);
  for (let i = 0; i < cps.length; i += size) yield { text: cps.slice(i, i + size).join("") };
  yield { done: { promptTokens: 1, completionTokens: 1 } } as Delta;
}

async function run(text: string, request: string): Promise<{ shown: string; stops: number; cut: boolean }> {
  let shown = "";
  let stops = 0;
  let cut = false;
  for await (const d of guardLoops(chunks(text), () => stops++, { request }) as AsyncGenerator<GuardedDelta>) {
    if (d.loop) {
      cut = true;
      shown = d.loop.text;
    }
    if (d.text) shown += d.text;
  }
  return { shown, stops, cut };
}

describe("F389 · repetition the user asked for is not a loop", () => {
  it("keeps five requested lines (en) through the stream", async () => {
    expect(detectLoop(FOX_FIVE, { request: FOX_ASK })).toBeNull();
    const r = await run(FOX_FIVE, FOX_ASK);
    expect(r.cut).toBe(false);
    expect(r.shown).toBe(FOX_FIVE);
  });

  it("keeps five requested lines (zh-Hant) through the stream", async () => {
    expect(detectLoop(ZH_FIVE, { request: ZH_ASK })).toBeNull();
    const r = await run(ZH_FIVE, ZH_ASK);
    expect(r.cut).toBe(false);
    expect(r.shown).toBe(ZH_FIVE);
  });

  it("keeps a sentence the user quoted, repeated on one line", () => {
    const text = `${FOX} ${FOX} ${FOX} ${FOX}`;
    expect(detectLoop(text, { request: `Say this four times: ${FOX}` })).toBeNull();
  });

  it("keeps a chorus the user asked for (line-structured, no count)", () => {
    const chorus = "Row, row, row your boat\nGently down the stream\n";
    expect(detectLoop(chorus.repeat(4), { request: "Write the chorus of a campfire song and sing it over and over." })).toBeNull();
  });

  it("cuts a requested repetition that runs past the count, keeping the count", () => {
    const eight = Array(8).fill(FOX).join("\n");
    const hit = detectLoop(eight, { request: FOX_ASK });
    expect(hit).not.toBeNull();
    expect(eight.slice(0, hit!.keep).trimEnd()).toBe(FOX_FIVE);
  });

  it("still trips on the round 86 Japanese loop with the user's question as context", () => {
    const hit = detectLoop(JA_LOOP, { request: JA_ASK });
    expect(hit).not.toBeNull();
    expect(JA_LOOP.slice(0, hit!.keep).trimEnd()).toBe(JA_UNIT);
  });

  it("still trips on an unrequested loop when the user asked an ordinary question", () => {
    expect(detectLoop(FOX_FIVE, { request: "Tell me a sentence that uses every letter." })).not.toBeNull();
  });

  it("still trips on a loop that is not the unit the user asked to repeat", () => {
    const other = Array(6).fill("I cannot repeat that sentence for you.").join("\n");
    expect(detectLoop(other, { request: "Say hello." })).not.toBeNull();
  });
});

describe("F389 · repetitionRequest reads the ask in the 8 locales", () => {
  const cases: [string, number | undefined][] = [
    ["Repeat exactly this sentence five times", 5],
    ["Write 3 lines of: hello", 3],
    ["Wiederhole diesen Satz fünfmal", 5],
    ["Repite esta frase cinco veces", 5],
    ["Répète cette phrase cinq fois", 5],
    ["Repita esta frase cinco vezes", 5],
    ["この文を5回繰り返してください", 5],
    ["이 문장을 다섯 번 반복해 주세요", 5],
    ["請把這句話重複五遍", 5],
    ["Write the lyrics with the chorus", undefined],
  ];
  for (const [ask, count] of cases) {
    it(ask, () => {
      const r = repetitionRequest(ask);
      expect(r.asked).toBe(true);
      expect(r.count).toBe(count);
    });
  }
  it("an ordinary question is not a repetition request", () => {
    expect(repetitionRequest("Who won the 1998 World Cup?").asked).toBe(false);
    expect(repetitionRequest(JA_ASK).asked).toBe(false);
  });
});

describe("F390 · Continue joins the rest with the right separator", () => {
  const join = (a: string, b: string) => a + continuationSeparator(a, b) + b;
  it("adds a space between two Latin words", () => expect(join("…along the trade routes", "Europe's culinary")).toBe("…along the trade routes Europe's culinary"));
  it("no space when the prefix ends in whitespace or a newline", () => {
    expect(join("routes ", "Europe")).toBe("routes Europe");
    expect(join("routes\n", "Europe")).toBe("routes\nEurope");
  });
  it("no space after an open bracket or quote", () => {
    expect(join("the spice (", "pepper")).toBe("the spice (pepper");
    expect(join("he said “", "go")).toBe("he said “go");
  });
  it("no space when the model starts with punctuation or its own space", () => {
    expect(join("trade routes", ", and Europe")).toBe("trade routes, and Europe");
    expect(join("trade routes", ".")).toBe("trade routes.");
    expect(join("Europe", "'s spices")).toBe("Europe's spices");
    expect(join("trade routes", " Europe")).toBe("trade routes Europe");
  });
  it("no space in Chinese or Japanese", () => {
    expect(join("香料貿易路線", "連接了歐洲")).toBe("香料貿易路線連接了歐洲");
    expect(join("交易ルートは", "ヨーロッパへ")).toBe("交易ルートはヨーロッパへ");
    expect(join("路線。", "歐洲")).toBe("路線。歐洲");
  });
  it("a space in Korean, which spaces its words", () => expect(join("무역로를", "따라")).toBe("무역로를 따라"));
  it("nothing to join when either side is empty", () => {
    expect(continuationSeparator("", "Europe")).toBe("");
    expect(continuationSeparator("routes", "")).toBe("");
  });
});
