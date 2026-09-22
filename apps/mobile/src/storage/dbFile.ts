import type { SqlDriver } from "@inborn/core";

/**
 * Web and desktop have no SQLite file of ours to move: the browser owns IndexedDB, and the desktop's file belongs
 * to the Rust side, which quarantines its own (store.rs) and reports it through `db_open`.
 */
export const deleteDatabaseFiles = (_name: string): void => undefined;
export const quarantineDatabase = (_name: string, _at?: number): string => "";
export const promoteDatabase = (_from: string, _to: string): void => undefined;

export function sqlDriverOf(_db: unknown): SqlDriver {
  throw new Error("no local SQLite database on this platform");
}
