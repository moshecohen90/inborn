import { Directory, File, Paths } from "expo-file-system";
import type { SqlDriver, SqlValue } from "@inborn/core";
import type * as SQLite from "expo-sqlite";

/** A WAL database is three files; moving the main one without its journal loses the last commits. */
const PARTS = ["", "-wal", "-shm"] as const;
const QUARANTINE = ".corrupt-";

/* expo-sqlite keeps every database under this one directory (it creates it on first open). */
const sqliteDir = (): Directory => new Directory(Paths.document, "SQLite");

const partsOf = (name: string): File[] => PARTS.map((suffix) => new File(sqliteDir(), `${name}${suffix}`));

export function deleteDatabaseFiles(name: string): void {
  for (const file of partsOf(name)) {
    try {
      if (file.exists) file.delete();
    } catch {
      /* held open by the OS; the next attempt overwrites it */
    }
  }
}

/**
 * Moves a damaged database aside instead of deleting it: chats live in this file and nowhere else, so a file the
 * app cannot read today is still the user's only copy. One kept file at a time, so a repeating fault cannot fill
 * the disk. Returns the name it was kept under, or "" when even the move failed.
 */
export function quarantineDatabase(name: string, at: number = Date.now()): string {
  const dir = sqliteDir();
  try {
    if (!dir.exists) return "";
    for (const entry of dir.list()) if (entry.name.startsWith(`${name}${QUARANTINE}`)) entry.delete();
  } catch {
    /* nothing kept from an earlier fault, or it cannot be removed; the move below still matters more */
  }
  const kept = `${name}${QUARANTINE}${new Date(at).toISOString().replace(/[:.]/g, "-")}`;
  let moved = false;
  for (const [i, file] of partsOf(name).entries()) {
    try {
      if (file.exists) {
        file.move(new File(dir, `${kept}${PARTS[i]}`));
        moved = true;
      }
    } catch {
      /* a part that cannot be moved is left where it is; the fresh open overwrites it */
    }
  }
  if (!moved) deleteDatabaseFiles(name);
  return moved ? kept : "";
}

/** Renames a rebuilt database onto the name the app opens. */
export function promoteDatabase(from: string, to: string): void {
  deleteDatabaseFiles(to);
  const dir = sqliteDir();
  for (const [i, file] of partsOf(from).entries()) {
    try {
      if (file.exists) file.move(new File(dir, `${to}${PARTS[i]}`));
    } catch {
      /* the main file is what matters; a missing -wal only costs the checkpointed tail */
    }
  }
}

/** The core salvage speaks this driver; so do the document index and the desktop store. */
export function sqlDriverOf(db: SQLite.SQLiteDatabase): SqlDriver {
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params = []) => void (await db.runAsync(sql, params as SqlValue[])),
    all: <T,>(sql: string, params: SqlValue[] = []) => db.getAllAsync<T>(sql, params),
    /* One connection on purpose: withExclusiveTransactionAsync opens a second one that never gets the SQLCipher key. */
    batch: (statements) =>
      db.withTransactionAsync(async () => {
        for (const s of statements) await db.runAsync(s.sql, (s.params ?? []) as SqlValue[]);
      }),
  };
}
