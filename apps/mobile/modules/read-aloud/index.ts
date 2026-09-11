import { requireOptionalNativeModule } from "expo";

export interface TtsEngineInfo {
  name: string;
  label: string;
  isDefault: boolean;
}

interface NativeReadAloud {
  engines(): TtsEngineInfo[];
  probe(engine: string, language: string): Promise<{ available: boolean; voices: string[] }>;
  speak(engine: string, text: string, language: string, voice: string | null, rate: number, id: string): Promise<void>;
  stop(): Promise<void>;
  addListener(event: "onStart" | "onDone" | "onError", listener: (e: { id: string; stopped?: boolean; code?: number }) => void): { remove(): void };
}

/** Android only: engine-aware read-aloud (QA T44). Null elsewhere; iOS and the web keep expo-speech. */
const native = requireOptionalNativeModule<NativeReadAloud>("ReadAloud");

export const hasReadAloud = (): boolean => native !== null;
export const ttsEngines = (): TtsEngineInfo[] => native?.engines() ?? [];
export const probeEngine = (engine: string, language: string): Promise<{ available: boolean; voices: string[] }> => native?.probe(engine, language) ?? Promise.resolve({ available: false, voices: [] });
export const speakWith = (engine: string, text: string, language: string, voice: string | null, rate: number, id: string): Promise<void> => native?.speak(engine, text, language, voice, rate, id) ?? Promise.reject(new Error("read-aloud unavailable"));
export const stopNative = (): Promise<void> => native?.stop() ?? Promise.resolve();
export function onUtterance(event: "onStart" | "onDone" | "onError", listener: (e: { id: string; stopped?: boolean; code?: number }) => void): () => void {
  const sub = native?.addListener(event, listener);
  return () => sub?.remove();
}
