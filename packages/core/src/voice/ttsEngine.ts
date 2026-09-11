import { normalizeLocale } from "./speech";

/**
 * Android read-aloud (spec §5.6, §7.4): the phone's default synthesiser may be a third-party engine that opens its own
 * settings activity instead of speaking (T44, com.intu.hebrewtts). The choice is made from what each engine reports
 * for the wanted language, never from what the engine does once asked to speak.
 */
export interface TtsEngineProbe {
  /** Package name of the engine. */
  name: string;
  /** The engine the system settings name as default. */
  isDefault: boolean;
  /** Locales the engine says it can speak now (installed voice data), BCP 47 or Android "en_US" form. */
  languages: readonly string[];
}

const tag = (l: string) => l.replace("_", "-").toLowerCase();

/** True when the engine reports a voice for the exact locale or for the same language. */
export function engineSpeaks(engine: Pick<TtsEngineProbe, "languages">, language: string): boolean {
  const want = tag(normalizeLocale(language));
  const lang = want.split("-")[0]!;
  return engine.languages.some((l) => tag(l) === want || tag(l).split("-")[0] === lang);
}

/**
 * The engine to bind: the system default when it reports the language, otherwise any other engine that does
 * (Google's first), otherwise null — the caller shows "no voice for this language" and launches nothing.
 */
export function chooseTtsEngine(engines: readonly TtsEngineProbe[], language: string): TtsEngineProbe | null {
  const able = engines.filter((e) => engineSpeaks(e, language));
  if (!able.length) return null;
  return able.find((e) => e.isDefault) ?? able.find((e) => e.name === "com.google.android.tts") ?? able[0]!;
}
