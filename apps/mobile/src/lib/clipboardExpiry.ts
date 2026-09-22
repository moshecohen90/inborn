/**
 * "Copy with expiry" (§7.5, §10.6 case 58): the pasteboard is cleared N seconds after a copy.
 * Platform-free so it can be tested without a device; `clipboard.ts` supplies the real pasteboard.
 */

export interface Pasteboard {
  write(text: string): Promise<void>;
  /** The current pasteboard text, or null where the platform will not let us read it back. */
  read(): Promise<string | null>;
  clear(): Promise<void>;
}

export interface ExpiryTimers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimers: ExpiryTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export class ExpiringClipboard {
  private expirySec = 0;
  private pending: { handle: unknown; text: string } | null = null;
  /** Resolves once the scheduled clear has run; tests await it, production ignores it. */
  private running: Promise<void> = Promise.resolve();

  constructor(
    private readonly pasteboard: Pasteboard,
    private readonly timers: ExpiryTimers = realTimers,
  ) {}

  /** 0 = Off. Turning it off also releases a copy that is already waiting to expire. */
  setExpiry(seconds: number): void {
    this.expirySec = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
    if (!this.expirySec) this.cancel();
  }

  get expirySeconds(): number {
    return this.expirySec;
  }

  /** The text a scheduled clear is still waiting on (tests and diagnostics). */
  get pendingText(): string | null {
    return this.pending?.text ?? null;
  }

  async copy(text: string): Promise<void> {
    this.cancel();
    await this.pasteboard.write(text);
    if (!this.expirySec) return;
    const handle = this.timers.set(() => {
      this.running = this.expire(text);
    }, this.expirySec * 1000);
    this.pending = { handle, text };
  }

  /** Lets a test wait for a fired timer's async clear. */
  settled(): Promise<void> {
    return this.running;
  }

  private cancel(): void {
    if (!this.pending) return;
    this.timers.clear(this.pending.handle);
    this.pending = null;
  }

  private async expire(text: string): Promise<void> {
    this.pending = null;
    try {
      const current = await this.pasteboard.read();
      // Never wipe something we did not put there: an unreadable pasteboard (web without permission) is left alone.
      if (current === null || current !== text) return;
      await this.pasteboard.clear();
    } catch {
      /* A pasteboard that refuses to be read or written is not an error the user can act on. */
    }
  }
}
