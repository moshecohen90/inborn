import type { GenOpts } from "./types";

/** llama.cpp ships the repeat penalty off (1.0); Instant looped a Japanese sentence to the ceiling without it (F369). */
export const REPEAT_PENALTY = 1.1;
/** Tokens the penalty looks back over; 64 covers a looping sentence without taxing particles a paragraph away. */
export const REPEAT_LAST_N = 64;

export interface Sampling {
  temperature: number;
  topP: number;
  repeatPenalty: number;
  repeatLastN: number;
}

/** The one place every engine adapter reads its sampler settings from; a caller's own values win. */
export function sampling(opts: GenOpts): Sampling {
  return {
    temperature: opts.temperature ?? 0.7,
    topP: opts.topP ?? 0.9,
    repeatPenalty: opts.repeatPenalty ?? REPEAT_PENALTY,
    repeatLastN: opts.repeatLastN ?? REPEAT_LAST_N,
  };
}
