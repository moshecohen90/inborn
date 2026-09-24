/** Documents and RAG on the device (spec §5.5, §7.3, §10.4). Pure types; nothing here touches the network. */
import type { Message } from "../llm/types";

export type DocKind = "pdf" | "docx" | "xlsx" | "html" | "txt" | "md" | "csv" | "image" | "unknown";

export type IndexStatus =
  | "queued"
  /** Pages are being extracted, chunked and embedded; `indexedPages` says how far. */
  | "indexing"
  | "indexed"
  /** Every page came back without a text layer: a scan. OCR is offered, never run by itself. */
  | "needs-ocr"
  /** Stopped by the user; resumes from `indexedPages`. */
  | "cancelled"
  | "failed"
  /** The file had no text at all (0 bytes, or only images and OCR found nothing). */
  | "empty";

export interface DocumentRecord {
  id: string;
  name: string;
  kind: DocKind;
  bytes: number;
  /** 0 until the extractor opened the file. Text files are sectioned into synthetic pages so citations still anchor. */
  pages: number;
  addedAt: number;
  status: IndexStatus;
  /** Pages fully committed to the store; indexing resumes from here after a cancel or a crash. */
  indexedPages: number;
  chunkCount: number;
  /** Dominant script of the text ("he", "ar", "en", "cjk", "mixed"), decided from the indexed pages. */
  language?: string;
  embedModel?: string;
  error?: string;
  /** Where the app keeps its own copy of the file. */
  uri?: string;
  sha256?: string;
  /** Instruction-like lines found while indexing (§10.4 #34); shown in the document details, never followed. */
  flaggedLines: number;
  /** Pages that had no text layer and were read by OCR. */
  ocrPages: number;
  /** Set while a rebuild for a new embedder runs: the embedder of the rows past `indexedPages`, still searched by their words. */
  reindexFrom?: string;
}

export interface Chunk {
  id: string;
  docId: string;
  /** 1-based page (or synthetic section for page-less formats). */
  page: number;
  /** Ordinal within the document, increasing with page and position. */
  ord: number;
  text: string;
  /** Character offsets inside the normalized page text, so "open the passage" can highlight it. */
  start: number;
  end: number;
  tokens: number;
}

export interface ExtractedPage {
  page: number;
  text: string;
  /** No text layer at all (or only whitespace); the page is an image and would need OCR. */
  needsOcr: boolean;
}

export interface DocSource {
  uri: string;
  name: string;
  kind: DocKind;
  bytes: number;
}

export interface OpenedDocument {
  pages: number;
  /** 0-based index; pages are read one at a time so a 200-page file never sits in memory (§10.4 #30). */
  page(index: number): Promise<ExtractedPage>;
  close(): Promise<void>;
}

/* `missing` is not `empty`: a filesystem answers "no file here" with the same 0 a genuinely empty file gives, and the
   two need different sentences or a document that was never found reads as a document with no text in it (QA F277). */
export type ExtractFailure = "empty" | "missing" | "corrupt" | "encrypted" | "unsupported" | "too-large";

export class ExtractError extends Error {
  constructor(
    readonly reason: ExtractFailure,
    message?: string,
  ) {
    super(message ?? reason);
    this.name = "ExtractError";
  }
}

export interface TextExtractor {
  supports(kind: DocKind): boolean;
  open(source: DocSource): Promise<OpenedDocument>;
}

/** On-device OCR (iOS Vision, Android Tesseract, Tesseract.js on the web). Receives a page image the extractor rendered. */
export interface Ocr {
  readonly id: string;
  languages(): Promise<string[]>;
  /** Recognizes one rendered page; `image` is the platform's handle (file URI or bitmap id). */
  recognize(image: string, languages: string[]): Promise<{ text: string; confidence?: number }>;
}

export interface StoredVector {
  chunkId: string;
  docId: string;
  dim: number;
  /** Symmetric int8 quantization of a unit vector: value = q * scale. */
  scale: number;
  q: Int8Array;
}

export interface EmbeddingStore {
  listDocuments(): Promise<DocumentRecord[]>;
  getDocument(id: string): Promise<DocumentRecord | null>;
  putDocument(doc: DocumentRecord): Promise<void>;
  /** Removes the document with its chunks and vectors (spec §5.3: deletable per document). */
  deleteDocument(id: string): Promise<void>;
  putChunks(chunks: Chunk[], vectors: Float32Array[]): Promise<void>;
  chunksOf(docId: string): Promise<Chunk[]>;
  getChunk(id: string): Promise<Chunk | null>;
  vectorsOf(docIds: string[]): Promise<StoredVector[]>;
  /** Drops chunks of pages at or after `fromPage` (1-based); used when re-indexing from a resume point. */
  deleteChunksFrom(docId: string, fromPage: number): Promise<void>;
  /** Drops the chunks of one page, so a rebuild replaces a page without losing the rows of the pages after it. */
  deleteChunksOfPage(docId: string, page: number): Promise<void>;
}

export interface Embedder {
  /** Catalog id of the embedding model ("embed-e5", "null"); it picks the task prefixes (`forDocuments`, `forQuery`). */
  readonly id: string;
  embed(texts: string[]): Promise<Float32Array[]>;
}

export interface RetrievalHit {
  chunk: Chunk;
  /** Fused rank score (reciprocal rank fusion); comparable only within one query. */
  score: number;
  /** Cosine similarity against the query embedding, when the vector side ranked it. */
  cosine: number;
  /** BM25 score, when the lexical side ranked it. */
  bm25: number;
  /** Distinct query terms (stop words excluded) the chunk matched lexically. */
  bm25Terms: number;
}

export interface Citation {
  /** 1-based number the model refers to as [n]. */
  n: number;
  docId: string;
  docName: string;
  kind: DocKind;
  page: number;
  chunkId: string;
  snippet: string;
}

export interface RagPrompt {
  messages: Message[];
  citations: Citation[];
  /** Hits that fit the context budget, in citation order. */
  used: RetrievalHit[];
  droppedForBudget: number;
  /** Strict mode found nothing relevant: answer with the "not found" wording without calling the model. */
  noAnswer: boolean;
  /** Tokens the prompt is estimated to occupy. */
  promptTokens: number;
}

export type IndexPhase = "extract" | "ocr" | "embed" | "store" | "done" | "cancelled" | "failed" | "needs-ocr" | "empty";

export interface IndexProgress {
  docId: string;
  phase: IndexPhase;
  /** Pages committed so far. */
  page: number;
  pages: number;
  chunks: number;
  /** Milliseconds since indexing (re)started. */
  elapsedMs: number;
}
