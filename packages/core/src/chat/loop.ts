/** Repetition guard (§10.5 #39, F369): a small model that starts looping is stopped, cut back to its first copy, and offered "Regenerate". */
import type { Delta, GenOpts, Usage } from "../llm/types";
import { continuationSeparator } from "./join";

export interface LoopHit {
  /** The repeated unit, whitespace collapsed. */
  unit: string;
  /** Full consecutive copies found. */
  repeats: number;
  /** UTF-16 offset in the input where the first copy starts. */
  start: number;
  /** UTF-16 offset to cut at: everything before it is kept, i.e. the text up to the end of the first copy. */
  keep: number;
  /** The copies kept are the ones the user asked for, so the answer is complete at `keep` (F421). */
  asked?: boolean;
  /** A retried list that reached the count it was asked for ends at `keep` with no notice (F426). */
  complete?: boolean;
}

/** Only the tail is searched, so a check costs the same at token 20 and token 2000. */
const WINDOW = 600;
/** A unit this long or longer is a phrase: three copies in a row are a loop. */
const MIN_UNIT = 8;
const REPEATS = 3;
/** Shorter units ("no no no", "谢谢谢谢") are emphasis until they run this long. */
const SHORT_RUN = 32;
const SHORT_REPEATS = 5;
const TERMINATORS = new Set(Array.from(".!?。！？．…"));
const LETTER = /\p{L}/u;
/** Copies of a requested repetition allowed when the ask names no count. */
const ASKED_CAP = 10;
const COUNT_CAP = 100;
/** F415: a unit this long is a phrase, and its second copy in a row is already a loop the user must not see. */
const LONG_UNIT = 12;
/** CJK, kana and Hangul carry a token or more per character, so six of them (three or more wide) are a phrase too. */
const WIDE_UNIT = 6;
const WIDE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
/** The tail rule looks this far back, so a repeated paragraph of up to half of it is caught. */
const TAIL_WINDOW = 800;
/** A match this short at the end is withheld without checks: it costs the reader one token of latency at most. */
const QUICK_HOLD = 3;
/** A sentence or line this long that the answer already said, word for word, is a loop even when something came between. */
const SEGMENT_MIN = 24;
const SEGMENT_TAIL = /[\s.!?。！？．…]+$/u;
/* The same sentence as a bullet and inside a paragraph is still said twice. */
const BULLET = /^[-*•+]\s+/u;
/** Words said again in order (a CJK character counts half); at 8, restated maths and quotes tripped it. */
const ECHO_WORDS = 10;
/** A tail this long that matches earlier words waits off screen until it diverges or completes an echo. */
const ECHO_HOLD = 3;
const CJK_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const WORD_CHAR = /[\p{L}\p{N}\p{M}]/u;
const LIST_SEPARATOR = /[,،、，;；・]/u;
const WORD = /[\p{L}\p{N}\p{M}]/u;
/** A name runs on past these (ベネチア・コルポ・クラブ・ソープ, Saint-Exupéry), so a copy followed by one is not whole. */
const JOINER = /[・·‧'’_\-‐‑]/u;
/* JSON fields, table rows and code lines repeat as data ("author": "George Orwell" for two of his books). */
const DATA_LINE = /^\s*[[{|<]|"[^"\n]*"\s*:|[;{[(]\s*$|^\s*(?:"[^"\n]*"|[\d.+-]+|true|false|null)\s*,\s*$/u;
/* F423: every rule reads the words, not the markup: a heading's #s and an item's bullet or number open a line (1. 1) (1) 1、 א. 一、 ①), */
const HEADING = /#{1,6}(?=[ \t])/uy;
const ITEM_MARK = /(?:[-*+•·▪◦‣](?=[ \t])|\d{1,3}[.)．](?=\s|[*_]|$)|\d{1,3}、|[(（](?:\d{1,3}|[א-ת]|[一二三四五六七八九十]{1,3})[)）]|[א-ת][.)](?=[ \t])|[一二三四五六七八九十]{1,3}、|[①-⑳])/uy;
/* and emphasis, inline code and quotation marks stand anywhere ("**האם צריך?** כולם אומרים: האם צריך?" is one phrase twice). */
const EMPHASIS = /\*\*|__|~~|[*_`]/uy;
const QUOTE = /["“”„‟«»「」『』＂]/u;
const APOSTROPHE = /['‘’]/u;
/** An item this long, or of two words or more, listed a second time is a loop anywhere in the answer. */
const ITEM_MIN = 8;
/* F426: a shorter item listed again in the same list is a loop once that list holds this many distinct items; an answer key ("True", "False") never does. */
const ENUMERATION = 5;
/* The same short item this many times in a row is a loop in any list ("1. Yes 2. Yes …"); round 111's short-unit rule cut it there too. */
const SAME_RUN = 8;
const PAREN = /\s*[(（[［]([^()（）[\]［］\n]*)[)）\]］]/gu;
const OPEN_PAREN = /\s*[(（[［]([^()（）[\]［］\n]*)$/u;
const wordRe = (alt: string) => new RegExp(`(?<![\\p{L}])(?:${alt})(?![\\p{L}])`, "iu");
/* An item the model marks as said again ("Clownfish (again, as listed before…)"), in the 8 app locales: "again" counts when the item was listed, */
const AGAIN = wordRe(
  "again|once more|repeat|as before|as above|שוב|חוזר|כנ\"ל|wieder|nochmals|wie oben|otra vez|de nuevo|como antes|encore|comme avant|di nuovo|come prima|novamente|de novo|снова|опять|повтор\\p{L}*|再び|再度|もう一度|繰り返し|重复|再次",
);
/* and "listed before" or "duplicate" on its own. */
const REPEATED = wordRe(
  "repeated|duplicated?|duplicates|(?:as )?(?:listed|mentioned) (?:above|before|earlier)|already (?:listed|mentioned|included)|שכבר (?:הוזכר|נמנה)|wiederholt|bereits (?:genannt|aufgeführt|erwähnt)|repetid[oa]|ya (?:mencionad|listad)[oa]|r[ée]p[ée]t[ée]e?|déjà (?:cité|mentionné|listé)e?|ripetut[oa]|già (?:citat|menzionat|elencat)[oa]|j[áa] (?:mencionad|listad)[oa]|уже (?:упомянут|перечислен)\\p{L}*|重複|前述|上記|上述",
);
const TRAILING_MARK = new RegExp(`[\\s,，、;–—-]+(?:${AGAIN.source}|${REPEATED.source})$`, "iu");

interface ItemKey {
  /** The item's words, lower-cased, without parentheticals, trailing punctuation or a repeat word. */
  key: string;
  /** Its parentheticals: "Dolphin (bottlenose)" and "Dolphin (river)" are two items, "Dolphin" and either one are the same. */
  note: string;
  /** 2: the item says it was listed before; 1: it says "again". */
  marked: 0 | 1 | 2;
  /** Round 111's key: the words with their parentheticals. */
  full: string;
}

function itemKey(words: string): ItemKey {
  const full = words.replace(ITEM_TAIL, "").trim().toLowerCase();
  const notes: string[] = [];
  let rest = words.replace(PAREN, (_m, x: string) => (notes.push(x), " "));
  rest = rest.replace(OPEN_PAREN, (_m, x: string) => (notes.push(x), ""));
  let key = rest.replace(/\s+/gu, " ").replace(ITEM_TAIL, "").trim().toLowerCase();
  let marked: 0 | 1 | 2 = 0;
  const trailing = TRAILING_MARK.exec(key);
  if (trailing && trailing.index > 0) {
    notes.push(trailing[0]);
    key = key.slice(0, trailing.index).replace(ITEM_TAIL, "").trim();
  }
  for (const x of notes) marked = REPEATED.test(x) ? 2 : AGAIN.test(x) && marked < 2 ? 1 : marked;
  if (!LETTER.test(key)) return { key: full, note: "", marked: 0, full };
  return { key, note: notes.join(" ").replace(/\s+/gu, " ").trim().toLowerCase(), marked, full };
}

/**
 * F426: whether s[a, b) is made of short list items only ("True", "False", "B") that hold two answers or more, or are
 * numbered: an answer key repeats its answers on purpose, and the item rule, which reads each item, owns short items.
 */
function answerKeyRun(s: string[], text: string, items: Normalized["items"]): (a: number, b: number) => boolean {
  if (!items.length) return () => false;
  const owner = new Int32Array(s.length).fill(-1);
  const keyOf: string[] = [];
  const numbered: boolean[] = [];
  for (const [m, { idx, line }] of items.entries()) {
    let e = idx;
    while (e < s.length && s[e] !== "\n") e++;
    const it = itemKey(s.slice(idx, e).join(""));
    keyOf.push(itemQualifies(it.full) || !LETTER.test(it.key) ? "" : it.key);
    numbered.push(/^[ \t]*(?:\*\*)?\d/u.test(text.slice(line, line + 8)));
    for (let k = idx; k < e; k++) owner[k] = m;
  }
  return (a, b) => {
    const seen = new Set<string>();
    let counted = true;
    for (let k = a; k < b; k++) {
      if (s[k] === "\n") continue;
      const m = owner[k]!;
      if (m < 0 || !keyOf[m]) return false;
      seen.add(keyOf[m]!);
      counted &&= numbered[m]!;
    }
    return seen.size >= 2 || (seen.size === 1 && counted);
  };
}

/** Which list each item belongs to: items at one indent under one parent, until a line of text at that indent or less ends the list. */
function listIds(text: string, items: { line: number }[]): number[] {
  const itemAt = new Map(items.map((x, m) => [x.line, m]));
  const ids: number[] = [];
  const open: { indent: number; id: number }[] = [];
  let next = 0;
  /* F428: "1.\nsein – to be": a marker alone on its line takes the next line as its words. */
  let bare = false;
  for (let pos = 0; pos <= text.length; ) {
    let eol = text.indexOf("\n", pos);
    if (eol < 0) eol = text.length;
    const lineText = text.slice(pos, eol);
    if (lineText.trim()) {
      const indent = Math.floor(/^[ \t]*/u.exec(lineText)![0].replace(/\t/gu, "    ").length / 2);
      const m = itemAt.get(pos);
      if (m !== undefined) {
        while (open.length && open.at(-1)!.indent > indent) open.pop();
        if (!open.length || open.at(-1)!.indent < indent) open.push({ indent, id: next++ });
        ids[m] = open.at(-1)!.id;
        bare = /^\s*(?:\*\*)?(?:\d{1,3}[.)．]|[-*•+])(?:\*\*)?\s*$/u.test(lineText);
      } else if (bare) bare = false;
      else while (open.length && open.at(-1)!.indent >= indent) open.pop();
    }
    pos = eol + 1;
  }
  return ids;
}
const ITEM_TAIL = /[\s.!?。！？．…,;，、；]+$/u;
/* F428: an item's head ends where its gloss or note starts ("sein (to be)", "sein: zu sein", "gehen – to go", "zu tun → to do"). */
const HEAD_END = /\s*[(（[［]|[:：](?=\s|$)|\s[–—-]\s|\s(?:→|->)\s|[,，](?=\s)|\s·|·\s/u;
/* A head listed again before its list holds five distinct heads waits off screen this many items for the fifth; an answer key never brings it. */
const HEAD_WAIT = 3;

/** F428: the words before the item's gloss or note, keyed like the item; the item's own key when nothing follows its head. */
function headOf(words: string, it: ItemKey): string {
  const m = HEAD_END.exec(words);
  if (!m || m.index === 0) return it.key;
  const head = itemKey(words.slice(0, m.index)).key;
  return LETTER.test(head) ? head : it.key;
}
/* "**Advantages:**" heads each option's sub-list. */
const LABEL = /[:：]\s*$/u;
/* A worked sum repeats its products and phrasing from step to step ("$123 \times 2 = 246$" for 274 and again for 283). */
const MATH = /\d\$?\s*(?:[=×÷+−]|\\(?:times|div|cdot)\b|\s[*/-]\s)\s*\$?\d/u;
const NUMBER = /^\d[\d.,]*$/u;
/* A cut right before a closing quote or bracket keeps it when the kept line opened it ("「東京" + "」"). */
const CLOSERS: Record<string, string> = { "」": "「", "』": "『", "）": "（", ")": "(", "］": "［", "]": "[", "】": "【", "”": "“", "»": "«", "〉": "〈", "》": "《" };

export interface LoopContext {
  /** The user's own message for this answer: repetition they asked for is not a loop (F389). */
  request?: string;
}

export interface RepetitionRequest {
  asked: boolean;
  /** The number of copies or lines asked for, when the ask names one. */
  count?: number;
}

const NUMBER_WORDS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, twenty: 20,
  zwei: 2, drei: 3, vier: 4, "fünf": 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10,
  dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7, huit: 8, neuf: 9, dix: 10,
  dois: 2, duas: 2, "três": 3, quatro: 4, sete: 7, oito: 8, nove: 9, dez: 10,
  "두": 2, "세": 3, "네": 4, "다섯": 5, "여섯": 6, "일곱": 7, "여덟": 8, "아홉": 9, "열": 10,
  "二": 2, "两": 2, "兩": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10,
};
const NUM = `\\d{1,3}|${Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length).join("|")}`;
/* "five times", "3 lines", "fünfmal", "cinco veces", "5回", "다섯 번", "五遍". */
const COUNTED = new RegExp(`(?<![\\p{Script=Latin}\\d])(${NUM})[ \\-]?(?:x\\b|×|times\\b|lines\\b|copies\\b|mal\\b|zeilen\\b|veces\\b|l[ií]neas\\b|fois\\b|lignes\\b|vezes\\b|linhas\\b|回|遍|次|行|번|줄)`, "iu");
/* Layout words ("one per line") are not an ask for repetition: a list of 30 animals one per line repeats no animal. */
const ASKED = /\b(?:repeat|over and over|chorus|refrain|lyrics|wiederhol|liedtext|repit|estribillo|coro\b|letra|r[ée]p[èée]t|paroles|repet|refr[ãa]o)|繰り返|くりかえ|リフレイン|サビ|歌詞|반복|후렴|가사|重複|重复|副歌|歌词/iu;

/* A song or a hymn may double a line, its chorus ("Glory, glory, hallelujah!"); a poem nobody asked a refrain of may not. */
const VERSE = /\b(?:song|hymn|lullaby|lied\b|canci[oó]n|chanson|can[çc][aã]o)|歌|童謡|노래/iu;

/** Whether the user asked for repetition (repeat N times, write N lines, a chorus), in the 8 app locales. */
export function repetitionRequest(request: string): RepetitionRequest {
  const text = request.normalize("NFC");
  const m = COUNTED.exec(text);
  const word = m?.[1]?.toLowerCase();
  const count = word === undefined ? undefined : /^\d+$/u.test(word) ? Number(word) : NUMBER_WORDS[word];
  const asked = count !== undefined || ASKED.test(text);
  return count !== undefined && count >= 2 ? { asked, count: Math.min(count, COUNT_CAP) } : { asked };
}

const flat = (s: string) => s.replace(/\s+/gu, " ").trim().toLowerCase();

interface Normalized {
  /** Code points, horizontal whitespace runs as " ", runs holding a line break as "\n"; markup and leading whitespace dropped. */
  cps: string[];
  /** UTF-16 offset in the input where each normalized code point starts, plus one entry for the end. */
  at: number[];
  /** UTF-16 offset where each normalized code point ends in the input: a cut right after one keeps no markup that follows it. */
  end: number[];
  /** Each list item: the normalized index its words start at, and the input offset its line starts at. */
  items: { idx: number; line: number }[];
}

function markAt(re: RegExp, text: string, i: number): number {
  re.lastIndex = i;
  return re.exec(text)?.[0].length ?? 0;
}

function normalize(text: string): Normalized {
  const cps: string[] = [];
  const at: number[] = [];
  const end: number[] = [];
  const items: Normalized["items"] = [];
  /* Before a line's first word, where a heading mark or an item marker may stand. */
  let lineStart = true;
  let line = 0;
  let heading = false;
  let item = false;
  for (let i = 0; i < text.length; ) {
    const cp = String.fromCodePoint(text.codePointAt(i)!);
    if (/\s/u.test(cp)) {
      const last = cps.length - 1;
      if (last >= 0 && (cps[last] === " " || cps[last] === "\n")) {
        if (cp === "\n") cps[last] = "\n";
        if (end[last] === i) end[last] = i + cp.length;
      } else if (last >= 0) {
        cps.push(cp === "\n" ? "\n" : " ");
        at.push(i);
        end.push(i + cp.length);
      }
      if (cp === "\n") {
        lineStart = true;
        line = i + 1;
        heading = item = false;
      }
      i += cp.length;
      continue;
    }
    let skip = 0;
    if (lineStart) {
      skip = markAt(HEADING, text, i);
      if (skip) heading = true;
      else if ((skip = markAt(ITEM_MARK, text, i)) && !heading && !item) {
        item = true;
        items.push({ idx: cps.length, line });
      }
    }
    if (!skip) skip = markAt(EMPHASIS, text, i);
    if (!skip && (QUOTE.test(cp) || (APOSTROPHE.test(cp) && !(WORD_CHAR.test(text[i - 1] ?? "") && WORD_CHAR.test(text[i + 1] ?? ""))))) skip = cp.length;
    if (skip) {
      i += skip;
      continue;
    }
    cps.push(cp);
    at.push(i);
    end.push(i + cp.length);
    lineStart = false;
    i += cp.length;
  }
  at.push(text.length);
  return { cps, at, end, items };
}

/** The input offset right after normalized code point k - 1: where a cut before k ends. */
const cutAt = (end: number[], k: number): number => (k <= 0 ? 0 : end[k - 1]!);

/** Whether the input line holding each normalized code point is a data line; read on the input, where the quotes still are. */
function dataLines(text: string, at: number[]): boolean[] {
  const out: boolean[] = [];
  let lineEnd = -1;
  let data = false;
  for (let k = 0; k < at.length - 1; k++) {
    const x = at[k]!;
    if (x > lineEnd) {
      const st = text.lastIndexOf("\n", x - 1) + 1;
      lineEnd = text.indexOf("\n", x);
      if (lineEnd < 0) lineEnd = text.length;
      data = DATA_LINE.test(text.slice(st, lineEnd));
    }
    out.push(data);
  }
  return out;
}

/** Fenced code (``` … ```, an unclosed fence runs to the end) repeats lines on purpose. */
function codeSpans(text: string): [number, number][] {
  const spans: [number, number][] = [];
  const re = /```[\s\S]*?(?:```|$)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    spans.push([m.index, m.index + m[0].length]);
    if (m[0].length === 0) re.lastIndex++;
  }
  return spans;
}

function periodic(s: string[], from: number, len: number, q: number): boolean {
  for (let k = from; k + q < from + len; k++) if (s[k] !== s[k + q]) return false;
  return true;
}

/* Where a copy should start: right after a sentence end or a line break when the rotation allows it, so the kept copy reads as a sentence. */
function boundary(s: string[], a: number): number {
  if (a === 0 || s[a - 1] === "\n") return 3;
  const prev = s[a - 1]!;
  if (TERMINATORS.has(prev)) return 2;
  if (prev === " " && a >= 2 && TERMINATORS.has(s[a - 2]!)) return 2;
  if (prev === " ") return 1;
  return 0;
}

/**
 * Finds degenerate repetition in a streamed answer: a unit of 8 or more code points repeated three times in a row
 * anywhere in the last 600 code points (fenced code never counts), or a shorter unit running 32 code points. No
 * whitespace is needed, so CJK loops are found like Latin ones. Null when the text is healthy.
 */
export function detectLoop(text: string, context: LoopContext = {}): LoopHit | null {
  if (!text) return null;
  const request = context.request ? flat(context.request) : "";
  const ask = request ? repetitionRequest(context.request!) : { asked: false };
  /* How many copies of this unit the user asked for; more than that is a loop. */
  const allowed = (a: number, p: number): number => {
    if (!request) return REPEATS - 1;
    const unit = s.slice(a, a + p);
    let quoted = false;
    for (let r = 0; r < p && !quoted; r++) {
      const rot = flat([...unit.slice(r), ...unit.slice(0, r)].join(""));
      quoted = rot.length >= MIN_UNIT / 2 && request.includes(rot);
    }
    if (quoted || (ask.asked && (ask.count !== undefined || unit.includes("\n")))) return Math.max(REPEATS - 1, ask.count ?? ASKED_CAP);
    return REPEATS - 1;
  };
  const { cps: s, at, end, items } = normalize(text);
  const n = s.length;
  const from = Math.max(0, n - WINDOW);
  const answerKey = answerKeyRun(s, text, items);
  const code = codeSpans(text);
  const inCode = (a: number, b: number) => code.some(([x, y]) => at[a]! < y && at[b]! > x);
  const hasLetter = (a: number, len: number) => s.slice(a, a + len).some((c) => LETTER.test(c));
  /* A copy whose separator has not streamed yet still counts when the text ends right there. */
  const span = (a: number, len: number, p: number) => len + (a + len === n && /\s/u.test(s[a + p - 1]!) ? 1 : 0);
  /* The region s[a, a + len) has period p and holds at least two copies; is it a loop? */
  const qualifies = (a: number, regionLen: number, p: number): boolean => {
    const len = span(a, regionLen, p);
    if (p < MIN_UNIT) {
      if (len < Math.max(SHORT_RUN, SHORT_REPEATS * p) || !hasLetter(a, p)) return false;
    } else {
      if (len < REPEATS * p || !hasLetter(a, p)) return false;
      /* A unit that is itself a short unit repeated ("ha ha ha ") is judged by the short rule. */
      for (let q = 1; q < MIN_UNIT; q++) if (periodic(s, a, regionLen, q)) return false;
      /* A doubled unit is judged at its own period, so a requested count is not dodged by pairing copies. */
      if (request) for (let q = MIN_UNIT; q < p; q++) if (periodic(s, a, regionLen, q)) return false;
      if (request && Math.floor(len / p) <= allowed(a, p)) return false;
    }
    return !inCode(a, a + regionLen) && !answerKey(a, a + p);
  };
  let best: { a: number; p: number } | null = null;
  for (let p = 1; p <= Math.floor((n - from + 1) / REPEATS); p++) {
    let j = from;
    while (j + p < n) {
      if (s[j] !== s[j + p]) {
        j++;
        continue;
      }
      const a = j;
      if (best && a >= best.a) break;
      while (j + p < n && s[j] === s[j + p]) j++;
      if (qualifies(a, j - a + p, p)) {
        best = { a, p };
        break;
      }
    }
  }
  if (!best) return null;

  let { a } = best;
  const { p } = best;
  /* The loop may have begun before the window: walk back to its first copy. */
  while (a > 0 && s[a - 1] === s[a - 1 + p]) a--;
  let e = a;
  while (e + p < n && s[e] === s[e + p]) e++;
  const copies = Math.floor(span(a, e - a + p, p) / p);
  /* Any rotation inside the first period is the same loop; start the copy on the best boundary. */
  let start = a;
  let score = boundary(s, a);
  for (let r = a + 1; r < a + p && r + p <= n && score < 3; r++) {
    const b = boundary(s, r);
    if (b > score && s[r] !== " " && s[r] !== "\n") {
      start = r;
      score = b;
    }
  }
  const unit = s.slice(start, start + p).join("").trim();
  /* Asked for five, got eight: keep the five. */
  const asked = p >= MIN_UNIT && request ? allowed(start, p) : REPEATS - 1;
  const keepCopies = asked > REPEATS - 1 ? Math.min(asked, copies - 1) : 1;
  const keepAt = Math.min(start + keepCopies * p, n);
  return { unit, repeats: copies, start: at[start]!, keep: cutAt(end, keepAt) };
}

/** What the tail rule found at the end of a streamed answer (F415). */
export interface TailCheck {
  /** UTF-16 code units at the end of the text to keep off screen for now: they may be the start of a copy. */
  hold: number;
  /** A copy past what is allowed was completed; `keep` ends the last allowed copy. */
  hit: LoopHit | null;
}

/** Copies of the unit s[a, a + p) the user asked for, or 0 when the ask names none for it. */
function askedCopies(s: string[], a: number, p: number, request: string, ask: RepetitionRequest): number {
  if (!request) return 0;
  const unit = s.slice(a, a + p);
  for (let r = 0; r < p; r++) {
    const rot = flat([...unit.slice(r), ...unit.slice(0, r)].join(""));
    if (rot.length >= MIN_UNIT / 2 && request.includes(rot)) return ask.count ?? ASKED_CAP;
  }
  if (ask.asked && (ask.count !== undefined || unit.includes("\n"))) return ask.count ?? ASKED_CAP;
  return 0;
}

let repeatsMemo: { request: string; copies: number } | null = null;
/** Most back-to-back copies of a phrase in the user's text: a translation of "Merrily, merrily, merrily, merrily" repeats as often. */
export function requestRepeats(request: string): number {
  if (repeatsMemo?.request === request) return repeatsMemo.copies;
  const s = Array.from(flat(request));
  let copies = 1;
  for (let p = 4; p <= Math.min(200, Math.floor(s.length / 2)); p++) {
    let j = 0;
    while (j + p < s.length) {
      if (s[j] !== s[j + p]) {
        j++;
        continue;
      }
      const a = j;
      while (j + p < s.length && s[j] === s[j + p]) j++;
      /* The last copy of a phrase often lacks its separator ("merrily, merrily"). */
      const c = Math.floor((j - a + p + 1) / p);
      if (c > copies && s.slice(a, a + p).some((x) => LETTER.test(x))) copies = c;
    }
  }
  repeatsMemo = { request, copies };
  return copies;
}

/** The tail rule (F415): every end from `from` on is checked, so a copy completed mid-chunk is not missed; `final` is the end, where a separator never arrives. */
export function tailLoop(text: string, context: LoopContext = {}, from = 0, final = false): TailCheck {
  if (!text) return { hold: 0, hit: null };
  const request = context.request ? flat(context.request) : "";
  const ask = request ? repetitionRequest(context.request!) : { asked: false };
  const verse = request ? VERSE.test(context.request!) : false;
  const source = request ? requestRepeats(context.request!) : 1;
  const { cps: s, at, end: ends, items } = normalize(text);
  const n = s.length;
  const code = codeSpans(text);
  const inCode = (a: number, b: number) => code.some(([x, y]) => at[a]! < y && at[b]! > x);
  const data = dataLines(text, at);
  const answerKey = answerKeyRun(s, text, items);
  const cut = (k: number) => cutAt(ends, k);
  interface Verdict {
    /** Copies that may stand in a row before it is a loop. */
    allowed: number;
    /** Copies the answer keeps when it is: one, unless the user, the source text or a refrain asked for more. */
    kept: number;
    asked: boolean;
  }
  const verdicts = new Map<string, Verdict | null>();
  /* What the unit s[a, a + p) may do, or null when it can never be a loop here. */
  const verdictAt = (a: number, p: number, end: number): Verdict | null => {
    const key = `${a}:${p}`;
    const known = verdicts.get(key);
    if (known !== undefined) return known;
    let verdict: Verdict | null = null;
    const unit = s.slice(a, a + p);
    const wide = unit.filter((c) => WIDE.test(c)).length;
    const long = p >= LONG_UNIT || (p >= WIDE_UNIT && wide >= 3);
    let primitive = true;
    for (let q = 1; q < p && primitive; q++) if (periodic(s, a, Math.min(end - a, 2 * p), q)) primitive = false;
    /* "beide, beide, beide, beide": a word listed a fourth time is a loop; "Nein, nein, nein!" stops at three. */
    const listed = !long && p < MIN_UNIT && unit.some((c) => LIST_SEPARATOR.test(c));
    if ((long || p >= MIN_UNIT || listed) && primitive && unit.some((c) => LETTER.test(c)) && !inCode(a, end) && !answerKey(a, a + p)) {
      const base = long ? 1 : listed ? REPEATS : REPEATS - 1;
      /* One line of a song may come twice, its chorus; a whole stanza may not. */
      const line = verse && unit.filter((c) => c === "\n").length === 1 ? 2 : 0;
      const askedN = askedCopies(s, a, p, request, ask);
      const kept = Math.max(1, line, askedN, source);
      verdict = { allowed: Math.max(base, kept), kept, asked: askedN > 1 && askedN === kept };
    }
    verdicts.set(key, verdict);
    return verdict;
  };
  /* A copy is whole only where its word ends: "\nPhotosynthesis" is not said twice in "\nPhotosynthesis\nPhotosynthesis is…". */
  const goesOn = (end: number): boolean => {
    const last = s[end - 1]!;
    if (!WORD.test(last) || CJK_CHAR.test(last)) return false;
    if (end === n) return !final;
    const next = s[end]!;
    return next === " " || JOINER.test(next) || (WORD.test(next) && !CJK_CHAR.test(next));
  };
  /* The longest run at `end` where the text repeats itself p back, for every p. */
  const scan = (end: number, wantHit: boolean): { hold: number; hit: { a: number; p: number; kept: number; copies: number; asked: boolean } | null } => {
    if (wantHit && goesOn(end)) return { hold: 0, hit: null };
    let hold = 0;
    const maxP = Math.min(end - 1, TAIL_WINDOW / 2);
    for (let p = 2; p <= maxP; p++) {
      let k = end - 1;
      while (k - p >= 0 && s[k] === s[k - p] && end - k <= TAIL_WINDOW) k--;
      const r = end - 1 - k;
      if (r === 0 || (wantHit && r < p - 1)) continue;
      if (r <= QUICK_HOLD && !wantHit) {
        if (p >= WIDE_UNIT) hold = Math.max(hold, r);
        continue;
      }
      const a = end - r - p;
      const v = verdictAt(a, p, end);
      if (!v) {
        if (r <= QUICK_HOLD && p >= WIDE_UNIT) hold = Math.max(hold, r);
        continue;
      }
      /* A last copy with every letter in place counts though its separator differs ("beide;") or never came (the end); a space means the phrase goes on ("one hundred and one"). */
      const rest = (r + p) % p;
      let trailing = 0;
      while (trailing < p && !WORD.test(s[a + p - 1 - trailing]!)) trailing++;
      const next = end < n ? s[end]! : undefined;
      const whole = rest > 0 && rest >= p - trailing && (next === undefined ? final : next !== " " && !WORD.test(next) && !JOINER.test(next));
      const copies = Math.floor((r + p) / p) + (whole ? 1 : 0);
      if (wantHit && copies > v.allowed) return { hold: 0, hit: { a, p, kept: v.kept, copies, asked: v.asked } };
      /* Past the copies it may keep, the unit waits off screen until it either stops repeating or is a loop. */
      hold = Math.max(hold, r + p - v.kept * p);
    }
    /* A short unit ("국면, ", "ha ") past its second copy waits off screen: emphasis ends in a token or two, a loop runs into the short rule. */
    if (!wantHit)
      for (let p = 1; p < MIN_UNIT && p <= maxP; p++) {
        let k = end - 1;
        while (k - p >= 0 && s[k] === s[k - p] && end - k <= TAIL_WINDOW) k--;
        const r = end - 1 - k;
        if (r > p && s.slice(end - r - p, end - r).some((c) => LETTER.test(c)) && !inCode(end - r - p, end)) hold = Math.max(hold, r - p);
      }
    return { hold, hit: null };
  };
  /* The segment rule: sentence and line ends where the segment repeats an earlier one, and how much of the tail to hold. */
  const segmentHits = new Map<number, number>();
  let segmentHold = 0;
  if (!ask.asked && source === 1) {
    /* A poem may bring a line back once as a refrain; everything else is said once. */
    const once = verse ? 2 : 1;
    const said = new Map<string, number>();
    const key = (a: number, b: number) => s.slice(a, b).join("").replace(SEGMENT_TAIL, "").trim().replace(BULLET, "");
    const inputKey = (a: number, b: number) => text.slice(cut(a), cut(b)).replace(/\s+/gu, " ").replace(SEGMENT_TAIL, "").trim().replace(BULLET, "");
    let st = 0;
    for (let i = 0; i < n; i++) {
      if (s[i] !== "\n" && !TERMINATORS.has(s[i]!)) continue;
      if (i + 1 < n && TERMINATORS.has(s[i + 1]!)) continue;
      const k = key(st, i + 1);
      if (Array.from(k).length >= SEGMENT_MIN && LETTER.test(k) && !DATA_LINE.test(inputKey(st, i + 1)) && !inCode(st, i + 1)) {
        const seen = said.get(k) ?? 0;
        if (seen >= once) {
          if (!segmentHits.has(i + 1)) segmentHits.set(i + 1, st);
        } else said.set(k, seen + 1);
      }
      st = i + 1;
    }
    while (st < n && /\s/u.test(s[st]!)) st++;
    const rest = s.slice(st, n).join("");
    if (rest && !inCode(st, n)) {
      const k = rest.replace(SEGMENT_TAIL, "").trim().replace(BULLET, "");
      const head = rest.trimEnd().replace(BULLET, "");
      if (final && (said.get(k) ?? 0) >= once) segmentHits.set(n, st);
      else if (head) for (const [x, seen] of said) if (seen >= once && x.startsWith(head)) segmentHold = n - st;
    }
  }
  /* The item rule (F423, F426): an item listed again, whatever its number, is a loop on its second copy (device list30-animals #2). */
  const itemHits = new Map<number, { line: number; unit: string }>();
  let itemHold = 0;
  if (!ask.asked && source === 1) {
    /* A list the user gave that lists an item twice (to translate, sort or fix) may be answered with it twice. */
    const once = Math.max(verse ? 2 : 1, request ? requestItems(context.request!) : 1);
    const lists = listIds(text, items);
    /* Each item said so far: its parenthetical, its list and its full words, by key. */
    const listed = new Map<string, { note: string; list: number; full: string }[]>();
    const distinct = new Map<number, Set<string>>();
    /* Per list: the item said last, how many times in a row, and where its second copy is. */
    const runs = new Map<number, { key: string; count: number; second: number }>();
    const keys: string[] = [];
    const firstAt = new Map<string, number>();
    /* Earlier copies of `it`: in its own list, notes aside ("Dolphin (multiple species)" is "Dolphin"); in another list, word for word and two words or 8 code points long. */
    const copiesOf = (it: ItemKey, key: string, list: number, long: boolean) =>
      (listed.get(key) ?? []).filter((x) => (x.list === list ? x.note === "" || it.note === "" || x.note === it.note || it.marked > 0 : long && x.full === it.full)).length;
    /* A short item repeats only in an enumeration: "True" and "False" 30 times over is an answer key, not a loop. */
    const enumerates = (list: number, key: string) => (distinct.get(list)?.size ?? 0) >= ENUMERATION && Array.from(key).length > 1;
    /* F428: heads per list and marker kind ("1." items and "-" items at one indent are two lists); a list shown to be an answer key stops. */
    const groups = new Map<string, { heads: Map<string, number[]>; distinct: Set<string>; wait: { m: number; line: number; unit: string; since: number } | null; key: boolean }>();
    const lineText = (m: number) => {
      const st = items[m]!.line;
      const nl = text.indexOf("\n", st);
      return text.slice(st, nl < 0 ? text.length : nl);
    };
    const indentAt = (m: number) => indentOf(/^[ \t]*/u.exec(lineText(m))![0]);
    /* A run of one marker kind broken by another starts a new group ("**2. フォーマット例**" between two bullet runs), unless its numbers go on. */
    const groupIds: string[] = [];
    const lastKind = new Map<number, string>();
    const lastNum = new Map<string, number>();
    const segment = new Map<string, number>();
    for (let m = 0; m < items.length; m++) {
      const list = lists[m] ?? -1;
      const lead = /^[ \t]*(?:\*\*|__)?(?:(\d{1,3})|(\S))/u.exec(lineText(m));
      const num = lead?.[1] === undefined ? undefined : Number(lead[1]);
      const kindKey = `${list}\u0001${num === undefined ? (lead?.[2] ?? "") : "n"}`;
      const prev = lastKind.get(list);
      let sg = segment.get(kindKey) ?? 0;
      if (prev !== undefined && prev !== kindKey && !(num !== undefined && num === (lastNum.get(kindKey) ?? -2) + 1)) sg++;
      segment.set(kindKey, sg);
      if (num !== undefined) lastNum.set(kindKey, num);
      lastKind.set(list, kindKey);
      groupIds[m] = `${kindKey}\u0001${sg}`;
    }
    const groupOf = (m: number) => {
      const id = groupIds[m]!;
      let g = groups.get(id);
      if (!g) groups.set(id, (g = { heads: new Map(), distinct: new Set(), wait: null, key: false }));
      return g;
    };
    const ends: number[] = [];
    /* Whether item m heads a sub-list (a category, not a gloss), and the end at which that is known; -1 while the next line may still be an item. */
    const kidsOf = (m: number): { at: number; kids: boolean } => {
      const e = ends[m]!;
      if (e >= n) return { at: n, kids: false };
      const nx = items[m + 1];
      if (nx && nx.idx === e + 1) return nx.idx < n ? { at: nx.idx + 1, kids: indentAt(m + 1) > indentAt(m) } : { at: -1, kids: false };
      let x = e + 1;
      while (x < n && s[x] !== "\n") x++;
      return x < n || (final && e + 1 < n) ? { at: Math.min(x + 1, n), kids: false } : final ? { at: n, kids: false } : { at: -1, kids: false };
    };
    for (const [m, { idx, line }] of items.entries()) {
      let e = idx;
      while (e < n && s[e] !== "\n") e++;
      ends[m] = e;
      const raw = text.slice(line, e < n ? at[e] : text.length);
      const words = s.slice(idx, e).join("");
      const it = itemKey(words);
      const k = it.key;
      /* A line still streaming that ends in "(" is an item about to add a note, not a code line yet. */
      const skip = DATA_LINE.test(e < n || final ? raw : raw.replace(/[;{[(]\s*$/u, "")) || MATH.test(raw) || inCode(idx, e);
      keys.push(skip ? `\u0000${m}` : k);
      if (skip) continue;
      const list = lists[m] ?? -1;
      const long = itemQualifies(it.full);
      if (e < n || final) {
        if (!firstAt.has(k)) firstAt.set(k, m);
        if (LABEL.test(words) || !LETTER.test(k)) continue;
        const copies = copiesOf(it, k, list, long);
        const repeat = it.marked === 2 || (it.marked === 1 && listed.has(k)) || (copies >= once && (long || enumerates(list, k)));
        const done = e < n ? e + 1 : n;
        const run = runs.get(list);
        if (run?.key === k) {
          run.count++;
          if (run.count === 2) run.second = m;
        } else runs.set(list, { key: k, count: 1, second: m });
        if (!repeat && (runs.get(list)!.count < Math.max(SAME_RUN, once + 1) || itemHits.has(done))) {
          listed.set(k, [...(listed.get(k) ?? []), { note: it.note, list, full: it.full }]);
          distinct.set(list, (distinct.get(list) ?? new Set()).add(k));
        } else if (!repeat) itemHits.set(done, { line: items[runs.get(list)!.second]!.line, unit: k });
        else if (!itemHits.has(done)) {
          /* A list restarted from scratch repeats its short items too ("1. Apple … 5. Elderberry"): the copy starts where the block does. */
          let a = m;
          let b = firstAt.get(k)!;
          while (b > 0 && a - 1 > b && keys[a - 1] === keys[b - 1]) {
            a--;
            b--;
          }
          itemHits.set(done, { line: items[a]!.line, unit: k });
        }
        if (repeat) continue;
        /* F428: in an enumeration the head is the item: "sein (to be)" then "sein (to exist)", or "gehen – to go" then "gehen – to go on a trip", is one verb twice. */
        const g = groupOf(m);
        if (g.key) continue;
        const h = headOf(words, it);
        const before = g.heads.get(h) ?? [];
        let again = false;
        if (Array.from(h).length > 1 && before.length >= once && !before.some((x) => kidsOf(x).kids)) {
          const next = kidsOf(m);
          if (next.at < 0) {
            itemHold = Math.max(itemHold, text.length - line);
            continue;
          }
          if (!next.kids) {
            again = true;
            if (!g.wait) {
              if (g.distinct.size < ENUMERATION) g.wait = { m, line, unit: h, since: 0 };
              else if (!itemHits.has(next.at)) itemHits.set(next.at, { line, unit: h });
              continue;
            }
          }
        }
        if (!again) {
          g.heads.set(h, [...before, m]);
          g.distinct.add(h);
        }
        if (g.wait && g.distinct.size >= ENUMERATION) {
          if (!itemHits.has(done)) itemHits.set(done, { line: g.wait.line, unit: g.wait.unit });
          g.wait = null;
        } else if (g.wait && ++g.wait.since >= HEAD_WAIT) {
          g.wait = null;
          g.key = true;
        }
      } else if (k) {
        /* The item still streaming may turn out a copy: its line waits off screen until it ends. */
        let wait = it.marked > 0;
        for (const x of listed.keys()) {
          if (wait) break;
          if (!x.startsWith(k)) continue;
          const xLong = itemQualifies(x);
          wait = copiesOf(it, x, list, xLong) >= once && (xLong || enumerates(list, x));
        }
        const g = groupOf(m);
        if (!wait && !g.key) {
          const cut = HEAD_END.exec(words);
          if (cut && cut.index > 0) wait = (g.heads.get(headOf(words, it))?.length ?? 0) >= once;
          else if (!cut) for (const [x, at] of g.heads) if (at.length >= once && x.startsWith(k)) wait = true;
        }
        if (wait) itemHold = text.length - line;
      }
    }
    /* A repeated head waiting for its list's fifth distinct head stays off screen until then, or until the list ends. */
    const starts = new Set(items.map((x) => x.idx));
    for (const g of groups.values()) {
      if (!g.wait || final) continue;
      let ended = false;
      for (let p = ends[g.wait.m]! + 1; p < n && !ended; ) {
        let q = p;
        while (q < n && s[q] !== "\n") q++;
        if (q >= n) break;
        ended = q > p && !starts.has(p);
        p = q + 1;
      }
      if (!ended) itemHold = Math.max(itemHold, text.length - g.wait.line);
    }
  }
  /* A rotation may start inside a word ("he light … ATP. T"): the cut backs up to the word's start. */
  const midWord = (k: number) => k > 0 && k < n && WORD_CHAR.test(s[k - 1]!) && WORD_CHAR.test(s[k]!) && !CJK_CHAR.test(s[k - 1]!) && !CJK_CHAR.test(s[k]!);
  const lineAt = (k: number) => {
    let x = k;
    while (x > 0 && s[x - 1] !== "\n") x--;
    return x;
  };
  /* An echo that starts mid-sentence or mid-item takes that sentence or item with it: "18. La única" or "*   **הגשה" left on screen reads as a glitch (round 110 web trials). */
  const opening = (k: number, source: number): number => {
    let x = k;
    while (x > 0 && s[x - 1] !== "\n" && !(s[x - 1] === " " && TERMINATORS.has(s[x - 2] ?? "")) && !"。！？".includes(s[x - 1]!)) x--;
    return source < x ? x : k;
  };
  const keepAt = (k: number): number => {
    let x = cut(k);
    let line = text.slice(text.lastIndexOf("\n", x - 1) + 1, x);
    const tally = (c: string) => line.split(c).length - 1;
    for (let c = text[x]; c !== undefined; c = text[x]) {
      const o = c === '"' ? c : CLOSERS[c];
      if (!o || (c === '"' ? tally(c) % 2 === 0 : tally(o) <= tally(c))) break;
      line += c;
      x++;
    }
    return x;
  };
  let first = 0;
  while (first < n && at[first + 1]! <= from) first++;
  const echo = !ask.asked && source === 1 && !verse ? echoAt(s, first, final, (a, b) => inCode(a, b), data, answerKey) : { hit: null, hold: 0 };
  for (let end = Math.min(Math.max(first + 1, 2 * WIDE_UNIT), n); end <= n; end++) {
    if (echo.hit && echo.hit.end <= end) return { hold: 0, hit: { unit: s.slice(echo.hit.start, echo.hit.end).join("").trim(), repeats: 2, start: at[echo.hit.start]!, keep: keepAt(opening(echo.hit.start, echo.hit.source)) } };
    const again = segmentHits.get(end);
    if (again !== undefined) return { hold: 0, hit: { unit: s.slice(again, end).join("").trim(), repeats: 2, start: at[again]!, keep: keepAt(again) } };
    const relisted = itemHits.get(end);
    if (relisted) return { hold: 0, hit: { unit: relisted.unit, repeats: 2, start: relisted.line, keep: relisted.line } };
    const found = scan(end, true).hit;
    if (!found) continue;
    const { a, p, kept, copies, asked } = found;
    let keep = a + kept * p;
    /* A copy that starts on the sentence's own full stop leaves it with the first copy. */
    for (let x = 0; x < 2 && keep < end && TERMINATORS.has(s[keep]!); x++) keep++;
    const ls = lineAt(keep);
    if (keep > ls && a < ls && items.some((x) => x.idx === ls)) {
      /* "12. African Elephant\n13. Asian Elephant\n14. Asian…" repeats from "Afric|an": item 13 is kept whole, it is not the copy; otherwise the item the copy starts in goes. */
      let e = keep;
      while (e < n && s[e] !== "\n") e++;
      keep = e < end && e < a + (kept + 1) * p ? e : ls;
    } else if (midWord(keep)) {
      let back = keep;
      while (back > keep - p && midWord(back)) back--;
      if (!midWord(back)) keep = back;
    }
    return { hold: 0, hit: { unit: s.slice(a, a + p).join("").trim(), repeats: copies, start: at[a]!, keep: keepAt(keep), ...(asked ? { asked } : {}) } };
  }
  const hold = Math.max(scan(n, false).hold, segmentHold, echo.hold);
  return { hold: Math.max(hold > 0 ? text.length - cut(n - hold) : 0, itemHold), hit: null };
}

/** An item of two words or more (a CJK character counts half), or of 8 code points, with a letter in it. */
function itemQualifies(key: string): boolean {
  if (!LETTER.test(key)) return false;
  if (Array.from(key).length >= ITEM_MIN) return true;
  let words = 0;
  let inWord = false;
  for (const c of key) {
    if (CJK_CHAR.test(c)) {
      words += 0.5;
      inWord = false;
    } else if (WORD_CHAR.test(c)) {
      if (!inWord) words++;
      inWord = true;
    } else inWord = false;
  }
  return words >= 2;
}

let itemsMemo: { request: string; copies: number } | null = null;
/** Most times one item is listed in the user's own text: a list to translate or sort may repeat an item as often. */
export function requestItems(request: string): number {
  if (itemsMemo?.request === request) return itemsMemo.copies;
  const { cps, items } = normalize(request);
  const counts = new Map<string, number>();
  let copies = 1;
  for (const { idx } of items) {
    let e = idx;
    while (e < cps.length && cps[e] !== "\n") e++;
    const words = cps.slice(idx, e).join("");
    const it = itemKey(words);
    if (!LETTER.test(it.key)) continue;
    /* F428: the answer's rule reads heads, so a head the user listed twice may come twice. */
    for (const k of new Set([it.key, `\u0001${headOf(words, it)}`])) {
      const c = (counts.get(k) ?? 0) + 1;
      counts.set(k, c);
      copies = Math.max(copies, c);
    }
  }
  itemsMemo = { request, copies };
  return copies;
}

/* The copy often opens with a word swapped ("their ways" for "their way"): walk back over single swaps while two words on each side match. */
function echoStart(words: Word[], i: number, j: number, earlierEnd: number): { a: number; b: number; numbers: boolean } {
  let a = i;
  let b = j;
  /* Whether a swapped word was a number both times: a worked step with new numbers, not a copy (device math-long-div #1). */
  let numbers = false;
  const same = (x: number, y: number) => x >= 0 && y >= 0 && words[x]!.w === words[y]!.w;
  const swapped = (x: number, y: number) => x >= 0 && y >= 0 && NUMBER.test(words[x]!.w) && NUMBER.test(words[y]!.w);
  for (;;) {
    if (a - 1 > earlierEnd && same(a - 1, b - 1)) {
      a--;
      b--;
    } else if (a - 3 > earlierEnd && same(a - 2, b - 2) && same(a - 3, b - 3)) {
      numbers ||= swapped(a - 1, b - 1);
      a -= 3;
      b -= 3;
    } else return { a, b, numbers: numbers || swapped(a - 1, b - 1) };
  }
}

/* An echo that opens its line takes the line's bullet and markdown with it ("*   **「" left alone reads as a glitch). */
function lineStart(s: string[], start: number): number {
  let k = start - 1;
  while (k >= 0 && s[k] !== "\n" && !WORD_CHAR.test(s[k]!)) k--;
  return k < 0 || s[k] === "\n" ? k + 1 : start;
}

interface Word {
  w: string;
  start: number;
  end: number;
  weight: number;
}

/** The answer's words over the normalized code points; code and data lines become words that match nothing. */
function wordsOf(s: string[], inCode: (a: number, b: number) => boolean, dataLine: boolean[]): Word[] {
  const words: Word[] = [];
  let st = -1;
  const push = (a: number, b: number, weight: number) => {
    const blocked = dataLine[a] || inCode(a, b);
    words.push({ w: blocked ? `\u0000${a}` : s.slice(a, b).join("").toLowerCase(), start: a, end: b, weight });
  };
  for (let i = 0; i <= s.length; i++) {
    const c = s[i];
    if (c !== undefined && WORD_CHAR.test(c) && !CJK_CHAR.test(c)) {
      if (st < 0) st = i;
      continue;
    }
    if (st >= 0) push(st, i, 1);
    st = -1;
    if (c !== undefined && CJK_CHAR.test(c)) push(i, i + 1, 0.5);
  }
  return words;
}

/** The echo rule (F415): a copy that drops the line breaks and punctuation ("…the sky They dance…") is still a loop. */
function echoAt(s: string[], first: number, final: boolean, inCode: (a: number, b: number) => boolean, data: boolean[], answerKey: (a: number, b: number) => boolean): { hit: { start: number; end: number; source: number } | null; hold: number } {
  const words = wordsOf(s, inCode, data);
  const seen = new Map<string, number[]>();
  let hit: { start: number; end: number; source: number } | null = null;
  let from = words.length;
  while (from > 0 && words[from - 1]!.end > first) from--;
  from = Math.max(0, from - 4 * ECHO_WORDS);
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const earlier = seen.get(w.w);
    if (i >= from && earlier)
      for (const j of earlier) {
        let weight = 0;
        for (let k = 0; i + k < words.length && j + k < i && words[j + k]!.w === words[i + k]!.w; k++) {
          weight += words[i + k]!.weight;
          if (weight >= ECHO_WORDS) {
            const back = echoStart(words, i, j, j + k);
            if (back.numbers && MATH.test(s.slice(words[back.a]!.start, words[i + k]!.end).join(""))) break;
            if (answerKey(words[back.a]!.start, words[i + k]!.end)) break;
            if (!hit || words[i + k]!.end < hit.end) hit = { start: lineStart(s, words[back.a]!.start), end: words[i + k]!.end, source: words[back.b]!.start };
            break;
          }
        }
      }
    if (earlier) earlier.push(i);
    else seen.set(w.w, [i]);
  }
  if (hit || final || !words.length) return { hit, hold: 0 };
  /* The tail: the longest run ending at the last word (still streaming when the text ends inside it) said before. */
  const last = words.length - 1;
  const open = words[last]!.end === s.length;
  let best = 0;
  for (let j = 0; j < last; j++) {
    const lw = words[last]!.w;
    if (!(open ? words[j]!.w.startsWith(lw) : words[j]!.w === lw)) continue;
    let weight = words[last]!.weight;
    let m = 1;
    while (j - m >= 0 && j < last - m && words[j - m]!.w === words[last - m]!.w) {
      weight += words[last - m]!.weight;
      m++;
    }
    if (weight >= ECHO_HOLD && j < last - m + 1) best = Math.max(best, s.length - words[last - m + 1]!.start);
  }
  return { hit: null, hold: best };
}

/** The one silent retry (F415); DRY 1.5 with presence 0.5 made the 0.8B model continue in emoji soup (docs/qa/fix-loops-root/retry-tuning). */
export const LOOP_RETRY: Pick<GenOpts, "repeatPenalty" | "dryMultiplier" | "presencePenalty" | "frequencyPenalty"> = {
  repeatPenalty: 1.15,
  dryMultiplier: 1.0,
  presencePenalty: 0.15,
  frequencyPenalty: 0.05,
};

/** F369's rules for units under 8 code points ("ha ha ha…", "大阪・大阪・…"); longer ones are the tail rule's. */
function shortLoop(text: string, context: LoopContext): LoopHit | null {
  const hit = detectLoop(text, context);
  if (!hit || Array.from(hit.unit).length >= MIN_UNIT) return null;
  /* "Merrily, merrily, merrily, merrily" translates to four "joyeux". */
  return context.request && hit.repeats <= requestRepeats(context.request) ? null : hit;
}

export interface LoopCut {
  /** The answer with the loop cut back to its first copy. */
  text: string;
  hit: LoopHit;
  /** Length of the answer before the cut. */
  fullLength: number;
}

/**
 * `trim`: replace the answer on screen with this text, silently (the silent retry continues after it).
 * `loop`: the retry looped too; the answer is `loop.text` and the "started repeating itself" notice shows.
 */
export type GuardedDelta = Delta & { loop?: LoopCut; trim?: string };

/* A copy that starts after "23." leaves the bare number behind, and whatever continues numbers its next item 24. */
const OPEN_ITEM = /(?<=\n)[ \t]*(?:\d{1,3}[.)．、]|[-*•+·]|[(（]\d{1,3}[)）]|[א-ת][.)]|[①-⑳])$/u;
/* An opening "**" with nothing after it, or a bracket or quote that opens the copy ("展望と目標（"). */
const OPEN_MARK = /(?<=^|\s)(?:\*\*|__|~~|[*_`])+$/u;
const OPENER = /[(（[［{「『“‘«〈《【]+$/u;
const NEXT_ITEM = /^[ \t]*\n\s*(?:\*\*)?(?:\d{1,3}[.)．、]|[-*•+·]|[(（]\d{1,3}[)）]|[א-ת][.)]|[①-⑳])/u;
const RESTART = /^\s*(?:\*\*)?1[.)．][ \t]/u;
const RESTART_INTRO = 2;
const INLINE_LIST = 4;
const ITEM_LINE = /(?:^|\n)[ \t]*(?:\d{1,3}[.)．、]|[-*•+·]|[(（]\d{1,3}[)）]|[א-ת][.)]|[①-⑳])[ \t][^\n]*$/u;

export function cutLoop(text: string, hit: LoopHit): LoopCut {
  let kept = text.slice(0, hit.keep);
  /* fr-list build 23: "8. …\nVoici une autre sélection de 30 idées :\n1. …": a restarted list's intro goes with it. */
  if (RESTART.test(text.slice(hit.keep))) {
    const lines = kept.replace(/\s+$/u, "").split("\n");
    let k = lines.length - 1;
    while (k >= 0 && !ITEM_OPEN.test(lines[k]!)) k--;
    const intro = lines.slice(k + 1).filter((l) => l.trim()).length;
    if (k >= 0 && intro > 0 && intro <= RESTART_INTRO) kept = `${lines.slice(0, k + 1).join("\n")}\n`;
  }
  for (let before = ""; before !== kept; ) {
    before = kept;
    kept = kept.trimEnd().replace(OPEN_ITEM, "").replace(OPEN_MARK, "").replace(OPENER, "");
  }
  /* The next item's number goes and its line break stays, so a continuation starts the next item (or whatever follows a list) on its own line. */
  const rest = text.slice(kept.length);
  if (NEXT_ITEM.test(rest) || (ITEM_LINE.test(kept) && /^[ \t]*\n/u.test(rest))) kept += "\n";
  return { text: closeMarks(kept), hit, fullLength: text.length };
}

/** Closes the emphasis a cut left open on the last line ("**Chlorophyll absorbs red light;" gets its "**"). */
function closeMarks(text: string): string {
  if ((text.match(/```/gu) ?? []).length % 2) return text;
  const line = text.slice(text.lastIndexOf("\n") + 1).replace(/^[ \t]*[*_](?=[ \t])/u, "");
  const open: string[] = [];
  let code = false;
  for (let i = 0; i < line.length; ) {
    const two = line.slice(i, i + 2);
    const mark = two === "**" || two === "__" || two === "~~" ? two : line[i] === "`" ? "`" : line[i] === "*" && (/\S/u.test(line[i + 1] ?? " ") || /\S/u.test(line[i - 1] ?? " ")) ? "*" : "";
    i += mark.length || 1;
    if (!mark || (code && mark !== "`")) continue;
    if (mark === "`") code = !code;
    if (open.at(-1) === mark) open.pop();
    else open.push(mark);
  }
  return text + open.reverse().join("");
}

/** One console line per cut, for the QA harness. */
export function describeLoopCut(cut: LoopCut): string {
  return `[chat] loop cut: kept ${cut.text.length} of ${cut.fullLength} chars, unit ${Array.from(cut.hit.unit).length} cp x${cut.hit.repeats}`;
}

/** One console line per silent retry, for the QA harness. */
export function describeLoopRetry(kept: string, hit: LoopHit): string {
  return `[chat] loop retry: kept ${kept.length} chars, unit ${Array.from(hit.unit).length} cp x${hit.repeats}`;
}

export interface GuardOptions extends LoopContext {
  /** Continues from `kept` once, like the chat's Continue with `LOOP_RETRY`; without it a loop ends the answer. */
  retry?: (kept: string) => AsyncIterable<Delta>;
  /** Told about the silent retry, for the log line. */
  onRetry?: (kept: string, hit: LoopHit) => void;
  /** Continue: the answer on screen this generation carries on, so a restarted phrase at the seam is dropped. */
  prefix?: string;
  /** What the continuation was asked with: a continuation that talks about it is taken back (F426). */
  instruction?: string;
}

const SEAM_WORDS = 3;

/**
 * Continue after Stop: "…like Christopher Columbus's fleet," went on "Christopher Columbus's fleet discovered…" on the
 * phone (build 22). When `next` opens with the end of the prefix's unfinished sentence, three words or more, that overlap
 * (and a comma the prefix already has) is how much of `next` to drop; -1 while `next` may still grow into one.
 */
export function seamOverlap(prefix: string, next: string, final = false): number {
  const head = prefix.trimEnd();
  if (!head || TERMINATORS.has(head.at(-1)!) || /\n\s*$/u.test(prefix)) return 0;
  let st = head.length;
  while (st > 0 && head[st - 1] !== "\n" && !(/\s/u.test(head[st - 1]!) && TERMINATORS.has(head[st - 2] ?? ""))) st--;
  const sentence = head.slice(st).replace(/[\s,;:，、；：—–-]+$/u, "");
  const lead = next.length - next.trimStart().length;
  const body = next.slice(lead);
  const starts: number[] = [];
  for (let i = 0; i < sentence.length; i++) if (!/\s/u.test(sentence[i]!) && (i === 0 || /\s/u.test(sentence[i - 1]!))) starts.push(i);
  let best = 0;
  for (let w = starts.length - SEAM_WORDS; w >= 0; w--) {
    const tail = sentence.slice(starts[w]);
    if (!final && tail.startsWith(body)) return -1;
    if (body.startsWith(tail) && (body.length > tail.length ? !WORD_CHAR.test(body[tail.length]!) : final)) best = tail.length;
  }
  if (!best) {
    const inside = restated(sentence, starts, body, final);
    if (inside <= 0) return inside;
    best = inside;
  }
  let drop = lead + best;
  const rest = next.slice(drop);
  const mark = rest.trimStart()[0];
  if (mark && ",;:，、；：".includes(mark) && head.endsWith(mark)) drop += rest.length - rest.trimStart().length + 1;
  return drop;
}

/* F426: a restatement inside the continuation's first sentence counts from five words or 24 code points of the stopped sentence. */
const RESTATE_WORDS = 5;
const RESTATE_CP = 24;
const RESTATE_WAIT = 400;
const escape = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/**
 * Build 23: "…treaties like the" went on "British colonial powers established control … through treaties like the Indian
 * Ocean Treaty". The end of the stopped sentence restated after a new subject: the length of `body` to drop, 0 for none,
 * -1 while the first sentence is still streaming.
 */
function restated(sentence: string, starts: number[], body: string, final: boolean): number {
  let end = body.search(/[.!?。！？](?=\s|$)|\n/u);
  const done = end >= 0 || final;
  if (end < 0) end = body.length;
  const first = body.slice(0, end);
  for (let w = 0; w < starts.length; w++) {
    const tail = sentence.slice(starts[w]).trim();
    if (starts.length - w < RESTATE_WORDS && Array.from(tail).length < RESTATE_CP) break;
    const m = new RegExp(`(?<![\\p{L}\\p{N}\\p{M}])${tail.split(/\s+/u).map(escape).join("\\s+")}(?![\\p{L}\\p{N}\\p{M}])`, "iu").exec(first);
    if (!m) continue;
    const at = m.index + m[0].length;
    if (at < body.length || final) return at;
    return -1;
  }
  return done || first.length > sentence.length + RESTATE_WAIT ? 0 : -1;
}

/** The instruction the chat sends with Continue and the silent retry (F390). */
export const CONTINUE_INSTRUCTION = "Continue exactly where you stopped. Do not repeat what you already wrote.";
/* Four words of the instruction in a row, in the continuation, are the model talking about it (web Fast list30 rerun 2). */
const ECHO_RUN = 4;
const lettersOf = (x: string) => Array.from(x.toLowerCase().matchAll(/[\p{L}\p{M}\p{N}'’]+/gu), (m) => ({ w: m[0].replace(/['’]/gu, ""), at: m.index! }));

/** Where the continuation starts echoing `instruction` (`at`), or how much of its end waits because it may (`hold`). */
export function instructionEcho(instruction: string, text: string, final = false): { at: number; hold: number } {
  const grams: string[][] = [];
  const said = lettersOf(instruction).map((x) => x.w);
  for (let i = 0; i + ECHO_RUN <= said.length; i++) grams.push(said.slice(i, i + ECHO_RUN));
  const words = lettersOf(text);
  const n = words.length;
  const run = (i: number, g: string[]) => {
    let k = 0;
    while (k < ECHO_RUN && i + k < n && words[i + k]!.w === g[k]) k++;
    return k;
  };
  for (let i = 0; i < n; i++) if (grams.some((g) => run(i, g) === ECHO_RUN)) return { at: words[i]!.at, hold: 0 };
  if (final || !n) return { at: -1, hold: 0 };
  /* The last word may still be growing ("stop" of "stopped"). */
  const open = words[n - 1]!.at + words[n - 1]!.w.length >= text.length;
  for (let i = Math.max(0, n - ECHO_RUN); i < n; i++) {
    const may = grams.some((g) => {
      const k = run(i, g);
      return i + k === n || (open && i + k === n - 1 && g[k]!.startsWith(words[n - 1]!.w));
    });
    if (may) return { at: -1, hold: text.length - words[i]!.at };
  }
  return { at: -1, hold: 0 };
}

/* A line that opens a list item: its indent, then its number (none for a bullet). */
const ITEM_OPEN = /^([ \t]*)(?:\*\*)?(?:(\d{1,3})[.)．]|[-*•+])[ \t]+/u;
/* A line start that may still grow into one ("2", "12.", "**"). */
const ITEM_PARTIAL = /^[ \t]*(?:\*\*?)?(?:\d{0,3}[.)．]?|[-*•+])$/u;
const indentOf = (lead: string) => Math.floor(lead.replace(/\t/gu, "    ").length / 2);
const lineKey = (line: string) => itemKey(normalize(line).cps.join("")).key;

/**
 * F426: after a cut inside a list, the retry may only add items. The first line that is not an item (nor deeper
 * content of one) ends it: `at` is where, or -1 with `hold`, the line still streaming that may yet turn out an item.
 */
function listEnd(text: string, from: number, indent: number, final: boolean): { at: number; hold: number } {
  for (let pos = from; pos < text.length; ) {
    const nl = text.indexOf("\n", pos);
    const line = text.slice(pos, nl < 0 ? text.length : nl);
    const whole = nl >= 0 || final;
    if (line.trim() && !ITEM_OPEN.test(line)) {
      const lead = indentOf(/^[ \t]*/u.exec(line)![0]);
      const deeper = lead > indent && /\S/u.test(line);
      if (!deeper) {
        if (!whole && ITEM_PARTIAL.test(line)) return { at: -1, hold: text.length - pos };
        return { at: pos, hold: 0 };
      }
    }
    if (nl < 0) break;
    pos = nl + 1;
  }
  return { at: -1, hold: 0 };
}

/** The items a request counts ("List 30 animals"), if it names a number. */
function listTarget(request: string): number | undefined {
  const m = /(?<![\d.,])(\d{1,3})(?![\d.,]\d)/u.exec(request);
  const n = m ? Number(m[1]) : NaN;
  return n >= 2 && n <= 200 ? n : undefined;
}

/** How many items the list ending `text` holds: its last number, or its item count. */
function listCount(text: string): number {
  const lines = text.split("\n").filter((l) => ITEM_OPEN.test(l));
  const last = lines.length ? ITEM_OPEN.exec(lines.at(-1)!)![2] : undefined;
  return last ? Number(last) : lines.length;
}

/**
 * F426: a continuation (the silent retry, or Continue after Stop) of a list goes on numbering after the kept list and
 * does not open with the kept last item again. iPhone build 23 showed "22. Sponges\n10. Sponges\n11. Shrimp"; that now
 * reads "22. Sponges\n23. Shrimp". Only the leading markers change; a line of text after the list ends it.
 */
export class ListSeam {
  private indent = 0;
  private last: number | null = null;
  private lastKey = "";
  private active = false;
  /** The kept last item is complete, so the continuation's first item may be that item again. */
  private whole: boolean;
  private lineStart: boolean;
  private started = false;
  private decided = false;
  private renumber = false;
  private next = 0;
  private buf = "";

  constructor(kept: string) {
    const body = kept.replace(/\s+$/u, "");
    const line = body.slice(body.lastIndexOf("\n") + 1);
    const m = ITEM_OPEN.exec(line);
    this.lineStart = this.whole = /\n[ \t]*$/u.test(kept);
    if (!m) return;
    this.active = true;
    this.indent = indentOf(m[1]!);
    this.last = m[2] ? Number(m[2]) : null;
    this.lastKey = lineKey(line);
  }

  /** The part of `piece` that can be shown now; a line start that may still turn out to be a list marker waits. */
  push(piece: string, final = false): string {
    if (!this.active) return piece;
    this.buf += piece;
    let out = "";
    while (this.buf && this.active) {
      const nl = this.buf.indexOf("\n");
      if (!this.lineStart) {
        if (nl < 0) {
          this.started ||= !!this.buf.trim();
          out += this.buf;
          this.buf = "";
          break;
        }
        /* "…22. Sponges" on screen and "\n10. Sponges" next: the kept item was complete. */
        if (!this.started && !this.buf.slice(0, nl).trim()) this.whole = true;
        this.started ||= !!this.buf.slice(0, nl).trim();
        out += this.buf.slice(0, nl + 1);
        this.buf = this.buf.slice(nl + 1);
        this.lineStart = true;
        continue;
      }
      const line = nl < 0 ? this.buf : this.buf.slice(0, nl);
      if (!line.trim()) {
        if (nl < 0) break;
        out += this.buf.slice(0, nl + 1);
        this.buf = this.buf.slice(nl + 1);
        continue;
      }
      const m = ITEM_OPEN.exec(line);
      if (!m && nl < 0 && !final && ITEM_PARTIAL.test(line)) break;
      const indent = indentOf(m ? m[1]! : /^[ \t]*/u.exec(line)![0]);
      if (!this.decided) {
        if (!m || indent !== this.indent) {
          this.active = false;
          break;
        }
        if (this.whole && nl < 0 && !final) break;
        this.decided = true;
        this.next = (this.last ?? 0) + 1;
        this.renumber = this.last !== null && m[2] !== undefined && Number(m[2]) !== this.next;
        if (this.whole && lineKey(line) === this.lastKey) {
          /* The dropped copy took the next number, so what follows is renumbered. */
          this.renumber = this.last !== null;
          this.buf = nl < 0 ? "" : this.buf.slice(nl + 1);
          continue;
        }
      }
      if (!this.renumber) {
        this.active = false;
        break;
      }
      if (m && indent === this.indent && m[2] !== undefined) {
        out += m[0].replace(m[2], String(this.next++));
        this.buf = this.buf.slice(m[0].length);
      } else if (!m && indent <= this.indent) {
        this.active = false;
        break;
      }
      this.lineStart = false;
    }
    if (!this.active && this.buf) {
      out += this.buf;
      this.buf = "";
    }
    if (final && this.buf) {
      out += this.buf;
      this.buf = "";
    }
    return out;
  }
}

/**
 * Wraps any engine's answer stream (every engine, one guard): a possible second copy is held off screen (F415); on a loop
 * it calls `stop`, keeps one copy and continues once through `retry`, and only a retry that loops too yields `{ loop }`.
 */
export async function* guardLoops(stream: AsyncIterable<Delta>, stop: () => void, context: GuardOptions = {}): AsyncGenerator<GuardedDelta> {
  let text = "";
  let sent = 0;
  let checkedAt = 0;
  let retried = false;
  let usage: Usage | undefined;
  let current = stream;
  /* The retry's first text needs the separator the script uses, like Continue (F390). */
  let joinNext = false;
  /* What a continuation's first text is held against until it is known not to restart the prefix's last phrase. */
  let seam = context.prefix ?? "";
  let opening = "";
  /* A continuation of a list on screen goes on numbering it (F426). */
  let list = context.prefix ? new ListSeam(context.prefix) : null;
  const instruction = context.instruction ?? CONTINUE_INSTRUCTION;
  /* Where this generation's continuation starts in `text` (-1: not a continuation), and the retried list's indent. */
  let contFrom = context.prefix ? 0 : -1;
  let listIndent = -1;
  const target = listTarget(context.request ?? "");
  /* A retried list that reaches its count ends quietly; one that stops short shows the notice. */
  const listStop = (all: string, at: number): LoopHit => ({ unit: all.slice(at).trim().slice(0, 80), repeats: 1, start: at, keep: at, complete: target !== undefined && listCount(all.slice(0, at)) >= target });
  for (;;) {
    let hit: LoopHit | null = null;
    for await (const d of current) {
      if (d.done) usage = d.done;
      if (hit) continue;
      if (d.reasoning || d.toolCall) yield { ...(d.reasoning ? { reasoning: d.reasoning } : {}), ...(d.toolCall ? { toolCall: d.toolCall } : {}) };
      if (!d.text) continue;
      let piece = d.text;
      if (seam) {
        opening += piece;
        const drop = seamOverlap(seam, opening);
        if (drop < 0) continue;
        piece = opening.slice(drop);
        seam = opening = "";
        if (!piece) continue;
      }
      if (joinNext) {
        piece = continuationSeparator(text, piece) + piece;
        joinNext = false;
      }
      if (list) {
        piece = list.push(piece);
        if (!piece) continue;
      }
      const from = text.length;
      text += piece;
      const tail = tailLoop(text, context, from);
      hit = tail.hit;
      let hold = tail.hold;
      if (!hit && contFrom >= 0) {
        const echo = instructionEcho(instruction, text.slice(contFrom));
        if (echo.at >= 0) hit = { unit: instruction, repeats: 1, start: contFrom, keep: contFrom };
        hold = Math.max(hold, echo.hold);
      }
      if (!hit && listIndent >= 0) {
        const end = listEnd(text, contFrom, listIndent, false);
        if (end.at >= 0) hit = listStop(text, end.at);
        hold = Math.max(hold, end.hold);
      }
      if (!hit && text.length - checkedAt >= 4) {
        checkedAt = text.length;
        hit = shortLoop(text, context);
      }
      if (hit) {
        stop();
        continue;
      }
      const safe = text.length - hold;
      if (safe > sent) {
        yield { text: text.slice(sent, safe) };
        sent = safe;
      }
    }
    if (!hit) {
      let rest = seam && opening ? opening.slice(Math.max(0, seamOverlap(seam, opening, true))) : "";
      if (joinNext && rest) rest = continuationSeparator(text, rest) + rest;
      text += list ? list.push(rest, true) : rest;
    }
    opening = "";
    if (!hit) hit = tailLoop(text, context, checkedAt, true).hit ?? shortLoop(text, context);
    if (!hit && contFrom >= 0) {
      const echo = instructionEcho(instruction, text.slice(contFrom), true);
      if (echo.at >= 0) hit = { unit: instruction, repeats: 1, start: contFrom, keep: contFrom };
    }
    if (!hit && listIndent >= 0) {
      const end = listEnd(text, contFrom, listIndent, true);
      if (end.at >= 0) hit = listStop(text, end.at);
    }
    /* he-list build 23: a retry that wrote only "." adds nothing; the answer ends at the cut, with the notice. */
    if (!hit && retried && !/[\p{L}\p{N}]/u.test(text.slice(contFrom))) hit = { unit: "", repeats: 1, start: contFrom, keep: contFrom };
    if (!hit) break;
    const cut = cutLoop(text, hit);
    /* Five asked, a sixth begun: the five are the whole answer, so a retry would only invent more (F421). */
    const retry = retried ? undefined : context.retry;
    if (hit.asked || hit.complete || retry) {
      /* Only whitespace past the cut on screen: nothing to take back. */
      if (sent > cut.text.length && !text.slice(cut.text.length, sent).trim()) {
        text = text.slice(0, sent);
      } else if (sent > cut.text.length) {
        yield { trim: cut.text };
        text = cut.text;
      } else {
        if (cut.text.length > sent) yield { text: cut.text.slice(sent) };
        text = cut.text;
      }
      sent = checkedAt = text.length;
      if (hit.asked || hit.complete || !retry) break;
      retried = true;
      contFrom = text.length;
      const lastLine = ITEM_OPEN.exec(text.replace(/\s+$/u, "").split("\n").at(-1) ?? "");
      listIndent = lastLine && /\n[ \t]*$/u.test(text) ? indentOf(lastLine[1]!) : -1;
      joinNext = true;
      seam = context.prefix ? context.prefix + continuationSeparator(context.prefix, text) + text : text;
      list = new ListSeam(seam);
      context.onRetry?.(cut.text, hit);
      current = retry(cut.text);
      continue;
    }
    /* An inline list cut short does not end on its separator ("…דרשינה,"); a verse ending "loud," keeps its comma. */
    if ((cut.text.slice(cut.text.lastIndexOf("\n") + 1).match(/[,،、，;；]/gu) ?? []).length >= INLINE_LIST) cut.text = cut.text.replace(/[ \t]*[,،、，;；][ \t]*$/u, "");
    yield { loop: cut };
    text = cut.text;
    sent = text.length;
    break;
  }
  if (sent < text.length) yield { text: text.slice(sent) };
  if (usage) yield { done: usage };
}
