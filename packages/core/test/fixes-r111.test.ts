import { describe, expect, it } from "vitest";
import * as core from "../src/index";
import type { Delta, GuardedDelta } from "../src/index";
import device from "./fixtures/r111-device-answers.json";

/**
 * Round 111 (F423). iPhone build 22 at the app's own temperature let two repeats through the round-107 guard: a numbered
 * list whose items 21 to 30 said items 11 to 20 again (the numbers differ, so no rule saw it), and a Hebrew phrase said
 * twice back to back with the first copy in **bold**. Every rule now reads the answer without list markers, emphasis,
 * heading marks and quotation marks, and a list item listed a second time is a loop.
 */
const { guardLoops, tailLoop } = core;
const usage = { promptTokens: 1, completionTokens: 1, ttftMs: 1, tokPerSec: 1 };
const LIST = device["l07-list30-animals-2"];
const HE = device["l07-he-explain-2"];
const HE_PHRASE = "האם צריך פטין מלאכותי?";

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

/** The items of a numbered or bulleted list, without their markers, lower-cased. */
const items = (text: string) =>
  text
    .split("\n")
    .map((l) => /^\s*(?:\d{1,3}[.)]|[-*•])\s+(.*)$/u.exec(l)?.[1]?.trim().toLowerCase())
    .filter((x): x is string => !!x);
/* Items the rule counts: two words or more, or 8 code points ("Eel" twice stays under it by design). */
const counted = (text: string) => items(text).filter((x) => x.split(/\s+/u).length >= 2 || Array.from(x).length >= 8);
const mostListed = (text: string) => Math.max(0, ...[...new Set(counted(text))].map((x) => counted(text).filter((y) => y === x).length));

describe("F423 · iPhone build 22: the two answers that reached the screen now stop at the first repeat", () => {
  it("list30-animals #2: a list item listed again is cut at its second copy, and no screen ever lists an item twice", async () => {
    const hit = tailLoop(LIST.text, { request: LIST.request }, 0, true).hit;
    expect(hit).not.toBeNull();
    const out = await screen(guardLoops(engine(LIST.text), () => undefined, { request: LIST.request }));
    expect(out.loop).toBeDefined();
    /* Round 113 (F426): "Eel" (item 6) comes back as item 17, before "Clownfish" (item 7) comes back as item 19. */
    expect(out.shown.trimEnd().split("\n").pop()).toBe("16. Tiger shark");
    expect(Math.max(...out.screens.map(mostListed))).toBe(1);
  });

  it("list30-animals #2: the silent retry continues the list after the cut, and a retry that repeats again ends with the notice", async () => {
    let kept = "";
    const fresh = "19. Moray eel\n20. Manta ray\n21. Swordfish\n22. Lobster";
    const ok = await screen(guardLoops(engine(LIST.text), () => undefined, { request: LIST.request, retry: (k) => ((kept = k), engine(fresh)) }));
    expect(kept.trimEnd().split("\n").pop()).toBe("16. Tiger shark");
    expect(ok.loop).toBeUndefined();
    /* F426: the continuation's "19." goes on at 17. */
    expect(ok.shown).toMatch(/16\. Tiger shark\n17\. Moray eel\n18\. Manta ray/u);
    expect(Math.max(...ok.screens.map(mostListed))).toBe(1);
    const again = await screen(guardLoops(engine(LIST.text), () => undefined, { request: LIST.request, retry: () => engine("19. Sea otter\n20. Sea bass") }));
    expect(again.loop).toBeDefined();
    expect(Math.max(...again.screens.map(mostListed))).toBe(1);
  });

  it("he-explain #2: the phrase said twice back to back, the first copy in bold, is cut to one copy", async () => {
    expect(count(HE.text, HE_PHRASE)).toBe(2);
    const hit = tailLoop(HE.text, { request: HE.request }, 0, true).hit;
    expect(hit).not.toBeNull();
    const out = await screen(guardLoops(engine(HE.text), () => undefined, { request: HE.request }));
    expect(out.loop).toBeDefined();
    expect(out.shown.endsWith("4.  **האם צריך פטין מלאכותי?** כולם אומרים:")).toBe(true);
    expect(Math.max(...out.screens.map((x) => count(x, HE_PHRASE)))).toBe(1);
  });

  it("he-explain #2 as it ran on the phone: the retry's continuation said the phrase again, and now the notice keeps one copy", async () => {
    const before = HE.text.slice(0, HE.kept);
    const continuation = HE.text.slice(HE.kept);
    expect(continuation.startsWith(` ${HE_PHRASE}`)).toBe(true);
    /* The log shows only the first loop's size (69 code points, twice); a doubled sentence stands in for it. */
    const first = `${before} כולם אומרים: לא. אנחנו נותנים את התפקיד הזה והוא עובד כל הזמן. לא. אנחנו נותנים את התפקיד הזה והוא עובד כל הזמן.`;
    let kept = "";
    const out = await screen(guardLoops(engine(first), () => undefined, { request: HE.request, retry: (k) => ((kept = k), engine(continuation)) }));
    expect(kept.startsWith(before)).toBe(true);
    expect(out.loop).toBeDefined();
    expect(Math.max(...out.screens.map((x) => count(x, HE_PHRASE)))).toBe(1);
    expect(count(out.shown, HE_PHRASE)).toBe(1);
  });
});

describe("F423 · every rule reads through list markers, emphasis and quotation marks", () => {
  it("a phrase in bold, then again plain, back to back, is a loop; the cut closes no bold it did not open", () => {
    const text = "Remember this: **The light reactions make ATP.** The light reactions make ATP. Then the Calvin cycle runs.";
    const hit = tailLoop(text, {}, 0, true).hit;
    expect(hit).not.toBeNull();
    const cut = core.cutLoop(text, hit!);
    expect(cut.text).toBe("Remember this: **The light reactions make ATP.**");
  });

  it("the second copy in bold leaves no dangling ** behind", () => {
    const text = "The light reactions make ATP. **The light reactions make ATP.** Then the Calvin cycle runs.";
    const hit = tailLoop(text, {}, 0, true).hit;
    expect(core.cutLoop(text, hit!).text).toBe("The light reactions make ATP.");
  });

  it("a copy that starts inside a bold span gets its ** closed", () => {
    const text = "**Leaves absorb red and blue light, absorb red and blue light,** and reflect green.";
    const hit = tailLoop(text, {}, 0, true).hit;
    expect(hit).not.toBeNull();
    expect(core.cutLoop(text, hit!).text).toBe("**Leaves absorb red and blue light,**");
  });

  it("a phrase in quotes, then again without them, back to back, is a loop", () => {
    for (const text of ['They all say: "Is artificial protein needed?" Is artificial protein needed? Not in this sense.', "כולם אומרים: „האם צריך פטין מלאכותי?” האם צריך פטין מלאכותי? לא במובן הזה.", "皆が言う：「人工タンパク質は必要ですか？」人工タンパク質は必要ですか？"]) {
      expect(tailLoop(text, {}, 0, true).hit, text).not.toBeNull();
    }
  });

  it("items numbered in Hebrew letters, circled numbers or 一、 are compared without their markers", () => {
    for (const text of ["רשימה:\nא. דולפין גדול\nב. כריש לבן\nג. דולפין גדול\n", "リスト：\n① 東京タワー\n② 大阪城公園\n③ 東京タワー\n", "目录：\n一、年度概况\n二、财务报表\n三、年度概况\n"]) {
      const hit = tailLoop(text, {}, 0, true).hit;
      expect(hit, text).not.toBeNull();
      expect(core.cutLoop(text, hit!).text.trimEnd().split("\n")).toHaveLength(3);
    }
  });

  it("a copy that starts inside a word of a new item keeps that item whole (round 110 web trial animals-40 #5)", () => {
    const text = "10. Leopard\n11. Panthera leo\n12. African Elephant\n13. Asian Elephant\n14. Asian Elephant (repeated for variety)\n15. African Wild Dog";
    const hit = tailLoop(text, { request: "List 40 animals, one per line, numbered." }, 0, true).hit;
    expect(hit).not.toBeNull();
    expect(core.cutLoop(text, hit!).text.trimEnd()).toBe("10. Leopard\n11. Panthera leo\n12. African Elephant\n13. Asian Elephant");
  });

  it("an item number or bullet with the copy is never left bare on screen", async () => {
    for (const text of ["Animals:\n1. Sea otter\n2. Sea bass\n3. **Sea otter**\n4. Whale", "Animals:\n- Sea otter\n- Sea bass\n- Sea otter\n- Whale", "Animals:\n(1) Sea otter\n(2) Sea bass\n(3) Sea otter\n(4) Whale"]) {
      const out = await screen(guardLoops(engine(text), () => undefined));
      expect(out.loop, text).toBeDefined();
      expect(out.shown.trimEnd().split("\n")).toHaveLength(3);
      for (const s of out.screens) expect((s.match(/^\s*(?:\d{1,3}[.)]|[-*•]|\(\d{1,3}\))\s*(?:\*\*)?Sea o/gmu) ?? []).length, s).toBeLessThanOrEqual(1);
      expect(count(out.shown, "Sea otter")).toBe(1);
    }
  });
});

describe("F423 · what must stay whole", () => {
  const ANIMALS = ["Blue whale", "Bottlenose dolphin", "Great white shark", "Green sea turtle", "Giant squid", "Common octopus", "Moon jellyfish", "Clownfish", "Manta ray", "Sea otter", "Sea lion", "Sea urchin", "Sea horse", "Starfish", "Hammerhead shark", "Tiger shark", "Bluefin tuna", "Atlantic cod", "Humpback whale", "Orca", "Narwhal", "Beluga whale", "Walrus", "Harbor seal", "Emperor penguin", "Lobster", "Hermit crab", "Moray eel", "Swordfish", "Sailfish", "Anglerfish", "Pufferfish", "Lionfish", "Barracuda", "Sea cucumber", "Nudibranch", "Krill", "Coral polyp", "Leatherback turtle", "Mahi-mahi"];

  it("a numbered list of 40 distinct animals, several sharing a first word, is not cut and never held for long", async () => {
    expect(new Set(ANIMALS).size).toBe(40);
    const text = `Here are 40 ocean animals:\n${ANIMALS.map((a, i) => `${i + 1}. ${a}`).join("\n")}`;
    const request = "List 40 animals that live in the ocean, one per line, numbered.";
    expect(tailLoop(text, { request }, 0, true).hit).toBeNull();
    const out = await screen(guardLoops(engine(text), () => undefined, { request, retry: () => engine("x") }));
    expect(out.loop).toBeUndefined();
    expect(out.shown).toBe(text);
  });

  it("a list where two items share their first word (Sea otter, Sea lion) is not cut, bulleted or bold", async () => {
    for (const text of ["1. Sea otter\n2. Sea lion\n3. Sea urchin\n4. Sea horse", "- **Sea otter** – floats on its back\n- **Sea lion** – barks on the rocks\n- **Sea otter** pups ride on their mothers"]) {
      expect(tailLoop(text, {}, 0, true).hit, text).toBeNull();
      expect((await screen(guardLoops(engine(text), () => undefined))).shown).toBe(text);
    }
  });

  it("'Repeat exactly this sentence five times, each on its own line' is not cut, numbered or not", async () => {
    const request = "Repeat exactly this sentence five times, each on its own line: The sea is calm tonight.";
    for (const text of ["The sea is calm tonight.\n".repeat(5).trimEnd(), [1, 2, 3, 4, 5].map((i) => `${i}. The sea is calm tonight.`).join("\n"), "- **The sea is calm tonight.**\n".repeat(5).trimEnd()]) {
      expect(tailLoop(text, { request }, 0, true).hit, text).toBeNull();
      const out = await screen(guardLoops(engine(text), () => undefined, { request, retry: () => engine("x") }));
      expect(out.shown, text).toBe(text);
    }
  });

  it("a bold phrase used once, then the same words in the sentence that explains it, is not cut", async () => {
    for (const text of [
      "**Photosynthesis**\nPhotosynthesis is how plants turn light into sugar.",
      "Here is the overview.\n**Photosynthesis**\nPhotosynthesis is how plants turn light into sugar.",
      "Here is the overview.\n### Mitochondria\nMitochondria make most of the cell's energy.",
      "## Photosynthesis\n\n**Photosynthesis** is how plants turn light into sugar. The **light reactions** happen first; the light reactions need water.",
      "**פוטוסינתזה** היא התהליך שבו צמחים הופכים אור לסוכר. בפוטוסינתזה יש שני שלבים.",
      "**1. Light reactions**\nThe light reactions make ATP.\n**2. Calvin cycle**\nThe Calvin cycle makes sugar.",
    ]) {
      expect(tailLoop(text, {}, 0, true).hit, text).toBeNull();
      expect((await screen(guardLoops(engine(text), () => undefined))).shown, text).toBe(text);
    }
  });

  it("labels that head each option's sub-list, a table row and short answers may repeat", () => {
    for (const text of [
      "1. **Solar**\n   - **Advantages:**\n     - Clean\n   - **Disadvantages:**\n     - Needs sun\n2. **Wind**\n   - **Advantages:**\n     - Cheap\n   - **Disadvantages:**\n     - Noisy",
      "| Animal | Where it lives |\n|---|---|\n| Sea otter | Pacific Ocean coast |\n| Sea lion | Pacific |\n| Sea otter | Pacific Ocean coast |",
      "Answer key:\n1. True\n2. False\n3. True\n4. True",
    ]) {
      expect(tailLoop(text, {}, 0, true).hit, text).toBeNull();
    }
  });

  it("a translation of a list that repeats an item repeats it too", () => {
    const request = "Translate to Spanish:\n1. Sea otter\n2. Sea bass\n3. Sea otter";
    expect(tailLoop("1. Nutria marina\n2. Lubina\n3. Nutria marina", { request }, 0, true).hit).toBeNull();
  });

  it("an item that runs on past the one before it is not its copy (fast t0.2, stress run list30-animals #3)", () => {
    const text = "24. Sea Dogfish\n25. Sea Bass\n26. Sea Basslet\n27. Sea Bassletlet\n28. Sea Bassletletlet";
    expect(tailLoop(text, {}, 0, true).hit).toBeNull();
  });

  it("a list restarted from scratch is cut where the restart begins, short items included (stress run cont-list #2)", () => {
    const list = "1. Apple\n2. Banana\n3. Cherry\n4. Date\n5. Elderberry\n6. Fig";
    const text = `Here are the fruits:\n${list}\n\nLet me recount carefully from scratch.\n\n${list}`;
    const hit = tailLoop(text, {}, 0, true).hit;
    /* F426: the restart's intro goes with the restarted list. */
    expect(core.cutLoop(text, hit!).text).toBe(`Here are the fruits:\n${list}\n`);
  });

  it("three identical numbered steps are a loop now, like three identical bullets (round 107 kept them)", () => {
    const text = "1. Stir the batter.\n2. Stir the batter.\n3. Stir the batter.\n\nThen bake it for 20 minutes.";
    const hit = tailLoop(text, {}, 0, true).hit;
    expect(core.cutLoop(text, hit!).text).toBe("1. Stir the batter.\n");
  });
});

describe("F423 · round 110's web trials: a cut lands on a clean boundary", () => {
  const ES = device["web-es-list-A4"];
  const HEB = device["web-he-explain-B4"];

  it("es-list A#4: a copy that starts inside item 18 takes the whole item, and the retry starts item 18 on its own line", async () => {
    let kept = "";
    const next = "18. La paciencia abre puertas que la prisa cierra.\n19. Cada día es una nueva oportunidad.";
    const out = await screen(guardLoops(engine(ES.kept + ES.copy), () => undefined, { request: ES.request, retry: (k) => ((kept = k), engine(next)) }));
    expect(kept.endsWith("17. Cuando estés cansado, busca lo más sencillo que puedas.\n")).toBe(true);
    expect(out.loop).toBeUndefined();
    expect(out.shown).toContain("puedas.\n18. La paciencia abre puertas");
    expect(out.shown).not.toContain("18. La única");
  });

  it("he-explain B#4: a copy that starts inside a bold bullet takes the bullet, so no ** or ### is left mid-line", async () => {
    let kept = "";
    const out = await screen(guardLoops(engine(HEB.kept + HEB.copy), () => undefined, { request: HEB.request, retry: (k) => ((kept = k), engine(HEB.continuation)) }));
    expect(kept.endsWith("אך אין לו חשיבות גבוהה ונפוצה.\n")).toBe(true);
    expect((kept.match(/\*\*/gu) ?? []).length % 2).toBe(0);
    expect(out.shown).not.toContain("**הגשה");
    expect(out.shown).not.toMatch(/\*\*[^\n*]*###/u);
  });

  it("a list followed by a paragraph said again: the kept list ends with a line break, so the retry does not join its last item", () => {
    const para = "Photosynthesis turns light, water and carbon dioxide into sugar and oxygen inside the chloroplasts of every green leaf.";
    const text = `${para}\n\nThe two stages:\n1. Light reactions\n2. Calvin cycle\n\n${para}`;
    const hit = tailLoop(text, {}, 0, true).hit;
    expect(hit).not.toBeNull();
    expect(core.cutLoop(text, hit!).text.endsWith("2. Calvin cycle\n")).toBe(true);
  });

  it("a copy that opens with a bracket leaves no open bracket, and a cut keeps the closing quote its line opened", () => {
    const bracket = "## 年次報告書\n*   **3. 展望と目標（展望と目標）**\n    *   今後の方向性を示します。";
    const b = tailLoop(bracket, {}, 0, true).hit;
    expect(core.cutLoop(bracket, b!).text.trimEnd().split("\n").pop()).toBe("*   **3. 展望と目標**");
    const quote = "私は「東京スカイツリー」「東京スカイツリー」に行きました。";
    const q = tailLoop(quote, {}, 0, true).hit;
    expect(q).not.toBeNull();
    expect(core.cutLoop(quote, q!).text).toBe("私は「東京スカイツリー」");
  });
});

describe("F423 · iPhone build 22: the other answers the guard must get right", () => {
  const MATH = device["l07-math-long-div-1"];

  it("math-long-div #1: a correct long-division step that multiplies by 2 again is not a copy, and nothing shown is taken back", async () => {
    const text = MATH.snapshot + MATH.nextStep;
    expect(tailLoop(text, { request: MATH.request }, 0, true).hit).toBeNull();
    let retried = false;
    const out = await screen(guardLoops(engine(text), () => undefined, { request: MATH.request, retry: () => ((retried = true), engine("x")) }));
    expect(retried).toBe(false);
    expect(out.shown).toBe(text);
    for (const s of out.screens) expect(text.startsWith(s)).toBe(true);
  });

  it("a long division whose steps repeat a product line is not a loop; the same step said again with the same numbers still is", () => {
    const steps = "- $123 \\times 2 = 246$\n- Subtract: 274 - 246 = 28\n- Bring down the 3 to make 283.\n- $123 \\times 2 = 246$\n- Subtract: 283 - 246 = 37";
    expect(tailLoop(steps, {}, 0, true).hit).toBeNull();
    const again = "- 123 goes into 542 four times, since $4 \\times 123 = 492$, and subtracting leaves a remainder of 50.\n- 123 goes into 542 four times, since $4 \\times 123 = 492$, and subtracting leaves a remainder of 50.";
    expect(tailLoop(again, {}, 0, true).hit).not.toBeNull();
  });

  it("list30-animals under a 0.2 persona: four animals cycling five times are cut at the first item listed again", async () => {
    const L = device["l02-list30-animals"];
    const out = await screen(guardLoops(engine(L.text), () => undefined, { request: L.request }));
    expect(out.loop).toBeDefined();
    expect(out.shown.trimEnd().split("\n").pop()).toBe("14. Starfish");
    expect(Math.max(...out.screens.map(mostListed))).toBe(1);
  });

  it("asked to repeat the fox sentence five times, Instant wrote it once (3 of 3): no cut, no retry", async () => {
    const answers = [...device["c-asked-repeat"].texts, ...device["c2-asked-repeat-again"].texts];
    expect(answers).toHaveLength(3);
    for (const text of answers) {
      let retried = false;
      const request = device["c-asked-repeat"].request;
      const out = await screen(guardLoops(engine(text), () => undefined, { request, retry: () => ((retried = true), engine("x")) }));
      expect(out.shown).toBe(text);
      expect(out.loop).toBeUndefined();
      expect(retried).toBe(false);
    }
  });
});

describe("F423 · Continue after Stop: a phrase restarted at the seam is dropped", () => {
  const C = device["d-continue"];
  const PHRASE = "Christopher Columbus's fleet";

  it("the phone's Continue: '…Columbus's fleet,' + 'Christopher Columbus's fleet discovered…' reads '…Columbus's fleet, discovered…'", async () => {
    expect(C.prefix.endsWith(`like ${PHRASE},`)).toBe(true);
    expect(C.continuation.startsWith(`${PHRASE} discovered the Americas in 1492`)).toBe(true);
    const out = await screen(guardLoops(engine(C.continuation), () => undefined, { request: C.request, prefix: C.prefix }));
    const joined = C.prefix + core.continuationSeparator(C.prefix, out.shown) + out.shown;
    expect(out.shown).toBe(C.continuation.slice(PHRASE.length));
    expect(count(joined, PHRASE)).toBe(1);
    expect(joined).toContain(`like ${PHRASE}, discovered the Americas in 1492, marking`);
  });

  it("a continuation that goes on, a prefix that ended its sentence, and a two-word echo are left alone", async () => {
    for (const [prefix, next] of [
      [C.prefix, "discovered the Americas in 1492, marking a pivotal moment."],
      ["We love the sea.", "We love the sea breeze too."],
      ["The fleet sailed west with the fleet", "the fleet reached land."],
    ] as const) {
      const out = await screen(guardLoops(engine(next), () => undefined, { prefix }));
      expect(out.shown, next).toBe(next);
    }
  });

  it("the overlap waits while it may still grow, and a comma the prefix already has is not doubled", () => {
    const prefix = "Trade grew with the rise of navies like Christopher Columbus's fleet,";
    expect(core.seamOverlap(prefix, "Christopher Colum")).toBe(-1);
    const next = "Christopher Columbus's fleet, which sailed in 1492.";
    expect(next.slice(core.seamOverlap(prefix, next))).toBe(" which sailed in 1492.");
    expect(core.seamOverlap(prefix, "Christopher Columbus's fleet", true)).toBe(PHRASE.length);
  });
});

describe("F423 · the length line no longer forbids a repetition the user asked for", () => {
  it("'Repeat exactly this sentence five times' plans moderate, allows the repetition, and still forbids padding", () => {
    const plan = core.planAnswerLength({ text: device["c-asked-repeat"].request, use: "chat" });
    expect(plan.length).toBe("moderate");
    expect(plan.instruction).toContain("Do not repeat yourself unless the request asks for repetition, and do not pad.");
    for (const length of ["moderate", "long"] as const) {
      expect(core.LENGTH_INSTRUCTIONS[length]).not.toContain("Do not repeat yourself and");
      expect(core.LENGTH_INSTRUCTIONS[length]).toContain("do not pad");
    }
  });
});
