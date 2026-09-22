/**
 * One generation at a time on one context (spec §10.3 case 23). Chat, the documents ask, quick actions and the
 * benchmark all run on the same llama.cpp context, and llama.rn keeps a single `inflight` per context: a second
 * `completion()` while the first is streaming reaches the same native state. Pure; the engine holds the instance.
 */

/** Thrown to a caller whose turn never came because it was cancelled while queued; no inference ran for it. */
export class QueuedAbortError extends Error {
  constructor() {
    super("queued-generation-aborted");
    this.name = "QueuedAbortError";
  }
}

export const isQueuedAbort = (e: unknown): e is QueuedAbortError => e instanceof QueuedAbortError || (e as Error | null)?.name === "QueuedAbortError";

/** Called once to hand the context to the next turn; calling it twice is a no-op. */
export type ReleaseTurn = () => void;

function abortSignalPromise(signal: AbortSignal): { promise: Promise<never>; dispose: () => void } {
  let dispose = (): void => undefined;
  const promise = new Promise<never>((_resolve, reject) => {
    if (signal.aborted) return reject(new QueuedAbortError());
    const onAbort = (): void => reject(new QueuedAbortError());
    signal.addEventListener("abort", onAbort, { once: true });
    dispose = () => signal.removeEventListener("abort", onAbort);
  });
  /* Nothing awaits this promise when the turn wins the race, and an unhandled rejection would reach the log. */
  promise.catch(() => undefined);
  return { promise, dispose };
}

export class InferenceQueue {
  private tail: Promise<void> = Promise.resolve();
  private queued = 0;
  private running = 0;

  /** Turns waiting for the context. */
  get waiting(): number {
    return this.queued;
  }

  /** Waiting plus the one in flight. */
  get depth(): number {
    return this.queued + this.running;
  }

  get busy(): boolean {
    return this.running > 0;
  }

  /**
   * Resolves when this turn owns the context, with the function that hands it on. Rejects with QueuedAbortError
   * when `signal` aborts first, and the turn is dropped from the queue without ever reaching the engine.
   */
  async acquire(signal?: AbortSignal): Promise<ReleaseTurn> {
    /* An already-cancelled turn never joins the queue: a race against a resolved `tail` would let it through. */
    if (signal?.aborted) throw new QueuedAbortError();
    const previous = this.tail;
    let release: ReleaseTurn = () => undefined;
    const turn = new Promise<void>((resolve) => {
      release = resolve;
    });
    /* The chain must survive a rejected turn, or one failed generation would wedge every later one. */
    this.tail = previous.then(
      () => turn,
      () => turn,
    );
    this.queued++;
    const abort = signal ? abortSignalPromise(signal) : null;
    try {
      await (abort ? Promise.race([previous, abort.promise]) : previous);
    } catch (e: unknown) {
      /* Give the slot straight back: the ordering still holds, because `tail` waits for `previous` before this turn. */
      release();
      this.queued--;
      throw e;
    } finally {
      abort?.dispose();
    }
    this.queued--;
    this.running++;
    let handed = false;
    return () => {
      if (handed) return;
      handed = true;
      this.running--;
      release();
    };
  }
}
