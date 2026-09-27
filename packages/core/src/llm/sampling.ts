import type { GenOpts } from "./types";

/** llama.cpp ships the repeat penalty off (1.0); Instant looped a Japanese sentence to the ceiling without it (F369). */
export const REPEAT_PENALTY = 1.1;
/** Tokens the penalty looks back over; 64 covers a looping sentence without taxing particles a paragraph away. */
export const REPEAT_LAST_N = 64;
/** DRY (F414) stays off for the answer: it cannot tell a loop from a repeat the answer needs (docs/qa/fix-loops-root/fidelity); only LOOP_RETRY turns it on. */
export const DRY_BASE = 1.75;
export const DRY_ALLOWED_LENGTH = 2;
/** Covers a whole answer (the ceiling is 1024 tokens). Not -1: llama.cpp reads that as the trained context (262k for Qwen3.5), and newer servers reject it. */
export const DRY_PENALTY_LAST_N = 4096;
/** llama.cpp's defaults, sent explicitly because the desktop binding has none of its own. */
export const DRY_SEQUENCE_BREAKERS: readonly string[] = ["\n", ":", '"', "*"];

export interface Sampling {
  temperature: number;
  topP: number;
  repeatPenalty: number;
  repeatLastN: number;
  dryMultiplier: number;
  dryBase: number;
  dryAllowedLength: number;
  dryPenaltyLastN: number;
  drySequenceBreakers: string[];
  presencePenalty: number;
  frequencyPenalty: number;
}

/** The one place every engine adapter reads its sampler settings from; a caller's own values win. */
export function sampling(opts: GenOpts): Sampling {
  return {
    temperature: opts.temperature ?? 0.7,
    topP: opts.topP ?? 0.9,
    repeatPenalty: opts.repeatPenalty ?? REPEAT_PENALTY,
    repeatLastN: opts.repeatLastN ?? REPEAT_LAST_N,
    dryMultiplier: opts.dryMultiplier ?? 0,
    dryBase: DRY_BASE,
    dryAllowedLength: DRY_ALLOWED_LENGTH,
    dryPenaltyLastN: DRY_PENALTY_LAST_N,
    drySequenceBreakers: [...DRY_SEQUENCE_BREAKERS],
    presencePenalty: opts.presencePenalty ?? 0,
    frequencyPenalty: opts.frequencyPenalty ?? 0,
  };
}
