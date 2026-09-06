import { scriptOf } from "../chat/language";
import type { LicenceTier } from "../licence/types";
import { can } from "../licence/gates";

/** Which dictation engine a tap on the mic uses (spec §7.4): the system's on-device recogniser is free, whisper is Pro. */
export type DictationEngine = "system" | "whisper";
export type DictationChoice = { engine: DictationEngine } | { engine: null; reason: "system-offline-missing" | "system-unavailable" | "whisper-not-installed" | "unsupported-platform" };

export interface DictationSignals {
  tier: LicenceTier;
  /** The OS has a speech recogniser at all (false on the web: browsers send audio to a server). */
  systemAvailable: boolean;
  /** The recogniser can run fully on the device for the wanted locale (iOS: always when supported; Android: model installed). */
  systemOnDevice: boolean;
  /** The whisper companion is in the vault and verified. */
  whisperReady: boolean;
  /** The user asked for whisper explicitly (a language the system cannot do on-device). */
  preferWhisper?: boolean;
}

/**
 * Nothing may leave the device: the system engine is used only when it can run on-device; otherwise whisper on Pro;
 * otherwise a reason the screen can explain. Whisper is also chosen when the user prefers it and owns it.
 */
export function chooseDictation(s: DictationSignals): DictationChoice {
  const whisperAllowed = can(s.tier, "whisperDictation") && s.whisperReady;
  if (s.preferWhisper && whisperAllowed) return { engine: "whisper" };
  if (s.systemAvailable && s.systemOnDevice) return { engine: "system" };
  if (whisperAllowed) return { engine: "whisper" };
  if (!s.systemAvailable) return { engine: null, reason: can(s.tier, "whisperDictation") ? "whisper-not-installed" : "unsupported-platform" };
  return { engine: null, reason: can(s.tier, "whisperDictation") ? "whisper-not-installed" : "system-offline-missing" };
}

/** BCP 47 tag for reading `text` aloud: the script decides, the UI locale breaks the Latin tie. */
export function speechLanguage(text: string, uiLocale: string): string {
  switch (scriptOf(text)) {
    case "hebrew":
      return "he-IL";
    case "arabic":
      return "ar-SA";
    case "cyrillic":
      return "ru-RU";
    case "cjk":
      return "zh-CN";
    case "japanese":
      return "ja-JP";
    case "korean":
      return "ko-KR";
    case "greek":
      return "el-GR";
    default:
      return normalizeLocale(uiLocale);
  }
}

const REGION: Record<string, string> = { en: "en-US", de: "de-DE", fr: "fr-FR", es: "es-ES", pt: "pt-BR", ja: "ja-JP", he: "he-IL", it: "it-IT", ar: "ar-SA", ru: "ru-RU", zh: "zh-CN" };

/** "pt-BR" stays, "pt_BR" and "de" become tags a synthesiser understands. */
export function normalizeLocale(locale: string): string {
  const tag = locale.replace("_", "-");
  const [lang, region] = tag.split("-");
  if (!lang) return "en-US";
  if (region) return `${lang.toLowerCase()}-${region.toUpperCase()}`;
  return REGION[lang.toLowerCase()] ?? lang.toLowerCase();
}

export interface SpeechVoice {
  identifier: string;
  language: string;
  /** "Enhanced" on iOS, `quality` from Android; "network" marks a voice that needs a connection (web `localService === false`). */
  quality?: string;
  /** False when the platform says the voice is synthesised remotely; undefined when it cannot say. */
  local?: boolean;
}

/** Best local voice for a language: exact tag, then same language, enhanced quality first; never a network voice. */
export function pickVoice(voices: SpeechVoice[], language: string): SpeechVoice | undefined {
  const want = normalizeLocale(language).toLowerCase();
  const lang = want.split("-")[0]!;
  const local = voices.filter((v) => v.local !== false && v.quality?.toLowerCase() !== "network");
  const rank = (v: SpeechVoice) => (v.quality?.toLowerCase() === "enhanced" || v.quality?.toLowerCase() === "premium" ? 0 : 1);
  const exact = local.filter((v) => v.language.replace("_", "-").toLowerCase() === want).sort((a, b) => rank(a) - rank(b));
  if (exact[0]) return exact[0];
  const same = local.filter((v) => v.language.replace("_", "-").toLowerCase().split("-")[0] === lang).sort((a, b) => rank(a) - rank(b));
  return same[0];
}

/**
 * Sentences for the synthesiser: one utterance per sentence keeps "stop" responsive and lets a screen reader follow
 * (§10.8 #53 "announcements per sentence"). Long sentences are split at clause boundaries near `max`.
 */
export function speechChunks(text: string, max = 240): string[] {
  const out: string[] = [];
  const sentences = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?؟。！？])\s+|\n+/);
  for (const s of sentences) {
    let rest = s.trim();
    while (rest.length > max) {
      let cut = rest.lastIndexOf(", ", max);
      if (cut < max / 2) cut = rest.lastIndexOf(" ", max);
      if (cut < max / 2) cut = max;
      out.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) out.push(rest);
  }
  return out;
}
