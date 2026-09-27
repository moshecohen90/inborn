import { describe, expect, it } from "vitest";
import * as core from "../src/index";
import type { Delta, GuardedDelta } from "../src/index";
import device from "./fixtures/r114-device-answers.json";

/**
 * Round 114 (F428). iPhone build 24 (Instant 0.7) and the Fast web run listed one verb twice with a new gloss:
 * "4. sein (to be)" then "5. sein (to exist/remain)", "sein: …" as items 1, 5 and 11, "3. gehen – to go" then
 * "20. gehen – to go on a trip". In an enumeration the item's head, the words before its gloss or note, is the item.
 */
const { guardLoops, tailLoop, cutLoop } = core;
const usage = { promptTokens: 1, completionTokens: 1, ttftMs: 1, tokPerSec: 1 };
const RUN1 = device["l07-list25-verbs-de-1"];
const RUN2 = device["l07-list25-verbs-de-2"];
const WEB_RAW = device["web-fast-list25-verbs-de-raw"];
const WEB_SCREEN = device["web-fast-list25-verbs-de-screen"];

function engine(text: string, step = 3): AsyncIterable<Delta> {
  return (async function* () {
    const cps = Array.from(text);
    for (let i = 0; i < cps.length; i += step) yield { text: cps.slice(i, i + step).join("") };
    yield { done: usage };
  })();
}

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

/** Each item's head: its words up to the first gloss or note, lower-cased; "1.\nsein – to be" counts as one item. */
const heads = (text: string) =>
  text
    .replace(/^(\s*\d{1,3}\.)\s*\n/gmu, "$1 ")
    .split("\n")
    .map((l) => /^\s*(?:\d{1,3}[.)]|[-*•])\s+(.*)$/u.exec(l)?.[1])
    .filter((x): x is string => !!x)
    .map((x) => x.replace(/\*\*/gu, "").split(/\s*\(|:\s|\s[–—-]\s|\s→\s|,\s/u)[0]!.trim().toLowerCase());
const twice = (text: string) => heads(text).filter((x, i, all) => all.indexOf(x) !== i);
const final = (text: string, request: string) => tailLoop(text, { request }, 0, true).hit;

async function guarded(answer: string, request: string) {
  const run = await screen(guardLoops(engine(answer), () => undefined, { request }));
  return { ...run, worst: run.screens.reduce((w, x) => (twice(x).length > twice(w).length ? x : w), "") };
}

describe("F428 · iPhone build 24 and web Fast: a verb listed again with a new gloss is a loop", () => {
  it("build 24 run 1: 'sein: …' as items 1 and 5 is cut before item 5, which never reaches the screen", async () => {
    const r = await guarded(RUN1.answer, RUN1.request);
    expect(r.loop).toBeDefined();
    expect(r.shown.trimEnd().split("\n").at(-1)).toBe("4. finden: zu suchen, zu entdecken");
    expect(r.screens.some((x) => x.includes("5. sein"))).toBe(false);
    expect(twice(r.worst)).toEqual([]);
  });

  it("build 24 run 2: 'sein (to be)' then 'sein (to exist/remain)' is cut before item 5", async () => {
    const r = await guarded(RUN2.answer, RUN2.request);
    expect(r.loop).toBeDefined();
    expect(r.shown.trimEnd().split("\n").at(-1)).toBe("4. sein (to be)");
    expect(r.screens.some((x) => x.includes("5. sein"))).toBe(false);
    expect(twice(r.worst)).toEqual([]);
  });

  it("web Fast, stored markdown: '**gehen** – to go on a trip' as item 20 is cut before it", async () => {
    const r = await guarded(WEB_RAW.answer, WEB_RAW.request);
    expect(r.loop).toBeDefined();
    expect(r.shown.trimEnd().split("\n").at(-1)).toBe("19. **bleiben** – to stay / remain");
    expect(r.screens.some((x) => x.includes("20. **gehen"))).toBe(false);
    expect(twice(r.worst)).toEqual([]);
  });

  it("web Fast, as the screen text reads (number on its own line): cut before '20.'", async () => {
    const r = await guarded(WEB_SCREEN.answer, WEB_SCREEN.request);
    expect(r.loop).toBeDefined();
    expect(r.shown.trimEnd().endsWith("19.\nbleiben – to stay / remain")).toBe(true);
    expect(twice(r.worst)).toEqual([]);
  });

  it("'verb: gloss', 'verb – gloss', 'verb → gloss' and 'verb, gloss' forms are all read by their head", () => {
    const verbs = ["sein", "haben", "gehen", "kommen", "sehen", "lesen"];
    for (const sep of [": to ", " – to ", " — to ", " - to ", " → to ", ", to "]) {
      const list = `${verbs.map((v, i) => `${i + 1}. ${v}${sep}x${i}`).join("\n")}\n7. gehen${sep}travel\n8. wissen${sep}know\n`;
      const hit = final(list, RUN1.request);
      expect(hit, sep).not.toBeNull();
      expect(cutLoop(list, hit!).text.trimEnd().split("\n").at(-1), sep).toBe(`6. lesen${sep}x5`);
    }
  });
});

describe("F428 · the head rule changes round 113's parenthetical rule, and keeps its exceptions", () => {
  it("'Dolphin (bottlenose)' and 'Dolphin (river)' in a 30-animal list: now a cut at the second (round 113 kept both)", () => {
    const animals = ["Dolphin (bottlenose)", "Shark", "Whale", "Octopus", "Seal", "Squid", "Crab", "Lobster", "Dolphin (river)", "Tuna"];
    const list = `${animals.map((x, i) => `${i + 1}. ${x}`).join("\n")}\n`;
    const hit = final(list, "List 30 animals that live in the ocean, one per line, numbered.");
    expect(hit).not.toBeNull();
    expect(cutLoop(list, hit!).text.trimEnd().split("\n").at(-1)).toBe("8. Lobster");
  });

  it("25 distinct verbs, each with a gloss, are not cut", async () => {
    const verbs = ["sein – to be", "haben – to have", "werden – to become", "können – can", "müssen – must", "sagen – to say", "machen – to make", "geben – to give", "kommen – to come", "sollen – should", "wollen – to want", "gehen – to go", "wissen – to know", "sehen – to see", "lassen – to let", "stehen – to stand", "finden – to find", "bleiben – to stay", "liegen – to lie", "heißen – to be called", "denken – to think", "nehmen – to take", "tun – to do", "dürfen – may", "glauben – to believe"];
    const list = `Hier sind 25 Verben:\n\n${verbs.map((x, i) => `${i + 1}. **${x.split(" – ")[0]}** – ${x.split(" – ")[1]} (e.g. sein, haben)`).join("\n")}\n`;
    expect(final(list, RUN1.request)).toBeNull();
    const r = await guarded(list, RUN1.request);
    expect(r.loop).toBeUndefined();
    expect(r.shown).toBe(list);
  });

  it("a True/False key, bare or with a reason per line, is not cut", () => {
    const bare = Array.from({ length: 30 }, (_, i) => `${i + 1}. ${["True", "False", "True", "True", "False"][i % 5]}`).join("\n");
    expect(final(bare, "Answer the 30 quiz questions True or False.")).toBeNull();
    const why = Array.from({ length: 12 }, (_, i) => `${i + 1}. ${i % 3 ? "True" : "False"} – statement ${i + 1} is ${i % 3 ? "right" : "wrong"}`).join("\n");
    expect(final(why, "Answer the 12 quiz questions True or False, with a reason.")).toBeNull();
  });

  it("a True/False key streams with at most a short wait and is never cut", async () => {
    const key = `${Array.from({ length: 20 }, (_, i) => `${i + 1}. ${["True", "False", "True", "True", "False"][i % 5]}`).join("\n")}\n`;
    const r = await guarded(key, "Answer the 20 quiz questions True or False.");
    expect(r.loop).toBeUndefined();
    expect(r.shown).toBe(key);
    /* The first repeat waits three items for a fifth distinct answer; after that the list is a key and streams. */
    expect(r.screens.findIndex((x) => x.includes("11. True"))).toBeGreaterThan(-1);
    expect(r.screens.findIndex((x) => x.includes("11. True"))).toBeLessThan(r.screens.length - 5);
  });

  it("a nested outline: sub-items repeat under each category, and a head followed by its own sub-list is a category", () => {
    const outline = "- Apple\n  - green\n  - red\n- Pear\n  - green\n  - red\n- Plum\n  - red\n- Fig\n- Kiwi\n  - green\n";
    expect(final(outline, "Group fruit by colour.")).toBeNull();
    const verbs = "1. sein – present\n   - ich bin\n   - du bist\n2. haben\n3. gehen\n4. kommen\n5. sehen\n6. sein – past\n   - ich war\n   - du warst\n7. lesen\n";
    expect(final(verbs, "Conjugate some German verbs.")).toBeNull();
  });

  it("a repeated head waits off screen until its next line shows whether a sub-list follows", async () => {
    const outline = "1. Apple – red\n2. Pear\n3. Plum\n4. Fig\n5. Kiwi\n6. Apple – green kinds\n   - Granny Smith\n   - Mutsu\n7. Lime\n";
    for (const step of [1, 2, 3, 5]) {
      const r = await screen(guardLoops(engine(outline, step), () => undefined, { request: "Group fruit by colour." }));
      expect(r.loop, `step ${step}`).toBeUndefined();
      expect(r.shown).toBe(outline);
    }
    const flat = "1. Apple – red\n2. Pear\n3. Plum\n4. Fig\n5. Kiwi\n6. Apple – green kinds\n7. Lime\n";
    const r = await guarded(flat, "Group fruit by colour.");
    expect(r.loop).toBeDefined();
    expect(r.screens.some((x) => x.includes("6. Apple"))).toBe(false);
  });

  it("bold numbered section titles between two bullet runs start a new run (replay: after-instant ja-nenji #1)", () => {
    const text = "**1. 構成要素**\n*   **タイトル**: 年度\n*   **年月日**: 報告の時期\n*   **目次**: 内容の順序\n*   **概要**: 要点\n*   **結論**: まとめ\n\n**2. フォーマット例**\n*   **表紙**: 会社名\n*   **目次**: 上記の項目順列\n*   **各セクション**: 本文\n";
    expect(final(text, "年次報告の書き方を教えて。")).toBeNull();
  });

  it("'Pros' and 'Cons' bullets under numbered options at one indent are not a repeat of the options", () => {
    const text = ["A", "B", "C", "D", "E", "F"].map((x, i) => `${i + 1}. **Option ${x}**\n- Pros: ${x} is fast\n- Cons: ${x} is costly`).join("\n");
    expect(final(text, "Compare six options.")).toBeNull();
  });

  it("asked repetition, data lines and a source list that repeats a head stay", () => {
    const hello = Array.from({ length: 10 }, (_, i) => `${i + 1}. Hello (${i + 1})`).join("\n");
    expect(final(hello, "Write 'Hello' 10 times as a numbered list.")).toBeNull();
    const rows = "| verb | meaning |\n|---|---|\n| sein | to be |\n| haben | to have |\n| gehen | to go |\n| kommen | to come |\n| sehen | to see |\n| sein | to exist |\n";
    expect(final(rows, RUN1.request)).toBeNull();
    const src = "Translate:\n1. sein (to be)\n2. haben\n3. gehen\n4. kommen\n5. sehen\n6. sein (to exist)";
    const out = "1. sein (sein)\n2. haben (haben)\n3. gehen (ir)\n4. kommen (venir)\n5. sehen (ver)\n6. sein (existir)\n";
    expect(final(out, src)).toBeNull();
  });

  it("dates, verse references and times keep their colon: 'Genesis 1:1' and 'Genesis 1:2' are two items", () => {
    const refs = "1. Genesis 1:1 – In the beginning\n2. Genesis 1:2 – The earth was void\n3. Genesis 1:3 – Let there be light\n4. Genesis 1:4 – God saw the light\n5. Genesis 1:5 – Day and night\n6. Genesis 1:6 – A firmament\n";
    expect(final(refs, "List 6 verses.")).toBeNull();
    const times = "- 08:00 – Breakfast\n- 09:00 – Walk\n- 10:00 – Museum\n- 12:00 – Lunch\n- 14:00 – Museum\n- 16:00 – Walk\n";
    expect(final(times, "Plan my day.")).toBeNull();
  });
});
