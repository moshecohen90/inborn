/** Repetition guard (§10.5 #39): a small model that starts looping is stopped and offered "Regenerate". */

export interface LoopOptions {
  /** Shortest repeated unit, in words. */
  minWords?: number;
  /** Longest repeated unit, in words. */
  maxWords?: number;
  /** How many consecutive repeats count as a loop. */
  repeats?: number;
  /** Character-level fallback for scripts without spaces. */
  minChars?: number;
}

const DEFAULTS: Required<LoopOptions> = { minWords: 1, maxWords: 24, repeats: 3, minChars: 12 };

/** True when the tail of `text` is the same n-gram repeated `repeats` times in a row (words, then characters). */
export function detectLoop(text: string, options: LoopOptions = {}): boolean {
  const o = { ...DEFAULTS, ...options };
  const words = text.trim().split(/\s+/).filter(Boolean);
  for (let n = o.minWords; n <= o.maxWords; n++) {
    // A single word needs one extra repeat: "no no no" is emphasis, four is a loop.
    const repeats = n === 1 ? o.repeats + 1 : o.repeats;
    if (words.length < n * repeats) break;
    const unit = words.slice(-n).join(" ");
    let ok = true;
    for (let r = 2; r <= repeats && ok; r++) {
      const start = words.length - n * r;
      ok = words.slice(start, start + n).join(" ") === unit;
    }
    if (ok) return true;
  }
  const compact = text.replace(/\s+/g, "");
  for (let n = o.minChars; n <= 80; n++) {
    if (compact.length < n * o.repeats) break;
    const unit = compact.slice(-n);
    let ok = true;
    for (let r = 2; r <= o.repeats && ok; r++) {
      const start = compact.length - n * r;
      ok = compact.slice(start, start + n) === unit;
    }
    if (ok) return true;
  }
  return false;
}
