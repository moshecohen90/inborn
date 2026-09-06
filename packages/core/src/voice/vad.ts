/**
 * Energy voice-activity detector (spec §5.6, S44). Pure: the phone feeds it one level per audio frame, it answers with
 * speech-start / speech-end events. The noise floor adapts while nobody speaks, so a fan or street noise raises the
 * bar instead of triggering it (§8.2 S44 "background noise: VAD threshold").
 */
export interface VadConfig {
  /** Speech starts when the level rises this far above the noise floor. */
  startMarginDb: number;
  /** Silence resumes when the level falls back under floor + this margin (below the start margin: hysteresis). */
  endMarginDb: number;
  /** Bursts shorter than this are clicks, not speech. */
  minSpeechMs: number;
  /** Silence this long after speech closes the utterance. */
  endSilenceMs: number;
  /** An utterance is cut here even without silence (whisper works on ≤ 30 s windows). */
  maxSpeechMs: number;
  /** Frames kept before the detected start so the first syllable is not lost. */
  preRollMs: number;
  /** The floor never sinks below this: a dead-quiet room still needs a real signal. */
  minFloorDb: number;
  /** The floor never climbs above this: loud constant noise stays detectable as "something". */
  maxFloorDb: number;
}

export const DEFAULT_VAD: VadConfig = {
  startMarginDb: 12,
  endMarginDb: 6,
  minSpeechMs: 250,
  endSilenceMs: 800,
  maxSpeechMs: 30_000,
  preRollMs: 300,
  minFloorDb: -65,
  maxFloorDb: -25,
};

export type VadState = "idle" | "speech" | "trailing";

export type VadEvent =
  | { type: "speech-start"; at: number }
  /** `startedAt` is the pre-rolled start; `reason` says whether silence or the 30 s cap ended it. */
  | { type: "speech-end"; at: number; startedAt: number; reason: "silence" | "max" }
  /** A burst that never reached `minSpeechMs`: the phone drops the buffered frames. */
  | { type: "discard"; at: number };

/** RMS level of one PCM frame in dBFS (-∞ for digital silence, capped at -100). */
export function rmsDb(samples: ArrayLike<number>, fullScale = 32768): number {
  if (!samples.length) return -100;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i]! / fullScale;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / samples.length);
  return rms > 0 ? Math.max(-100, 20 * Math.log10(rms)) : -100;
}

export class EnergyVad {
  state: VadState = "idle";
  floorDb: number;
  private speechStart = 0;
  private lastLoud = 0;
  private confirmed = false;
  private speechSum = 0;
  private speechFrames = 0;

  constructor(readonly config: VadConfig = DEFAULT_VAD, initialFloorDb = -50) {
    this.floorDb = clamp(initialFloorDb, config.minFloorDb, config.maxFloorDb);
  }

  /** Feed one frame level (dBFS) at wall-clock `now` (ms); returns the events this frame produced. */
  update(levelDb: number, now: number): VadEvent[] {
    const c = this.config;
    const events: VadEvent[] = [];
    const loud = levelDb > this.floorDb + c.startMarginDb;
    const quiet = levelDb < this.floorDb + c.endMarginDb;
    switch (this.state) {
      case "idle":
        if (loud) {
          this.state = "speech";
          this.speechStart = now;
          this.lastLoud = now;
          this.confirmed = false;
          this.speechSum = 0;
          this.speechFrames = 0;
        } else {
          this.adaptFloor(levelDb);
        }
        break;
      case "speech":
      case "trailing":
        this.speechSum += levelDb;
        this.speechFrames++;
        if (!quiet) {
          this.lastLoud = now;
          this.state = "speech";
        } else if (this.state === "speech") {
          this.state = "trailing";
        }
        if (!this.confirmed && this.lastLoud - this.speechStart >= c.minSpeechMs) {
          this.confirmed = true;
          events.push({ type: "speech-start", at: Math.max(0, this.speechStart - c.preRollMs) });
        }
        if (now - this.speechStart >= c.maxSpeechMs) {
          events.push(...this.finish(now, "max"));
        } else if (this.state === "trailing" && now - this.lastLoud >= c.endSilenceMs) {
          events.push(...this.finish(now, "silence"));
        }
        break;
    }
    return events;
  }

  /** Forces the current utterance closed (the user tapped stop). */
  flush(now: number): VadEvent[] {
    return this.state === "idle" ? [] : this.finish(now, "silence");
  }

  reset(): void {
    this.state = "idle";
    this.confirmed = false;
  }

  private finish(now: number, reason: "silence" | "max"): VadEvent[] {
    const startedAt = Math.max(0, this.speechStart - this.config.preRollMs);
    const confirmed = this.confirmed;
    this.state = "idle";
    this.confirmed = false;
    /* Nobody talks for 30 s without a pause: that level is the room (a fan, a broken mic), so it becomes the floor. */
    if (reason === "max" && this.speechFrames) this.floorDb = clamp(this.speechSum / this.speechFrames, this.config.minFloorDb, this.config.maxFloorDb);
    if (!confirmed) return [{ type: "discard", at: now }];
    return [{ type: "speech-end", at: now, startedAt, reason }];
  }

  /* Falls quickly to a quieter room, climbs slowly with steady noise (a passing car should not raise the bar for a minute). */
  private adaptFloor(levelDb: number): void {
    const c = this.config;
    const next = levelDb < this.floorDb ? this.floorDb + (levelDb - this.floorDb) * 0.2 : this.floorDb + (levelDb - this.floorDb) * 0.02;
    this.floorDb = clamp(next, c.minFloorDb, c.maxFloorDb);
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
