import * as Speech from "expo-speech";
import { Platform } from "react-native";
import { pickVoice, speechChunks, speechLanguage, type SpeechVoice } from "@inborn/core";

/**
 * Read-aloud through the system synthesiser (spec §5.6, §7.4 free tier): AVSpeechSynthesizer, Android TextToSpeech,
 * Web Speech. Only voices the platform marks as local are ever chosen; the text goes out sentence by sentence so Stop
 * lands between sentences and screen readers can follow (§10.8 #53).
 */
export interface SpeakOptions {
  /** BCP 47; derived from the text's script + UI locale when absent. */
  language?: string;
  uiLocale: string;
  rate?: number;
  onStart?: () => void;
  onDone?: () => void;
  onError?: (e: Error) => void;
}

let voices: SpeechVoice[] | null = null;
let current: { cancelled: boolean } | null = null;

async function localVoices(): Promise<SpeechVoice[]> {
  if (voices) return voices;
  try {
    const all = (await Speech.getAvailableVoicesAsync()) as (Speech.Voice & { localService?: boolean })[];
    /* iOS and Android only list voices installed on the device; the web flags server voices with localService=false. */
    voices = all.map((v) => ({ identifier: v.identifier, language: v.language, quality: v.quality, local: Platform.OS === "web" ? v.localService !== false : true }));
  } catch {
    voices = [];
  }
  return voices;
}

export const ttsAvailable = (): boolean => Platform.OS !== "web" || (typeof globalThis !== "undefined" && "speechSynthesis" in globalThis);

/** Resolves when the last sentence finished (or the reading was stopped); the first sentence's onStart carries the latency. */
export async function speak(text: string, opts: SpeakOptions): Promise<void> {
  await stopSpeaking();
  const chunks = speechChunks(text);
  if (!chunks.length) {
    opts.onDone?.();
    return;
  }
  const language = opts.language ?? speechLanguage(text, opts.uiLocale);
  const voice = pickVoice(await localVoices(), language);
  const token = { cancelled: false };
  current = token;
  let started = false;
  for (const chunk of chunks) {
    if (token.cancelled) break;
    await new Promise<void>((resolve) => {
      Speech.speak(chunk, {
        language: voice?.language ?? language,
        ...(voice ? { voice: voice.identifier } : {}),
        rate: opts.rate ?? 1,
        onStart: () => {
          if (!started) {
            started = true;
            opts.onStart?.();
          }
        },
        onDone: resolve,
        onStopped: resolve,
        onError: (e) => {
          opts.onError?.(e instanceof Error ? e : new Error(String(e)));
          resolve();
        },
      });
    });
  }
  if (current === token) current = null;
  if (!token.cancelled) opts.onDone?.();
}

export async function stopSpeaking(): Promise<void> {
  if (current) current.cancelled = true;
  current = null;
  try {
    await Speech.stop();
  } catch {
    /* nothing was speaking */
  }
}

export const isSpeaking = (): boolean => current !== null;

/** True when the device has a local voice for the language (the read-aloud row is hidden otherwise on the web). */
export async function hasVoiceFor(language: string): Promise<boolean> {
  return pickVoice(await localVoices(), language) !== undefined;
}
