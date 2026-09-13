import type * as SQLite from "expo-sqlite";
import { ReopeningHandle, type CloseReport } from "./reopen";

type Db = SQLite.SQLiteDatabase;

/** The repository's one connection: every statement goes through the live handle and survives it dying underneath (QA F15). */
export class ReopeningDatabase {
  private readonly handle: ReopeningHandle<Db>;

  constructor(db: Db, open: () => Promise<Db>, onReopen?: (error: unknown) => void) {
    this.handle = new ReopeningHandle(db, open, onReopen, (dead) => dead.closeAsync());
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

  /** The body gets the raw handle: statements inside must not reopen half way, the whole body reruns instead. */
  withTransactionAsync(task: (db: Db) => Promise<void>): Promise<void> {
    return this.handle.run((db) => db.withTransactionAsync(() => task(db)));
  }

  /** Waits for in-flight statements before the native close (QA F18); nothing runs on this repository afterwards. */
  closeAsync(): Promise<CloseReport> {
    return this.handle.close();
  }

  get closed(): boolean {
    return this.handle.isClosed;
  }

  get inFlight(): number {
    return this.handle.inFlightCount;
  }

  /** Dev hook: closes the live handle under the repository after the in-flight statements drain; the next statement reopens. */
  closeUnderneath(): Promise<CloseReport> {
    return this.handle.closeUnderneath();
  }
}
