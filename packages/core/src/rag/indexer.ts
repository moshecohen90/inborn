/**
 * Incremental indexing (spec §5.5: a 200-page file is indexed page by page with a visible progress; §10.4 #30).
 * Every page is committed with its chunks and vectors before `indexedPages` advances, so a cancel, a crash or a
 * full disk resumes from the last committed page and never leaves half a page behind.
 */
import { DEFAULT_CHUNK, chunkPage, chunkingOf, type ChunkOptions } from "./chunker";
import { forDocuments, indexModelOf } from "./embedder";
import { countInstructionLines } from "./injection";
import { LEXICAL_INDEX_ID } from "./overview";
import { detectScript } from "./tokens";
import type { Chunk, DocumentRecord, Embedder, EmbeddingStore, IndexProgress, Ocr, OpenedDocument } from "./types";

export interface IndexOptions {
  doc: DocumentRecord;
  opened: OpenedDocument;
  /** Null while no index model is installed: the chunks are stored without vectors and found by their words. */
  embedder: Embedder | null;
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
export const needsReindex = (doc: Pick<DocumentRecord, "embedModel" | "indexedPages">, embedder: Pick<Embedder, "id" | "revision">): boolean => doc.indexedPages > 0 && doc.embedModel !== indexModelOf(embedder);

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
export const vectorsValidUpTo = (doc: Pick<DocumentRecord, "reindexFrom" | "indexedPages" | "vectorPages">): number => (doc.reindexFrom ? (doc.vectorPages ?? doc.indexedPages) : Infinity);

/** What a document needs under this embedder and chunking: nothing, new vectors for its stored passages, or a fresh read. */
export type RebuildKind = "none" | "vectors" | "full";

const baseModel = (embedModel: string | undefined): string | undefined => embedModel?.split("@")[0];

/* A row from before `chunking` was stored, from this same model, was cut by today's chunker: chunker.ts and tokens.ts have not moved since embed-e5 shipped. */
const storedChunking = (doc: Pick<DocumentRecord, "chunking" | "embedModel">, embedder: Pick<Embedder, "id">, chunking: string): string | undefined =>
  doc.chunking ?? (baseModel(doc.embedModel) === embedder.id ? chunking : undefined);

export function rebuildKind(doc: Pick<DocumentRecord, "embedModel" | "indexedPages" | "chunkCount" | "status" | "chunking">, embedder: Pick<Embedder, "id" | "revision">, chunking: string): RebuildKind {
  if (doc.indexedPages === 0) return "none";
  const sameCut = storedChunking(doc, embedder, chunking) === chunking;
  if (doc.embedModel === indexModelOf(embedder)) return sameCut ? "none" : "full";
  return sameCut && doc.status === "indexed" && doc.chunkCount > 0 ? "vectors" : "full";
}

/** The record to re-queue when only the vectors change: every passage stays, and stays searchable, while `vectorPages` advances. */
export const reembedFrom = (doc: DocumentRecord): DocumentRecord => ({ ...doc, status: "queued", reindexFrom: doc.reindexFrom ?? doc.embedModel ?? "unknown", vectorPages: doc.vectorPages ?? 0 });

/* Bounded so a long file's run cannot hold every vector it made. */
const MEMO_LIMIT = 256;

/** Embeds `texts` in batches; a text already embedded in this run (a repeated header page, an empty form) reuses its vector. */
async function embedTexts(embedder: Embedder, texts: string[], batchSize: number, memo: Map<string, Float32Array>, signal?: AbortSignal): Promise<Float32Array[]> {
  const fresh = [...new Set(texts.filter((t) => !memo.has(t)))];
  for (let i = 0; i < fresh.length; i += batchSize) {
    if (signal?.aborted) throw new IndexCancelled();
    const batch = fresh.slice(i, i + batchSize);
    const vectors = await embedder.embed(forDocuments(embedder.id, batch), signal);
    batch.forEach((t, j) => memo.set(t, vectors[j]!));
  }
  const out = texts.map((t) => memo.get(t)!);
  for (const key of memo.keys()) {
    if (memo.size <= MEMO_LIMIT) break;
    memo.delete(key);
  }
  return out;
}

/**
 * Rebuilds a document's vectors for `embedder` from the passages already stored, page by page: no page is read, OCRed or
 * re-cut, a cancel resumes at `vectorPages`, and a question meanwhile uses the new vectors up to there and words past it.
 */
export async function reembedStored(o: { doc: DocumentRecord; store: EmbeddingStore; embedder: Embedder; batchSize?: number; signal?: AbortSignal; onProgress?: (p: IndexProgress) => void; chunking?: string; now?: () => number }): Promise<DocumentRecord> {
  const now = o.now ?? Date.now;
  const started = now();
  const chunks = await o.store.chunksOf(o.doc.id);
  const lastPage = chunks.reduce((max, c) => Math.max(max, c.page), 0);
  const doc: DocumentRecord = { ...o.doc, status: "indexing", reindexFrom: o.doc.reindexFrom ?? o.doc.embedModel ?? "unknown", vectorPages: o.doc.vectorPages ?? 0 };
  const total = Math.max(o.doc.pages, lastPage);
  const report = (phase: IndexProgress["phase"]) => o.onProgress?.({ docId: doc.id, phase, page: doc.vectorPages ?? 0, pages: total, chunks: chunks.length, elapsedMs: now() - started });
  const byPage = new Map<number, Chunk[]>();
  for (const c of chunks) if (c.page > doc.vectorPages!) byPage.set(c.page, [...(byPage.get(c.page) ?? []), c]);
  const memo = new Map<string, Float32Array>();
  try {
    for (const [page, rows] of [...byPage].sort((a, b) => a[0] - b[0])) {
      if (o.signal?.aborted) throw new IndexCancelled();
      report("embed");
      await o.store.putChunks(rows, await embedTexts(o.embedder, rows.map((r) => r.text), o.batchSize ?? 8, memo, o.signal));
      doc.vectorPages = page;
      await o.store.putDocument(doc);
      report("store");
    }
  } catch (e: unknown) {
    if (!(e instanceof IndexCancelled) && !o.signal?.aborted) throw e;
    doc.status = "cancelled";
    await o.store.putDocument(doc);
    report("cancelled");
    return doc;
  }
  const done: DocumentRecord = {
    ...doc,
    embedModel: indexModelOf(o.embedder),
    chunkCount: chunks.length,
    indexedPages: Math.max(o.doc.indexedPages, lastPage),
    status: chunks.length ? "indexed" : "empty",
    ...(o.chunking ? { chunking: o.chunking } : {}),
  };
  delete done.reindexFrom;
  delete done.vectorPages;
  delete done.error;
  await o.store.putDocument(done);
  report(done.status === "indexed" ? "done" : "empty");
  return done;
}

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
  const doc: DocumentRecord = { ...o.doc, pages: o.opened.pages, status: "indexing", embedModel: o.embedder ? indexModelOf(o.embedder) : LEXICAL_INDEX_ID, chunking: chunkingOf({ ...DEFAULT_CHUNK, ...o.chunk }) };
  delete doc.vectorPages;
  const report = (phase: IndexProgress["phase"]) => o.onProgress?.({ docId: doc.id, phase, page: doc.indexedPages, pages: total, chunks: doc.chunkCount, elapsedMs: now() - started });
  const cancelled = () => o.signal?.aborted === true;
  /* Rows past the committed page are either a page interrupted mid-commit or the old embedder's rows of a rebuild:
     both are replaced page by page below, so a question asked meanwhile still finds the old rows by their words. */
  await o.store.putDocument(doc);
  let ord = (await o.store.chunksOf(doc.id)).filter((c) => c.page <= doc.indexedPages).length;
  doc.chunkCount = ord;
  let blankPages = 0;
  const memo = new Map<string, Float32Array>();
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
      if (o.embedder) report("embed");
      const vectors = o.embedder ? await embedTexts(o.embedder, rows.map((r) => r.text), batchSize, memo, o.signal) : [];
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
