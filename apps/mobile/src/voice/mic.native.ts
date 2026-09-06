import LiveAudioStream from "@fugood/react-native-audio-pcm-stream";
import { Paths } from "expo-file-system";
import { Platform } from "react-native";
import { DEFAULT_VAD, EnergyVad, rmsDb, type VadConfig, type VadEvent } from "@inborn/core";

/** whisper.cpp wants 16 kHz mono; Android's VOICE_RECOGNITION source (6) skips the OS's music-oriented processing. */
export const SAMPLE_RATE = 16_000;
const FRAME_SAMPLES = 1600; // 100 ms
const MAX_BUFFER_MS = 35_000;

export interface MicFrame {
  samples: Int16Array;
  at: number;
}

export interface MicOptions {
  onFrame?: (frame: MicFrame, levelDb: number) => void;
  onError?: (message: string) => void;
}

let listeners = 0;

/* base64 → bytes without Buffer (Hermes has atob). */
function decodeBase64(b64: string): Uint8Array {
  const bin = globalThis.atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * One microphone owner at a time: PCM16 frames from the device, kept in a ring of `MAX_BUFFER_MS`, handed out as
 * Float32 for whisper. The stream module is a singleton, so this class serialises access to it.
 */
export class MicRecorder {
  /** The recorder that currently owns the microphone stream. */
  static current: MicRecorder | null = null;
  private frames: MicFrame[] = [];
  private running = false;
  private startedAt = 0;

  constructor(private readonly opts: MicOptions = {}) {}

  async start(): Promise<void> {
    if (MicRecorder.current && MicRecorder.current !== this) await MicRecorder.current.stop();
    MicRecorder.current = this;
    this.frames = [];
    this.startedAt = Date.now();
    LiveAudioStream.init({
      sampleRate: SAMPLE_RATE,
      channels: 1,
      bitsPerSample: 16,
      audioSource: Platform.OS === "android" ? 6 : undefined,
      bufferSize: FRAME_SAMPLES * 2,
      /* The module insists on a wav path; the file is never read and lives in the cache. */
      wavFile: `${Paths.cache.uri.replace(/^file:\/\//, "")}/mic-${Date.now()}.wav`,
    } as Parameters<typeof LiveAudioStream.init>[0]);
    if (!listeners++) LiveAudioStream.on("data", onData);
    this.running = true;
    LiveAudioStream.start();
  }

  /** Called by the module-level data listener; frames go to the current owner only. */
  push(bytes: Uint8Array): void {
    if (!this.running) return;
    const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
    const frame = { samples: Int16Array.from(samples), at: Date.now() };
    this.frames.push(frame);
    const limit = frame.at - MAX_BUFFER_MS;
    while (this.frames.length && this.frames[0]!.at < limit) this.frames.shift();
    this.opts.onFrame?.(frame, rmsDb(frame.samples));
  }

  isRunning(): boolean {
    return this.running;
  }

  /** Stops the microphone; the buffered audio stays readable through `take()`. */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    try {
      await LiveAudioStream.stop();
    } catch (e: unknown) {
      this.opts.onError?.(e instanceof Error ? e.message : String(e));
    }
    if (MicRecorder.current === this) MicRecorder.current = null;
  }

  /** Float32 PCM of everything since `fromMs` (wall clock) and its duration; clears nothing. */
  take(fromMs = 0): { samples: Float32Array; ms: number } {
    const picked = this.frames.filter((f) => f.at >= fromMs);
    const total = picked.reduce((n, f) => n + f.samples.length, 0);
    const out = new Float32Array(total);
    let at = 0;
    for (const f of picked) {
      for (let i = 0; i < f.samples.length; i++) out[at + i] = f.samples[i]! / 32768;
      at += f.samples.length;
    }
    return { samples: out, ms: Math.round((total * 1000) / SAMPLE_RATE) };
  }

  /** Drops frames older than `beforeMs` (after an utterance was consumed). */
  drop(beforeMs: number): void {
    this.frames = this.frames.filter((f) => f.at >= beforeMs);
  }

  elapsedMs(): number {
    return Date.now() - this.startedAt;
  }

  release(): void {
    this.frames = [];
  }
}

function onData(b64: string): void {
  const owner = MicRecorder.current;
  if (!owner) return;
  try {
    owner.push(decodeBase64(b64));
  } catch (e: unknown) {
    console.warn("[voice] mic frame", e);
  }
}

export const micAvailable = (): boolean => true;

/**
 * Microphone + energy VAD for hands-free listening (S44): resolves with the utterance's audio when the speaker stops,
 * null when the listener was cancelled. `maxWaitMs` ends a listen that never heard speech.
 */
export class UtteranceListener {
  private recorder: MicRecorder;
  private vad: EnergyVad;
  private resolve: ((r: { samples: Float32Array; ms: number } | null) => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private speaking = false;

  constructor(
    private readonly hooks: { onLevel?: (db: number, speaking: boolean) => void; onError?: (m: string) => void } = {},
    config: VadConfig = DEFAULT_VAD,
  ) {
    this.vad = new EnergyVad(config);
    this.recorder = new MicRecorder({
      onFrame: (frame, level) => this.onFrame(frame.at, level),
      onError: (m) => this.hooks.onError?.(m),
    });
  }

  private onFrame(at: number, level: number): void {
    const events = this.vad.update(level, at);
    this.hooks.onLevel?.(level, this.vad.state !== "idle");
    for (const e of events) this.onVad(e);
  }

  private onVad(e: VadEvent): void {
    if (e.type === "speech-start") {
      this.speaking = true;
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
    } else if (e.type === "speech-end") {
      const audio = this.recorder.take(e.startedAt);
      this.recorder.drop(e.at);
      this.finish(audio);
    } else if (e.type === "discard") {
      this.speaking = false;
    }
  }

  async listen(maxWaitMs = 12_000): Promise<{ samples: Float32Array; ms: number } | null> {
    this.vad.reset();
    this.speaking = false;
    await this.recorder.start();
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.timer = setTimeout(() => {
        if (!this.speaking) this.finish(null);
      }, maxWaitMs);
    });
  }

  /** Ends the utterance now (a tap while listening). */
  async flush(): Promise<void> {
    for (const e of this.vad.flush(Date.now())) this.onVad(e);
    if (this.resolve) this.finish(null);
  }

  async cancel(): Promise<void> {
    await this.finish(null);
  }

  private async finish(result: { samples: Float32Array; ms: number } | null): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const r = this.resolve;
    this.resolve = null;
    await this.recorder.stop();
    r?.(result);
  }

  release(): void {
    this.recorder.release();
  }
}
