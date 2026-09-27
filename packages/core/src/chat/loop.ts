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
const LIST_ITEM = /^[ \t]*(?:[-*+•·]|\d{1,3}[.)、．])[ \t]/u;
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
  /** Code points, horizontal whitespace runs as " ", runs holding a line break as "\n". */
  cps: string[];
  /** UTF-16 offset in the input where each normalized code point starts, plus one entry for the end. */
  at: number[];
}

function normalize(text: string): Normalized {
  const cps: string[] = [];
  const at: number[] = [];
  let i = 0;
  for (const cp of text) {
    if (/\s/u.test(cp)) {
      const last = cps.length - 1;
      if (last >= 0 && (cps[last] === " " || cps[last] === "\n")) {
        if (cp === "\n") cps[last] = "\n";
      } else {
        cps.push(cp === "\n" ? "\n" : " ");
        at.push(i);
      }
    } else {
      cps.push(cp);
      at.push(i);
    }
    i += cp.length;
  }
  at.push(text.length);
  return { cps, at };
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
 * anywhere in the last 600 code points (a list item needs four, fenced code never counts), or a shorter unit running
 * 32 code points. No whitespace is needed, so CJK loops are found like Latin ones. Null when the text is healthy.
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
  const { cps: s, at } = normalize(text);
  const n = s.length;
  const from = Math.max(0, n - WINDOW);
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
      const unit = s.slice(a, a + p);
      const nl = unit.indexOf("\n");
      if (nl >= 0 && LIST_ITEM.test([...unit.slice(nl + 1), ...unit.slice(0, nl)].join("")) && len < (REPEATS + 1) * p) return false;
      /* A doubled unit is judged at its own period, so a requested count is not dodged by pairing copies. */
      if (request) for (let q = MIN_UNIT; q < p; q++) if (periodic(s, a, regionLen, q)) return false;
      if (request && Math.floor(len / p) <= allowed(a, p)) return false;
    }
    return !inCode(a, a + regionLen);
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
  return { unit, repeats: copies, start: at[start]!, keep: at[keepAt]! };
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
  const { cps: s, at } = normalize(text);
  const n = s.length;
  const code = codeSpans(text);
  const inCode = (a: number, b: number) => code.some(([x, y]) => at[a]! < y && at[b]! > x);
  interface Verdict {
    /** Copies that may stand in a row before it is a loop. */
    allowed: number;
    /** Copies the answer keeps when it is: one, unless the user, the source text or a refrain asked for more. */
    kept: number;
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
    if ((long || p >= MIN_UNIT || listed) && primitive && unit.some((c) => LETTER.test(c)) && !inCode(a, end)) {
      const base = long ? 1 : listed ? REPEATS : REPEATS - 1;
      /* One line of a song may come twice, its chorus; a whole stanza may not. */
      const line = verse && unit.filter((c) => c === "\n").length === 1 ? 2 : 0;
      const kept = Math.max(1, line, askedCopies(s, a, p, request, ask), source);
      verdict = { allowed: Math.max(base, kept), kept };
    }
    verdicts.set(key, verdict);
    return verdict;
  };
  /* The longest run at `end` where the text repeats itself p back, for every p. */
  const scan = (end: number, wantHit: boolean): { hold: number; hit: { a: number; p: number; kept: number; copies: number } | null } => {
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
      if (wantHit && copies > v.allowed) return { hold: 0, hit: { a, p, kept: v.kept, copies } };
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
    let st = 0;
    for (let i = 0; i < n; i++) {
      if (s[i] !== "\n" && !TERMINATORS.has(s[i]!)) continue;
      if (i + 1 < n && TERMINATORS.has(s[i + 1]!)) continue;
      const k = key(st, i + 1);
      if (Array.from(k).length >= SEGMENT_MIN && LETTER.test(k) && !DATA_LINE.test(k) && !inCode(st, i + 1)) {
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
  let first = 0;
  while (first < n && at[first + 1]! <= from) first++;
  const echo = !ask.asked && source === 1 && !verse ? echoAt(s, first, final, (a, b) => inCode(a, b)) : { hit: null, hold: 0 };
  for (let end = Math.min(Math.max(first + 1, 2 * WIDE_UNIT), n); end <= n; end++) {
    if (echo.hit && echo.hit.end <= end) return { hold: 0, hit: { unit: s.slice(echo.hit.start, echo.hit.end).join("").trim(), repeats: 2, start: at[echo.hit.start]!, keep: at[echo.hit.start]! } };
    const again = segmentHits.get(end);
    if (again !== undefined) return { hold: 0, hit: { unit: s.slice(again, end).join("").trim(), repeats: 2, start: at[again]!, keep: at[again]! } };
    const found = scan(end, true).hit;
    if (!found) continue;
    const { a, p, kept, copies } = found;
    let keep = a + kept * p;
    /* A copy that starts on the sentence's own full stop leaves it with the first copy. */
    for (let x = 0; x < 2 && keep < end && TERMINATORS.has(s[keep]!); x++) keep++;
    return { hold: 0, hit: { unit: s.slice(a, a + p).join("").trim(), repeats: copies, start: at[a]!, keep: at[keep]! } };
  }
  const hold = Math.max(scan(n, false).hold, segmentHold, echo.hold);
  return { hold: hold > 0 ? text.length - at[n - hold]! : 0, hit: null };
}

/* The copy often opens with a word swapped ("their ways" for "their way"): walk back over single swaps while two words on each side match. */
function echoStart(words: Word[], i: number, j: number, earlierEnd: number): number {
  let a = i;
  let b = j;
  const same = (x: number, y: number) => x >= 0 && y >= 0 && words[x]!.w === words[y]!.w;
  for (;;) {
    if (a - 1 > earlierEnd && same(a - 1, b - 1)) {
      a--;
      b--;
    } else if (a - 3 > earlierEnd && same(a - 2, b - 2) && same(a - 3, b - 3)) {
      a -= 3;
      b -= 3;
    } else return a;
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
function wordsOf(s: string[], inCode: (a: number, b: number) => boolean): Word[] {
  const words: Word[] = [];
  const dataLine: boolean[] = [];
  for (let i = 0, st = 0; i <= s.length; i++) {
    if (i < s.length && s[i] !== "\n") continue;
    const data = DATA_LINE.test(s.slice(st, i).join(""));
    for (let k = st; k < i; k++) dataLine[k] = data;
    st = i + 1;
  }
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
function echoAt(s: string[], first: number, final: boolean, inCode: (a: number, b: number) => boolean): { hit: { start: number; end: number } | null; hold: number } {
  const words = wordsOf(s, inCode);
  const seen = new Map<string, number[]>();
  let hit: { start: number; end: number } | null = null;
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
            if (!hit || words[i + k]!.end < hit.end) hit = { start: lineStart(s, words[echoStart(words, i, j, j + k)]!.start), end: words[i + k]!.end };
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
const OPEN_ITEM = /(?<=\n)[ \t]*(?:\d{1,3}[.)]|[-*•+])$/u;

export function cutLoop(text: string, hit: LoopHit): LoopCut {
  return { text: text.slice(0, hit.keep).trimEnd().replace(OPEN_ITEM, ""), hit, fullLength: text.length };
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
  for (;;) {
    let hit: LoopHit | null = null;
    for await (const d of current) {
      if (d.done) usage = d.done;
      if (hit) continue;
      if (d.reasoning || d.toolCall) yield { ...(d.reasoning ? { reasoning: d.reasoning } : {}), ...(d.toolCall ? { toolCall: d.toolCall } : {}) };
      if (!d.text) continue;
      let piece = d.text;
      if (joinNext) {
        piece = continuationSeparator(text, piece) + piece;
        joinNext = false;
      }
      const from = text.length;
      text += piece;
      const tail = tailLoop(text, context, from);
      hit = tail.hit;
      if (!hit && text.length - checkedAt >= 4) {
        checkedAt = text.length;
        hit = shortLoop(text, context);
      }
      if (hit) {
        stop();
        continue;
      }
      const safe = text.length - tail.hold;
      if (safe > sent) {
        yield { text: text.slice(sent, safe) };
        sent = safe;
      }
    }
    if (!hit) hit = tailLoop(text, context, checkedAt, true).hit ?? shortLoop(text, context);
    if (!hit) break;
    const cut = cutLoop(text, hit);
    if (context.retry && !retried) {
      retried = true;
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
      joinNext = true;
      context.onRetry?.(cut.text, hit);
      current = context.retry(cut.text);
      continue;
    }
    yield { loop: cut };
    text = cut.text;
    sent = text.length;
    break;
  }
  if (sent < text.length) yield { text: text.slice(sent) };
  if (usage) yield { done: usage };
}
