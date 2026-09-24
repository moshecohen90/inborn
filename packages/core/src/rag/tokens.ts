/**
 * Token estimates without a tokenizer (spec §10.4 #31: Hebrew and CJK cost more tokens per character).
 * Calibrated against Qwen's BPE: ~4 chars/token for Latin, ~2 for Hebrew/Arabic, ~1.5 for CJK. Over-estimates
 * rather than under, since the budget it feeds must never overflow the context.
 */
const HEBREW_ARABIC = /[\u0590-\u06FF\u0750-\u077F\uFB1D-\uFDFF\uFE70-\uFEFF]/u;
const CJK = /[\u3000-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/u;
const LATIN = /[A-Za-z\u00C0-\u024F]/u;
const DIGIT = /[0-9]/u;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  let latin = 0;
  let rtl = 0;
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    if (LATIN.test(ch)) latin++;
    else if (HEBREW_ARABIC.test(ch)) rtl++;
    else if (CJK.test(ch)) cjk++;
    else if (DIGIT.test(ch)) other += 1.5;
    else if (ch !== " " && ch !== "\n" && ch !== "\t") other++;
  }
  const spaces = text.split(/\s+/).length - 1;
  return Math.ceil(latin / 4 + rtl / 2 + cjk / 1.5 + other / 3 + spaces / 4);
}

/** The longest prefix of `text`, cut at a code point, whose estimate fits `maxTokens`. */
export function clipToTokens(text: string, maxTokens: number): string {
  if (estimateTokens(text) <= maxTokens) return text;
  const chars = Array.from(text);
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (estimateTokens(chars.slice(0, mid).join("")) <= maxTokens) lo = mid;
    else hi = mid - 1;
  }
  return chars.slice(0, lo).join("");
}

export type Script = "he" | "ar" | "en" | "cjk" | "mixed" | "unknown";

/** Dominant script by character share; "mixed" when no script reaches 60% of the letters. */
export function detectScript(text: string): Script {
  let he = 0;
  let ar = 0;
  let latin = 0;
  let cjk = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x0590 && c <= 0x05ff) he++;
    else if ((c >= 0x0600 && c <= 0x06ff) || (c >= 0x0750 && c <= 0x077f)) ar++;
    else if (LATIN.test(ch)) latin++;
    else if (CJK.test(ch)) cjk++;
  }
  const total = he + ar + latin + cjk;
  if (!total) return "unknown";
  const best = Math.max(he, ar, latin, cjk);
  if (best / total < 0.6) return "mixed";
  if (best === he) return "he";
  if (best === ar) return "ar";
  if (best === cjk) return "cjk";
  return "en";
}

export const isRtlScript = (s: Script): boolean => s === "he" || s === "ar";
