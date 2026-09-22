/**
 * §8.8 row 5a: an answer the system kills mid-stream (jetsam, a task-manager swipe, a battery pull) must still be
 * on disk. The assistant row used to be written only after the stream ended, so everything on screen was lost.
 * This says when the text on screen is due to be written through; Chat.tsx does the writing.
 */

/** A kill loses at most this much of the answer. Short enough to be invisible, long enough not to write per token. */
export const PARTIAL_SAVE_MS = 1_500;

export class PartialAnswerSaver {
  private lastAt = 0;
  private lastLength = -1;
  private off = false;

  constructor(private readonly intervalMs: number = PARTIAL_SAVE_MS) {}

  /** True for the first text of an answer, then once per interval, and never for text already written. */
  due(now: number, length: number): boolean {
    if (this.off || length <= 0 || length === this.lastLength) return false;
    return this.lastLength < 0 || now - this.lastAt >= this.intervalMs;
  }

  saved(now: number, length: number): void {
    this.lastAt = now;
    this.lastLength = length;
  }

  /** A store that refused the write (a full disk) is not asked again for this answer; the final write reports it. */
  stop(): void {
    this.off = true;
  }

  /** Whether anything of this answer has been written through yet. */
  get wrote(): boolean {
    return this.lastLength >= 0;
  }
}
