import type { Chunk, DocumentRecord, Message, RetrievalHit } from "@inborn/core";

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

/* A scan with no text layer ends "needs-ocr", or "empty" once OCR found nothing: its pages are still pictures (round 132). */
const READ_STATUSES: ReadonlySet<DocumentRecord["status"]> = new Set(["indexed", "needs-ocr", "empty"]);

/** A PDF whose pages are read, with or without text, and whose file is still held: the only documents a page can be rendered from. */
export const pageReadable = (d: DocumentRecord): boolean => d.kind === "pdf" && READ_STATUSES.has(d.status) && d.indexedPages > 0 && !!d.uri;

export interface PagePhotoInput {
  /** Photos the user put in the composer: theirs win, and the PDF stays text-only for this turn. */
  ownPhotos: number;
  /** Photos one message may carry on this tier. */
  limit: number;
  attached: readonly DocumentRecord[];
  /** This platform can render a PDF page (the native module; not the browser). */
  canRender: boolean;
  /** The user took the page picture off this message on the hold card. */
  declined?: boolean;
  /** Images already in this chat's messages. */
  sent: readonly string[];
  chars: (docId: string) => Promise<Map<number, number>>;
  /** The page of the passage that best answers the question, if any passage does. */
  bestPage: (docIds: string[]) => Promise<{ docId: string; page: number } | null>;
  ink: (doc: DocumentRecord, page: number) => Promise<number>;
}

export interface PagePlan {
  doc: DocumentRecord;
  page: number;
  /** Characters the text route has for the page. */
  chars: number;
  /** Null where no page can be rendered to measure it (the browser). */
  visual: boolean | null;
  /** The page goes with the message as its photo. */
  picture: boolean;
}

/**
 * The sparse page this turn is about, and whether its picture goes with the message. Text-rich PDFs return after the
 * stored page lengths alone: no retrieval, no render.
 */
export async function planPage(i: PagePhotoInput): Promise<PagePlan | null> {
  const pdfs = i.attached.filter(pageReadable);
  if (!pdfs.length) return null;
  const chars = new Map<string, Map<number, number>>();
  for (const d of pdfs) chars.set(d.id, await i.chars(d.id));
  const lengthOf = (docId: string, page: number) => chars.get(docId)?.get(page) ?? 0;
  const withSparse = pdfs.filter((d) => Array.from({ length: d.indexedPages }, (_, p) => p + 1).some((p) => lengthOf(d.id, p) < VISUAL_PAGE_CHARS));
  if (!withSparse.length) return null;
  const onePage = pdfs.length === 1 && pdfs[0]!.pages === 1;
  const best = onePage ? null : await i.bestPage(pdfs.map((d) => d.id));
  const doc = (best && pdfs.find((d) => d.id === best.docId)) || pdfs[0]!;
  const page = best && doc.id === best.docId ? best.page : 1;
  const length = lengthOf(doc.id, page);
  if (length >= VISUAL_PAGE_CHARS) return null;
  const visual = i.canRender ? isVisualPage(length, await i.ink(doc, page)) : null;
  const shown = i.sent.some((p) => p.includes(pageImagePrefix(doc.id, page)));
  const picture = visual === true && !shown && !i.declined && i.ownPhotos === 0 && i.limit >= 1;
  return { doc, page, chars: length, visual, picture };
}

/** A page with only crumbs of text whose picture is not going to the model: the model is told so and handed all of that text. */
export const isThinTurn = (plan: PagePlan | null): plan is PagePlan => !!plan && !plan.picture && plan.visual !== false && plan.chars > 0;

/**
 * The turn carries every attached file whole: one file of one page, sent as its picture or, on the thin route, as all
 * of its text; or a scan with no text at all, sent as its page picture. Retrieval has nothing to choose there, so the
 * index model would add nothing (rounds 131, 132).
 */
export const coversAttachments = (plan: PagePlan | null, attached: readonly DocumentRecord[]): boolean =>
  !!plan && attached.length === 1 && attached[0]!.id === plan.doc.id && (plan.doc.pages === 1 || (plan.picture && plan.doc.chunkCount === 0)) && (plan.picture || isThinTurn(plan));

/** The thin page's own passages first, in reading order, then the other passages that bear on the question. */
export function pageHits(docChunks: readonly Chunk[], page: number, relevant: readonly RetrievalHit[]): RetrievalHit[] {
  const own = docChunks.filter((c) => c.page === page).sort((a, b) => a.ord - b.ord);
  const ids = new Set(own.map((c) => c.id));
  return [...own.map((chunk) => ({ chunk, score: 1, cosine: 0, bm25: 0, bm25Terms: 0 })), ...relevant.filter((h) => !ids.has(h.chunk.id))];
}
