import { describe, expect, it } from "vitest";
import * as core from "../src/index";
import type { Delta, GuardedDelta } from "../src/index";

/**
 * Round 110 (F421). Web trials of the final round-107 guard: asked for the fox sentence five times, Instant wrote five
 * copies on one line and began a sixth. The guard kept the five, then its silent retry continued an answer that was
 * already complete ("The next line begins: 'The lazy cat barks at the swift owl.' …"), 2 of 5 trials.
 */
const { guardLoops } = core;
const FOX = "The quick brown fox jumps over the lazy dog.";
const ASK = `Repeat exactly this sentence five times, each on its own line: ${FOX}`;
const usage = { promptTokens: 1, completionTokens: 1, ttftMs: 1, tokPerSec: 1 };

function engine(text: string): AsyncIterable<Delta> {
  return (async function* () {
    const cps = Array.from(text);
    for (let i = 0; i < cps.length; i += 3) yield { text: cps.slice(i, i + 3).join("") };
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

describe("F421 · a repetition the user asked for ends at the asked count, with no retry and no notice", () => {
  it("five asked, a sixth begun on the same line (web trial fox-5 #1): five shown, nothing continued", async () => {
    let retries = 0;
    const retry = () => (retries++, engine(' The next line begins: "The lazy cat barks at the swift owl."'));
    const out = await screen(guardLoops(engine(`${FOX} `.repeat(7).trim()), () => undefined, { request: ASK, retry }));
    expect(out.shown.trimEnd()).toBe(Array(5).fill(FOX).join(" "));
    expect(retries).toBe(0);
    expect(out.loop).toBeUndefined();
    expect(Math.max(...out.screens.map((s) => count(s, FOX)))).toBe(5);
  });

  it("five asked, eight written one per line: five lines, nothing continued", async () => {
    let retries = 0;
    const retry = () => (retries++, engine("The quick brown fox still manages to jump higher."));
    const out = await screen(guardLoops(engine(`${FOX}\n`.repeat(8)), () => undefined, { request: ASK, retry }));
    expect(out.shown.trim().split("\n")).toEqual(Array(5).fill(FOX));
    expect(retries).toBe(0);
    expect(out.loop).toBeUndefined();
  });

  it("exactly five stays whole, and a loop nobody asked for still gets its one silent retry", async () => {
    const exact = Array(5).fill(FOX).join("\n");
    expect((await screen(guardLoops(engine(exact), () => undefined, { request: ASK, retry: () => engine("x") }))).shown).toBe(exact);
    let retries = 0;
    const retry = () => (retries++, engine("It then naps in the sun."));
    const out = await screen(guardLoops(engine(`${FOX} ${FOX} ${FOX}`), () => undefined, { request: "Write a sentence about a fox.", retry }));
    expect(retries).toBe(1);
    expect(out.shown).toBe(`${FOX} It then naps in the sun.`);
  });
});
