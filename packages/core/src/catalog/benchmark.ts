import type { ChipClass, SpeedRange } from "./speed";

/** S31 "Benchmark on this phone": llama.cpp's synthetic run, 512 prompt tokens then 128 generated (spec §8.4). */
export const BENCH_PP = 512;
export const BENCH_TG = 128;

export interface BenchmarkResult {
  modelId: string;
  /** Epoch ms of the run. */
  at: number;
  /** Cold load of the weights before the run, ms; 0 when they were already resident. */
  loadMs: number;
  promptTokPerSec: number;
  genTokPerSec: number;
  pp: number;
  tg: number;
  /** Bytes of the weights the engine maps, when the engine reports it. */
  memMB: number | null;
  chip: ChipClass;
}

export type BenchmarkVerdict = "faster" | "expected" | "slower" | "unknown";

/** Generation speed against the §6.4 "expected on your device" range for this chip class and tier. */
export function benchmarkVerdict(genTokPerSec: number, expected: SpeedRange | undefined): BenchmarkVerdict {
  if (!expected || !(genTokPerSec > 0)) return "unknown";
  const [min, max] = expected;
  if (genTokPerSec < min) return "slower";
  if (genTokPerSec > max) return "faster";
  return "expected";
}

/** Time to first token for a prompt of `tokens`, derived from the measured prefill speed (ms). */
export function ttftForPrompt(promptTokPerSec: number, tokens = BENCH_PP): number | null {
  return promptTokPerSec > 0 ? Math.round((tokens / promptTokPerSec) * 1000) : null;
}

export const benchmarkKey = (modelId: string): string => `benchmark.${modelId}`;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Reads a stored result back; anything malformed (older shape, hand edit) is treated as "never measured". */
export function parseBenchmark(raw: string | undefined | null): BenchmarkResult | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as Partial<BenchmarkResult>;
    if (typeof r.modelId !== "string" || !finite(r.at) || !finite(r.loadMs) || !finite(r.promptTokPerSec) || !finite(r.genTokPerSec) || !finite(r.pp) || !finite(r.tg) || typeof r.chip !== "string") return null;
    return { modelId: r.modelId, at: r.at, loadMs: r.loadMs, promptTokPerSec: r.promptTokPerSec, genTokPerSec: r.genTokPerSec, pp: r.pp, tg: r.tg, memMB: finite(r.memMB) ? r.memMB : null, chip: r.chip as ChipClass };
  } catch {
    return null;
  }
}
