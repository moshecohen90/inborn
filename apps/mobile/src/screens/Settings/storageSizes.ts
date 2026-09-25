import { IDB_NAME } from "../../storage/web/idbRepository";
import { DOCUMENTS_IDB_NAME } from "../../documents/db";
import { MODELS_DIR } from "../../web/opfs";

export interface StorageSizes {
  chats: number | null;
  documents: number | null;
  models: number | null;
  memory: number;
  reports: number;
}

export interface WebSizeEnv {
  indexedDB?: IDBFactory;
  storage?: StorageManager;
}

/** Bytes a stored value takes, counted the way IndexedDB keeps it: UTF-8 text, 8-byte numbers, raw typed-array buffers. */
export function valueBytes(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "string") return new TextEncoder().encode(v).length;
  if (typeof v === "number") return 8;
  if (typeof v === "boolean") return 1;
  if (ArrayBuffer.isView(v)) return v.byteLength;
  if (v instanceof ArrayBuffer) return v.byteLength;
  if (Array.isArray(v)) return v.reduce<number>((n, x) => n + valueBytes(x), 0);
  if (v instanceof Map) return [...v.entries()].reduce<number>((n, [k, x]) => n + valueBytes(k) + valueBytes(x), 0);
  if (typeof v === "object") return Object.entries(v as Record<string, unknown>).reduce<number>((n, [k, x]) => n + valueBytes(k) + valueBytes(x), 0);
  return 0;
}

/** Sums every row of every store without creating the database when it does not exist yet. */
async function databaseBytes(factory: IDBFactory, name: string): Promise<number> {
  const listed = await factory.databases?.().catch(() => null);
  if (listed && !listed.some((d) => d.name === name)) return 0;
  const db = await new Promise<IDBDatabase | null>((resolve) => {
    const r = factory.open(name);
    r.onupgradeneeded = () => r.transaction?.abort();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => resolve(null);
    r.onblocked = () => resolve(null);
  });
  if (!db) return 0;
  try {
    const stores = Array.from({ length: db.objectStoreNames.length }, (_, i) => db.objectStoreNames.item(i)!);
    if (!stores.length) return 0;
    const tx = db.transaction(stores, "readonly");
    const rows = await Promise.all(
      stores.map(
        (s) =>
          new Promise<unknown[]>((resolve) => {
            const g = tx.objectStore(s).getAll();
            g.onsuccess = () => resolve(g.result as unknown[]);
            g.onerror = () => resolve([]);
          }),
      ),
    );
    return rows.reduce<number>((n, r) => n + valueBytes(r), 0);
  } finally {
    db.close();
  }
}

/* "cache" is wllama's own OPFS cache: the embedder GGUF it fetched by URL. */
const MODEL_DIRS = [MODELS_DIR, "cache"];

async function opfsModelBytes(storage: StorageManager): Promise<number> {
  const root = await storage.getDirectory();
  let n = 0;
  for (const name of MODEL_DIRS) {
    let dir: FileSystemDirectoryHandle;
    try {
      dir = await root.getDirectoryHandle(name);
    } catch {
      continue;
    }
    for await (const [, h] of (dir as FileSystemDirectoryHandle & { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
      if (h.kind === "file") n += (await (h as FileSystemFileHandle).getFile()).size;
    }
  }
  return n;
}

const pageEnv = (): WebSizeEnv => ({
  indexedDB: typeof indexedDB === "undefined" ? undefined : indexedDB,
  storage: typeof navigator === "undefined" ? undefined : navigator.storage,
});

/** Web: counted per store (chats and documents in IndexedDB, models in OPFS), since the origin-wide estimate lags OPFS writes. */
export async function storageSizes(env: WebSizeEnv = pageEnv()): Promise<StorageSizes> {
  const count = async (f: () => Promise<number>): Promise<number | null> => {
    try {
      return await f();
    } catch {
      return null;
    }
  };
  const idb = env.indexedDB;
  const storage = env.storage;
  const [chats, documents, models] = await Promise.all([
    idb ? count(() => databaseBytes(idb, IDB_NAME)) : Promise.resolve(null),
    idb ? count(() => databaseBytes(idb, DOCUMENTS_IDB_NAME)) : Promise.resolve(null),
    storage?.getDirectory ? count(() => opfsModelBytes(storage)) : Promise.resolve(null),
  ]);
  return { chats, documents, models, memory: 0, reports: 0 };
}
