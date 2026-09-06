/** Windows has no thermal API (§6.5): a 35 % drop in tok/s within 60 s is read as throttling, proposal only. */
export class SpeedWatch {
  private samples: { at: number; tps: number }[] = [];
  private throttled = false;

  constructor(
    private readonly windowMs = 60_000,
    private readonly dropRatio = 0.35,
  ) {}

  /** Record the tok/s of a finished answer; returns whether the machine looks throttled. */
  sample(tokPerSec: number, now: number): boolean {
    if (tokPerSec > 0) this.samples.push({ at: now, tps: tokPerSec });
    return this.evaluate(now);
  }

  isThrottling(now: number): boolean {
    return this.evaluate(now);
  }

  private evaluate(now: number): boolean {
    this.samples = this.samples.filter((s) => now - s.at <= this.windowMs);
    const latest = this.samples[this.samples.length - 1];
    if (!latest || this.samples.length < 2) return (this.throttled = false);
    const peak = Math.max(...this.samples.map((s) => s.tps));
    /* Clears only once speed is back within 20 % of the window's peak, so one slow answer does not blink the line. */
    if (latest.tps <= peak * (1 - this.dropRatio)) this.throttled = true;
    else if (latest.tps >= peak * 0.8) this.throttled = false;
    return this.throttled;
  }
}
