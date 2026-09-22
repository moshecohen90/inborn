import type { Chunk, DocumentRecord, EmbeddingStore, StoredVector } from "./types";

/**
 * Two stores behind one interface (spec §5.7): a document added inside an incognito session lives in RAM and
 * never reaches the encrypted database, while the saved library stays searchable in the same question. Ownership
 * is decided per document id, once, by the caller — never guessed from the record.
 */
export class SplitEmbeddingStore implements EmbeddingStore {
  constructor(
    private readonly saved: EmbeddingStore,
    private readonly ram: EmbeddingStore,
    private readonly isRam: (docId: string) => boolean,
  ) {}

  private storeFor(docId: string): EmbeddingStore {
    return this.isRam(docId) ? this.ram : this.saved;
  }

  async listDocuments(): Promise<DocumentRecord[]> {
    const [saved, ram] = await Promise.all([this.saved.listDocuments(), this.ram.listDocuments()]);
    return [...saved, ...ram];
  }

  getDocument(id: string): Promise<DocumentRecord | null> {
    return this.storeFor(id).getDocument(id);
  }

  putDocument(doc: DocumentRecord): Promise<void> {
    return this.storeFor(doc.id).putDocument(doc);
  }

  /** Deletes from both: a document may be removed after its session ended, when it is no longer owned by RAM. */
  async deleteDocument(id: string): Promise<void> {
    await Promise.all([this.saved.deleteDocument(id), this.ram.deleteDocument(id)]);
  }

  async putChunks(chunks: Chunk[], vectors: Float32Array[]): Promise<void> {
    const ramAt: number[] = [];
    const savedAt: number[] = [];
    chunks.forEach((c, i) => (this.isRam(c.docId) ? ramAt : savedAt).push(i));
    const write = (where: EmbeddingStore, at: number[]) => (at.length ? where.putChunks(at.map((i) => chunks[i]!), at.map((i) => vectors[i]!)) : Promise.resolve());
    await Promise.all([write(this.saved, savedAt), write(this.ram, ramAt)]);
  }

  chunksOf(docId: string): Promise<Chunk[]> {
    return this.storeFor(docId).chunksOf(docId);
  }

  /** A chunk id carries no ownership, so the RAM side answers first and the saved library is the fallback. */
  async getChunk(id: string): Promise<Chunk | null> {
    return (await this.ram.getChunk(id)) ?? (await this.saved.getChunk(id));
  }

  async vectorsOf(docIds: string[]): Promise<StoredVector[]> {
    const ram = docIds.filter((id) => this.isRam(id));
    const saved = docIds.filter((id) => !this.isRam(id));
    const [a, b] = await Promise.all([saved.length ? this.saved.vectorsOf(saved) : [], ram.length ? this.ram.vectorsOf(ram) : []]);
    return [...a, ...b];
  }

  async deleteChunksFrom(docId: string, fromPage: number): Promise<void> {
    await this.storeFor(docId).deleteChunksFrom(docId, fromPage);
  }
}
