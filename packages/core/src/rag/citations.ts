/** Citations: "contract.pdf · p.4" chips (spec S12) built from retrieval hits, and the [n] marks a model used. */
import { bm25Tokens, isCjkFunctionTerm, isWeakTerm } from "./bm25";
import { detectLanguage } from "../chat/detectLanguage";
import { hasCjk } from "./text";
import type { Citation, DocKind, DocumentRecord, RetrievalHit } from "./types";

const SNIPPET_CHARS = 220;

/** What `page` counts for a kind: a real page (PDF, scan), a workbook sheet, or an ordinal part of a text cut by size/headings. */
export type PageUnit = "page" | "sheet" | "part";

export function pageUnit(kind: DocKind): PageUnit {
  return kind === "pdf" || kind === "image" ? "page" : kind === "xlsx" ? "sheet" : "part";
}

/** Words per unit; the UI passes its translations, the prompt keeps English. */
export type PageWords = Record<PageUnit, string>;
export const PAGE_WORDS: PageWords = { page: "p.", sheet: "sheet ", part: "part " };

/** "§" was the old text glyph; a section number the document did not write itself is labelled "part N" now. */
export function pageGlyph(kind: DocKind, words: PageWords = PAGE_WORDS): string {
  return words[pageUnit(kind)];
}

export function citationLabel(c: Pick<Citation, "docName" | "kind" | "page" | "pageTo">, words: PageWords = PAGE_WORDS): string {
  const pages = c.pageTo && c.pageTo > c.page ? `${c.page}–${c.pageTo}` : `${c.page}`;
  return `${c.docName} · ${pageGlyph(c.kind, words)}${pages}`;
}

export function snippetOf(text: string, max = SNIPPET_CHARS): string {
  const one = text.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  const cut = one.lastIndexOf(" ", max);
  return `${one.slice(0, cut > max / 2 ? cut : max)}…`;
}

export function buildCitations(hits: RetrievalHit[], docs: ReadonlyMap<string, DocumentRecord>): Citation[] {
  return hits.map((h, i) => {
    const doc = docs.get(h.chunk.docId);
    return { n: i + 1, docId: h.chunk.docId, docName: doc?.name ?? h.chunk.docId, kind: doc?.kind ?? "unknown", page: h.chunk.page, chunkId: h.chunk.id, snippet: snippetOf(h.chunk.text) };
  });
}

/** Numbers the answer actually refers to ([1], [2,3], [1][4]); order of first appearance. */
export function citedNumbers(answer: string): number[] {
  const seen = new Set<number>();
  for (const m of answer.matchAll(/\[(\d{1,2}(?:\s*[,\u060C]\s*\d{1,2})*)\]/g)) {
    for (const part of m[1]!.split(/[,\u060C]/)) {
      const n = Number(part.trim());
      if (n > 0) seen.add(n);
    }
  }
  return [...seen];
}

/* Markdown the model may wrap a line in: bold, a bullet, a quote or heading mark. */
const WRAP = /^[\s*_>#-]*/;
/* One header as the prompt writes it, "[n] <file> · part k" (or p.k, sheet k; "page k" in words). The name holds no
   "·", so a header matches one way only; repeating it inside one regex backtracks exponentially on near-headers. */
const HEADER = /\[\d{1,2}\]\s*[^\n·]*?\s·\s(?:part|page|p\.|sheet)\s?\d+(?:–\d+)?[\s*_.:,;]*/y;

type LabelSource = Pick<Citation, "n" | "docName" | "kind" | "page" | "pageTo">;

function isLabelLine(line: string): boolean {
  let at = WRAP.exec(line)![0].length;
  if (at === line.length) return false;
  while (at < line.length) {
    HEADER.lastIndex = at;
    if (!HEADER.exec(line)) return false;
    at = HEADER.lastIndex;
  }
  return true;
}

const headerStart = (line: string, citations: readonly LabelSource[]): boolean => {
  const bare = line.slice(WRAP.exec(line)![0].length);
  return citations.some((c) => `[${c.n}] ${citationLabel(c)}`.startsWith(bare));
};

/**
 * The answer without the passage headers a small model copies onto its opening lines (F457: "[1] office.txt · part 1"
 * above the sentence, the same label the chip under it shows). A "[n]" that opens or sits inside a sentence is the
 * citation and stays; an answer that is nothing but labels is kept whole. While `streaming`, an unfinished first line
 * that is still the start of one of `citations`' headers is held back, so the label never flashes on screen.
 */
export function withoutEchoedLabels(answer: string, opts: { streaming?: boolean; citations?: readonly LabelSource[] } = {}): string {
  const lines = answer.split("\n");
  let i = 0;
  let labels = 0;
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (isLabelLine(line)) labels++;
    else if (line.trim()) break;
  }
  const rest = lines.slice(i).join("\n");
  if (!opts.streaming) return labels && rest.trim() ? rest : answer;
  const pending = i === lines.length - 1 && headerStart(lines[i]!, opts.citations ?? []);
  return pending || !rest.trim() ? "" : labels ? rest : answer;
}

/** Chips to show under an answer: the cited ones first in citation order, then the rest only when nothing was cited. */
export function citationsForAnswer(answer: string, all: Citation[]): { shown: Citation[]; cited: boolean } {
  const shown = citedNumbers(answer).flatMap((n) => all.filter((c) => c.n === n));
  if (!shown.length) return { shown: onePerPage(all), cited: false };
  return { shown, cited: true };
}

/* Unnumbered chips are only "where it came from": several passages of one page (or one section's pages) are one source. Numbered chips stay one per [n] so every mark resolves. */
const onePerPage = (all: Citation[]): Citation[] => {
  const seen = new Set<string>();
  return all.filter((c) => {
    const key = `${c.docId}\u0000${c.page}\u0000${c.pageTo ?? c.page}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const NUMERAL = /[\p{N}〇零一二三四五六七八九十百千万億兆两]/u;

/* In an answer a number is the fact itself ("七名", "1962"), so it counts; a counter or particle pair ("名で") does not. */
const evidenceTerms = (text: string): Set<string> => new Set(bm25Tokens(text).filter((t) => !isCjkFunctionTerm(t) && (!isWeakTerm(t) || (NUMERAL.test(t) && !(hasCjk(t) && [...t].length === 1)))));

const SCRIPTS: Array<[string, RegExp]> = [
  ["cjk", /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF]/gu],
  ["hangul", /[\uAC00-\uD7AF]/gu],
  ["hebrew", /[\u05D0-\u05EA]/gu],
  ["arabic", /[\u0621-\u064A]/gu],
  ["cyrillic", /[\u0400-\u04FF]/gu],
  ["latin", /[A-Za-z\u00C0-\u024F]/gu],
];

/** The script most of a text's letters are written in. */
export function mainScript(text: string): string {
  let best = "none";
  let most = 0;
  for (const [name, re] of SCRIPTS) {
    const n = text.match(re)?.length ?? 0;
    if (n > most) [best, most] = [name, n];
  }
  return best;
}

/**
 * The citations whose passage the answer actually took something from: a content word or a number of the passage
 * that the question did not already contain. An answer that only echoes the question, or states a fact no passage carries
 * ("Japan won the 1998 World Cup" under a company report, QA F366), gets no SOURCES strip.
 */
export function groundedCitations(answer: string, question: string, used: RetrievalHit[], citations: Citation[]): Citation[] {
  /* The file's name is on the chip already: "the Constitution" said back about constitution.pdf is not taken from a passage. */
  const asked = new Set([...evidenceTerms(question), ...citations.flatMap((c) => [...evidenceTerms(c.docName)])]);
  const said = [...evidenceTerms(answer)].filter((t) => !asked.has(t));
  const script = mainScript(answer);
  /* Round 134I: a pancake recipe shared "make", "two" and "place" with a page of the constitution; a few common words are not a source. */
  const comparable = used.filter((h) => mainScript(h.chunk.text) === script);
  if (comparable.length && !takenFrom(said, comparable.map((h) => h.chunk.text))) return [];
  const grounded = new Set(
    used
      .filter((h) => {
        /* An answer in the UI language over a passage in another script shares no word with it by design: nothing to judge. */
        if (mainScript(h.chunk.text) !== script) return true;
        const passage = evidenceTerms(h.chunk.text);
        return said.some((t) => passage.has(t));
      })
      .map((h) => h.chunk.id),
  );
  return citations.filter((c) => grounded.has(c.chunkId));
}

/** Below this share of an answer's own content words found in its sources, the answer was not taken from them. */
export const MIN_SOURCE_SHARE = 1 / 3;

const SUFFIX = /(?:ing|ion|ed|es|er|e|s)$/;
const MIN_PREFIX = 5;

/* "beans"/"bean", "rotated"/"rotation", "noting"/"notes": a model rewords the passage, so an exact token misses (round 134I2). */
const stemOf = (term: string): string => {
  if (!/^[a-z]+$/.test(term)) return term;
  const cut = term.replace(SUFFIX, "");
  return cut.length >= 3 ? cut : term;
};

/** The share of `said` whose word, up to inflection, occurs in `sources`. */
export function sourceShare(said: readonly string[], sources: readonly string[]): number {
  if (!said.length) return 0;
  const words = new Set(sources.flatMap((s) => [...evidenceTerms(s)]));
  const stems = new Set([...words].map(stemOf));
  const long = [...stems].filter((s) => s.length >= MIN_PREFIX);
  const found = (t: string): boolean => {
    if (words.has(t)) return true;
    const stem = stemOf(t);
    if (stems.has(stem)) return true;
    return stem.length >= MIN_PREFIX && /^[a-z]+$/.test(stem) && long.some((s) => s.startsWith(stem) || stem.startsWith(s));
  };
  return said.filter(found).length / said.length;
}

const takenFrom = (said: readonly string[], sources: readonly string[]): boolean => sourceShare(said, sources) >= MIN_SOURCE_SHARE;

/**
 * The sources a follow-up ("shorter", "make it 3 bullet points") carries: those of the answer it reworks, when it restates
 * that answer in its words or in another language. A rework has no passages of its own, so this is its grounding.
 */
export function inheritedCitations(rework: string, reworked: { content: string; citations?: readonly Citation[] | undefined }): Citation[] {
  const from = [...(reworked.citations ?? [])];
  if (!from.length || !rework.trim()) return [];
  const [to, was] = [detectLanguage(rework), detectLanguage(reworked.content)];
  if (to && was && to !== was) return from;
  const said = [...evidenceTerms(rework)];
  return said.length && takenFrom(said, [reworked.content]) ? from : [];
}

const MARKS = /\s?\[(\d{1,2}(?:\s*[,\u060C]\s*\d{1,2})*)\]/g;

/** The answer without the [n] marks that open no chip under it ("removed from office [4]." with no SOURCES, round 134I). */
export function withoutStrayMarkers(answer: string, citations: readonly Pick<Citation, "n">[]): string {
  const known = new Set(citations.map((c) => c.n));
  return answer.replace(MARKS, (mark, list: string) => {
    const parts = list.split(/[,\u060C]/).map((p) => p.trim());
    const kept = parts.filter((p) => known.has(Number(p)));
    if (kept.length === parts.length) return mark;
    return kept.length ? `${mark.startsWith("[") ? "" : mark[0]}[${kept.join(", ")}]` : "";
  });
}
