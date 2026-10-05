import type { Chunk, DocumentRecord, Message } from "@inborn/core";

/* Round 130 (docs/qa/r130-pdf-page-vision): text pages inked ≤ 0.02 of a 128 px render, picture pages ≥ 0.27; characters
   alone do not separate them, a short memo page has fewer than a shop page with two photos. */
export const VISUAL_PAGE_CHARS = 600;
export const VISUAL_PAGE_INK = 0.1;

export const isVisualPage = (chars: number, ink: number): boolean => chars < VISUAL_PAGE_CHARS && ink >= VISUAL_PAGE_INK;

/** Characters the text route carries for each page: the end of its last stored passage. */
export function charsByPage(chunks: readonly Chunk[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const c of chunks) out.set(c.page, Math.max(out.get(c.page) ?? 0, c.end));
  return out;
}

/* Stored with the message, so a later turn knows the chat already showed the model this page. */
export const pageImagePrefix = (docId: string, page: number): string => `pdfpage-${docId}-p${page}-`;

const shows = (path: string, docId: string): boolean => path.includes(`pdfpage-${docId}-p`);

/** The conversation already carries a page picture of one of these documents, so the turn is asked like a photo turn. */
export const carriesPage = (messages: readonly Message[], docIds: readonly string[]): boolean =>
  messages.some((m) => m.images?.some((p) => docIds.some((id) => shows(p, id))));

/** A PDF whose pages are read and whose file is still held: the only documents a page can be rendered from. */
export const pageReadable = (d: DocumentRecord): boolean => d.kind === "pdf" && d.status === "indexed" && d.indexedPages > 0 && !!d.uri;

export interface PagePhotoInput {
  /** Photos the user put in the composer: theirs win, and the PDF stays text-only for this turn. */
  ownPhotos: number;
  /** Photos one message may carry on this tier. */
  limit: number;
  attached: readonly DocumentRecord[];
  /** This platform can render a PDF page (the native module; not the browser). */
  canRender: boolean;
  /** Images already in this chat's messages. */
  sent: readonly string[];
  chars: (docId: string) => Promise<Map<number, number>>;
  /** The page of the passage that best answers the question, if any passage does. */
  bestPage: (docIds: string[]) => Promise<{ docId: string; page: number } | null>;
  ink: (doc: DocumentRecord, page: number) => Promise<number>;
}

export interface PagePhoto {
  doc: DocumentRecord;
  page: number;
}

/**
 * The page this turn is about, when it is a visual one that the chat has not shown the model yet. Text-rich PDFs return
 * after the stored page lengths alone: no retrieval, no render.
 */
export async function planPagePhoto(i: PagePhotoInput): Promise<PagePhoto | null> {
  if (i.ownPhotos > 0 || i.limit < 1 || !i.canRender) return null;
  const pdfs = i.attached.filter(pageReadable);
  if (!pdfs.length) return null;
  const chars = new Map<string, Map<number, number>>();
  for (const d of pdfs) chars.set(d.id, await i.chars(d.id));
  const sparse = (docId: string, page: number) => (chars.get(docId)?.get(page) ?? 0) < VISUAL_PAGE_CHARS;
  const withSparse = pdfs.filter((d) => Array.from({ length: d.indexedPages }, (_, p) => p + 1).some((p) => sparse(d.id, p)));
  if (!withSparse.length) return null;
  const onePage = pdfs.length === 1 && pdfs[0]!.pages === 1;
  const best = onePage ? null : await i.bestPage(pdfs.map((d) => d.id));
  const doc = (best && pdfs.find((d) => d.id === best.docId)) || pdfs[0]!;
  const page = best && doc.id === best.docId ? best.page : 1;
  if (!sparse(doc.id, page)) return null;
  if (i.sent.some((p) => p.includes(pageImagePrefix(doc.id, page)))) return null;
  return isVisualPage(chars.get(doc.id)?.get(page) ?? 0, await i.ink(doc, page)) ? { doc, page } : null;
}
