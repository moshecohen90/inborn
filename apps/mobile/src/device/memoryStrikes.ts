/** What a phone's memory warning does: drop the picture projector and keep the model, or hand it to the policy's switch. */
export type MemoryStep = "ease" | "escalate";

/** A second warning this soon after the projector was dropped means the model itself does not fit. */
export const EASE_WINDOW_MS = 120_000;

/** UIKit can report one pressure event twice a few ms apart (simulator, round 134J): that is still the first warning. */
export const SAME_WARNING_MS = 2_000;

/** Memory warnings for the device guard (§6.5 memory row): the policy's stop and unload answer each warning once, not every evaluation while its status holds. */
export class MemoryStrikes {
  private seen = 0;
  private handled = 0;
  private easedAt: number | null = null;

  constructor(private readonly windowMs = EASE_WINDOW_MS) {}

  /** A warning arrived. `projector`: a picture projector is attached and can go first. */
  warn(now: number, level: "warning" | "critical", projector: boolean): MemoryStep | "same" {
    if (level === "warning" && this.easedAt !== null && now - this.easedAt < SAME_WARNING_MS) return "same";
    if (level === "warning" && projector && (this.easedAt === null || now - this.easedAt > this.windowMs)) {
      this.easedAt = now;
      return "ease";
    }
    this.seen++;
    return "escalate";
  }

  /** Whether the stop and unload for the current memory status are still owed. */
  due(): boolean {
    return this.handled !== this.seen;
  }

  acted(): void {
    this.handled = this.seen;
  }
}
