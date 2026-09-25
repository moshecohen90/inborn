/** Browser: the one IndexedDB database behind the document library (its index snapshot and the picked files' bytes). */
export const DOCUMENTS_IDB_NAME = "inborn-documents";
/* v2 added the file stores; every opener must ask for the same version or an older one fails with VersionError. */
const VERSION = 2;
export const SNAPSHOT_STORE = "snapshot";
export const FILES_STORE = "files";
export const FILE_META_STORE = "fileMeta";

/** Opens the database, runs `work` in one transaction and always closes the connection, so Delete everything is never blocked (F378). */
export function withDocumentsDb<T>(stores: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return resolve(undefined);
    const req = indexedDB.open(DOCUMENTS_IDB_NAME, VERSION);
    req.onupgradeneeded = () => {
      for (const name of [SNAPSHOT_STORE, FILES_STORE, FILE_META_STORE]) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
    };
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
    req.onsuccess = () => {
      const db = req.result;
      let tx: IDBTransaction;
      try {
        tx = db.transaction(stores, mode);
      } catch (e: unknown) {
        db.close();
        return reject(e);
      }
      const r = work(tx);
      tx.oncomplete = () => {
        db.close();
        resolve(r ? r.result : undefined);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        reject(tx.error ?? new Error("indexedDB transaction failed"));
      };
    };
  });
}
