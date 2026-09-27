import { describe, expect, it } from "vitest";
import * as core from "../src/index";
import type { Delta, GuardedDelta } from "../src/index";
import device from "./fixtures/r112-device-answers.json";

/**
 * Round 113 (F426). iPhone build 23 at the app's own temperature (Instant 0.7) still showed repeats round 111 let
 * through: one-word items listed again ("Octopus" 8 and 21, "Dolphin" 2 and 6), a silent retry that restarted the
 * numbering ("22. Sponges" then "10. Sponges"), and an item the model itself marked "(again, as listed before…)".
 */
const { guardLoops, tailLoop, ListSeam } = core;
const usage = { promptTokens: 1, completionTokens: 1, ttftMs: 1, tokPerSec: 1 };
const RUN1 = device["l07-list30-animals-1"];
const RUN2 = device["l07-list30-animals-2"];

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

/** Item words without marker, parentheticals or trailing punctuation, lower-cased. */
const items = (text: string) =>
  text
    .split("\n")
    .map((l) => /^\s*(?:\d{1,3}[.)]|[-*•])\s+(.*)$/u.exec(l)?.[1])
    .filter((x): x is string => !!x)
    .map((x) => x.replace(/\s*\([^)]*\)?/gu, "").replace(/[.\s]+$/u, "").trim().toLowerCase());
const numbers = (text: string) => text.split("\n").flatMap((l) => (/^\s*(\d{1,3})[.)]\s/u.exec(l) ? [Number(/^\s*(\d{1,3})/u.exec(l)![1])] : []));
const twice = (text: string) => items(text).filter((x, i, all) => all.indexOf(x) !== i);
const sequential = (text: string) => numbers(text).every((x, i, all) => i === 0 || x === all[i - 1]! + 1);
const final = (text: string, request = RUN1.request) => tailLoop(text, { request }, 0, true).hit;

describe("F426 · iPhone build 23: a short item listed again is a loop", () => {
  it("list30 #1 as the model wrote it: cut before '18. Dolphin (multiple species)', the first item said again", async () => {
    expect(twice(RUN1.screen)).toEqual(["dolphin", "octopus", "sponges"]);
    const hit = final(RUN1.screen);
    expect(hit).not.toBeNull();
    const { shown, loop, screens } = await screen(guardLoops(engine(RUN1.screen), () => undefined, { request: RUN1.request }));
    expect(loop).toBeDefined();
    expect(shown.trimEnd().endsWith("17. Blue Whale")).toBe(true);
    for (const s of screens) expect(twice(s)).toEqual([]);
    expect(screens.some((s) => s.includes("18. D"))).toBe(false);
  });

  it("list30 #2 as the model wrote it: cut before '6. Dolphin' (five distinct animals listed by then)", async () => {
    const { shown, screens } = await screen(guardLoops(engine(RUN2.screen), () => undefined, { request: RUN2.request }));
    expect(shown.trimEnd().endsWith("5. Sea Turtle")).toBe(true);
    for (const s of screens) expect(twice(s)).toEqual([]);
  });

  it("'Clownfish (again, as listed before…)' is the same item as 'Clownfish'", () => {
    const list = RUN2.continuation;
    expect(final(list)).not.toBeNull();
    const cut = core.cutLoop(list, final(list)!);
    expect(cut.text.trimEnd().endsWith("26. Rockfish")).toBe(true);
  });

  it("an item that says it was listed before is a repeat on its own, with no earlier copy of its words", () => {
    const list = "1. Shark\n2. Whale\n3. Dolphin\n4. Seal\n5. Octopus\n6. Tuna (already listed)\n";
    expect(final(list)).not.toBeNull();
    expect(final("1. Shark\n2. Whale\n3. Tuna (duplicate)\n")).not.toBeNull();
  });

  it("a bare 'again' marks a repeat only when the item was listed: 'Salmon (again)' first time stays", () => {
    expect(final("1. Shark\n2. Whale\n3. Salmon (again)\n4. Seal\n")).toBeNull();
    expect(final("1. Shark\n2. Whale\n3. Whale (again)\n", RUN1.request)).not.toBeNull();
  });

  it("the 8 app locales' repeat words", () => {
    expect(final("1. Hai\n2. Wal\n3. Hai (wieder)\n", "Nenne 30 Meerestiere.")).not.toBeNull();
    expect(final("1. כריש\n2. לוויתן\n3. כריש (שוב)\n", "רשום 30 חיות ים.")).not.toBeNull();
    expect(final("1. Tiburón\n2. Ballena\n3. Tiburón (otra vez)\n", "Lista 30 animales marinos.")).not.toBeNull();
    expect(final("1. Requin\n2. Baleine\n3. Requin (encore)\n", "Liste 30 animaux marins.")).not.toBeNull();
    expect(final("1. Squalo\n2. Balena\n3. Squalo (di nuovo)\n", "Elenca 30 animali marini.")).not.toBeNull();
    expect(final("1. Tubarão\n2. Baleia\n3. Tubarão (novamente)\n", "Liste 30 animais marinhos.")).not.toBeNull();
    expect(final("1. Акула\n2. Кит\n3. Акула (снова)\n", "Перечисли 30 морских животных.")).not.toBeNull();
    expect(final("1. サメ\n2. クジラ\n3. サメ（再び）\n", "海の動物を30個挙げて。")).not.toBeNull();
  });

  it("F428 changed this: 'Shark (Great White)' then 'Shark (Tiger)' is one head twice, cut at the second", () => {
    const list = "1. Shark (Great White)\n2. Whale\n3. Dolphin\n4. Seal\n5. Octopus\n6. Shark (Tiger)\n7. Mercury (planet)\n8. Mercury (element)\n";
    const hit = final(list);
    expect(hit).not.toBeNull();
    expect(core.cutLoop(list, hit!).text.trimEnd().split("\n").at(-1)).toBe("5. Octopus");
  });
});

describe("F426 · no false cut: answer keys, sub-lists and separate lists repeat short items on purpose", () => {
  it("a True/False answer key of 30 lines", () => {
    const key = Array.from({ length: 30 }, (_, i) => `${i + 1}. ${["True", "False", "True", "True", "False"][i % 5]}`).join("\n");
    expect(final(key, "Answer the 30 quiz questions True or False.")).toBeNull();
  });

  it("a Yes/No list and a Yes/No/Maybe list", () => {
    expect(final(Array.from({ length: 20 }, (_, i) => `- ${i % 3 ? "Yes" : "No"}`).join("\n"), "Answer each with yes or no.")).toBeNull();
    expect(final(Array.from({ length: 20 }, (_, i) => `${i + 1}. ${["Yes", "No", "Maybe"][i % 3]}`).join("\n"), "Answer each.")).toBeNull();
  });

  it("a multiple-choice key with five options", () => {
    expect(final(Array.from({ length: 25 }, (_, i) => `${i + 1}. ${"ACBEDBDAEC"[i % 10]}`).join("\n"), "Give the answer letters.")).toBeNull();
  });

  it("'Pros' and 'Cons' under each of six options", () => {
    const text = ["A", "B", "C", "D", "E", "F"].map((x, i) => `${i + 1}. **Option ${x}**\n   - Pros\n   - Cons`).join("\n");
    expect(final(text, "Compare six options.")).toBeNull();
  });

  it("two lists with a paragraph between them may share short items", () => {
    const text = "Fish:\n1. Tuna\n2. Cod\n3. Eel\n4. Carp\n5. Pike\n6. Sole\n\nFish I ate this week:\n1. Tuna\n2. Cod\n";
    expect(final(text, "Which fish?")).toBeNull();
  });

  it("asked repetition stays: a numbered list of the same word", () => {
    const text = Array.from({ length: 10 }, (_, i) => `${i + 1}. Hello`).join("\n");
    expect(final(text, "Write 'Hello' 10 times as a numbered list.")).toBeNull();
  });

  it("the same sub-item under two parents, once with a note (replay: before-instant ja-nenji #3)", () => {
    const text = "*   **2023 年**：\n    *   **1 目**: 主要指標。\n    *   **2 目**: 本年達成した成果物（例：新製品発売）。\n    *   **3 目**: 課題と改善策。\n*   **2024 年**：\n    *   **1 目**: 本年度の主要指標。\n    *   **2 目**: 本年達成した成果物。\n    *   **3 目**: 来年の目標。\n";
    expect(final(text, "年次報告の書き方を教えて。")).toBeNull();
  });

  it("one short item eight times in a row is a loop, cut back to its first copy", () => {
    const text = Array.from({ length: 12 }, (_, i) => `${i + 1}. Yes`).join("\n");
    const hit = final(text, "Is each of these a mammal?");
    expect(hit).not.toBeNull();
    expect(core.cutLoop(text, hit!).text.trimEnd()).toBe("1. Yes");
    expect(final(Array.from({ length: 7 }, (_, i) => `${i + 1}. Yes`).join("\n"), "Is each of these a mammal?")).toBeNull();
  });

  it("a short item listed again before the list has five distinct items stays", () => {
    expect(final("1. Cat\n2. Dog\n3. Cat\n4. Bird\n", "Pets?")).toBeNull();
  });
});

describe("F426 · a continuation of a list goes on numbering it", () => {
  it("build 23 #1 retry seam: '22. Sponges' + '10. Sponges\\n11. Shrimp…' reads '22. Sponges\\n23. Shrimp…'", () => {
    for (const step of [1, 3, 7, 1000]) {
      const seam = new ListSeam(RUN1.kept);
      let out = "";
      const cps = Array.from(RUN1.continuation);
      for (let i = 0; i < cps.length; i += step) out += seam.push(cps.slice(i, i + step).join(""));
      out += seam.push("", true);
      expect(out).toBe("23. Shrimp\n24. Crayfish\n25. Mollusk (Coral Reefs)\n");
    }
  });

  it("build 23 #1 through the guard: the retry after '17. Blue Whale' goes on at 18", async () => {
    const retry = () => engine(RUN1.continuation);
    const { shown, loop } = await screen(guardLoops(engine(RUN1.screen), () => undefined, { request: RUN1.request, retry }));
    expect(loop).toBeUndefined();
    expect(shown).toContain("17. Blue Whale\n18. Sponges\n19. Shrimp\n20. Crayfish\n21. Mollusk (Coral Reefs)");
    expect(sequential(shown)).toBe(true);
    expect(twice(shown)).toEqual([]);
  });

  it("build 23 #2 through the guard: kept 1–5, the retry renumbered from 6, stopped before its own 'Clownfish (again…)'", async () => {
    const retry = () => engine(RUN2.continuation);
    const { shown, loop, screens } = await screen(guardLoops(engine(RUN2.screen), () => undefined, { request: RUN2.request, retry }));
    expect(loop).toBeDefined();
    expect(shown).toContain("5. Sea Turtle\n6. Sea Eagle\n7. Clownfish\n");
    expect(shown.trimEnd().endsWith("25. Rockfish")).toBe(true);
    for (const s of screens) {
      expect(twice(s)).toEqual([]);
      expect(sequential(s)).toBe(true);
    }
  });

  it("Continue after Stop: the same seam, with and without the line break on screen", async () => {
    const a = await screen(guardLoops(engine(RUN1.continuation), () => undefined, { request: RUN1.request, prefix: RUN1.kept }));
    expect(a.shown).toBe("23. Shrimp\n24. Crayfish\n25. Mollusk (Coral Reefs)\n");
    const b = await screen(guardLoops(engine(`\n${RUN1.continuation}`), () => undefined, { request: RUN1.request, prefix: RUN1.kept.trimEnd() }));
    expect(b.shown).toBe("\n23. Shrimp\n24. Crayfish\n25. Mollusk (Coral Reefs)\n");
  });

  it("a bulleted list drops a first item that repeats the kept last one", () => {
    const seam = new ListSeam("- Shark\n- Whale\n");
    expect(seam.push("- Whale\n- Seal\n", true)).toBe("- Seal\n");
  });

  it("a continuation that numbers correctly, continues the item, or ends the list is untouched", () => {
    expect(new ListSeam(RUN1.kept).push("23. Shrimp\n24. Crab\n", true)).toBe("23. Shrimp\n24. Crab\n");
    expect(new ListSeam(RUN1.kept).push("These all live in salt water.\n1. Tuna\n", true)).toBe("These all live in salt water.\n1. Tuna\n");
    expect(new ListSeam("1. Shark\n2. Whale\n3. Mollus").push("k\n1. Seal\n2. Crab\n\nAll of them swim.\n1. Note", true)).toBe("k\n4. Seal\n5. Crab\n\nAll of them swim.\n1. Note");
    expect(new ListSeam("Plain text.").push("1. Shark\n", true)).toBe("1. Shark\n");
  });
});
