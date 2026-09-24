/** In-memory EmbeddingStore: the web tier (snapshotted into IndexedDB by the app), incognito attachments and tests. */
import type { Chunk, DocumentRecord, EmbeddingStore, StoredVector } from "./types";
import { quantize } from "./vector";

export interface StoreSnapshot {
  documents: DocumentRecord[];
  chunks: Chunk[];
  vectors: Array<Omit<StoredVector, "q"> & { q: number[] }>;
}

export class MemoryEmbeddingStore implements EmbeddingStore {
  private readonly docs = new Map<string, DocumentRecord>();
  private readonly chunks = new Map<string, Chunk>();
  private readonly vectors = new Map<string, StoredVector>();

  async listDocuments(): Promise<DocumentRecord[]> {
    return [...this.docs.values()].sort((a, b) => b.addedAt - a.addedAt);
  }

  async getDocument(id: string): Promise<DocumentRecord | null> {
    return this.docs.get(id) ?? null;
  }

  async putDocument(doc: DocumentRecord): Promise<void> {
    this.docs.set(doc.id, { ...doc });
  }

  async deleteDocument(id: string): Promise<void> {
    this.docs.delete(id);
    for (const [cid, c] of this.chunks) {
      if (c.docId === id) {
        this.chunks.delete(cid);
        this.vectors.delete(cid);
      }
    }
  }

  async putChunks(chunks: Chunk[], vectors: Float32Array[]): Promise<void> {
    if (chunks.length !== vectors.length) throw new Error("chunks and vectors differ in length");
    chunks.forEach((c, i) => {
      this.chunks.set(c.id, c);
      const { q, scale } = quantize(vectors[i]!);
      this.vectors.set(c.id, { chunkId: c.id, docId: c.docId, dim: q.length, scale, q });
    });
  }

  async chunksOf(docId: string): Promise<Chunk[]> {
    return [...this.chunks.values()].filter((c) => c.docId === docId).sort((a, b) => a.ord - b.ord);
  }

  async getChunk(id: string): Promise<Chunk | null> {
    return this.chunks.get(id) ?? null;
  }

  async vectorsOf(docIds: string[]): Promise<StoredVector[]> {
    const set = new Set(docIds);
    return [...this.vectors.values()].filter((v) => set.has(v.docId));
  }

  async deleteChunksFrom(docId: string, fromPage: number): Promise<void> {
    for (const [cid, c] of this.chunks) {
      if (c.docId === docId && c.page >= fromPage) {
        this.chunks.delete(cid);
        this.vectors.delete(cid);
      }
    }
  }

  async deleteChunksOfPage(docId: string, page: number): Promise<void> {
    for (const [cid, c] of this.chunks) {
      if (c.docId === docId && c.page === page) {
        this.chunks.delete(cid);
        this.vectors.delete(cid);
      }
    }
  }

  /** Drops everything at once; the incognito session's whole index goes this way when the session ends (§5.7). */
  clear(): void {
    this.docs.clear();
    this.chunks.clear();
    this.vectors.clear();
  }

  snapshot(): StoreSnapshot {
    return { documents: [...this.docs.values()], chunks: [...this.chunks.values()], vectors: [...this.vectors.values()].map((v) => ({ ...v, q: Array.from(v.q) })) };
  }

  static fromSnapshot(s: StoreSnapshot): MemoryEmbeddingStore {
    const store = new MemoryEmbeddingStore();
    for (const d of s.documents) store.docs.set(d.id, d);
    for (const c of s.chunks) store.chunks.set(c.id, c);
    for (const v of s.vectors) store.vectors.set(v.chunkId, { ...v, q: Int8Array.from(v.q) });
    return store;
  }
}
