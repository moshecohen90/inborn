/** Citations: "contract.pdf · p.4" chips (spec S12) built from retrieval hits, and the [n] marks a model used. */
import type { Citation, DocKind, DocumentRecord, RetrievalHit } from "./types";

const SNIPPET_CHARS = 220;

/** Page-based formats cite pages, a workbook cites its sheet, text formats are sectioned, so the chip says "§". */
export function pageGlyph(kind: DocKind): string {
  return kind === "pdf" || kind === "image" ? "p." : kind === "xlsx" ? "sheet " : "§";
}

export function citationLabel(c: Pick<Citation, "docName" | "kind" | "page">): string {
  return `${c.docName} · ${pageGlyph(c.kind)}${c.page}`;
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
  const nums = citedNumbers(answer).filter((n) => n <= all.length);
  if (!nums.length) return { shown: all, cited: false };
  return { shown: nums.map((n) => all[n - 1]!), cited: true };
}
