/** Repetition guard (§10.5 #39, F369): a small model that starts looping is stopped, cut back to its first copy, and offered "Regenerate". */
import type { Delta } from "../llm/types";

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
export function detectLoop(text: string): LoopHit | null {
  if (!text) return null;
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
  return { unit, repeats: copies, start: at[start]!, keep: at[start + p]! };
}

export interface LoopCut {
  /** The answer with the loop cut back to its first copy. */
  text: string;
  hit: LoopHit;
  /** Length of the answer before the cut. */
  fullLength: number;
}

export type GuardedDelta = Delta & { loop?: LoopCut };

export function cutLoop(text: string, hit: LoopHit): LoopCut {
  return { text: text.slice(0, hit.keep).trimEnd(), hit, fullLength: text.length };
}

/** One console line per cut, for the QA harness. */
export function describeLoopCut(cut: LoopCut): string {
  return `[chat] loop cut: kept ${cut.text.length} of ${cut.fullLength} chars, unit ${Array.from(cut.hit.unit).length} cp x${cut.hit.repeats}`;
}

/**
 * Wraps any engine's answer stream (every engine, one guard): when the answer starts looping it calls `stop` once,
 * yields `{ loop }` with the cut text, and swallows the text the engine still flushes; the final `done` passes through.
 * A loop the engine finished by itself (token ceiling) is cut at the end the same way, without `stop`.
 */
export async function* guardLoops(stream: AsyncIterable<Delta>, stop: () => void): AsyncGenerator<GuardedDelta> {
  let text = "";
  let cut: LoopCut | null = null;
  let checkedAt = 0;
  for await (const d of stream) {
    if (cut) {
      if (d.done) yield { done: d.done };
      continue;
    }
    if (d.text) {
      text += d.text;
      if (text.length - checkedAt >= 4) {
        checkedAt = text.length;
        const hit = detectLoop(text);
        if (hit) {
          cut = cutLoop(text, hit);
          stop();
          yield d.done ? { loop: cut, done: d.done } : { loop: cut };
          continue;
        }
      }
    }
    yield d;
  }
  if (!cut && text) {
    const hit = detectLoop(text);
    if (hit) yield { loop: cutLoop(text, hit) };
  }
}
