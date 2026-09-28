import { describe, expect, it } from "vitest";
import * as core from "../src/index";
import type { Delta, GuardedDelta } from "../src/index";

/**
 * Round 119 (F441). The web, Fast, 28.9 13:54: Stop after "…which catches the wind from behind. As the", then Continue,
 * and the screen read "…from behind. As the As they turn, the sails catch…". The model restarted the sentence with
 * other words, so round 118's exact rule had nothing to drop.
 */
const { guardLoops } = core;
const usage = { promptTokens: 1, completionTokens: 1, ttftMs: 1, tokPerSec: 1 };

const BEHIND =
  "To sail downwind, the crew lowers the main sail and raises a smaller jib on each side of the hull, which catches the wind from behind.";
const STOPPED = `${BEHIND} As the`;
const REST = "As they turn, the sails catch the wind that is now blowing from behind them. The boat then runs straight ahead.";

function engine(text: string, step = 3): AsyncIterable<Delta> {
  return (async function* () {
    const cps = Array.from(text);
    for (let i = 0; i < cps.length; i += step) yield { text: cps.slice(i, i + step).join("") };
    yield { done: usage };
  })();
}

/** What the chat shows (Chat.tsx `shown`): `prefix` joined with `continuationSeparator`, then the guarded reply; every state. */
async function screen(stream: AsyncIterable<GuardedDelta>, prefix: string) {
  let head = prefix;
  let reply = "";
  const screens: string[] = [];
  const shown = () => head + (reply ? core.continuationSeparator(head, reply) : "") + reply;
  for await (const d of stream) {
    if (d.prefix !== undefined) head = d.prefix;
    if (d.trim !== undefined) reply = d.trim;
    if (d.text) reply += d.text;
    screens.push(shown());
  }
  return { shown: shown(), screens };
}

const cont = async (prefix: string, next: string, step = 3) => screen(guardLoops(engine(next, step), () => undefined, { prefix }), prefix);

describe("F441 · a fragment restarted at the Continue seam is taken back", () => {
  it("the web's Continue: '…from behind. As the' + ' As they turn, …' reads '…from behind. As they turn, …', in chunks of 1, 3 and 7", async () => {
    for (const lead of [" ", ""]) {
      for (const step of [1, 3, 7]) {
        const r = await cont(STOPPED, `${lead}${REST}`, step);
        expect(r.shown, `lead '${lead}' / ${step}`).toBe(`${BEHIND} ${REST}`);
        expect(r.shown).toContain("from behind. As they turn, the sails catch");
        for (const s of r.screens) expect(s, `lead '${lead}' / ${step}`).not.toMatch(/As the\s+As/u);
      }
    }
  });

  it("a longer fragment restarted with a new verb: '…repeatedly. This maneuver creates' + 'This maneuver makes …'", async () => {
    const before = "Sailors must turn the vessel back and forth repeatedly.";
    const r = await cont(`${before} This maneuver creates`, "This maneuver makes a diagonal path across the wind.");
    expect(r.shown).toBe(`${before} This maneuver makes a diagonal path across the wind.`);
    for (const s of r.screens) expect(s).not.toMatch(/creates\s+This/u);
  });

  it("a one-word fragment: '…behind. As' + 'As they turn' reads '…behind. As they turn'", async () => {
    const r = await cont(`${BEHIND} As`, "As they turn, the sails fill.");
    expect(r.shown).toBe(`${BEHIND} As they turn, the sails fill.`);
  });

  it("a fragment at the answer's start: 'The crew' + 'The sailors turn' reads 'The sailors turn'", async () => {
    const r = await cont("The crew", "The sailors turn the boat.");
    expect(r.shown).toBe("The sailors turn the boat.");
    const spaced = await cont("The crew", " The sailors turn the boat.");
    expect(spaced.shown).toBe("The sailors turn the boat.");
  });

  it("a fragment that began a line or a list item keeps the line break or the marker", async () => {
    const line = await cont("Tacking takes practice.\nThe crew", "The sailors turn the boat.");
    expect(line.shown).toBe("Tacking takes practice.\nThe sailors turn the boat.");
    const item = await cont("Steps:\n- The crew", " The sailors turn the boat.");
    expect(item.shown).toBe("Steps:\n- The sailors turn the boat.");
  });

  it("a lower-case fragment after a colon, restarted as a sentence: 'simple: the crew' + 'The sailors turn'", async () => {
    const r = await cont("The plan was simple: the crew", "The sailors turn the boat.");
    expect(r.shown).toBe("The plan was simple: The sailors turn the boat.");
  });

  it("the first word waits off screen while it may still be the fragment's first word", async () => {
    const r = await cont(STOPPED, ` ${REST}`, 1);
    for (const s of r.screens) {
      expect(s).not.toMatch(/As the\s+A/u);
      expect(s.startsWith(BEHIND)).toBe(true);
    }
    expect(core.seamRestart(STOPPED, " As")).toBe(-1);
    expect(core.seamRestart(STOPPED, " As they")).toBe(BEHIND.length);
    expect(core.seamRestart(STOPPED, " As", true)).toBe(BEHIND.length);
    expect(core.seamRestart(STOPPED, " Ast")).toBe(STOPPED.length);
  });
});

describe("F441 · what stays", () => {
  it("a plain continuation, and round 118's exact word, drop nothing more", async () => {
    expect((await cont(STOPPED, " wind shifts to the stern.")).shown).toBe(`${STOPPED} wind shifts to the stern.`);
    expect((await cont(STOPPED, " the wind shifts to the stern.")).shown).toBe(`${STOPPED} wind shifts to the stern.`);
  });

  it("a different first word, or a lower-case restart of a capitalised fragment, stays as written", async () => {
    expect((await cont(STOPPED, " Titanic sailed west.")).shown).toBe(`${STOPPED} Titanic sailed west.`);
    expect((await cont(STOPPED, " as they turn.")).shown).toBe(`${STOPPED} as they turn.`);
  });

  it("from the replay of stored answers: a lower-case word, a label in capitals, a bracket, or other marks stay", async () => {
    for (const [prefix, next] of [
      ["as indicated by the documents; the text only mentions", " the maintenance budget for the Halden plant."],
      ["El camino hacia la excelencia no es fácil; el camino hacia", " el éxito es más simple."],
      ["Lightest on battery. GOOD AT", " Good · Chat, Summaries, Voice notes"],
      ["16. Persimmon\n17. Peach (Wait, I listed", " Peach earlier) -> Replace with Pineapple"],
      ["22. Sea Scorpion\n23. Sea Star", " (Sea Urchins)\n24. Sea Squid"],
      ["*   **תנודות וקורבנות:** מרגיעות של", " תנודות גופניות או קרינה"],
    ] as const) {
      const r = await cont(prefix, next);
      expect(r.shown, next).toBe(prefix + core.continuationSeparator(prefix, next) + next);
    }
  });

  it("five words said again are round 113/118's: one copy", async () => {
    const r = await cont(`${BEHIND} As the crew turns the`, "As the crew turns the wheel, the boom swings.");
    expect(r.shown).toBe(`${BEHIND} As the crew turns the wheel, the boom swings.`);
  });

  it("a heading line and its next line: the exact rule, one copy", async () => {
    const r = await cont("### Tacking\nThe crew", "The crew turns the boat.");
    expect(r.shown).toBe("### Tacking\nThe crew turns the boat.");
  });

  it("a stopped text that ends a sentence, a continuation on a new line, and a heading keep round 118's joins", async () => {
    for (const [prefix, next] of [
      ["Sailors turn the ship.", " Sailors then rest."],
      [STOPPED, "\n\nAs they turn, the sails fill."],
      ["### Photosynthesis", "\n\nPhotosynthesis is how plants turn light into sugar."],
      ["## Tacking into the wind", " Tacking is a turn through the wind."],
    ] as const) {
      const r = await cont(prefix, next);
      expect(r.shown, next).toBe(prefix + core.continuationSeparator(prefix, next) + next);
    }
  });

  it("Chinese: round 118's join is unchanged", async () => {
    const zh = await cont("逆风航行时，单帆无法直接受风，所以水手必须反复调转船头。这种操作产生", "产生一条对角线路径，让帆从侧面受风。");
    expect(zh.shown).toBe("逆风航行时，单帆无法直接受风，所以水手必须反复调转船头。这种操作产生一条对角线路径，让帆从侧面受风。");
  });
});
