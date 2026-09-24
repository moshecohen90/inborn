/** Lexical side of hybrid retrieval: BM25 over unicode words, with Hebrew/Arabic prefix variants (ו/ה/ב/ל/מ/ש/כ, ال). */
import { foldDiacritics, hasCjk, words } from "./text";

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
  "the a an and or of to in on for is are was were be been it that this with as at by from what who how when where which why does do did has have had not no i you we they he she my your our their me us them than then there here about into over under up down out so if but can could would should shall must will may might its also very just more most some any all each every both few many much own other such only same too before after during while within between among through against because"
    .split(" ")
    /* Every launch locale needs its own, or its articles and prepositions are "evidence" the way CJK glue was (QA F278/F327).
       Words whose spelling is a content word in another launch locale (de "war"/"die"/"man"/"hat", es "son", fr "car", pt "era") are left out. */
    .concat("der die das dem den des ein eine einen einem eines und oder aber auch noch nur sehr als aus bei mit nach von vor zu zum zur im in am an auf für über unter ohne durch gegen ist sind sein seine seiner seinen haben hatte werden wird wurde kann können muss soll wie wer wen wem was wo wann warum welche welcher welches dieser diese dieses sich ihr ihre sie es nicht kein keine mehr schon dass damit oben unten".split(" "))
    .concat("que el la los las un una unos unas de del al en es ser está están por para con sin sobre como cuando donde quien cual cuanto este esta esto estos estas ese esa eso su sus mi mis tu tus nos les lo se ya muy más pero también hay ha han fue tiene tienen desde hasta entre todo toda todos todas otro otra mismo qué cómo cuándo dónde quién cuál cuánto".split(" "))
    .concat("que os um uma uns umas do da dos das na nas em pelo pela pelos pelas ao aos às qual quais quem quando onde como porque são está estão foi tem têm há já mais menos muito também mas seu sua seus suas meu minha este esta isso esse essa aquele aquela outro outra lhe ele ela eles elas eu você nós".split(" "))
    .concat("que le les des du et ou qui quoi dans sur sous avec sans pour par sont être ont ce cet cette ces sa ses ma mes ta tes notre nos votre vos leur leurs il elle ils elles je nous vous on me te au aux plus moins très aussi mais donc comme quand où combien pourquoi comment tout tous toute toutes même autre autres fait faire peut doit est".split(" "))
    .concat(
    ["\u05E9\u05DC", "\u05D0\u05EA", "\u05E2\u05DC", "\u05E2\u05DD", "\u05D0\u05DC", "\u05D0\u05DD", "\u05DB\u05D9", "\u05D2\u05DD", "\u05D0\u05D5", "\u05DC\u05D0", "\u05D6\u05D4", "\u05D6\u05D5", "\u05D6\u05D0\u05EA", "\u05D4\u05D5\u05D0", "\u05D4\u05D9\u05D0", "\u05D4\u05DD", "\u05D4\u05DF", "\u05D0\u05E0\u05D9", "\u05D0\u05EA\u05D4", "\u05D0\u05E0\u05D7\u05E0\u05D5", "\u05D0\u05EA\u05DD", "\u05D9\u05E9", "\u05D0\u05D9\u05DF", "\u05DB\u05DC", "\u05DE\u05D4", "\u05DE\u05D9", "\u05D0\u05D9\u05DA", "\u05DE\u05EA\u05D9", "\u05D0\u05D9\u05E4\u05D4", "\u05DC\u05DE\u05D4", "\u05DB\u05DE\u05D4", "\u05D0\u05D1\u05DC", "\u05E8\u05E7", "\u05E2\u05D5\u05D3", "\u05DB\u05D1\u05E8", "\u05D4\u05D9\u05D4", "\u05D4\u05D9\u05D9\u05EA\u05D4", "\u05D4\u05D9\u05D5", "\u05D9\u05D4\u05D9\u05D4", "\u05DB\u05DA", "\u05DB\u05DF", "\u05D0\u05D6", "\u05E4\u05D4", "\u05E9\u05DD", "\u05D1\u05D9\u05DF", "\u05DC\u05E4\u05E0\u05D9", "\u05D0\u05D7\u05E8\u05D9", "\u05EA\u05D7\u05EA", "\u05DE\u05E2\u05DC"],
  ),
);

export const isStopWord = (w: string): boolean => STOP.has(w);

/* Chinese/Japanese grammatical characters: kana morphology, plus the Han pronouns, copulas, conjunctions and
   particles that STOP covers for English and Hebrew but that no word boundary ever separates in these scripts.
   The last class is the Traditional form of every Simplified glyph above, because zh-Hant is a launch locale (F363). */
const CJK_FUNCTION_CHAR =
  /[ぁ-ゟー]|[的了是在和有我你他她它们这那什么可以就都也很不没上下来去对为因所以吗呢吧把被让从与及其之于而且但如还要会能过时得着个两一每或者向新]|[們這麼對為嗎讓從與於還會過時著個兩來沒]/u;

/* A bigram of pure glue ("です", "可以") is shared by any two texts of the language, so counting it as a distinct
   lexical match handed an off-topic question the document's own passage (QA F278); it still scores and ranks. */
export const isCjkFunctionTerm = (term: string): boolean => hasCjk(term) && ![...term].some((c) => !CJK_FUNCTION_CHAR.test(c));

const CJK_NUMERAL = /^[〇零一二三四五六七八九十百千万億兆两]+$/u;
/* Numerals, the counters a date or a count is written with, and nothing else: "八年", "年に", "年度". */
const CJK_NUMBERISH = /[〇零一二三四五六七八九十百千万億兆两年月日号號時歳岁個回倍元円度秒名人件枚]/u;
const UNITS = new Set("km kg mg cm mm ml kb mb gb tb hz khz mhz ghz kw kwh mah usd eur ils nis gbp jpy cny krw brl".split(" "));

/**
 * A term that proves nothing on its own: a number, a year, a unit, a numeral bigram ("一九") or a lone CJK character.
 * Under e5 an off-topic question sharing only the year "1998" with a company report scored cosine 0.81 (QA F365).
 */
export const isWeakTerm = (term: string): boolean => {
  if (/^\p{N}+$/u.test(term) || CJK_NUMERAL.test(term) || UNITS.has(term)) return true;
  if (hasCjk(term)) {
    const chars = [...term];
    if (chars.length === 1) return true;
    if (chars.every((c) => CJK_NUMBERISH.test(c) || CJK_FUNCTION_CHAR.test(c)) && chars.some((c) => CJK_NUMBERISH.test(c))) return true;
  }
  /* "1998년", "10th", "1990s", "40km": a number with a counter or unit glued on is still a number. */
  const unit = term.replace(/^\p{N}+/u, "");
  return unit !== term && ([...unit].length <= 2 || UNITS.has(unit));
};

/* French, Italian and Catalan articles and pronouns that elide into the next word: "l'œuvre", "dell'arte", "qu'il". */
const ELISION = new Set("l d qu j c m n s t jusqu lorsqu puisqu quoiqu un dell all nell dall sull quest quell".split(" "));
/* What an elided article leaves behind that is still glue ("j'ai", "c'est", "d'une"); "ai" is glue only here, as English "AI" is a word. */
const ELIDED_GLUE = new Set("ai est il ils elle elles on un une en y".split(" "));
const APOSTROPHE = /['\u2019]/u;

/** The word an apostrophe hides: the elided article is dropped, and so is an English "'s". Null when only glue is left (F368). */
function unelide(word: string): string | null {
  let w = word;
  for (let at = w.search(APOSTROPHE); at > 0 && ELISION.has(w.slice(0, at)); at = w.search(APOSTROPHE)) {
    w = w.slice(at + 1);
    if (ELIDED_GLUE.has(w)) return null;
  }
  const last = w.length - 2;
  return last > 0 && APOSTROPHE.test(w[last]!) && w[last + 1] === "s" ? w.slice(0, last) : w;
}

const UMLAUT_DIGRAPH: Record<string, string> = { "\u00E4": "ae", "\u00F6": "oe", "\u00FC": "ue" };

/**
 * A word as the index spells it, and, for a word with ä/ö/ü, the ae/oe/ue spelling German typists fall back to (F368).
 * The digraph is an extra spelling, never a fold, so "Poesie", "Quelle" and "Feuer" keep their own letters.
 */
function termGroups(text: string): string[][] {
  const out: string[][] = [];
  for (const word of words(text)) {
    const raw = unelide(word);
    /* Glue is recognised as spelled before folding, so "très" stays glue while Spanish "tres" (three) stays a word. */
    if (raw === null || STOP.has(raw)) continue;
    const w = foldDiacritics(raw);
    /* A lone CJK character is a word, not a stray letter, so the one-character floor does not apply to it. */
    if (STOP.has(w) || (w.length < 2 && !/\p{N}/u.test(w) && !hasCjk(w))) continue;
    const digraph = /[\u00E4\u00F6\u00FC]/u.test(raw) ? foldDiacritics(raw.replace(/[\u00E4\u00F6\u00FC]/gu, (c) => UMLAUT_DIGRAPH[c]!)) : null;
    for (const t of termsOf(w)) if (!STOP.has(t)) out.push(digraph && t === w ? [t, digraph] : [t]);
  }
  return out;
}

export const bm25Tokens = (text: string): string[] => termGroups(text).map((g) => g[0]!);

export interface Bm25Hit {
  id: string;
  score: number;
  /** Distinct content query terms that matched; glue is excluded, and weak terms count only beside a content term. */
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
    const groups = termGroups(text);
    /* The digraph spelling is indexed but not counted in the length, so it moves no other word's score. */
    this.lengths.set(id, groups.length);
    this.totalLength += groups.length;
    for (const t of groups.flat()) {
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
    const scores = new Map<string, { score: number; matched: Set<string>; weak: Set<string> }>();
    /* One query word is one term however many spellings it is looked up under: its best-scoring spelling counts, once. */
    const qgroups: string[][] = [];
    for (const g of termGroups(query)) {
      const same = qgroups.find((q) => g.some((t) => q.includes(t)));
      if (same) same.push(...g.filter((t) => !same.includes(t)));
      else qgroups.push(g);
    }
    for (const group of qgroups) {
      const best = new Map<string, number>();
      for (const t of group) {
        const m = this.postings.get(t);
        if (!m) continue;
        const idf = Math.log(1 + (n - m.size + 0.5) / (m.size + 0.5));
        for (const [id, tf] of m) {
          if (filter && !filter(id)) continue;
          const len = this.lengths.get(id) ?? avg;
          const s = idf * ((tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + (this.b * len) / avg)));
          if (s > (best.get(id) ?? -1)) best.set(id, s);
        }
      }
      const t = group[0]!;
      for (const [id, s] of best) {
        let e = scores.get(id);
        if (!e) scores.set(id, (e = { score: 0, matched: new Set(), weak: new Set() }));
        e.score += s;
        if (isWeakTerm(t)) e.weak.add(t);
        else if (!isCjkFunctionTerm(t)) e.matched.add(t);
      }
    }
    return [...scores]
      .map(([id, e]) => ({ id, score: e.score, matched: e.matched.size ? e.matched.size + e.weak.size : 0 }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, k);
  }
}
