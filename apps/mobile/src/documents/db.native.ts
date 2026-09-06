import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import { SqlEmbeddingStore, type EmbeddingStore, type SqlDriver, type SqlValue } from "@inborn/core";
import { DB_NAME } from "../storage/schema";

/* Same key item as the chat repository (storage/sqliteRepository.ts): documents live in the same SQLCipher file (spec §5.3). */
const KEY_ITEM = "inborn.db.key";
const KEY_OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

async function openSharedDb(): Promise<SQLite.SQLiteDatabase> {
  const key = await SecureStore.getItemAsync(KEY_ITEM, KEY_OPTIONS);
  if (!key) throw new Error("chat store not opened yet; the document index needs its key");
  /* Without useNewConnection Android hands back the chat's cached connection; the index gets its own, keyed once. */
  const db = await SQLite.openDatabaseAsync(DB_NAME, { useNewConnection: true });
  await db.execAsync(`PRAGMA key = "x'${key}'";`);
  await db.getFirstAsync("SELECT count(*) AS n FROM sqlite_master");
  return db;
}

const tagged = async <T,>(sql: string, p: Promise<T>): Promise<T> => {
  try {
    return await p;
  } catch (e: unknown) {
    throw new Error(`${e instanceof Error ? e.message : String(e)} [${sql.slice(0, 48)}]`);
  }
};

function driverOf(db: SQLite.SQLiteDatabase): SqlDriver {
  return {
    exec: (sql) => tagged(sql, db.execAsync(sql)),
    run: async (sql, params = []) => void (await tagged(sql, db.runAsync(sql, params as SqlValue[]))),
    all: <T,>(sql: string, params: SqlValue[] = []) => tagged(sql, db.getAllAsync<T>(sql, params)),
    /* withExclusiveTransactionAsync opens a second native connection that never gets the SQLCipher key; stay on this one. */
    batch: (statements) =>
      db.withTransactionAsync(async () => {
        for (const s of statements) await tagged(s.sql, db.runAsync(s.sql, (s.params ?? []) as SqlValue[]));
      }),
  };
}

let opened: Promise<EmbeddingStore> | null = null;

/** The document index inside the encrypted chat database; falls back to RAM when the key is unavailable. */
export function openRagStore(): Promise<EmbeddingStore> {
  return (opened ??= openSharedDb().then((db) => SqlEmbeddingStore.open(driverOf(db))));
}

export const ragStoreKind = (): "sqlcipher" | "memory" => "sqlcipher";
