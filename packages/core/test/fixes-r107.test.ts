import { describe, expect, it } from "vitest";
import * as core from "../src/index";
import type { Delta, GuardedDelta } from "../src/index";

/**
 * Round 107 (F414, F415). The founder's ruling: a model repeating itself never reaches the user, not even twice. The
 * sampler penalises copying at the source (DRY), and the guard holds back what may be a second copy, keeps one, and
 * silently continues once; only a continuation that loops again ends with the notice.
 */
const { guardLoops, sampling, tailLoop } = core;
const UNIT = "The winner of the 1998 World Cup was France.";
const JA = "1998年のワールドカップで優勝したのはフランスです。";
const usage = { promptTokens: 1, completionTokens: 1, ttftMs: 1, tokPerSec: 1 };

/** Streams `text` three code points at a time, like a BPE engine; stops early when `signal` aborts. */
function engine(text: string, signal?: AbortSignal): AsyncIterable<Delta> {
  return (async function* () {
    const cps = Array.from(text);
    for (let i = 0; i < cps.length; i += 3) {
      if (signal?.aborted) break;
      yield { text: cps.slice(i, i + 3).join("") };
    }
    yield { done: usage };
  })();
}

const count = (hay: string, needle: string) => hay.split(needle).length - 1;

/** Plays the guard's output the way the chat renders it; `screens` is every state the answer was on screen in. */
async function screen(stream: AsyncIterable<GuardedDelta>) {
  let shown = "";
  let loop: GuardedDelta["loop"];
  const screens: string[] = [];
  for await (const d of stream) {
    if (d.trim !== undefined) shown = d.trim;
    if (d.loop) {
      loop = d.loop;
      shown = d.loop.text;
    }
    if (d.text) shown += d.text;
    screens.push(shown);
  }
  return { shown, loop, screens };
}

describe("F415 · tailLoop: the second copy of a phrase is a loop, and it is held back while it streams", () => {
  it("red before: the r86 guard let the second and third copies onto the screen", async () => {
    const text = `${UNIT} ${UNIT} ${UNIT} ${UNIT} ${UNIT}`;
    const { screens } = await screen(guardLoops(engine(text), () => undefined));
    expect(Math.max(...screens.map((s) => count(s, UNIT)))).toBe(1);
  });

  for (const [lang, unit, sep] of [
    ["en", UNIT, " "],
    ["ja", JA, ""],
    ["he", "הזוכה במונדיאל 1998 היא צרפת.", " "],
    ["ko", "1998년 월드컵 우승팀은 프랑스입니다.", "\n"],
    ["de, one copy per line", "Der Weltmeister von 1998 ist Frankreich.", "\n"],
  ] as const) {
    it(`${lang}: two copies trip, the kept text is the first copy`, () => {
      const text = `Intro.${sep}${unit}${sep}${unit}${sep}`;
      const hit = tailLoop(text)!.hit;
      expect(hit).not.toBeNull();
      expect(text.slice(0, hit!.keep).trimEnd()).toBe(`Intro.${sep}${unit}`.trimEnd());
    });

    it(`${lang}: at every point inside the second copy, what may be shown ends at the first copy`, () => {
      const head = `Intro.${sep}${unit}${sep}`;
      const cps = Array.from(unit);
      for (let k = 1; k < cps.length; k++) {
        const text = head + cps.slice(0, k).join("");
        const t = tailLoop(text);
        /* Near its end the copy may already be complete in another rotation (". The … France"): then it is cut to one. */
        if (t.hit) expect(text.slice(0, t.hit.keep).trimEnd(), `prefix ${k}`).toBe(head.trimEnd());
        else expect(text.length - t.hold, `prefix ${k}`).toBeLessThanOrEqual(head.length);
      }
    });
  }

  it("a second copy that has no separator yet counts at the end of the answer", () => {
    const bare = UNIT.slice(0, -1);
    expect(tailLoop(`${bare}\n${bare}`, {}, 0, true).hit).not.toBeNull();
    expect(tailLoop(`${bare}\n${bare}`, {}, 0, false).hit).toBeNull();
  });

  it("a copy completed in the middle of a chunk is still caught", () => {
    const head = `${UNIT} `;
    expect(tailLoop(`${head}${UNIT} And then more text follows here.`, {}, head.length).hit).not.toBeNull();
  });

  it("a sentence the answer already said is a loop even with other text between (instant, stress run ja-nenji)", async () => {
    const a = "*   **「次期計画」は「次年度」で写す**：年次報告書として書くべきことは、次の年度に向けた目標です。\n";
    const b = "*   **財務データは必須**：本業の決算資料は必ず添付されます。\n";
    const text = `**4. 注意点**\n${a}${b}${a}${b}`;
    const hit = tailLoop(text).hit;
    expect(text.slice(0, hit!.keep)).toBe(`**4. 注意点**\n${a}${b}`);
    const { screens } = await screen(guardLoops(engine(text), () => undefined));
    expect(Math.max(...screens.map((x) => count(x, "年次報告書として書くべきこと")))).toBe(1);
  });

  it("identical bullets are a loop now: the founder's ruling supersedes F369's allowance for list items", () => {
    const text = "So geht es:\n- Den Teig gut rühren.\n- Den Teig gut rühren.\n- Den Teig gut rühren.\nDann 20 Minuten backen.";
    const hit = tailLoop(text).hit;
    expect(text.slice(0, hit!.keep).trimEnd()).toBe("So geht es:\n- Den Teig gut rühren.");
  });

  it("a sentence that only starts like the one before is held for its matching words, then released", () => {
    const text = `${UNIT} The winner of the 2002 World Cup was Brazil.`;
    const t = tailLoop(text);
    expect(t.hit).toBeNull();
    /* Only the full stop that matches the one before may wait for the next token. */
    expect(t.hold).toBeLessThanOrEqual(1);
  });
});

describe("F415 · the echo rule: ten words said again, punctuation and line breaks aside", () => {
  const POEM = "The stars begin to light their way,\nBeyond the waves that touch the sky.\nThey dance in circles for eternity,\nLike time itself has changed its view.\nNo ship can sail here with engines loud,\n";
  const RUN_ON = "The stars begin to light their ways, Beyond the waves that touch the sky They dance in circles for eternity Like time itself has changed its way";

  it("a copy that drops the line breaks is a loop, and none of it reaches the screen (web trial poem #1, after the retry)", async () => {
    expect(tailLoop(`${POEM}${RUN_ON}`, {}, 0, true).hit).not.toBeNull();
    const out = await screen(guardLoops(engine(`${POEM}${RUN_ON}`), () => undefined, { request: "Write a long poem about the sea with many stanzas." }));
    expect(out.shown.trimEnd()).toBe(POEM.trimEnd());
    expect(Math.max(...out.screens.map((x) => count(x, "dance in circles for eternity")))).toBe(1);
  });

  it("a list item said again with one word changed is a loop (web trial es-list #3)", () => {
    const text = "5. Si alguien te dice que algo es malo, entonces probablemente lo sea.\n6. El miedo te hace sentir muy mal.\n7. Si alguien te dice que algo es malo, entonces probablemente sea así.";
    const hit = tailLoop(text, { request: "Escribe 30 frases motivadoras cortas." }, 0, true).hit;
    expect(text.slice(0, hit!.keep).trimEnd()).toBe("5. Si alguien te dice que algo es malo, entonces probablemente lo sea.\n6. El miedo te hace sentir muy mal.\n7.");
  });

  it("a restated problem, a formula twice and a short quote stay whole (stress runs math-series, math-fib, quote-en)", () => {
    for (const text of [
      "We need the sum of all integers from 1 to 50. Pair them: 1 + 50, 2 + 49, and so on, 25 pairs of 51. So the sum of all integers from 1 to 50 is 1275.",
      "Each number is F(n) = F(n-1) + F(n-2). Start with 0 and 1; by F(n) = F(n-1) + F(n-2) the next is 1, then 2, then 3.",
      'The Sendai head office was founded in 1962 (Quote: "The Sendai head office was founded in 1962.").',
    ])
      expect(tailLoop(text, {}, 0, true).hit, text).toBeNull();
  });

  it("a song may bring its chorus back; the echo rule leaves songs to the line rule", () => {
    const chorus = "Oh the sea is wide and the sea is deep and the sea will sing me to sleep\n";
    const song = `${chorus}The gulls fly high over the harbour wall,\n${chorus}`;
    expect(tailLoop(song, { request: "Write a song about the sea." }, 0, true).hit).toBeNull();
    expect(tailLoop(song, { request: "Write a story about the sea." }, 0, true).hit).not.toBeNull();
  });
});

describe("F415 · healthy text stays whole", () => {
  const HEALTHY: Record<string, string> = {
    "numbered list of three identical steps": "1. Stir the batter.\n2. Stir the batter.\n3. Stir the batter.\n\nThen bake it for 20 minutes.",
    "no no no (en)": "No no no, the museum is closed on Mondays.",
    "go on and on and on (en idiom)": "go on and on and on and on and on",
    "שלום ×4 (he)": "שלום שלום שלום שלום",
    "谢谢 (zh)": "谢谢谢谢！不客气，这是我的荣幸。",
    "いいえ ×3 (ja)": "いいえ、いいえ、いいえ。月曜日は休館です。",
    "fenced code with repeated lines": "Run it like this:\n```python\nprint('hello world')\nprint('hello world')\nprint('hello world')\n```\nIt prints three lines.",
    "unfenced code, three repeated lines": "x += 1\nx += 1\nx += 1\nprint(x)",
    "markdown table and rule": "| a | b |\n|---|---|\n| 1 | 2 |\n| 1 | 2 |\n\n----------------------------------------\n\nDone.",
    "ja long answer with repeated particles": "青葉商事は仙台と福岡に本社を置く商社です。社員数は三百八十二名で、取締役会は七名で構成されています。仙台の本社は一九六二年に設立され、福岡の本社は一九八九年に設立されました。",
    "parallel sentences that differ": "The rain falls on the roof. The rain falls on the road. The rain falls on the river.",
    "JSON records with the same author twice (fast, stress run json-schema)": '[\n  {\n    "title": "1984",\n    "author": "George Orwell",\n    "year": 1949\n  },\n  {\n    "title": "Animal Farm",\n    "author": "George Orwell",\n    "year": 1945\n  }\n]',
    "a name, then its full name joined by ・ (instant, r83 web trial)": "優勝したのは、レアル・マドリード（レアル・マドリード・クラブ・デ・フトボル）です。",
    "a name, then its full name (en)": "The winner was Real Madrid (Real Madrid Club de Fútbol) in the final.",
    "one hundred, one hundred and one (instant t0.2, stress run list-100-numbers)": "The number one hundred is one hundred, one hundred and one is one hundred and one, one hundred and twenty is one hundred and twenty.",
    "JSON records": '[{"id": 1, "name": "Ana", "email": "ana@example.com"}, {"id": 2, "name": "Ben", "email": "ben@example.com"}]',
  };
  for (const [name, text] of Object.entries(HEALTHY)) {
    it(name, async () => {
      expect(tailLoop(text, {}, 0, true).hit).toBeNull();
      expect((await screen(guardLoops(engine(text), () => undefined))).shown).toBe(text);
    });
  }

  it("a hymn line twice is fine when the user asked for a hymn, and a third copy is not", () => {
    const hymn = "Glory, glory, hallelujah!\nGlory, glory, hallelujah!\nHis truth is marching on.";
    expect(tailLoop(hymn, { request: "Write a short hymn about hope." }, 0, true).hit).toBeNull();
    expect(tailLoop(hymn, {}, 0, true).hit).not.toBeNull();
    expect(tailLoop("Glory, glory, hallelujah!\n".repeat(3), { request: "Write a hymn." }, 0, true).hit).not.toBeNull();
  });

  it("a translation of repetitive text repeats as often as the source did (instant, stress run tr-song-fr)", async () => {
    const request = "Translate to French: Row, row, row your boat, gently down the stream. Merrily, merrily, merrily, merrily, life is but a dream.";
    const answer = "Rive, rive, rive ton navire, doucement vers la rivière. Enchantement, enchantement, enchantement, enchantement, la vie n'est qu'un rêve.";
    expect(core.requestRepeats(request)).toBe(4);
    expect((await screen(guardLoops(engine(answer), () => undefined, { request }))).shown).toBe(answer);
    expect(tailLoop(`${answer} Enchantement, enchantement, enchantement, enchantement, enchantement, enchantement, `, { request }, 0, true).hit).not.toBeNull();
  });

  it("a poem nobody asked a refrain of repeats no line and no stanza (web trial poem #4, stress run poem-refrainless #2)", async () => {
    const request = "Write a long poem about the sea with many stanzas.";
    const stanza = "*The Sea and Its Longest Song*\nA journey through endless ocean depths,\nWhere every wave holds memory of what came before.\n\n";
    const intro = "The sea breathes in waves that roll like distant echoes.\n\n";
    const doubled = tailLoop(`${intro}${stanza}${stanza}`, { request }, 0, true).hit;
    expect(`${intro}${stanza}${stanza}`.slice(0, doubled!.keep).trimEnd()).toBe(`${intro}${stanza}`.trimEnd());
    const line = "No shadows cast upon the water's surface, no clouds of smoke,\n";
    const poem = `${line}Just the raw, unfiltered truth of what is found and seen.\nThe rock beneath becomes a giant, sleeping friend,\n${line}Just the raw, unfiltered reality that is found and seen.\n`;
    expect(tailLoop(poem, { request }, 0, true).hit).not.toBeNull();
    expect(count((await screen(guardLoops(engine(poem), () => undefined, { request }))).shown, line.trim())).toBe(1);
  });

  it("a song or a hymn may bring a line back once as its chorus, and a poem asked for a refrain may repeat it", () => {
    const refrain = "The tide comes in, the tide goes out.\n";
    const verse = `${refrain}Salt on the stones and gulls in the air,\n${refrain}Nobody waits for the sea to be fair.\n`;
    expect(tailLoop(verse, { request: "Write a song about the sea." }, 0, true).hit).toBeNull();
    expect(tailLoop(`${verse}${refrain}`, { request: "Write a song about the sea." }, 0, true).hit).not.toBeNull();
    expect(tailLoop(`${refrain}${refrain}${refrain}`, { request: "Write a poem about the sea with a refrain." }, 0, true).hit).toBeNull();
  });

  it("a list asked for one per line may not repeat an item (fast t0.2, stress run list30-animals #1)", () => {
    const request = "List 30 animals that live in the ocean, one per line, numbered.";
    const text = "20. Sea snail  \n21. Sea urchin  \n22. Starfish (various species)  \n23. Sea cucumber  \n24. Coral polyp  \n25. Starfish (various species)  \n";
    expect(tailLoop(text, { request }, 0, true).hit).not.toBeNull();
  });

  it("a sentence said as a bullet and again inside a paragraph is a loop (instant web trial he-explain #3)", async () => {
    const request = "הסבר לי בפירוט מה זה פוטוסינתזה.";
    const said = "אם המעשה נכשל במגמות של חיים וקבע עליו את המספר, אנו צריכים לשים קורונה.";
    const text = `הנה ההסבר:\n*   ${said}\n\nסיכום: ההבנה אינה קריטית. ${said}`;
    expect(tailLoop(text, { request }, 0, true).hit).not.toBeNull();
    expect(count((await screen(guardLoops(engine(text), () => undefined, { request }))).shown, said)).toBe(1);
  });

  it("F389 still holds: five copies asked for are five copies shown, the sixth is trimmed", async () => {
    const request = "Repeat the sentence 'I will study every day.' 5 times.";
    const line = "I will study every day.";
    const { shown, loop } = await screen(guardLoops(engine(`${line}\n`.repeat(8)), () => undefined, { request }));
    expect(count(shown, line)).toBe(5);
    expect(loop).toBeDefined();
    const exact = await screen(guardLoops(engine(`${line}\n`.repeat(5)), () => undefined, { request }));
    expect(count(exact.shown, line)).toBe(5);
    expect(exact.loop).toBeUndefined();
  });
});

describe("F415 · guardLoops keeps one copy and silently continues once", () => {
  it("red before: the r86 guard had no retry; a loop always ended the answer with the notice", async () => {
    let retries = 0;
    let stops = 0;
    const ac = new AbortController();
    const retry = (kept: string) => {
      retries++;
      expect(kept).toBe(`Intro. ${UNIT}`);
      return engine("It beat Brazil 3-0 in the final in Paris.");
    };
    const out = await screen(guardLoops(engine(`Intro. ${UNIT} ${UNIT} ${UNIT} ${UNIT}`, ac.signal), () => (stops++, ac.abort()), { retry }));
    expect(stops).toBe(1);
    expect(retries).toBe(1);
    expect(out.loop).toBeUndefined();
    expect(out.shown).toBe(`Intro. ${UNIT} It beat Brazil 3-0 in the final in Paris.`);
    expect(Math.max(...out.screens.map((s) => count(s, UNIT)))).toBe(1);
  });

  it("joins the continuation with the script's separator (ja: none)", async () => {
    const out = await screen(guardLoops(engine(`${JA}${JA}${JA}`), () => undefined, { retry: () => engine("決勝でブラジルに勝ちました。") }));
    expect(out.shown).toBe(`${JA}決勝でブラジルに勝ちました。`);
  });

  it("a cut right after an item number drops the number, so the continuation does not skip to the next (instant, retry-tuning es-list #2)", async () => {
    const MOTTO = "El éxito es la suma de pequeños esfuerzos diarios.";
    const head = `Frases:\n1. ${MOTTO}\n2. Cree en ti mismo y todo será posible.\n`;
    let kept = "";
    const retry = (k: string) => ((kept = k), engine("3. Nunca te rindas.\n4. Sonríe cada mañana."));
    const out = await screen(guardLoops(engine(`${head}3. ${MOTTO}\n4. Nunca te rindas.`), () => undefined, { retry }));
    expect(kept).toBe(head);
    expect(out.loop).toBeUndefined();
    expect(out.shown).toBe(`${head}3. Nunca te rindas.\n4. Sonríe cada mañana.`);
  });

  it("the notice's kept text does not end on a bare item number either", async () => {
    const MOTTO = "El éxito es la suma de pequeños esfuerzos diarios.";
    const out = await screen(guardLoops(engine(`Frases:\n1. ${MOTTO}\n2. ${MOTTO}`), () => undefined));
    expect(out.loop).toBeDefined();
    expect(out.shown).toBe(`Frases:\n1. ${MOTTO}\n`);
  });

  it("a continuation that loops again is cut to one copy and ends with the notice; there is no second retry", async () => {
    let retries = 0;
    const retry = () => (retries++, engine(`${UNIT} ${UNIT}`));
    const out = await screen(guardLoops(engine(`${UNIT} ${UNIT} ${UNIT}`), () => undefined, { retry }));
    expect(retries).toBe(1);
    expect(out.loop).toBeDefined();
    expect(out.shown).toBe(UNIT);
    expect(Math.max(...out.screens.map((s) => count(s, UNIT)))).toBe(1);
  });

  it("the retry's own loop is caught in the continuation alone, too", async () => {
    const out = await screen(guardLoops(engine(`${UNIT} ${UNIT}`), () => undefined, { retry: () => engine("Brazil lost the final to the host. Brazil lost the final to the host.") }));
    expect(out.loop).toBeDefined();
    expect(count(out.shown, "Brazil lost the final to the host.")).toBe(1);
    expect(count(out.shown, UNIT)).toBe(1);
  });

  it("a short-unit loop already on screen is taken back with a trim before the retry", async () => {
    const out = await screen(guardLoops(engine(`Sure! ${"ha ".repeat(20)}`), () => undefined, { retry: () => engine("Here is the answer.") }));
    expect(out.loop).toBeUndefined();
    expect(out.shown).not.toMatch(/(ha ){6}/);
    expect(out.shown).toMatch(/Here is the answer\.$/);
  });

  it("a short unit shows at most twice while it streams, then the answer keeps one (instant t0.2, stress run ko-list)", async () => {
    const text = "한국 음식: 김치찌개, 국물, 떡볶이, 국수, " + "국면, ".repeat(30);
    const out = await screen(guardLoops(engine(text), () => undefined, { retry: () => engine("비빔밥, 불고기.") }));
    expect(Math.max(...out.screens.map((x) => count(x, "국면")))).toBeLessThanOrEqual(2);
    expect(count(out.shown, "국면")).toBe(1);
    expect(out.shown).toMatch(/비빔밥, 불고기\.$/);
  });

  it("a word listed a fourth time is cut; three stay, as emphasis (instant web trial verbs-de #4)", async () => {
    const text = "Hier sind 25 deutsche Verben:\nbeide, beide, beide, beide; beide, beide, alle; alle, alles.";
    const out = await screen(guardLoops(engine(text), () => undefined, { retry: () => engine("sein, haben, werden.") }));
    expect(Math.max(...out.screens.map((x) => count(x, "beide")))).toBeLessThanOrEqual(2);
    expect(count(out.shown, "beide")).toBe(1);
    for (const ok of ["Nein, nein, nein! Das Museum ist montags geschlossen.", "いいえ、いいえ、いいえ。月曜日は休館です。", "Fibonacci: 1, 1, 2, 3, 5, 8, 13."]) {
      expect((await screen(guardLoops(engine(ok), () => undefined, { retry: () => engine("x") }))).shown, ok).toBe(ok);
    }
    const r83 = "日本の代表は日本・福岡・大阪・大阪・福岡・福岡・東京・東京・大阪・大阪・大阪・大阪・大阪・大阪・";
    expect(tailLoop(r83, {}, 0, true).hit).not.toBeNull();
  });

  it("a short word the source repeats four times may repeat four times (fast, stress run tr-song-fr)", async () => {
    const request = "Translate to French: Row, row, row your boat, gently down the stream. Merrily, merrily, merrily, merrily, life is but a dream.";
    const answer = "Rame, rame, rame ton bateau, doucement sur le ruisseau. Joyeux, joyeux, joyeux, joyeux, la vie n'est qu'un rêve.";
    expect((await screen(guardLoops(engine(answer), () => undefined, { request, retry: () => engine("x") }))).shown).toBe(answer);
  });

  it("reasoning passes through untouched and the last done arrives once", async () => {
    const stream = (async function* (): AsyncIterable<Delta> {
      yield { reasoning: "thinking" };
      yield { text: "Hello there, friend." };
      yield { done: usage };
    })();
    const all: GuardedDelta[] = [];
    for await (const d of guardLoops(stream, () => undefined)) all.push(d);
    expect(all.filter((d) => d.reasoning)).toHaveLength(1);
    expect(all.filter((d) => d.done)).toHaveLength(1);
  });
});

describe("F414 · DRY reaches every engine, and only the silent retry after a loop turns it on", () => {
  it("red before: sampling() had no DRY or presence/frequency to send", () => {
    expect(sampling(core.LOOP_RETRY)).toMatchObject({ dryMultiplier: 1, dryBase: 1.75, dryAllowedLength: 2, dryPenaltyLastN: 4096, presencePenalty: 0.15, frequencyPenalty: 0.05 });
    expect(sampling({}).drySequenceBreakers).toEqual(["\n", ":", '"', "*"]);
  });

  it("the answer samples as before: with DRY on, an ID format came out as ORD-2024-XXXXXX and copied names were misspelt", () => {
    expect(sampling({})).toMatchObject({ repeatPenalty: 1.1, repeatLastN: 64, dryMultiplier: 0, presencePenalty: 0, frequencyPenalty: 0 });
  });

  it("the retry samples one step harder than the answer did, and no more", () => {
    const answer = sampling({});
    const retry = sampling(core.LOOP_RETRY);
    expect(retry.dryMultiplier).toBeGreaterThan(answer.dryMultiplier);
    expect(retry.repeatPenalty).toBeGreaterThan(answer.repeatPenalty);
    expect(retry.dryMultiplier).toBeLessThanOrEqual(1);
    expect(retry.presencePenalty).toBeLessThanOrEqual(0.15);
    expect(retry.frequencyPenalty).toBeLessThanOrEqual(0.05);
  });
});
