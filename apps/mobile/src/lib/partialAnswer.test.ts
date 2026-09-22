import { describe, expect, it } from "vitest";
import { PARTIAL_SAVE_MS, PartialAnswerSaver } from "./partialAnswer";

/** Streams `deltas` through the saver and returns the text lengths that would have reached the store. */
function stream(deltas: { at: number; length: number }[], saver = new PartialAnswerSaver()): number[] {
  const written: number[] = [];
  for (const d of deltas) {
    if (!saver.due(d.at, d.length)) continue;
    written.push(d.length);
    saver.saved(d.at, d.length);
  }
  return written;
}

describe("partial answer on disk (§8.8 row 5a, F65)", () => {
  it("writes the first text at once, so a kill one second in still leaves the answer", () => {
    expect(stream([{ at: 1000, length: 4 }])).toEqual([4]);
  });

  it("then writes once per interval, not once per token", () => {
    const deltas = Array.from({ length: 40 }, (_, i) => ({ at: 1000 + i * 100, length: (i + 1) * 5 }));
    const written = stream(deltas);
    expect(written[0]).toBe(5);
    expect(written).toHaveLength(1 + Math.floor((39 * 100) / PARTIAL_SAVE_MS));
    for (let i = 1; i < written.length; i++) expect(written[i]).toBeGreaterThan(written[i - 1]!);
  });

  it("never writes before there is text, and never rewrites the same text", () => {
    const saver = new PartialAnswerSaver();
    expect(saver.due(0, 0)).toBe(false);
    expect(saver.wrote).toBe(false);
    expect(saver.due(0, 3)).toBe(true);
    saver.saved(0, 3);
    expect(saver.wrote).toBe(true);
    expect(saver.due(10_000, 3)).toBe(false);
    expect(saver.due(10_000, 4)).toBe(true);
  });

  it("a store that refused the write is not asked again for this answer", () => {
    const saver = new PartialAnswerSaver();
    expect(saver.due(0, 3)).toBe(true);
    saver.stop();
    expect(saver.due(0, 3)).toBe(false);
    expect(saver.due(60_000, 9_000)).toBe(false);
    expect(saver.wrote).toBe(false);
  });

  it("a slow first token does not open the door to a write per token afterwards", () => {
    const saver = new PartialAnswerSaver(1_000);
    expect(stream(
      [
        { at: 30_000, length: 2 },
        { at: 30_100, length: 5 },
        { at: 30_900, length: 9 },
        { at: 31_000, length: 12 },
      ],
      saver,
    )).toEqual([2, 12]);
  });
});
