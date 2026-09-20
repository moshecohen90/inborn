/** Script / language hints (§7.8 full RTL, §10.5 #40 wrong-language answers). Pure string inspection, no network. */

export type Direction = "ltr" | "rtl";

const RTL_RANGE = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/u;
const STRONG_LTR = /[A-Za-z\u00c0-\u024f\u0370-\u03ff\u0400-\u04ff\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/u;

/** Direction of a text from its first strong character (Unicode bidi "first strong"). */
export function directionOf(text: string): Direction {
  for (const ch of text) {
    if (RTL_RANGE.test(ch)) return "rtl";
    if (STRONG_LTR.test(ch)) return "ltr";
  }
  return "ltr";
}

export type Script = "hebrew" | "arabic" | "cyrillic" | "cjk" | "japanese" | "korean" | "greek" | "latin" | "other";

/** Dominant script by character count, ignoring digits and punctuation. */
export function scriptOf(text: string): Script {
  const counts: Record<Script, number> = { hebrew: 0, arabic: 0, cyrillic: 0, cjk: 0, japanese: 0, korean: 0, greek: 0, latin: 0, other: 0 };
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x0590 && c <= 0x05ff) counts.hebrew++;
    else if ((c >= 0x0600 && c <= 0x06ff) || (c >= 0x0750 && c <= 0x077f)) counts.arabic++;
    else if (c >= 0x0400 && c <= 0x04ff) counts.cyrillic++;
    else if (c >= 0x0370 && c <= 0x03ff) counts.greek++;
    else if ((c >= 0x3040 && c <= 0x30ff) || (c >= 0x31f0 && c <= 0x31ff)) counts.japanese++;
    else if (c >= 0xac00 && c <= 0xd7af) counts.korean++;
    else if (c >= 0x4e00 && c <= 0x9fff) counts.cjk++;
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || (c >= 0xc0 && c <= 0x24f)) counts.latin++;
  }
  let best: Script = "other";
  let n = 0;
  for (const k of Object.keys(counts) as Script[]) {
    if (counts[k] > n) {
      n = counts[k];
      best = k;
    }
  }
  return best;
}

const LANGUAGE_BY_SCRIPT: Partial<Record<Script, string>> = { hebrew: "Hebrew", arabic: "Arabic", cyrillic: "Russian", greek: "Greek", japanese: "Japanese", korean: "Korean", cjk: "Chinese" };

/** Explicit instruction for scripts small models drift away from; empty for Latin (the baseline already says "same language"). */
export function languageHint(userText: string): string {
  const name = LANGUAGE_BY_SCRIPT[scriptOf(userText)];
  return name ? `The user writes in ${name}. Answer in ${name}.` : "";
}

/** "Answer in Hebrew" quick action (§8.2 S11): the instruction appended to a re-ask. */
export function answerInLanguageInstruction(language: string): string {
  return `Answer in ${language}.`;
}

/** ISO 639-1 code the catalog's `goodLanguages` uses for each non-Latin script. */
const CODE_BY_SCRIPT: Partial<Record<Script, string>> = { hebrew: "he", arabic: "ar", cyrillic: "ru", greek: "el", japanese: "ja", korean: "ko", cjk: "zh" };

export const languageCodeOf = (text: string): string | null => CODE_BY_SCRIPT[scriptOf(text)] ?? null;

/* Simplified and Traditional forms of eighty very common characters, paired by index; a Han text uses one side or the other. */
const SIMPLIFIED_FORMS = "们这国说为时会个来对学发点无长东车门马鸟见语请谢关开书电话买卖从众与业义习乡写农让认识议论讲变边过进远连运还达适选经两确气么儿万号岁员图团园处备头医应战报术体湾";
const TRADITIONAL_FORMS = "們這國說為時會個來對學發點無長東車門馬鳥見語請謝關開書電話買賣從眾與業義習鄉寫農讓認識議論講變邊過進遠連運還達適選經兩確氣麼兒萬號歲員圖團園處備頭醫應戰報術體灣";
const SIMPLIFIED_ONLY = new Set([...SIMPLIFIED_FORMS]);
const TRADITIONAL_ONLY = new Set([...TRADITIONAL_FORMS]);

/** Which Chinese script a Han text is written in; null when it uses no character that tells the two apart. */
export function chineseScriptOf(text: string): "zh-Hans" | "zh-Hant" | null {
  let hans = 0;
  let hant = 0;
  for (const ch of text) {
    if (SIMPLIFIED_ONLY.has(ch)) hans++;
    else if (TRADITIONAL_ONLY.has(ch)) hant++;
  }
  return hans === hant ? null : hans > hant ? "zh-Hans" : "zh-Hant";
}

/** Code to English name; the UI resolves `language.<code>` and falls back to this. */
export const LANGUAGE_NAME_BY_CODE: Readonly<Record<string, string>> = {
  ...Object.fromEntries((Object.keys(CODE_BY_SCRIPT) as Script[]).map((s) => [CODE_BY_SCRIPT[s]!, LANGUAGE_BY_SCRIPT[s]!])),
  "zh-Hans": "Chinese (Simplified)",
  "zh-Hant": "Chinese (Traditional)",
};

export interface LanguageCandidate {
  id: string;
  goodLanguages: readonly string[];
  /** Ready to use now (installed) or still to install; both are offered, the copy differs. */
  installed: boolean;
}

export interface LanguageModelHint {
  code: string;
  language: string;
  model: LanguageCandidate;
}

/**
 * §7 "recommended model per language": when the user writes in a script the loaded model does not list as a good language
 * and another chat model on the catalog does, name that model (installed first). Null for Latin scripts and when nothing better exists.
 */
export function betterModelForLanguage(userText: string, current: LanguageCandidate | null, candidates: readonly LanguageCandidate[]): LanguageModelHint | null {
  const code = languageCodeOf(userText);
  if (!code || !current || current.goodLanguages.includes(code)) return null;
  const better = candidates.filter((c) => c.id !== current.id && c.goodLanguages.includes(code)).sort((a, b) => Number(b.installed) - Number(a.installed))[0];
  if (!better) return null;
  return { code, language: LANGUAGE_BY_SCRIPT[scriptOf(userText)] ?? code, model: better };
}
