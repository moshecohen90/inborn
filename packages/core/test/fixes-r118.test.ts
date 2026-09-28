import { describe, expect, it } from "vitest";
import * as core from "../src/index";
import type { Delta, GuardedDelta } from "../src/index";

/**
 * Round 118 (F438). The web, Fast, 28.9 12:30: Stop after "…This maneuver creates", then Continue, and the screen read
 * "This maneuver creates creates a diagonal path…". The seam dropped a restated clause of three words or more, never the
 * last word or two said again at the join.
 */
const { guardLoops } = core;
const usage = { promptTokens: 1, completionTokens: 1, ttftMs: 1, tokPerSec: 1 };

const STOPPED =
  "Sailing into the wind is called tacking. A single sail cannot catch an opposing wind, so sailors must turn the vessel back and forth repeatedly. This maneuver creates";
const REST = " a diagonal path that allows the sails to keep catching the wind from the side.";

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

describe("F438 · the word at the Continue seam is said once", () => {
  it("the web's Continue: '…This maneuver creates' + ' creates a diagonal path…' reads '…This maneuver creates a diagonal path…'", async () => {
    const r = await cont(STOPPED, ` creates${REST}`);
    expect(r.shown).toBe(`${STOPPED}${REST}`);
    expect(r.shown).toContain("This maneuver creates a diagonal path that allows the sails");
    for (const s of r.screens) expect(s).not.toMatch(/creates\s+creates/u);
  });

  it("the same word with no leading space, with a capital, or split across chunks: one 'creates', one space", async () => {
    for (const [next, step] of [
      [`creates${REST}`, 3],
      [`Creates${REST}`, 3],
      [` creates${REST}`, 1],
      [` creates${REST}`, 7],
    ] as const) {
      const r = await cont(STOPPED, next, step);
      expect(r.shown, `${next.slice(0, 12)} / ${step}`).toBe(`${STOPPED}${REST}`);
      for (const s of r.screens) expect(s).not.toMatch(/creates\s+creates/iu);
    }
  });

  it("two and three words said again at the join go too", async () => {
    const two = await cont(STOPPED, `maneuver creates${REST}`);
    expect(two.shown).toBe(`${STOPPED}${REST}`);
    const three = await cont(STOPPED, `This maneuver creates${REST}`);
    expect(three.shown).toBe(`${STOPPED}${REST}`);
    const back = "Sailors must turn the vessel back and forth";
    const again = await cont(back, "Back and forth repeatedly, so the path zigzags.");
    expect(again.shown).toBe("Sailors must turn the vessel back and forth repeatedly, so the path zigzags.");
    /* Round 111 left this two-word echo alone; it is the same stutter. */
    const fleet = await cont("The fleet sailed west with the fleet", "the fleet reached land.");
    expect(fleet.shown).toBe("The fleet sailed west with the fleet reached land.");
  });

  it("the join has exactly one space, and none before punctuation", async () => {
    const spaced = await cont(`${STOPPED} `, `creates${REST}`);
    expect(spaced.shown).toBe(`${STOPPED}${REST}`);
    const wide = await cont(STOPPED, ` creates  ${REST.trimStart()}`);
    expect(wide.shown).toBe(`${STOPPED}${REST}`);
    const comma = await cont(STOPPED, "creates, in effect, a zigzag across the wind.");
    expect(comma.shown).toBe(`${STOPPED}, in effect, a zigzag across the wind.`);
  });

  it("after a full sentence the continuation starts a new one: 'the ship.' + 'The ship then…' is not an overlap", async () => {
    for (const [prefix, next] of [
      ["Sailors turn the ship.", " The ship then gathers speed."],
      ["Sailors turn the ship.", "The ship then gathers speed."],
      ["Sailors turn the ship.\n", "The ship then gathers speed."],
      ["Sailors turn the ship!", "Ship and crew then rest."],
    ] as const) {
      const r = await cont(prefix, next);
      expect(r.shown, next).toBe(prefix + core.continuationSeparator(prefix, next) + next);
    }
  });

  it("a continuation that goes on with a different word is left alone", async () => {
    for (const [prefix, next] of [
      [STOPPED, REST],
      [STOPPED, " created by the wind itself."],
      ["The sailors turned the", " theory into practice."],
    ] as const) {
      const r = await cont(prefix, next);
      expect(r.shown, next).toBe(prefix + next);
    }
  });

  it("from the replay of stored answers: a word said twice on purpose, other marks between the words, or a new line stay", async () => {
    for (const [prefix, next] of [
      ["Es gibt englische Verben, die", " die neutrale Bedeutung der deutschen Verben tragen."],
      ["Le matin, nous", " nous levons tôt pour hisser la voile."],
      ["8. geben: zu übergeben, zu verschenken\n9. lassen: zu", " lassen, zu überlassen\n10. machen: zu tun"],
      ["### Photosynthesis", "\n\nPhotosynthesis is how plants turn light into sugar."],
    ] as const) {
      const r = await cont(prefix, next);
      expect(r.shown, next).toBe(prefix + next);
    }
  });

  it("Chinese and Japanese, no spaces: a word said again at the join goes; one character doubled on purpose stays", async () => {
    const zh = await cont("逆风航行时，单帆无法直接受风，所以水手必须反复调转船头。这种操作产生", "产生一条对角线路径，让帆从侧面受风。");
    expect(zh.shown).toBe("逆风航行时，单帆无法直接受风，所以水手必须反复调转船头。这种操作产生一条对角线路径，让帆从侧面受风。");
    const ja = await cont("帆は一枚では向かい風を受けられないため、この操作は斜めの進路を", "進路を作り出します。");
    expect(ja.shown).toBe("帆は一枚では向かい風を受けられないため、この操作は斜めの進路を作り出します。");
    const look = await cont("我们来看", "看这个例子。");
    expect(look.shown).toBe("我们来看看这个例子。");
  });

  it("a stopped text that ends mid-word: 'creat' + 'es a diagonal' reads 'creates a diagonal', no space inserted", async () => {
    const stopped = STOPPED.slice(0, -2);
    expect(stopped.endsWith("This maneuver creat")).toBe(true);
    const r = await cont(stopped, `es${REST}`);
    expect(r.shown).toBe(`${STOPPED}${REST}`);
    for (const s of r.screens) expect(s).not.toContain("creat es");
    const one = await cont(stopped, `es${REST}`, 1);
    expect(one.shown).toBe(`${STOPPED}${REST}`);
    const sails = await cont("The wind and the sail", "s turn together.");
    expect(sails.shown).toBe("The wind and the sails turn together.");
  });

  it("a whole word after a whole word keeps its space (F390): 'es' where it is a word, 'fully', and a stopped word used whole before", async () => {
    const join = async (prefix: string, next: string) => (await cont(prefix, next)).shown;
    expect(await join("Spices moved along the trade routes", "connected Europe and Asia.")).toBe("Spices moved along the trade routes connected Europe and Asia.");
    expect(await join("En esta ruta la vela", "es la clave del avance.")).toBe("En esta ruta la vela es la clave del avance.");
    expect(await join("Bei Flaute gibt", "es keinen Vortrieb.")).toBe("Bei Flaute gibt es keinen Vortrieb.");
    expect(await join("무역로를", "따라 이동했다.")).toBe("무역로를 따라 이동했다.");
    expect(await join("Pour the yeast into the bowl and stir gently until", "fully combined.")).toBe("Pour the yeast into the bowl and stir gently until fully combined.");
    expect(await join("The sails and the wind meet where the", "ory of lift begins.")).toBe("The sails and the wind meet where the ory of lift begins.");
  });

  it("the seam decides at the stream's end too: a continuation of only the word said again adds nothing", async () => {
    const r = await cont(STOPPED, " creates");
    expect(r.shown).toBe(STOPPED);
    expect(core.seamOverlap(STOPPED, " creates", true)).toBe(" creates".length);
    expect(core.seamOverlap(STOPPED, " cre")).toBe(-1);
  });
});
