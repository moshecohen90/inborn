/** Lexical side of hybrid retrieval: BM25 over unicode words, with Hebrew/Arabic prefix variants (ו/ה/ב/ל/מ/ש/כ, ال). */
import { hasCjk, words } from "./text";

const HEBREW_PREFIXES = ["\u05D5\u05D4", "\u05D5\u05D1", "\u05D5\u05DC", "\u05D5\u05DE", "\u05D5\u05E9", "\u05D5\u05DB", "\u05D5", "\u05D4", "\u05D1", "\u05DC", "\u05DE", "\u05E9", "\u05DB"];
const ARABIC_PREFIXES = ["\u0648\u0627\u0644", "\u0628\u0627\u0644", "\u0644\u0644", "\u0627\u0644", "\u0648", "\u0628", "\u0644"];

/** Index terms for a word: the word itself plus its prefix-stripped forms for Semitic scripts. */
export function termsOf(word: string): string[] {
  const out = [word];
  const first = word.codePointAt(0) ?? 0;
  const prefixes = first >= 0x05d0 && first <= 0x05ea ? HEBREW_PREFIXES : first >= 0x0621 && first <= 0x064a ? ARABIC_PREFIXES : null;
  if (!prefixes) return out;
  for (const p of prefixes) {
    if (word.length - p.length >= 3 && word.startsWith(p)) {
      out.push(word.slice(p.length));
      break;
    }
  }
  return out;
}

/* Function words carry no relevance signal; without this "the" alone would make every chunk a lexical match. */
const STOP = new Set(
  "the a an and or of to in on for is are was were be been it that this with as at by from what who how when where which why does do did has have had not no i you we they he she my your our their me us them than then there here about into over under up down out so if but can could would should will may might its also very just more most some any all each every both few many much own other such only same too".split(" ").concat(
    ["\u05E9\u05DC", "\u05D0\u05EA", "\u05E2\u05DC", "\u05E2\u05DD", "\u05D0\u05DC", "\u05D0\u05DD", "\u05DB\u05D9", "\u05D2\u05DD", "\u05D0\u05D5", "\u05DC\u05D0", "\u05D6\u05D4", "\u05D6\u05D5", "\u05D6\u05D0\u05EA", "\u05D4\u05D5\u05D0", "\u05D4\u05D9\u05D0", "\u05D4\u05DD", "\u05D4\u05DF", "\u05D0\u05E0\u05D9", "\u05D0\u05EA\u05D4", "\u05D0\u05E0\u05D7\u05E0\u05D5", "\u05D0\u05EA\u05DD", "\u05D9\u05E9", "\u05D0\u05D9\u05DF", "\u05DB\u05DC", "\u05DE\u05D4", "\u05DE\u05D9", "\u05D0\u05D9\u05DA", "\u05DE\u05EA\u05D9", "\u05D0\u05D9\u05E4\u05D4", "\u05DC\u05DE\u05D4", "\u05DB\u05DE\u05D4", "\u05D0\u05D1\u05DC", "\u05E8\u05E7", "\u05E2\u05D5\u05D3", "\u05DB\u05D1\u05E8", "\u05D4\u05D9\u05D4", "\u05D4\u05D9\u05D9\u05EA\u05D4", "\u05D4\u05D9\u05D5", "\u05D9\u05D4\u05D9\u05D4", "\u05DB\u05DA", "\u05DB\u05DF", "\u05D0\u05D6", "\u05E4\u05D4", "\u05E9\u05DD", "\u05D1\u05D9\u05DF", "\u05DC\u05E4\u05E0\u05D9", "\u05D0\u05D7\u05E8\u05D9", "\u05EA\u05D7\u05EA", "\u05DE\u05E2\u05DC"],
  ),
);

export const isStopWord = (w: string): boolean => STOP.has(w);

/* Chinese/Japanese grammatical characters: kana morphology, plus the Han pronouns, copulas, conjunctions and
   particles that STOP covers for English and Hebrew but that no word boundary ever separates in these scripts. */
const CJK_FUNCTION_CHAR =
  /[ぁ-ゟー]|[的了是在和有我你他她它们这那什么可以就都也很不没上下来去对为因所以吗呢吧把被让从与及其之于而且但如还要会能过时得着个两一每或者向新]/u;

/* A bigram of pure glue ("です", "可以") is shared by any two texts of the language, so counting it as a distinct
   lexical match handed an off-topic question the document's own passage (QA F278); it still scores and ranks. */
export const isCjkFunctionTerm = (term: string): boolean => hasCjk(term) && ![...term].some((c) => !CJK_FUNCTION_CHAR.test(c));

export function bm25Tokens(text: string): string[] {
  const out: string[] = [];
  for (const w of words(text)) {
    /* A lone CJK character is a word, not a stray letter, so the one-character floor does not apply to it. */
    if (STOP.has(w) || (w.length < 2 && !/\p{N}/u.test(w) && !hasCjk(w))) continue;
    for (const t of termsOf(w)) if (!STOP.has(t)) out.push(t);
  }
  return out;
}

export interface Bm25Hit {
  id: string;
  score: number;
  /** Distinct content query terms that matched; grammatical glue is excluded, as the relevance floor reads this. */
  matched: number;
}

export class Bm25Index {
  private readonly postings = new Map<string, Map<string, number>>();
  private readonly lengths = new Map<string, number>();
  private totalLength = 0;

  constructor(
    private readonly k1 = 1.2,
    private readonly b = 0.75,
  ) {}

  get size(): number {
    return this.lengths.size;
  }

  add(id: string, text: string): void {
    if (this.lengths.has(id)) this.remove(id);
    const toks = bm25Tokens(text);
    this.lengths.set(id, toks.length);
    this.totalLength += toks.length;
    for (const t of toks) {
      let m = this.postings.get(t);
      if (!m) this.postings.set(t, (m = new Map()));
      m.set(id, (m.get(id) ?? 0) + 1);
    }
  }

  remove(id: string): void {
    const len = this.lengths.get(id);
    if (len === undefined) return;
    this.lengths.delete(id);
    this.totalLength -= len;
    for (const [t, m] of this.postings) {
      m.delete(id);
      if (!m.size) this.postings.delete(t);
    }
  }

  search(query: string, k = 10, filter?: (id: string) => boolean): Bm25Hit[] {
    const n = this.lengths.size;
    if (!n) return [];
    const avg = this.totalLength / n;
    const scores = new Map<string, { score: number; matched: Set<string> }>();
    const qterms = new Set(bm25Tokens(query));
    for (const t of qterms) {
      const m = this.postings.get(t);
      if (!m) continue;
      const idf = Math.log(1 + (n - m.size + 0.5) / (m.size + 0.5));
      for (const [id, tf] of m) {
        if (filter && !filter(id)) continue;
        const len = this.lengths.get(id) ?? avg;
        const s = idf * ((tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + (this.b * len) / avg)));
        let e = scores.get(id);
        if (!e) scores.set(id, (e = { score: 0, matched: new Set() }));
        e.score += s;
        if (!isCjkFunctionTerm(t)) e.matched.add(t);
      }
    }
    return [...scores]
      .map(([id, e]) => ({ id, score: e.score, matched: e.matched.size }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, k);
  }
}
