import type * as SQLite from "expo-sqlite";
import { ReopeningHandle } from "./reopen";

type Db = SQLite.SQLiteDatabase;

/** The repository's one connection: every statement goes through the live handle and survives it dying underneath (QA F15). */
export class ReopeningDatabase {
  private readonly handle: ReopeningHandle<Db>;

  constructor(db: Db, open: () => Promise<Db>, onReopen?: (error: unknown) => void) {
    this.handle = new ReopeningHandle(db, open, onReopen);
  }

  /** The raw handle, for a transaction body: statements inside must not reopen half way, the whole body reruns instead. */
  raw(): Db {
    return this.handle.get();
  }

  execAsync(source: string): Promise<void> {
    return this.handle.run((db) => db.execAsync(source));
  }

  runAsync(source: string, ...params: unknown[]): Promise<SQLite.SQLiteRunResult> {
    return this.handle.run((db) => db.runAsync(source, ...(params as SQLite.SQLiteVariadicBindParams)));
  }

  getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null> {
    return this.handle.run((db) => db.getFirstAsync<T>(source, ...(params as SQLite.SQLiteVariadicBindParams)));
  }

  getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]> {
    return this.handle.run((db) => db.getAllAsync<T>(source, ...(params as SQLite.SQLiteVariadicBindParams)));
  }

  withTransactionAsync(task: (db: Db) => Promise<void>): Promise<void> {
    return this.handle.run((db) => db.withTransactionAsync(() => task(db)));
  }

  closeAsync(): Promise<void> {
    return this.handle.get().closeAsync();
  }
}
