import { describe, expect, it } from "vitest";
import * as core from "../src/index";
import type { Delta, GuardedDelta } from "../src/index";
import device from "./fixtures/r115-device-answers.json";

/**
 * Round 115 (F431). iPhone build 25 on round 114's guard (main 6312e769) still showed two repeats and one seam blemish:
 * a fenced long division that said "- 123000000" / "--------" 16 times, a Hebrew list that said items 14 and 18–22
 * again with the first word misspelt ("קיבוץ ירושלים" then "קיבוט ירושלים"), and a Continue that read "capitals,. These".
 */
const { guardLoops, tailLoop } = core;
const usage = { promptTokens: 1, completionTokens: 1, ttftMs: 1, tokPerSec: 1 };
const DIV = device["l07-math-long-div-2"];
const HE = device["l02-he-list"];
const SEAM = device["d-continue-1"];

function engine(text: string, step = 3): AsyncIterable<Delta> {
  return (async function* () {
    const cps = Array.from(text);
    for (let i = 0; i < cps.length; i += step) yield { text: cps.slice(i, i + step).join("") };
    yield { done: usage };
  })();
}

/** What the chat shows: `prefix` (Continue) joined like the chat, then the guarded reply; every state it passes through. */
async function screen(stream: AsyncIterable<GuardedDelta>, prefix = "") {
  let head = prefix;
  let reply = "";
  let loop: GuardedDelta["loop"];
  const screens: string[] = [];
  const shown = () => head + (reply ? core.continuationSeparator(head, reply) : "") + reply;
  for await (const d of stream) {
    if (d.prefix !== undefined) head = d.prefix;
    if (d.trim !== undefined) reply = d.trim;
    if (d.loop) {
      loop = d.loop;
      reply = d.loop.text;
    }
    if (d.text) reply += d.text;
    screens.push(shown());
  }
  return { shown: shown(), loop, screens };
}

const guarded = (answer: string, request: string, retry?: (kept: string) => AsyncIterable<Delta>) => screen(guardLoops(engine(answer), () => undefined, { request, retry }));
const final = (text: string, request = "") => tailLoop(text, { request }, 0, true).hit;
const count = (text: string, line: string) => text.split("\n").filter((l) => l.trim() === line).length;
const fenced = (lines: string[]) => `Here it is:\n\n\`\`\`\n${lines.join("\n")}\n\`\`\`\n\nDone.`;

describe("F431 · inside a fence, a unit of lines said identically back to back is a loop at its third copy", () => {
  it("build 25 math-long-div 0.7 #2: cut before the third '- 123000000', the fence closed, the third copy never on screen", async () => {
    const r = await guarded(DIV.answer, DIV.request);
    expect(r.loop).toBeDefined();
    expect(r.loop!.hit.fence).toBe(true);
    expect(r.shown.endsWith("  --------\n  634654321\n```")).toBe(true);
    expect(count(r.shown, "- 123000000")).toBe(2);
    expect(Math.max(...r.screens.map((x) => count(x, "- 123000000")))).toBe(2);
    expect((r.shown.match(/```/gu) ?? []).length % 2).toBe(0);
  });

  it("no retry writes into the block: the notice shows instead", async () => {
    let retries = 0;
    const r = await guarded(DIV.answer, DIV.request, () => {
      retries++;
      return engine("  511654321\n  - 123000000\n");
    });
    expect(retries).toBe(0);
    expect(r.loop).toBeDefined();
    expect(count(r.shown, "- 123000000")).toBe(2);
  });

  it("a real long division in a fence is not cut: its subtrahends differ and its steps move right", async () => {
    const div = fenced([
      "       8029",
      "    -------",
      "123 ) 987654",
      "      984",
      "      ---",
      "        365",
      "        246",
      "        ---",
      "        1194",
      "        1107",
      "        ----",
      "          874",
      "          861",
      "          ---",
      "           13",
    ]);
    expect(final(div, DIV.request)).toBeNull();
    const r = await guarded(div, DIV.request);
    expect(r.loop).toBeUndefined();
    expect(r.shown).toBe(div);
  });

  it("the same subtrahend three times in a row, one step further right each time (quotient 111), is not cut", () => {
    const div = fenced(["123 ) 13653", "   -123", "   ----", "     135", "    -123", "    ----", "      123", "     -123", "     ----", "        0"]);
    expect(final(div, "Divide 13653 by 123 with long division.")).toBeNull();
  });

  it("the rule line alone repeating with different numbers between stays exempt", () => {
    const div = fenced(["  987654", "- 984", "--------", "  365", "- 246", "--------", "  1194", "- 1107", "--------", "  874", "- 861", "--------", "  13"]);
    expect(final(div, DIV.request)).toBeNull();
  });

  it("code that repeats a line between different lines, nested 'end's and a JSON array of objects are not cut", () => {
    const ruby = fenced(["module A", "  class B", "    def c", "      if d", "        e", "      end", "    end", "  end", "end"]);
    const json = fenced(["[", "  {", '    "name": "a",', '    "type": "string"', "  },", "  {", '    "name": "b",', '    "type": "string"', "  },", "  {", '    "name": "c",', '    "type": "string"', "  }", "]"]);
    const steps = fenced(['print("Step 1")', "time.sleep(1)", 'print("Step 2")', "time.sleep(1)", 'print("Step 3")', "time.sleep(1)"]);
    const table = fenced(["+---+---+", "| 1 | 2 |", "+---+---+", "| 3 | 4 |", "+---+---+", "| 5 | 6 |", "+---+---+"]);
    for (const x of [ruby, json, steps, table]) expect(final(x)).toBeNull();
  });

  it("three copies that close the fence stay, streamed: the third waits off screen and shows when the fence closes", async () => {
    const zeros = fenced(["0 0 0", "0 0 0", "0 0 0"]);
    const hello = "Run it like this:\n```python\nprint('hello world')\nprint('hello world')\nprint('hello world')\n```\nIt prints three lines.";
    for (const x of [zeros, hello]) {
      expect(final(x)).toBeNull();
      const r = await guarded(x, "Show me.");
      expect(r.loop).toBeUndefined();
      expect(r.shown).toBe(x);
    }
  });

  it("a line or a pair of lines said four times in a row is cut before the third; asked repetition is kept", async () => {
    const pair = fenced(["x = compute()", "print(x)", "x = compute()", "print(x)", "x = compute()", "print(x)", "x = compute()", "print(x)"]);
    const r = await guarded(pair, "Write a short Python snippet.");
    expect(r.loop?.hit.fence).toBe(true);
    expect(r.shown).toBe("Here it is:\n\n```\nx = compute()\nprint(x)\nx = compute()\nprint(x)\n```");
    const asked = fenced(['print("hello")', 'print("hello")', 'print("hello")']);
    expect(final(asked, 'Write Python that prints "hello" three times, one print per line.')).toBeNull();
  });
});

describe("F431 · an item said again with one word misspelt is that item again", () => {
  it("build 25 he-list 0.2: cut before '23. קיבוט ירושלים'; no misspelt copy reaches the screen", async () => {
    const r = await guarded(HE.answer, HE.request);
    expect(r.loop).toBeDefined();
    expect(r.shown.trimEnd().split("\n").at(-1)).toBe("22. קיבוץ גבולות");
    for (const bad of ["קיבוט", "קיבוצת", "קיבוק", "קיבוע", "קיבץ", "לקוויט"]) expect(r.screens.some((x) => x.includes(bad))).toBe(false);
  });

  it("a shared word misspelt in English is cut too, and waits off screen until the list holds five distinct heads", async () => {
    const list = "Lakes:\n1. Lake Como\n2. Lake Garda\n3. Lake Geneva\n4. Lame Como\n5. Lake Tahoe\n6. Lake Erie\n7. Lake Huron\n";
    const r = await guarded(list, "List 10 lakes.");
    expect(r.loop).toBeDefined();
    expect(r.shown.trimEnd().split("\n").at(-1)).toBe("3. Lake Geneva");
    expect(r.screens.some((x) => x.includes("Lame"))).toBe(false);
  });

  it("real near-names stay: 'Saint Paul' and 'Saint Pauli', 'Anna' and 'Anne', 'Level 1' and 'Level 2', 'New York' and 'New Yorker'", () => {
    const saints = "1. Saint Paul\n2. Saint Peter\n3. Saint Louis\n4. Saint Denis\n5. Saint Pauli\n6. Saint Malo\n";
    const names = "1. Anna\n2. Anne\n3. Maria\n4. Marie\n5. Johan\n6. Johann\n7. Ruth\n";
    const levels = "1. Level 1\n2. Level 2\n3. Level 3\n4. Level 4\n5. Level 5\n6. Level 6\n";
    const ny = "1. New York\n2. New Jersey\n3. New Mexico\n4. New Hampshire\n5. New Yorker\n6. New Orleans\n";
    for (const x of [saints, names, levels, ny]) expect(final(x, "List them.")).toBeNull();
  });

  it("conjugations stay: 'ellos hablan' / 'ellas hablan', 'lui parla' / 'lei parla', 'eles falam' / 'elas falam'", () => {
    const es = "1. yo hablo\n2. tú hablas\n3. él habla\n4. ella habla\n5. nosotros hablamos\n6. nosotras hablamos\n7. vosotros habláis\n8. ellos hablan\n9. ellas hablan\n10. ustedes hablan\n";
    const it_ = "1. io parlo\n2. tu parli\n3. lui parla\n4. lei parla\n5. noi parliamo\n6. voi parlate\n7. loro parlano\n";
    const pt = "1. eu falo\n2. tu falas\n3. ele fala\n4. ela fala\n5. nós falamos\n6. eles falam\n7. elas falam\n";
    for (const x of [es, it_, pt]) expect(final(x, "Conjugate the verb.")).toBeNull();
    const flat = "1. ellos hablan\n2. ellas hablan\n3. ellos comen\n4. ellas comen\n5. ellos viven\n6. ellas viven\n7. ellos beben\n8. ellas beben\n";
    expect(final(flat, "Conjugate four verbs for ellos and ellas.")).toBeNull();
  });

  it("the same place with a real new word next to the shared one is a new item: 'קיבוץ עין גדי' after 'קיבוץ גדי' is not a misspelling", () => {
    const list = "1. קיבוץ דגניה\n2. קיבוץ גדי\n3. קיבוץ חניתה\n4. קיבוץ יגור\n5. קיבוץ עין גדי\n6. קיבוץ ניר דוד\n";
    expect(final(list, HE.request)).toBeNull();
  });
});

describe("F431 · Continue never leaves ',.' or ';.' at the seam", () => {
  it("build 25 Continue try 1: 'capitals,' + '. These ventures' reads 'capitals. These ventures'", async () => {
    const r = await screen(guardLoops(engine(SEAM.continued), () => undefined, { request: SEAM.request, prefix: SEAM.stopped }), SEAM.stopped);
    expect(r.shown).toContain("into the continent's capitals. These ventures marked a turning point");
    expect(r.screens.some((x) => /[,;]\./u.test(x))).toBe(false);
    expect(r.loop).toBeUndefined();
  });

  it("a restated clause closed with a full stop, and a semicolon, lose the dangling mark too", async () => {
    const stopped = "The fleets carried gold and pepper into the continent's capitals,";
    const r = await screen(guardLoops(engine(" gold and pepper into the continent's capitals. These ventures changed trade."), () => undefined, { prefix: stopped }), stopped);
    expect(r.shown).toBe("The fleets carried gold and pepper into the continent's capitals. These ventures changed trade.");
    const semi = "Venice held the routes;";
    const s = await screen(guardLoops(engine(". Then Lisbon rose."), () => undefined, { prefix: semi }), semi);
    expect(s.shown).toBe("Venice held the routes. Then Lisbon rose.");
  });

  it("a continuation that goes on the sentence keeps the comma", async () => {
    const stopped = "They traded pepper, cloves,";
    const r = await screen(guardLoops(engine(" and nutmeg across the sea."), () => undefined, { prefix: stopped }), stopped);
    expect(r.shown).toBe("They traded pepper, cloves, and nutmeg across the sea.");
  });

  it("the silent retry's seam drops a dangling comma the cut kept", async () => {
    const answer = "The winds carried the ships east, the winds carried the ships east, the winds carried the ships east, the winds";
    const r = await guarded(answer, "Tell me about the monsoon.", () => engine(". Then the traders came home."));
    expect(r.shown).not.toMatch(/[,;]\./u);
    expect(r.screens.some((x) => /[,;]\./u.test(x))).toBe(false);
    expect(r.shown).toContain("The winds carried the ships east. Then the traders came home.");
  });
});
