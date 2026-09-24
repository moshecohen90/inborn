/**
 * On-disk layout for documents, chunks and vectors (spec §5.3: same encrypted DB as the chats, deletable per
 * document). Plain SQL over a tiny driver so expo-sqlite (SQLCipher), the desktop's Rust store and sql.js in tests
 * all share one implementation. Vectors are int8 + scale, base64 in a TEXT column so drivers without blob
 * parameters (Tauri IPC) work unchanged.
 */
import type { Chunk, DocumentRecord, EmbeddingStore, IndexStatus, StoredVector } from "./types";
import { quantize } from "./vector";

export type SqlValue = string | number | null;

export interface SqlDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<void>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Runs statements atomically when the driver can; otherwise one after another. */
  batch(statements: Array<{ sql: string; params?: SqlValue[] }>): Promise<void>;
}

export const RAG_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  pages INTEGER NOT NULL DEFAULT 0,
  added_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  indexed_pages INTEGER NOT NULL DEFAULT 0,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  language TEXT,
  embed_model TEXT,
  error TEXT,
  uri TEXT,
  sha256 TEXT,
  flagged_lines INTEGER NOT NULL DEFAULT 0,
  ocr_pages INTEGER NOT NULL DEFAULT 0,
  reindex_from TEXT
);
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY NOT NULL,
  doc_id TEXT NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  page INTEGER NOT NULL,
  ord INTEGER NOT NULL,
  text TEXT NOT NULL,
  start INTEGER NOT NULL,
  end INTEGER NOT NULL,
  tokens INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS chunks_by_doc ON chunks (doc_id, ord);
CREATE TABLE IF NOT EXISTS vectors (
  chunk_id TEXT PRIMARY KEY NOT NULL REFERENCES chunks (id) ON DELETE CASCADE,
  doc_id TEXT NOT NULL,
  dim INTEGER NOT NULL,
  scale REAL NOT NULL,
  q TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS vectors_by_doc ON vectors (doc_id);
`;

export const RAG_SQL = {
  listDocuments: "SELECT * FROM documents ORDER BY added_at DESC",
  getDocument: "SELECT * FROM documents WHERE id = ?",
  upsertDocument:
    "INSERT INTO documents (id, name, kind, bytes, pages, added_at, status, indexed_pages, chunk_count, language, embed_model, error, uri, sha256, flagged_lines, ocr_pages, reindex_from) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET name = excluded.name, kind = excluded.kind, bytes = excluded.bytes, pages = excluded.pages, status = excluded.status, indexed_pages = excluded.indexed_pages, chunk_count = excluded.chunk_count, language = excluded.language, embed_model = excluded.embed_model, error = excluded.error, uri = excluded.uri, sha256 = excluded.sha256, flagged_lines = excluded.flagged_lines, ocr_pages = excluded.ocr_pages, reindex_from = excluded.reindex_from",
  deleteVectorsOfDoc: "DELETE FROM vectors WHERE doc_id = ?",
  deleteChunksOfDoc: "DELETE FROM chunks WHERE doc_id = ?",
  deleteDocument: "DELETE FROM documents WHERE id = ?",
  insertChunk: "INSERT OR REPLACE INTO chunks (id, doc_id, page, ord, text, start, end, tokens) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  insertVector: "INSERT OR REPLACE INTO vectors (chunk_id, doc_id, dim, scale, q) VALUES (?, ?, ?, ?, ?)",
  chunksOf: "SELECT * FROM chunks WHERE doc_id = ? ORDER BY ord",
  getChunk: "SELECT * FROM chunks WHERE id = ?",
  vectorsOf: (n: number) => `SELECT * FROM vectors WHERE doc_id IN (${Array.from({ length: n }, () => "?").join(", ")})`,
  deleteVectorsFrom: "DELETE FROM vectors WHERE chunk_id IN (SELECT id FROM chunks WHERE doc_id = ? AND page >= ?)",
  deleteChunksFrom: "DELETE FROM chunks WHERE doc_id = ? AND page >= ?",
  deleteVectorsOfPage: "DELETE FROM vectors WHERE chunk_id IN (SELECT id FROM chunks WHERE doc_id = ? AND page = ?)",
  deleteChunksOfPage: "DELETE FROM chunks WHERE doc_id = ? AND page = ?",
  /* Databases created before round 89 have no such column; SQLite has no ADD COLUMN IF NOT EXISTS. */
  addReindexFrom: "ALTER TABLE documents ADD COLUMN reindex_from TEXT",
  documentColumns: "PRAGMA table_info(documents)",
} as const;

type DocRow = {
  id: string;
  name: string;
  kind: string;
  bytes: number;
  pages: number;
  added_at: number;
  status: string;
  indexed_pages: number;
  chunk_count: number;
  language: string | null;
  embed_model: string | null;
  error: string | null;
  uri: string | null;
  sha256: string | null;
  flagged_lines: number;
  ocr_pages: number;
  reindex_from?: string | null;
};
type ChunkRow = { id: string; doc_id: string; page: number; ord: number; text: string; start: number; end: number; tokens: number };
type VectorRow = { chunk_id: string; doc_id: string; dim: number; scale: number; q: string };

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Base64 without Buffer/atob so the same code runs in Hermes, browsers and Node. */
export function int8ToBase64(q: Int8Array): string {
  const bytes = new Uint8Array(q.buffer, q.byteOffset, q.byteLength);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += B64[(n >>> 18) & 63]! + B64[(n >>> 12) & 63]! + (b === undefined ? "=" : B64[(n >>> 6) & 63]!) + (c === undefined ? "=" : B64[n & 63]!);
  }
  return out;
}

export function base64ToInt8(s: string): Int8Array {
  const clean = s.replace(/=+$/, "");
  const out = new Int8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (const ch of clean) {
    acc = (acc << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = ((acc >>> bits) & 0xff) << 24 >> 24;
    }
  }
  return out;
}

const toDoc = (r: DocRow): DocumentRecord => ({
  id: r.id,
  name: r.name,
  kind: r.kind as DocumentRecord["kind"],
  bytes: r.bytes,
  pages: r.pages,
  addedAt: r.added_at,
  status: r.status as IndexStatus,
  indexedPages: r.indexed_pages,
  chunkCount: r.chunk_count,
  flaggedLines: r.flagged_lines,
  ocrPages: r.ocr_pages,
  ...(r.language ? { language: r.language } : {}),
  ...(r.embed_model ? { embedModel: r.embed_model } : {}),
  ...(r.error ? { error: r.error } : {}),
  ...(r.uri ? { uri: r.uri } : {}),
  ...(r.sha256 ? { sha256: r.sha256 } : {}),
  ...(r.reindex_from ? { reindexFrom: r.reindex_from } : {}),
});

const toChunk = (r: ChunkRow): Chunk => ({ id: r.id, docId: r.doc_id, page: r.page, ord: r.ord, text: r.text, start: r.start, end: r.end, tokens: r.tokens });
const toVector = (r: VectorRow): StoredVector => ({ chunkId: r.chunk_id, docId: r.doc_id, dim: r.dim, scale: r.scale, q: base64ToInt8(r.q) });

export class SqlEmbeddingStore implements EmbeddingStore {
  private constructor(private readonly db: SqlDriver) {}

  static async open(db: SqlDriver): Promise<SqlEmbeddingStore> {
    await db.exec(RAG_SCHEMA_SQL);
    const columns = await db.all<{ name: string }>(RAG_SQL.documentColumns);
    if (!columns.some((c) => c.name === "reindex_from")) await db.run(RAG_SQL.addReindexFrom);
    return new SqlEmbeddingStore(db);
  }

  async listDocuments(): Promise<DocumentRecord[]> {
    return (await this.db.all<DocRow>(RAG_SQL.listDocuments)).map(toDoc);
  }

  async getDocument(id: string): Promise<DocumentRecord | null> {
    const r = (await this.db.all<DocRow>(RAG_SQL.getDocument, [id]))[0];
    return r ? toDoc(r) : null;
  }

  async putDocument(d: DocumentRecord): Promise<void> {
    await this.db.run(RAG_SQL.upsertDocument, [d.id, d.name, d.kind, d.bytes, d.pages, d.addedAt, d.status, d.indexedPages, d.chunkCount, d.language ?? null, d.embedModel ?? null, d.error ?? null, d.uri ?? null, d.sha256 ?? null, d.flaggedLines, d.ocrPages, d.reindexFrom ?? null]);
  }

  /* Explicit deletes rather than relying on foreign_keys being on for this connection. */
  async deleteDocument(id: string): Promise<void> {
    await this.db.batch([
      { sql: RAG_SQL.deleteVectorsOfDoc, params: [id] },
      { sql: RAG_SQL.deleteChunksOfDoc, params: [id] },
      { sql: RAG_SQL.deleteDocument, params: [id] },
    ]);
  }

  async putChunks(chunks: Chunk[], vectors: Float32Array[]): Promise<void> {
    if (chunks.length !== vectors.length) throw new Error("chunks and vectors differ in length");
    const statements: Array<{ sql: string; params: SqlValue[] }> = [];
    chunks.forEach((c, i) => {
      const { q, scale } = quantize(vectors[i]!);
      statements.push({ sql: RAG_SQL.insertChunk, params: [c.id, c.docId, c.page, c.ord, c.text, c.start, c.end, c.tokens] });
      statements.push({ sql: RAG_SQL.insertVector, params: [c.id, c.docId, q.length, scale, int8ToBase64(q)] });
    });
    await this.db.batch(statements);
  }

  async chunksOf(docId: string): Promise<Chunk[]> {
    return (await this.db.all<ChunkRow>(RAG_SQL.chunksOf, [docId])).map(toChunk);
  }

  async getChunk(id: string): Promise<Chunk | null> {
    const r = (await this.db.all<ChunkRow>(RAG_SQL.getChunk, [id]))[0];
    return r ? toChunk(r) : null;
  }

  async vectorsOf(docIds: string[]): Promise<StoredVector[]> {
    if (!docIds.length) return [];
    return (await this.db.all<VectorRow>(RAG_SQL.vectorsOf(docIds.length), docIds)).map(toVector);
  }

  async deleteChunksFrom(docId: string, fromPage: number): Promise<void> {
    await this.db.batch([
      { sql: RAG_SQL.deleteVectorsFrom, params: [docId, fromPage] },
      { sql: RAG_SQL.deleteChunksFrom, params: [docId, fromPage] },
    ]);
  }

  async deleteChunksOfPage(docId: string, page: number): Promise<void> {
    await this.db.batch([
      { sql: RAG_SQL.deleteVectorsOfPage, params: [docId, page] },
      { sql: RAG_SQL.deleteChunksOfPage, params: [docId, page] },
    ]);
  }
}
