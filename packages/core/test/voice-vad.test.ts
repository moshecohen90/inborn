import { describe, expect, it } from "vitest";
import { DEFAULT_VAD, EnergyVad, rmsDb, type VadEvent } from "../src/voice/vad";

const FRAME = 20;

/** Drives the detector with a level profile: [levelDb, durationMs] pairs. */
function run(vad: EnergyVad, profile: [number, number][], from = 0): { events: VadEvent[]; now: number } {
  const events: VadEvent[] = [];
  let now = from;
  for (const [level, ms] of profile) {
    for (let t = 0; t < ms; t += FRAME) {
      now += FRAME;
      events.push(...vad.update(level, now));
    }
  }
  return { events, now };
}

describe("rmsDb", () => {
  it("is -100 for silence and 0 dBFS for full scale", () => {
    expect(rmsDb(new Int16Array(160))).toBe(-100);
    expect(rmsDb(Int16Array.from({ length: 160 }, () => 32768))).toBeCloseTo(0, 5);
  });
  it("is about -6 dB at half scale", () => {
    expect(rmsDb(Int16Array.from({ length: 160 }, () => 16384))).toBeCloseTo(-6.02, 1);
  });
});

describe("EnergyVad", () => {
  it("ignores a room at the noise floor", () => {
    const vad = new EnergyVad(DEFAULT_VAD, -50);
    const { events } = run(vad, [[-52, 3000]]);
    expect(events).toEqual([]);
    expect(vad.state).toBe("idle");
  });

  it("reports start after minSpeechMs (pre-rolled) and end after the silence gap", () => {
    const vad = new EnergyVad(DEFAULT_VAD, -50);
    const { events } = run(vad, [
      [-52, 500],
      [-20, 1500],
      [-52, 1000],
    ]);
    const start = events.find((e) => e.type === "speech-start");
    const end = events.find((e) => e.type === "speech-end");
    expect(start).toBeDefined();
    expect(end).toBeDefined();
    expect(start!.at).toBeCloseTo(520 - DEFAULT_VAD.preRollMs, -1);
    if (end?.type === "speech-end") {
      expect(end.reason).toBe("silence");
      expect(end.at - 2000).toBeGreaterThanOrEqual(DEFAULT_VAD.endSilenceMs);
      expect(end.startedAt).toBe(start!.at);
    }
    expect(vad.state).toBe("idle");
  });

  it("discards a click shorter than minSpeechMs", () => {
    const vad = new EnergyVad(DEFAULT_VAD, -50);
    const { events } = run(vad, [
      [-52, 200],
      [-15, 100],
      [-52, 1500],
    ]);
    expect(events.map((e) => e.type)).toEqual(["discard"]);
  });

  it("bridges a short pause inside a sentence", () => {
    const vad = new EnergyVad(DEFAULT_VAD, -50);
    const { events } = run(vad, [
      [-20, 800],
      [-52, 400],
      [-20, 800],
      [-52, 1200],
    ]);
    expect(events.filter((e) => e.type === "speech-end")).toHaveLength(1);
    expect(events.filter((e) => e.type === "speech-start")).toHaveLength(1);
  });

  it("cuts an utterance at maxSpeechMs with reason max", () => {
    const vad = new EnergyVad({ ...DEFAULT_VAD, maxSpeechMs: 3000 }, -50);
    const { events } = run(vad, [[-20, 4000]]);
    const end = events.find((e) => e.type === "speech-end");
    expect(end?.type === "speech-end" && end.reason).toBe("max");
  });

  it("a constant tone ends at maxSpeechMs and becomes the floor, so it never restarts", () => {
    const vad = new EnergyVad({ ...DEFAULT_VAD, maxSpeechMs: 3000 }, -50);
    const first = run(vad, [[-30, 3200]]);
    expect(first.events.some((e) => e.type === "speech-end" && e.reason === "max")).toBe(true);
    expect(vad.floorDb).toBeCloseTo(-30, 0);
    const again = run(vad, [[-30, 5000]], first.now);
    expect(again.events.filter((e) => e.type === "speech-start")).toHaveLength(0);
  });

  it("raises the floor under steady noise so the same level no longer counts as speech", () => {
    const vad = new EnergyVad(DEFAULT_VAD, -60);
    run(vad, [[-52, 20_000]]);
    expect(vad.floorDb).toBeGreaterThan(-54);
    const { events } = run(vad, [[-44, 2000]], 20_000);
    expect(events.filter((e) => e.type === "speech-start")).toHaveLength(0);
  });

  it("drops the floor quickly when the room gets quiet again", () => {
    const vad = new EnergyVad(DEFAULT_VAD, -30);
    run(vad, [[-60, 1000]]);
    expect(vad.floorDb).toBeLessThan(-55);
  });

  it("flush closes a confirmed utterance and discards an unconfirmed one", () => {
    const vad = new EnergyVad(DEFAULT_VAD, -50);
    run(vad, [[-20, 600]]);
    expect(vad.flush(700).map((e) => e.type)).toEqual(["speech-end"]);
    run(vad, [[-20, 100]], 1000);
    expect(vad.flush(1200).map((e) => e.type)).toEqual(["discard"]);
    expect(vad.flush(1300)).toEqual([]);
  });
});
