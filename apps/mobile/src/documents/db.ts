import { MemoryEmbeddingStore, SqlEmbeddingStore, type Chunk, type DocumentRecord, type EmbeddingStore, type SqlDriver, type SqlValue, type StoreSnapshot } from "@inborn/core";
import { isTauri } from "../adapters/tauri";
import { SNAPSHOT_STORE, withDocumentsDb } from "./idb";

type TauriGlobal = { core: { invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> } };
const invoke = <T,>(cmd: string, args?: Record<string, unknown>): Promise<T> => (window as Window & { __TAURI__?: TauriGlobal }).__TAURI__!.core.invoke<T>(cmd, args);

/** Desktop: the Rust SQLCipher store already opened for chats serves the document tables too. */
function tauriDriver(): SqlDriver {
  return {
    exec: (sql) => invoke("db_exec", { sql }),
    run: async (sql, params = []) => void (await invoke<number>("db_run", { sql, params })),
    all: <T,>(sql: string, params: SqlValue[] = []) => invoke<T[]>("db_all", { sql, params }),
    batch: async (statements) => void (await invoke<number[]>("db_batch", { statements: statements.map((s) => ({ sql: s.sql, params: s.params ?? [] })) })),
  };
}

export { DOCUMENTS_IDB_NAME } from "./idb";

const idbGet = (): Promise<StoreSnapshot | null> =>
  withDocumentsDb<StoreSnapshot | undefined>([SNAPSHOT_STORE], "readonly", (tx) => tx.objectStore(SNAPSHOT_STORE).get("v1")).then(
    (v) => v ?? null,
    () => null,
  );

const idbPut = (snapshot: StoreSnapshot): Promise<void> =>
  withDocumentsDb([SNAPSHOT_STORE], "readwrite", (tx) => void tx.objectStore(SNAPSHOT_STORE).put(snapshot, "v1")).then(
    () => undefined,
    () => undefined,
  );

/** Browser: the in-memory store, snapshotted into IndexedDB after every write (no SQLCipher on the web, like the chats). */
class PersistedMemoryStore implements EmbeddingStore {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  constructor(private readonly inner: MemoryEmbeddingStore) {}

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private touch(): void {
    if (this.disposed) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void idbPut(this.inner.snapshot()), 300);
  }

  listDocuments = () => this.inner.listDocuments();
  getDocument = (id: string) => this.inner.getDocument(id);
  chunksOf = (id: string) => this.inner.chunksOf(id);
  getChunk = (id: string) => this.inner.getChunk(id);
  vectorsOf = (ids: string[]) => this.inner.vectorsOf(ids);
  async putDocument(doc: DocumentRecord): Promise<void> {
    await this.inner.putDocument(doc);
    this.touch();
  }
  async deleteDocument(id: string): Promise<void> {
    await this.inner.deleteDocument(id);
    this.touch();
  }
  async putChunks(chunks: Chunk[], vectors: Float32Array[]): Promise<void> {
    await this.inner.putChunks(chunks, vectors);
    this.touch();
  }
  async deleteChunksFrom(docId: string, fromPage: number): Promise<void> {
    await this.inner.deleteChunksFrom(docId, fromPage);
    this.touch();
  }
  async deleteChunksOfPage(docId: string, page: number): Promise<void> {
    await this.inner.deleteChunksOfPage(docId, page);
    this.touch();
  }
}

let opened: Promise<EmbeddingStore> | null = null;

/** Delete everything: the next open reads the (now empty) database, and the old store never writes again. */
export function forgetRagStore(): void {
  const was = opened;
  opened = null;
  void was?.then((s) => (s instanceof PersistedMemoryStore ? s.dispose() : undefined)).catch(() => undefined);
}

export function openRagStore(): Promise<EmbeddingStore> {
  return (opened ??= (async () => {
    if (isTauri()) return SqlEmbeddingStore.open(tauriDriver());
    const snapshot = await idbGet();
    return new PersistedMemoryStore(snapshot ? MemoryEmbeddingStore.fromSnapshot(snapshot) : new MemoryEmbeddingStore());
  })());
}

export const ragStoreKind = (): "sqlcipher" | "indexeddb" | "memory" => (isTauri() ? "sqlcipher" : typeof indexedDB === "undefined" ? "memory" : "indexeddb");
