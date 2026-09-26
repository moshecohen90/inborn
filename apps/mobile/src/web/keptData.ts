import { openIdb } from "../storage/web/idbRepository";
import { FILE_META_STORE, SNAPSHOT_STORE, withDocumentsDb } from "../documents/idb";

const count = (db: IDBDatabase, store: string): Promise<number> =>
  new Promise((resolve, reject) => {
    const r = db.transaction(store, "readonly").objectStore(store).count();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("IndexedDB count failed"));
  });

/**
 * F405: whether this browser still holds anything of the user's (chats, documents, the document index). Only then is
 * the Model step alone right after a lost model; with nothing to keep, onboarding starts over. A probe that fails
 * answers true, so an unreadable store never costs anyone the short path.
 */
export async function browserKeepsData(): Promise<boolean> {
  if (typeof indexedDB === "undefined") return false;
  try {
    const db = await openIdb();
    try {
      if ((await count(db, "chats")) > 0) return true;
    } finally {
      db.close();
    }
    const files = await withDocumentsDb([FILE_META_STORE], "readonly", (tx) => tx.objectStore(FILE_META_STORE).count());
    if ((files ?? 0) > 0) return true;
    /* The index snapshot outlives its documents (deleting the last one writes an empty snapshot). */
    const snapshot = await withDocumentsDb<{ documents?: unknown[] } | undefined>([SNAPSHOT_STORE], "readonly", (tx) => tx.objectStore(SNAPSHOT_STORE).get("v1"));
    return (snapshot?.documents?.length ?? 0) > 0;
  } catch {
    return true;
  }
}
