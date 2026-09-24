/** Citations: "contract.pdf · p.4" chips (spec S12) built from retrieval hits, and the [n] marks a model used. */
import { bm25Tokens, isCjkFunctionTerm, isWeakTerm } from "./bm25";
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

export function citationLabel(c: Pick<Citation, "docName" | "kind" | "page">, words: PageWords = PAGE_WORDS): string {
  return `${c.docName} · ${pageGlyph(c.kind, words)}${c.page}`;
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

/** Chips to show under an answer: the cited ones first in citation order, then the rest only when nothing was cited. */
export function citationsForAnswer(answer: string, all: Citation[]): { shown: Citation[]; cited: boolean } {
  const shown = citedNumbers(answer).flatMap((n) => all.filter((c) => c.n === n));
  if (!shown.length) return { shown: all, cited: false };
  return { shown, cited: true };
}

const evidenceTerms = (text: string): Set<string> => new Set(bm25Tokens(text).filter((t) => !isWeakTerm(t) && !isCjkFunctionTerm(t)));

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
 * The citations whose passage the answer actually took something from: a content word of the passage that the
 * question did not already contain. An answer that only echoes the question, or states a fact no passage carries
 * ("Japan won the 1998 World Cup" under a company report, QA F366), gets no SOURCES strip.
 */
export function groundedCitations(answer: string, question: string, used: RetrievalHit[], citations: Citation[]): Citation[] {
  const asked = evidenceTerms(question);
  const said = [...evidenceTerms(answer)].filter((t) => !asked.has(t));
  const script = mainScript(answer);
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
