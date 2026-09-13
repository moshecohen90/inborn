/**
 * A native SQLite handle can die underneath the repository (expo-sqlite on Android closes a cached connection when any
 * JS wrapper of it is garbage-collected, and a wiped file leaves an unlinked handle). The pure part: recognise such an
 * error and run the statement once more on a freshly opened handle; every other error passes through untouched (QA F15).
 *
 * Closing is gated (QA F18): expo-sqlite runs closeAsync and statements on different coroutine threads, and a native
 * close that overlaps a statement being stepped or finalized double-frees it (SIGABRT in libexpo-sqlite). So a close
 * waits for every in-flight statement, and a statement that arrives while a close runs waits for the close to end.
 */

const DEAD_HANDLE = /NullPointerException|Access to closed resource|InvalidSharedObjectId|shared object.*(released|invalid)|database is closed/i;

/** Thrown by a statement that arrives after the owner closed for good; never a dead-handle error, so nothing reopens. */
export const CLOSED_MESSAGE = "storage handle closed by the app";

/** A statement that outlives this is not waited for: a hung statement must not hold a wipe forever. */
export const DRAIN_TIMEOUT_MS = 5000;

/** Message plus the cause chain: expo-sqlite wraps the SQLite text one level down. */
export function errorChain(e: unknown): string {
  const parts: string[] = [];
  for (let cur: unknown = e, i = 0; cur && i < 5; cur = (cur as { cause?: unknown }).cause, i++) parts.push(cur instanceof Error ? cur.message : String(cur));
  return parts.join(" | ");
}

export const isDeadHandleError = (e: unknown): boolean => DEAD_HANDLE.test(errorChain(e));

export interface CloseReport {
  /** Statements that were in flight when the close began. */
  waitedFor: number;
  /** False when the drain timed out and the close ran anyway. */
  drained: boolean;
}

const noop = () => undefined;

/** One owner of a handle: hands out the live one and reopens at most once at a time when a caller reports it dead. */
export class ReopeningHandle<T> {
  private reopening: Promise<T> | null = null;
  private readonly inFlight = new Set<Promise<void>>();
  private closing: Promise<CloseReport> | null = null;
  private closed = false;
  private closedUnderneath: T | null = null;

  constructor(
    private current: T,
    private readonly open: () => Promise<T>,
    private readonly onReopen: (error: unknown) => void = noop,
    private readonly closeHandle: (db: T) => Promise<void> = async () => undefined,
  ) {}

  get(): T {
    return this.current;
  }

  get inFlightCount(): number {
    return this.inFlight.size;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  /** Concurrent statements that hit the same dead handle share one reopen instead of racing four. */
  reopen(dead: T, error: unknown): Promise<T> {
    if (this.closed) return Promise.reject(new Error(CLOSED_MESSAGE));
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
    for (let attempt = 0; ; attempt++) {
      // No await between these checks and `track`: a close snapshots the in-flight set synchronously, so a statement is either in it or waits.
      while (this.closing) await this.closing.catch(noop);
      if (this.closed) throw new Error(CLOSED_MESSAGE);
      if (this.reopening) {
        await this.reopening.catch(noop);
        continue;
      }
      const db = this.current;
      try {
        return await this.track(task(db));
      } catch (e: unknown) {
        if (!isDead(e) || attempt > 0) throw e;
        await this.reopen(db, e);
      }
    }
  }

  /** Waits for in-flight statements, then closes for good: later statements reject with CLOSED_MESSAGE and never reopen. */
  close(drainTimeoutMs = DRAIN_TIMEOUT_MS): Promise<CloseReport> {
    return this.closeWith(true, drainTimeoutMs);
  }

  /** Waits for in-flight statements, then closes the live handle only: the next statement finds it dead and reopens (dev hook). */
  closeUnderneath(drainTimeoutMs = DRAIN_TIMEOUT_MS): Promise<CloseReport> {
    return this.closeWith(false, drainTimeoutMs);
  }

  private closeWith(terminal: boolean, drainTimeoutMs: number): Promise<CloseReport> {
    if (this.closing) return this.closing;
    if (this.closed || (!terminal && this.closedUnderneath === this.current)) return Promise.resolve({ waitedFor: 0, drained: true });
    if (terminal) this.closed = true;
    this.closing = (async () => {
      if (this.reopening) await this.reopening.catch(noop);
      const db = this.current;
      const waitedFor = this.inFlight.size;
      const drained = await this.drain(drainTimeoutMs);
      await this.closeHandle(db);
      if (!terminal) this.closedUnderneath = db;
      return { waitedFor, drained };
    })().finally(() => {
      this.closing = null;
    });
    return this.closing;
  }

  private track<R>(p: Promise<R>): Promise<R> {
    const done = p.then(noop, noop);
    this.inFlight.add(done);
    return p.finally(() => this.inFlight.delete(done));
  }

  private drain(timeoutMs: number): Promise<boolean> {
    if (!this.inFlight.size) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      void Promise.all([...this.inFlight]).then(() => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  }
}
