import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import { SqlEmbeddingStore, type EmbeddingStore, type SqlDriver, type SqlValue } from "@inborn/core";
import { DB_NAME } from "../storage/schema";
import { SECURE_ITEMS } from "../storage/secureItems";
import { ReopeningHandle } from "../storage/reopen";

/* Same key item as the chat repository (storage/sqliteRepository.ts): documents live in the same SQLCipher file (spec §5.3). */
const KEY_ITEM = SECURE_ITEMS.dbKey;
const KEY_OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

async function openSharedDb(): Promise<SQLite.SQLiteDatabase> {
  const key = await SecureStore.getItemAsync(KEY_ITEM, KEY_OPTIONS);
  if (!key) throw new Error("chat store not opened yet; the document index needs its key");
  /* Without useNewConnection Android hands back the chat's cached connection; the index gets its own, keyed once. */
  const db = await SQLite.openDatabaseAsync(DB_NAME, { useNewConnection: true });
  await db.execAsync(`PRAGMA key = "x'${key}'";`);
  /* The chat connection writes the answer while a rebuild writes pages (QA F353): wait for its lock instead of failing the page. */
  await db.execAsync("PRAGMA busy_timeout = 5000;");
  await db.getFirstAsync("SELECT count(*) AS n FROM sqlite_master");
  return db;
}

const tagged = async <T,>(sql: string, p: Promise<T>): Promise<T> => {
  try {
    return await p;
  } catch (e: unknown) {
    throw new Error(`${e instanceof Error ? e.message : String(e)} [${sql.slice(0, 48)}]`, { cause: e });
  }
};

type Handle = ReopeningHandle<SQLite.SQLiteDatabase>;
/* The index never reopens underneath itself; the handle is here for its close gate (QA F18: no close mid-statement). */
const never = () => false;

function driverOf(handle: Handle): SqlDriver {
  return {
    exec: (sql) => tagged(sql, handle.run((db) => db.execAsync(sql), never)),
    run: async (sql, params = []) => void (await tagged(sql, handle.run((db) => db.runAsync(sql, params as SqlValue[]), never))),
    all: <T,>(sql: string, params: SqlValue[] = []) => tagged(sql, handle.run((db) => db.getAllAsync<T>(sql, params), never)),
    /* withExclusiveTransactionAsync opens a second native connection that never gets the SQLCipher key; stay on this one. */
    batch: (statements) =>
      handle.run(
        (db) =>
          db.withTransactionAsync(async () => {
            for (const s of statements) await tagged(s.sql, db.runAsync(s.sql, (s.params ?? []) as SqlValue[]));
          }),
        never,
      ),
  };
}

let opened: Promise<{ store: EmbeddingStore; handle: Handle }> | null = null;

/** The document index inside the encrypted chat database; falls back to RAM when the key is unavailable. */
export function openRagStore(): Promise<EmbeddingStore> {
  opened ??= openSharedDb().then(async (db) => {
    const handle: Handle = new ReopeningHandle(db, () => Promise.reject(new Error("the document index does not reopen")), undefined, (dead) => dead.closeAsync());
    return { store: await SqlEmbeddingStore.open(driverOf(handle)), handle };
  });
  return opened.then((o) => o.store);
}

/**
 * Delete everything: the index lets go of the file before it is deleted. Its own keyed connection kept the database
 * open through the wipe, so expo-sqlite refused the delete, and the next open must key the new file (F419).
 */
export async function closeRagStore(): Promise<void> {
  const was = opened;
  opened = null;
  const o = await was?.catch(() => null);
  await o?.handle.close();
}

export const ragStoreKind = (): "sqlcipher" | "memory" => "sqlcipher";
