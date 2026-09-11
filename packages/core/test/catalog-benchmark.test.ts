import { describe, expect, it } from "vitest";
import { BENCH_PP, BENCH_TG, benchmarkKey, benchmarkVerdict, expectedSpeed, parseBenchmark, ttftForPrompt, type BenchmarkResult } from "../src/index";

const result: BenchmarkResult = { modelId: "instant", at: 1, loadMs: 1200, promptTokPerSec: 180, genTokPerSec: 24, pp: BENCH_PP, tg: BENCH_TG, memMB: 508, chip: "android-high" };

describe("S31 benchmark (spec §7.2, §8.4)", () => {
  it("runs 512 prompt / 128 generated tokens", () => {
    expect([BENCH_PP, BENCH_TG]).toEqual([512, 128]);
  });

  it("judges generation speed against the §6.4 range of the chip class", () => {
    const range = expectedSpeed("android-high", "instant");
    expect(range).toEqual([18, 28]);
    expect(benchmarkVerdict(24, range)).toBe("expected");
    expect(benchmarkVerdict(18, range)).toBe("expected");
    expect(benchmarkVerdict(17.9, range)).toBe("slower");
    expect(benchmarkVerdict(28.1, range)).toBe("faster");
    expect(benchmarkVerdict(24, undefined)).toBe("unknown");
    expect(benchmarkVerdict(0, range)).toBe("unknown");
    expect(benchmarkVerdict(30, expectedSpeed("android-high", undefined))).toBe("unknown");
  });

  it("derives the time to first token of a 512-token prompt from the prefill speed", () => {
    expect(ttftForPrompt(256)).toBe(2000);
    expect(ttftForPrompt(180, 90)).toBe(500);
    expect(ttftForPrompt(0)).toBeNull();
  });

  it("stores one result per model and refuses a malformed one", () => {
    expect(benchmarkKey("instant")).toBe("benchmark.instant");
    expect(parseBenchmark(JSON.stringify(result))).toEqual(result);
    expect(parseBenchmark(JSON.stringify({ ...result, memMB: undefined }))).toEqual({ ...result, memMB: null });
    expect(parseBenchmark(JSON.stringify({ ...result, genTokPerSec: "fast" }))).toBeNull();
    expect(parseBenchmark("{")).toBeNull();
    expect(parseBenchmark(undefined)).toBeNull();
  });
});
