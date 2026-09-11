import * as Speech from "expo-speech";
import { Platform } from "react-native";
import { chooseTtsEngine, pickVoice, speechChunks, speechLanguage, type SpeechVoice, type TtsEngineProbe } from "@inborn/core";
import { hasReadAloud, onUtterance, probeEngine, speakWith, stopNative, ttsEngines } from "../../modules/read-aloud";

/**
 * Read-aloud through the system synthesiser (spec §5.6, §7.4 free tier): AVSpeechSynthesizer, Android TextToSpeech,
 * Web Speech. Only voices the platform marks as local are ever chosen; the text goes out sentence by sentence so Stop
 * lands between sentences and screen readers can follow (§10.8 #53). Android binds an engine that reports the
 * language (QA T44): the default one first, another installed engine otherwise, none when no voice exists.
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

/** "no-voice": nothing on the device can speak this language; the caller shows it instead of a silent failure. */
export type SpeakOutcome = "done" | "stopped" | "no-voice";

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

const androidEngines = Platform.OS === "android" && hasReadAloud();
const engineByLanguage = new Map<string, { name: string; voice: string | null } | null>();

/** The Android engine for a language: probed once per session, the default engine first, then the rest in the core's order. */
async function androidEngineFor(language: string): Promise<{ name: string; voice: string | null } | null> {
  const cached = engineByLanguage.get(language);
  if (cached !== undefined) return cached;
  const engines = ttsEngines();
  const ordered = [...engines].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  const probes: TtsEngineProbe[] = [];
  const voicesOf = new Map<string, string[]>();
  for (const e of ordered) {
    const r = await probeEngine(e.name, language).catch(() => ({ available: false, voices: [] as string[] }));
    probes.push({ name: e.name, isDefault: e.isDefault, languages: r.available ? [language] : [] });
    voicesOf.set(e.name, r.voices);
    if (e.isDefault && r.available) break;
  }
  const chosen = chooseTtsEngine(probes, language);
  const result = chosen ? { name: chosen.name, voice: voicesOf.get(chosen.name)?.[0] ?? null } : null;
  engineByLanguage.set(language, result);
  return result;
}

let utteranceSeq = 0;

function speakChunkAndroid(engine: { name: string; voice: string | null }, chunk: string, language: string, rate: number, onStart: () => void): Promise<boolean> {
  const id = `inborn-${++utteranceSeq}`;
  return new Promise<boolean>((resolve) => {
    const offs = [
      onUtterance("onStart", (e) => e.id === id && onStart()),
      onUtterance("onDone", (e) => {
        if (e.id !== id) return;
        done(true);
      }),
      onUtterance("onError", (e) => {
        if (e.id !== id) return;
        done(false);
      }),
    ];
    const done = (ok: boolean) => {
      for (const off of offs) off();
      resolve(ok);
    };
    speakWith(engine.name, chunk, language, engine.voice, rate, id).catch(() => done(false));
  });
}

/** Resolves when the last sentence finished (or the reading was stopped); the first sentence's onStart carries the latency. */
export async function speak(text: string, opts: SpeakOptions): Promise<SpeakOutcome> {
  await stopSpeaking();
  const chunks = speechChunks(text);
  if (!chunks.length) {
    opts.onDone?.();
    return "done";
  }
  const language = opts.language ?? speechLanguage(text, opts.uiLocale);
  const token = { cancelled: false };
  current = token;
  let started = false;
  const onStart = () => {
    if (!started) {
      started = true;
      opts.onStart?.();
    }
  };
  if (androidEngines) {
    const engine = await androidEngineFor(language);
    if (!engine) {
      if (current === token) current = null;
      return "no-voice";
    }
    for (const chunk of chunks) {
      if (token.cancelled) break;
      const ok = await speakChunkAndroid(engine, chunk, language, opts.rate ?? 1, onStart);
      if (!ok && !token.cancelled) {
        opts.onError?.(new Error("read-aloud failed"));
        break;
      }
    }
  } else {
    const voice = pickVoice(await localVoices(), language);
    for (const chunk of chunks) {
      if (token.cancelled) break;
      await new Promise<void>((resolve) => {
        Speech.speak(chunk, {
          language: voice?.language ?? language,
          ...(voice ? { voice: voice.identifier } : {}),
          rate: opts.rate ?? 1,
          onStart,
          onDone: resolve,
          onStopped: resolve,
          onError: (e) => {
            opts.onError?.(e instanceof Error ? e : new Error(String(e)));
            resolve();
          },
        });
      });
    }
  }
  if (current === token) current = null;
  if (token.cancelled) return "stopped";
  opts.onDone?.();
  return "done";
}

export async function stopSpeaking(): Promise<void> {
  if (current) current.cancelled = true;
  current = null;
  try {
    if (androidEngines) await stopNative();
    else await Speech.stop();
  } catch {
    /* nothing was speaking */
  }
}

export const isSpeaking = (): boolean => current !== null;

/** True when the device has a local voice for the language (the read-aloud row is hidden otherwise on the web). */
export async function hasVoiceFor(language: string): Promise<boolean> {
  if (androidEngines) return (await androidEngineFor(language)) !== null;
  return pickVoice(await localVoices(), language) !== undefined;
}
