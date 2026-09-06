/**
 * Sentence-aware chunking (spec §5.5: ≈400 tokens, overlap 60; §10.4 #31: bidi-aware, sentence boundaries via
 * Intl.Segmenter rather than character counts). Every chunk carries its page and character offsets.
 */
import { estimateTokens } from "./tokens";
import { normalizeText } from "./text";

export interface ChunkOptions {
  targetTokens?: number;
  overlapTokens?: number;
  /** A trailing piece below this size is merged into the previous chunk instead of standing alone. */
  minTokens?: number;
}

export interface PageChunk {
  text: string;
  start: number;
  end: number;
  tokens: number;
}

export const DEFAULT_CHUNK: Required<ChunkOptions> = { targetTokens: 400, overlapTokens: 60, minTokens: 40 };

interface Segment {
  text: string;
  start: number;
  end: number;
  tokens: number;
  /** Paragraph break follows this segment: a preferred cut point. */
  hardBreak: boolean;
}

type Segmenter = { segment(s: string): Iterable<{ segment: string; index: number }> };
type IntlWithSegmenter = typeof Intl & { Segmenter?: new (locale?: string, o?: { granularity: "sentence" | "word" | "grapheme" }) => Segmenter };

let sentenceSegmenter: Segmenter | null = null;
let segmenterCtor: unknown;
function segmenter(): Segmenter | null {
  const S = (Intl as IntlWithSegmenter).Segmenter;
  if (S !== segmenterCtor) {
    segmenterCtor = S;
    sentenceSegmenter = S ? new S(undefined, { granularity: "sentence" }) : null;
  }
  return sentenceSegmenter;
}

/* Fallback boundaries when Intl.Segmenter is missing (Hermes): terminal punctuation incl. sof pasuq (׃) and CJK stops,
   followed by whitespace, or a newline. The split point is after the whitespace so the next sentence starts clean. */
const FALLBACK_BOUNDARY = /(?<=[.!?\u0589\u06D4\u061F\u05C3\u3002\uFF01\uFF1F])\s+|\n/gu;

function splitSentences(paragraph: string, base: number): Segment[] {
  const out: Segment[] = [];
  const push = (text: string, start: number) => {
    const trimmedStart = text.search(/\S/u);
    if (trimmedStart < 0) return;
    const t = text.trimEnd();
    const s = start + trimmedStart;
    const body = t.slice(trimmedStart);
    if (!body) return;
    out.push({ text: body, start: s, end: s + body.length, tokens: estimateTokens(body), hardBreak: false });
  };
  const seg = segmenter();
  if (seg) {
    for (const { segment, index } of seg.segment(paragraph)) push(segment, base + index);
    return out;
  }
  let last = 0;
  for (const m of paragraph.matchAll(FALLBACK_BOUNDARY)) {
    const at = m.index ?? 0;
    push(paragraph.slice(last, at + m[0].length), base + last);
    last = at + m[0].length;
  }
  push(paragraph.slice(last), base + last);
  return out;
}

/* A sentence larger than the budget is cut at whitespace (never inside a word, which keeps bidi runs intact);
   text without spaces (CJK) falls back to code-point runs. */
function splitLong(seg: Segment, maxTokens: number): Segment[] {
  if (seg.tokens <= maxTokens) return [seg];
  const parts: Segment[] = [];
  const pieces = seg.text.split(/(\s+)/u);
  let cur = "";
  let curStart = seg.start;
  let offset = seg.start;
  const flush = () => {
    const body = cur.trimEnd();
    if (body) parts.push({ text: body, start: curStart, end: curStart + body.length, tokens: estimateTokens(body), hardBreak: false });
    cur = "";
  };
  if (pieces.length === 1) {
    const chars = Array.from(seg.text);
    const per = Math.max(8, Math.floor((chars.length * maxTokens) / seg.tokens));
    for (let i = 0; i < chars.length; i += per) {
      const body = chars.slice(i, i + per).join("");
      const start = seg.start + chars.slice(0, i).join("").length;
      parts.push({ text: body, start, end: start + body.length, tokens: estimateTokens(body), hardBreak: false });
    }
    return parts;
  }
  for (const piece of pieces) {
    if (!cur) curStart = offset;
    const candidate = cur + piece;
    if (cur && estimateTokens(candidate) > maxTokens) {
      flush();
      curStart = offset;
      cur = piece.trimStart();
      curStart += piece.length - cur.length;
    } else cur = candidate;
    offset += piece.length;
  }
  flush();
  return parts;
}

/** Sentences (or sentence pieces) of a normalized page, with paragraph breaks marked. */
export function segments(text: string, maxTokens: number): Segment[] {
  const out: Segment[] = [];
  const re = /\n{2,}/gu;
  let last = 0;
  const paragraphs: Array<{ text: string; start: number }> = [];
  for (const m of text.matchAll(re)) {
    paragraphs.push({ text: text.slice(last, m.index), start: last });
    last = (m.index ?? 0) + m[0].length;
  }
  paragraphs.push({ text: text.slice(last), start: last });
  for (const p of paragraphs) {
    const sentences = splitSentences(p.text, p.start).flatMap((s) => splitLong(s, maxTokens));
    const lastIdx = sentences.length - 1;
    sentences.forEach((s, i) => out.push(i === lastIdx ? { ...s, hardBreak: true } : s));
  }
  return out;
}

/**
 * Chunks one page. Sentences accumulate up to `targetTokens`; the last sentences worth `overlapTokens` start the next
 * chunk. Offsets index the normalized text this function returns, so callers store that text.
 */
export function chunkPage(rawText: string, options: ChunkOptions = {}): { text: string; chunks: PageChunk[] } {
  const opts = { ...DEFAULT_CHUNK, ...options };
  const text = normalizeText(rawText);
  if (!text) return { text, chunks: [] };
  const segs = segments(text, opts.targetTokens);
  const chunks: PageChunk[] = [];
  let window: Segment[] = [];
  let tokens = 0;
  const emit = () => {
    const first = window[0];
    const last = window[window.length - 1];
    if (!first || !last) return;
    const body = text.slice(first.start, last.end);
    chunks.push({ text: body, start: first.start, end: last.end, tokens: estimateTokens(body) });
  };
  const carry = (): Segment[] => {
    const kept: Segment[] = [];
    let sum = 0;
    for (let i = window.length - 1; i >= 0; i--) {
      const s = window[i]!;
      if (sum + s.tokens > opts.overlapTokens) break;
      kept.unshift(s);
      sum += s.tokens;
    }
    /* An overlap that is the whole window would repeat the chunk verbatim. */
    return kept.length === window.length ? [] : kept;
  };
  for (const s of segs) {
    if (window.length && tokens + s.tokens > opts.targetTokens) {
      emit();
      window = carry();
      tokens = window.reduce((n, w) => n + w.tokens, 0);
    }
    window.push(s);
    tokens += s.tokens;
  }
  if (window.length) {
    const tail = window.reduce((n, w) => n + w.tokens, 0);
    const prev = chunks[chunks.length - 1];
    const overlapOnly = window.every((w) => prev && w.start >= prev.start && w.end <= prev.end);
    if (prev && tail < opts.minTokens && !overlapOnly) {
      const body = text.slice(prev.start, window[window.length - 1]!.end);
      chunks[chunks.length - 1] = { text: body, start: prev.start, end: prev.start + body.length, tokens: estimateTokens(body) };
    } else if (!overlapOnly) emit();
  }
  return { text, chunks };
}
