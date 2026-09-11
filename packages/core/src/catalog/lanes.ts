/** Files at or above this size take the single large lane; smaller ones (companions) never queue behind them (§5.4 install queue). */
export const LARGE_DELIVERY_BYTES = 1_000_000_000;

interface Waiter {
  id: string;
  bytes: number;
  go: () => void;
}

/**
 * Bounded delivery concurrency: one multi-GB file at a time, a few small ones beside it. A whisper/embedding download
 * therefore starts, finishes and gets verified while a Sharp shard is still streaming, instead of waiting for it.
 */
export class DeliveryLanes {
  private readonly running = new Map<string, number>();
  private readonly waiting: Waiter[] = [];

  constructor(
    private readonly largeSlots = 1,
    private readonly smallSlots = 2,
  ) {}

  static isLarge = (bytes: number): boolean => bytes >= LARGE_DELIVERY_BYTES;

  private free(large: boolean): boolean {
    let used = 0;
    for (const b of this.running.values()) if (DeliveryLanes.isLarge(b) === large) used++;
    return used < (large ? this.largeSlots : this.smallSlots);
  }

  /** Resolves when a lane is free; the same id never holds two lanes. */
  acquire(id: string, bytes: number): Promise<void> {
    if (this.running.has(id)) return Promise.resolve();
    if (this.free(DeliveryLanes.isLarge(bytes))) {
      this.running.set(id, bytes);
      return Promise.resolve();
    }
    return new Promise((go) => this.waiting.push({ id, bytes, go }));
  }

  release(id: string): void {
    if (!this.running.delete(id)) {
      const i = this.waiting.findIndex((w) => w.id === id);
      /* A canceled waiter is woken without a lane; the caller re-checks its state and bails. */
      if (i >= 0) this.waiting.splice(i, 1)[0]!.go();
      return;
    }
    /* Smallest first within a lane class so a queued companion never sits behind a queued shard. */
    const next = this.waiting.filter((w) => this.free(DeliveryLanes.isLarge(w.bytes))).sort((a, b) => a.bytes - b.bytes)[0];
    if (!next) return;
    this.waiting.splice(this.waiting.indexOf(next), 1);
    this.running.set(next.id, next.bytes);
    next.go();
  }

  isRunning = (id: string): boolean => this.running.has(id);
  isWaiting = (id: string): boolean => this.waiting.some((w) => w.id === id);
}
