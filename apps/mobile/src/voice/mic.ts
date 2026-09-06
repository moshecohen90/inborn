/* Web / desktop: no PCM stream module; whisper dictation and hands-free are phone features in this phase (spec §5.6 web = later). */
export const SAMPLE_RATE = 16_000;

export interface MicFrame {
  samples: Int16Array;
  at: number;
}

export interface MicOptions {
  onFrame?: (frame: MicFrame, levelDb: number) => void;
  onError?: (message: string) => void;
}

export class MicRecorder {
  constructor(_opts: MicOptions = {}) {}
  async start(): Promise<void> {
    throw new Error("mic-unavailable");
  }
  push(_bytes: Uint8Array): void {}
  isRunning(): boolean {
    return false;
  }
  async stop(): Promise<void> {}
  take(_fromMs = 0): { samples: Float32Array; ms: number } {
    return { samples: new Float32Array(), ms: 0 };
  }
  drop(_beforeMs: number): void {}
  elapsedMs(): number {
    return 0;
  }
  release(): void {}
}

export const micAvailable = (): boolean => false;

export class UtteranceListener {
  constructor(_hooks: { onLevel?: (db: number, speaking: boolean) => void; onError?: (m: string) => void } = {}) {}
  async listen(_maxWaitMs = 12_000): Promise<{ samples: Float32Array; ms: number } | null> {
    throw new Error("mic-unavailable");
  }
  async flush(): Promise<void> {}
  async cancel(): Promise<void> {}
  release(): void {}
}
