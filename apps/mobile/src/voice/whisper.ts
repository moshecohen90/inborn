/* Web / desktop: whisper on WebGPU is a later phase (spec §5.6); the browser tier has no transcription companion yet. */
export const WHISPER_MODEL_ID = "speech-whisper-base";
export const DEV_WHISPER_FILE = "whisper.bin";

export interface Transcription {
  text: string;
  language?: string;
  whisperLanguage: string;
  ms: number;
}

export const resolveWhisper = (): string | null => null;
export const whisperInstalled = (): boolean => false;
export async function installWhisper(): Promise<unknown> {
  throw new Error("whisper-unavailable");
}

class WhisperEngine {
  loadMs = 0;
  async load(): Promise<never> {
    throw new Error("whisper-unavailable");
  }
  isLoaded(): boolean {
    return false;
  }
  async transcribe(_samples: Float32Array, _opts: { language?: string; signal?: AbortSignal } = {}): Promise<Transcription> {
    throw new Error("whisper-unavailable");
  }
  async transcribeFile(_uri: string, _opts: { language?: string } = {}): Promise<Transcription> {
    throw new Error("whisper-unavailable");
  }
  async unload(): Promise<void> {}
}

let engine: WhisperEngine | null = null;
export const getWhisper = (): WhisperEngine => (engine ??= new WhisperEngine());
