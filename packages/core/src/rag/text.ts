/** Text normalization shared by the chunker, the lexical index and the injection filter. */

/* Bidi formatting characters (embeddings, overrides, isolates) and invisible code points: dropped before indexing.
   Overrides (RLO/LRO) and Unicode "tag" characters are also a hiding place for injected instructions (§10.4 #34). */
// eslint-disable-next-line no-misleading-character-class
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u00AD\u034F\u061C\u180E]|[\u{E0000}-\u{E007F}]/gu;
/* C0/C1 controls except tab, newline and carriage return. */
// eslint-disable-next-line no-control-regex
const CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/** NFC, invisible + control characters removed, CRLF folded, runs of blank lines collapsed, trailing spaces trimmed. */
export function normalizeText(input: string): string {
  return input
    .normalize("NFC")
    .replace(INVISIBLE, "")
    .replace(CONTROLS, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\u00A0]+\n/g, "\n")
    .replace(/[ \t\u00A0]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Hebrew points and cantillation; stripped for lexical matching only, never from stored text. */
const HEBREW_MARKS = /[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g;
/** Arabic harakat and tatweel. */
const ARABIC_MARKS = /[\u064B-\u0652\u0670\u0640]/g;

export function foldForSearch(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(HEBREW_MARKS, "").replace(ARABIC_MARKS, "");
}

/** Unicode words (letters/digits, with inner apostrophes and geresh/gershayim kept). */
const WORD = /[\p{L}\p{N}]+(?:['\u05F3\u05F4\u2019][\p{L}\p{N}]+)*/gu;

export function words(s: string): string[] {
  return foldForSearch(s).match(WORD) ?? [];
}

export const isWhitespaceOnly = (s: string): boolean => !/\S/u.test(s);
