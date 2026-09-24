/**
 * Incremental indexing (spec §5.5: a 200-page file is indexed page by page with a visible progress; §10.4 #30).
 * Every page is committed with its chunks and vectors before `indexedPages` advances, so a cancel, a crash or a
 * full disk resumes from the last committed page and never leaves half a page behind.
 */
import { chunkPage, type ChunkOptions } from "./chunker";
import { forDocuments } from "./embedder";
import { countInstructionLines } from "./injection";
import { detectScript } from "./tokens";
import type { Chunk, DocumentRecord, Embedder, EmbeddingStore, IndexProgress, Ocr, OpenedDocument } from "./types";

export interface IndexOptions {
  doc: DocumentRecord;
  opened: OpenedDocument;
  embedder: Embedder;
  store: EmbeddingStore;
  /** When set, pages without a text layer are read by OCR; otherwise they only count towards "needs OCR". */
  ocr?: { engine: Ocr; languages: string[]; render: (page: number) => Promise<string> };
  onProgress?: (p: IndexProgress) => void;
  signal?: AbortSignal;
  /** Chunks embedded per engine call. */
  batchSize?: number;
  /** Hard cap on pages (the Free tier's 20-page attachment, §7.3). */
  maxPages?: number;
  chunk?: ChunkOptions;
  now?: () => number;
}

export const chunkId = (docId: string, page: number, ord: number): string => `${docId}:${page}:${ord}`;

/** Vectors from another embedder live in another space (and here another dimension), so the document is rebuilt, never cosine-searched. */
export const needsReindex = (doc: Pick<DocumentRecord, "embedModel" | "indexedPages">, embedderId: string): boolean => doc.indexedPages > 0 && doc.embedModel !== embedderId;

/**
 * The record to re-queue: `indexDocument` rebuilds it from page 0, replacing one page at a time. The old rows of the pages
 * not rebuilt yet stay in the store and are searched by their words until their page is replaced (QA F353).
 */
export const reindexFrom = (doc: DocumentRecord): DocumentRecord => ({
  ...doc,
  status: "queued",
  indexedPages: 0,
  chunkCount: 0,
  ocrPages: 0,
  flaggedLines: 0,
  ...(doc.chunkCount > 0 ? { reindexFrom: doc.reindexFrom ?? doc.embedModel ?? "unknown" } : {}),
});

/** Has rows a question can search: its own index, or while a rebuild runs, the old embedder's rows found by their words. */
export const isSearchable = (doc: Pick<DocumentRecord, "chunkCount" | "reindexFrom">): boolean => doc.chunkCount > 0 || !!doc.reindexFrom;

/** The page from which a document's vectors are not in the current embedder's space: every page while nothing is rebuilt. */
export const vectorsValidUpTo = (doc: Pick<DocumentRecord, "reindexFrom" | "indexedPages">): number => (doc.reindexFrom ? doc.indexedPages : Infinity);

export class IndexCancelled extends Error {
  constructor() {
    super("cancelled");
    this.name = "IndexCancelled";
  }
}

/** Runs to completion, cancel, or failure; the returned record is what the store holds. */
export async function indexDocument(o: IndexOptions): Promise<DocumentRecord> {
  const now = o.now ?? Date.now;
  const started = now();
  const batchSize = o.batchSize ?? 8;
  const total = Math.min(o.opened.pages, o.maxPages ?? Infinity);
  const doc: DocumentRecord = { ...o.doc, pages: o.opened.pages, status: "indexing", embedModel: o.embedder.id };
  const report = (phase: IndexProgress["phase"]) => o.onProgress?.({ docId: doc.id, phase, page: doc.indexedPages, pages: total, chunks: doc.chunkCount, elapsedMs: now() - started });
  const cancelled = () => o.signal?.aborted === true;
  /* Rows past the committed page are either a page interrupted mid-commit or the old embedder's rows of a rebuild:
     both are replaced page by page below, so a question asked meanwhile still finds the old rows by their words. */
  await o.store.putDocument(doc);
  let ord = (await o.store.chunksOf(doc.id)).filter((c) => c.page <= doc.indexedPages).length;
  doc.chunkCount = ord;
  let blankPages = 0;
  const scripts = new Map<string, number>();
  try {
    for (let p = doc.indexedPages; p < total; p++) {
      if (cancelled()) throw new IndexCancelled();
      report("extract");
      const page = await o.opened.page(p);
      let text = page.text;
      if (page.needsOcr) {
        if (o.ocr) {
          report("ocr");
          const image = await o.ocr.render(p);
          if (cancelled()) throw new IndexCancelled();
          text = (await o.ocr.engine.recognize(image, o.ocr.languages)).text;
          if (text.trim()) doc.ocrPages++;
        } else blankPages++;
      }
      const { text: normalized, chunks } = chunkPage(text, o.chunk);
      if (!chunks.length) {
        await o.store.deleteChunksOfPage(doc.id, p + 1);
        doc.indexedPages = p + 1;
        await o.store.putDocument(doc);
        report("store");
        continue;
      }
      doc.flaggedLines += countInstructionLines(normalized);
      const script = detectScript(normalized);
      scripts.set(script, (scripts.get(script) ?? 0) + normalized.length);
      const rows: Chunk[] = chunks.map((c, i) => ({ id: chunkId(doc.id, p + 1, ord + i), docId: doc.id, page: p + 1, ord: ord + i, text: c.text, start: c.start, end: c.end, tokens: c.tokens }));
      ord += rows.length;
      const vectors: Float32Array[] = [];
      for (let i = 0; i < rows.length; i += batchSize) {
        if (cancelled()) throw new IndexCancelled();
        report("embed");
        const batch = rows.slice(i, i + batchSize);
        vectors.push(...(await o.embedder.embed(forDocuments(o.embedder.id, batch.map((r) => r.text)))));
      }
      await o.store.deleteChunksOfPage(doc.id, p + 1);
      await o.store.putChunks(rows, vectors);
      doc.chunkCount += rows.length;
      doc.indexedPages = p + 1;
      await o.store.putDocument(doc);
      report("store");
    }
    /* Pages past a lowered cap, or an old index of a longer file, keep no rows once the rebuild is complete. */
    await o.store.deleteChunksFrom(doc.id, total + 1);
    delete doc.reindexFrom;
    const dominant = [...scripts].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (dominant) doc.language = dominant;
    if (!doc.chunkCount) doc.status = blankPages > 0 && !o.ocr ? "needs-ocr" : "empty";
    else doc.status = "indexed";
    delete doc.error;
    await o.store.putDocument(doc);
    report(doc.status === "indexed" ? "done" : doc.status);
    return doc;
  } catch (e: unknown) {
    if (e instanceof IndexCancelled || cancelled()) {
      doc.status = "cancelled";
      await o.store.putDocument(doc);
      report("cancelled");
      return doc;
    }
    doc.status = "failed";
    doc.error = e instanceof Error ? e.message : String(e);
    await o.store.putDocument(doc);
    report("failed");
    return doc;
  }
}
