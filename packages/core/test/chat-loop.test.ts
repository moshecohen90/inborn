import { describe, expect, it } from "vitest";
import { describeLoopCut, detectLoop, guardLoops, type Delta, type GuardedDelta } from "../src/index";

/* F369: docs/qa/fix-corroboration-door/e2e/after.json steps[5], the Instant answer the user saw, verbatim. */
const JA_UNIT = "1998 年ワールドカップの優勝は日本を、日本は 1998 年ワールドカップを日本を優勝したのはどこですか？";
const JA_LOOP = `${JA_UNIT} ${JA_UNIT} ${JA_UNIT} 199`;
/* The same answer as it streamed: the screenshot shows each copy on its own line (the harness collapsed the breaks). */
const JA_LOOP_LINES = `${JA_UNIT}\n${JA_UNIT}\n${JA_UNIT}\n199`;

const LOOPS: Record<string, { text: string; keep: string }> = {
  ja: { text: JA_LOOP, keep: JA_UNIT },
  "ja, one copy per line": { text: JA_LOOP_LINES, keep: JA_UNIT },
  zh: { text: "1998年世界杯冠军是法国队，法国队是1998年世界杯的冠军。".repeat(3) + "1998年", keep: "1998年世界杯冠军是法国队，法国队是1998年世界杯的冠军。" },
  ko: { text: "1998년 월드컵 우승팀은 프랑스입니다. ".repeat(3) + "1998년 월", keep: "1998년 월드컵 우승팀은 프랑스입니다." },
  he: { text: "הזוכה במונדיאל 1998 היא צרפת. ".repeat(3) + "הזוכה", keep: "הזוכה במונדיאל 1998 היא צרפת." },
  ar: { text: "الفائز بكأس العالم 1998 هو فرنسا. ".repeat(3) + "الفائز", keep: "الفائز بكأس العالم 1998 هو فرنسا." },
  en: { text: "France won the 1998 World Cup. " + "The winner of the 1998 World Cup was France. ".repeat(3) + "The win", keep: "France won the 1998 World Cup. The winner of the 1998 World Cup was France." },
  de: { text: "Der Weltmeister von 1998 ist Frankreich. ".repeat(4), keep: "Der Weltmeister von 1998 ist Frankreich." },
};

const HEALTHY: Record<string, string> = {
  "numbered list of three identical steps": "1. Stir the batter.\n2. Stir the batter.\n3. Stir the batter.\n\nThen bake it for 20 minutes.",
  "numbered list of three identical steps (ja)": "手順：\n1. 生地をよく混ぜます。\n2. 生地をよく混ぜます。\n3. 生地をよく混ぜます。\n最後に二十分焼きます。",
  "bulleted list of three identical steps (de)": "So geht es:\n- Den Teig gut rühren.\n- Den Teig gut rühren.\n- Den Teig gut rühren.\nDann 20 Minuten backen.",
  "poem refrain twice (he)": "אֵלִי, אֵלִי, שֶׁלֹּא יִגָּמֵר לְעוֹלָם\nהַחוֹל וְהַיָּם\nאֵלִי, אֵלִי, שֶׁלֹּא יִגָּמֵר לְעוֹלָם\nרִשְׁרוּשׁ שֶׁל הַמַּיִם",
  "hymn chorus line twice": "Glory, glory, hallelujah!\nGlory, glory, hallelujah!\nHis truth is marching on.",
  "no no no (en)": "No no no, the museum is closed on Mondays.",
  "go on and on and on (en idiom)": "go on and on and on and on and on",
  "שלום ×4 (he)": "שלום שלום שלום שלום",
  "nein nein nein (de)": "Nein, nein, nein! Das Museum ist montags geschlossen.",
  "いいえ ×3 (ja)": "いいえ、いいえ、いいえ。月曜日は休館です。",
  "لا لا لا (ar)": "لا لا لا، المتحف مغلق يوم الاثنين.",
  "谢谢 (zh)": "谢谢谢谢！不客气，这是我的荣幸。",
  "fenced code with repeated lines": "Run it like this:\n```python\nprint('hi')\nprint('hi')\nprint('hi')\nprint('hi')\nprint('hi')\n```\nIt prints five lines.",
  "unfenced code, three repeated lines": "x += 1\nx += 1\nx += 1\nprint(x)",
  "markdown table and rule": "| a | b |\n|---|---|\n| 1 | 2 |\n| 1 | 2 |\n\n----------------------------------------\n\nDone.",
  "de on-topic answer (after.json)": "Das Unternehmen arbeitet dreihundertzweiundachtzig Personen, wobei seine beiden Hauptbüros Sendai und Fukuoka betreffen.",
  "ja on-topic answer (after.json)": "青葉商事の社員数は三百八十二名です。",
  "ja board answer (after.json)": "取締役会は七名で構成されます。",
  "en long answer": "Neil Armstrong was the first person to walk on the Moon, on 20 July 1969. Buzz Aldrin followed him about twenty minutes later, while Michael Collins stayed in orbit aboard the command module. The landing site was the Sea of Tranquility.",
  "ja long answer with repeated particles": "青葉商事は仙台と福岡に本社を置く商社です。社員数は三百八十二名で、取締役会は七名で構成されています。仙台の本社は一九六二年に設立され、福岡の本社は一九八九年に設立されました。",
  "zh answer": "青叶商事是一家总部位于仙台和福冈的贸易公司，共有三百八十二名员工，董事会由七名成员组成。",
  "ko answer": "아오바 상사는 센다이와 후쿠오카에 본사를 둔 무역 회사로, 직원은 382명이고 이사회는 7명으로 구성되어 있습니다.",
  "he answer": "בחברה עובדים שלוש מאות שמונים ושניים אנשים, בשני משרדים ראשיים: סנדאי ופוקואוקה.",
  "ar answer": "يعمل في الشركة ثلاثمائة واثنان وثمانون موظفًا في مكتبين رئيسيين في سنداي وفوكوكا.",
};

describe("F369 · detectLoop flags a repeat anywhere in the tail, not only at its end", () => {
  it("trips on the exact Japanese loop from after.json and trims to the first occurrence", () => {
    const hit = detectLoop(JA_LOOP);
    expect(hit).not.toBeNull();
    expect(hit!.repeats).toBeGreaterThanOrEqual(3);
    expect(JA_LOOP.slice(0, hit!.keep).trimEnd()).toBe(JA_UNIT);
  });

  it("trips on the Japanese loop at every streaming boundary once the third copy and its separator are in", () => {
    const third = (JA_UNIT.length + 1) * 3;
    for (let end = third; end <= JA_LOOP.length; end++) expect(detectLoop(JA_LOOP.slice(0, end)), `prefix ${end}`).not.toBeNull();
    expect(detectLoop(JA_LOOP.slice(0, JA_UNIT.length * 2 + 1))).toBeNull();
  });

  for (const [lang, { text, keep }] of Object.entries(LOOPS)) {
    it(`trips on a ${lang} sentence loop and keeps "${keep.slice(0, 24)}…"`, () => {
      const hit = detectLoop(text);
      expect(hit).not.toBeNull();
      expect(text.slice(0, hit!.keep).trimEnd()).toBe(keep);
    });
  }

  it("catches a loop that started before the 600-code-point window, keeping only its first copy", () => {
    const text = "Intro. " + "The same eleven words keep coming back in this answer again. ".repeat(30);
    const hit = detectLoop(text);
    expect(text.slice(0, hit!.keep).trimEnd()).toBe("Intro. The same eleven words keep coming back in this answer again.");
  });

  it("trips on a long run of a short unit (a model stuck on one syllable)", () => {
    expect(detectLoop("ははははははははははははははははははははははははははははははははははははは")).not.toBeNull();
    expect(detectLoop("Sure! " + "ha ".repeat(20))).not.toBeNull();
    expect(detectLoop("The answer is 42. The answer is 42. The answer is 42.")).not.toBeNull();
  });

  for (const [name, text] of Object.entries(HEALTHY)) {
    it(`leaves healthy text alone: ${name}`, () => {
      expect(detectLoop(text)).toBeNull();
    });
  }

  it("is empty-safe", () => {
    expect(detectLoop("")).toBeNull();
  });
});

/** An engine that loops forever until it is stopped, three code points per token, like a BPE stream. */
function loopingEngine(unit: string, signal: AbortSignal, pulled: { chars: number; afterStop: number }): AsyncIterable<Delta> {
  return (async function* () {
    const cps = Array.from(`${unit} `);
    for (let i = 0; i < 4000; i += 3) {
      if (signal.aborted) {
        pulled.afterStop++;
        break;
      }
      const text = Array.from({ length: 3 }, (_, k) => cps[(i + k) % cps.length]).join("");
      pulled.chars += text.length;
      yield { text };
    }
    yield { done: { promptTokens: 10, completionTokens: pulled.chars, ttftMs: 1, tokPerSec: 1 } };
  })();
}

async function drain(stream: AsyncIterable<GuardedDelta>) {
  let text = "";
  let loop: GuardedDelta["loop"];
  let textAfterLoop = 0;
  let done = false;
  for await (const d of stream) {
    if (d.text) {
      if (loop) textAfterLoop++;
      text += d.text;
    }
    if (d.loop) loop = d.loop;
    if (d.done) done = true;
  }
  return { text, loop, textAfterLoop, done };
}

describe("F369 · guardLoops stops the engine and cuts the answer (controller)", () => {
  it("aborts a looping stream within the fourth copy and hands back the first copy", async () => {
    const ac = new AbortController();
    const pulled = { chars: 0, afterStop: 0 };
    let stops = 0;
    const out = await drain(guardLoops(loopingEngine(JA_UNIT, ac.signal, pulled), () => { stops++; ac.abort(); }));
    expect(stops).toBe(1);
    expect(out.loop?.text).toBe(JA_UNIT);
    expect(out.textAfterLoop).toBe(0);
    expect(out.done).toBe(true);
    expect(pulled.chars).toBeLessThan(JA_UNIT.length * 4);
    expect(describeLoopCut(out.loop!)).toMatch(/^\[chat\] loop cut: kept \d+ of \d+ chars, unit \d+ cp x\d+$/);
  });

  it("passes a healthy stream through untouched and never stops it", async () => {
    let stops = 0;
    const words = HEALTHY["en long answer"]!.split(/(?<= )/);
    const healthy = (async function* (): AsyncIterable<Delta> {
      for (const text of words) yield { text };
      yield { done: { promptTokens: 1, completionTokens: words.length, ttftMs: 1, tokPerSec: 1 } };
    })();
    const out = await drain(guardLoops(healthy, () => stops++));
    expect(stops).toBe(0);
    expect(out.loop).toBeUndefined();
    expect(out.text).toBe(HEALTHY["en long answer"]);
  });

  it("cuts a loop the engine finished by itself (token ceiling) without calling stop", async () => {
    let stops = 0;
    const whole = (async function* (): AsyncIterable<Delta> {
      yield { text: JA_LOOP };
      yield { done: { promptTokens: 1, completionTokens: 1, ttftMs: 1, tokPerSec: 1 } };
    })();
    const out = await drain(guardLoops(whole, () => stops++));
    expect(out.loop?.text).toBe(JA_UNIT);
    expect(stops).toBeLessThanOrEqual(1);
  });
});
