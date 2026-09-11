/**
 * A native SQLite handle can die underneath the repository (expo-sqlite on Android closes a cached connection when any
 * JS wrapper of it is garbage-collected, and a wiped file leaves an unlinked handle). The pure part: recognise such an
 * error and run the statement once more on a freshly opened handle; every other error passes through untouched (QA F15).
 */

const DEAD_HANDLE = /NullPointerException|Access to closed resource|InvalidSharedObjectId|shared object.*(released|invalid)|database is closed/i;

/** Message plus the cause chain: expo-sqlite wraps the SQLite text one level down. */
export function errorChain(e: unknown): string {
  const parts: string[] = [];
  for (let cur: unknown = e, i = 0; cur && i < 5; cur = (cur as { cause?: unknown }).cause, i++) parts.push(cur instanceof Error ? cur.message : String(cur));
  return parts.join(" | ");
}

export const isDeadHandleError = (e: unknown): boolean => DEAD_HANDLE.test(errorChain(e));

/** One owner of a handle: hands out the live one and reopens at most once at a time when a caller reports it dead. */
export class ReopeningHandle<T> {
  private reopening: Promise<T> | null = null;

  constructor(
    private current: T,
    private readonly open: () => Promise<T>,
    private readonly onReopen: (error: unknown) => void = () => undefined,
  ) {}

  get(): T {
    return this.current;
  }

  /** Concurrent statements that hit the same dead handle share one reopen instead of racing four. */
  reopen(dead: T, error: unknown): Promise<T> {
    if (this.current !== dead) return Promise.resolve(this.current);
    if (!this.reopening) {
      this.onReopen(error);
      this.reopening = this.open()
        .then((fresh) => {
          this.current = fresh;
          return fresh;
        })
        .finally(() => {
          this.reopening = null;
        });
    }
    return this.reopening;
  }

  /** Runs `task` on the live handle; a dead-handle failure reopens and runs it once more, from the start. */
  async run<R>(task: (db: T) => Promise<R>, isDead: (e: unknown) => boolean = isDeadHandleError): Promise<R> {
    const db = this.current;
    try {
      return await task(db);
    } catch (e: unknown) {
      if (!isDead(e)) throw e;
      return task(await this.reopen(db, e));
    }
  }
}
