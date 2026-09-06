import { directionOf } from "../chat/language";

/* whisper.cpp writes what it hears when nobody speaks ([BLANK_AUDIO], [Ambient], (music)…); none of it belongs in a message. */
const MARKERS = /\[[A-Za-z _]{1,30}\]|\([a-z _]{1,30}\)|♪+|\*[^*]{0,40}\*/g;

/** Whisper / system output → text a person would have typed: markers gone, whitespace collapsed, ends trimmed. */
export function cleanTranscript(raw: string): string {
  return raw
    .replace(MARKERS, " ")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** True when a transcript has nothing a model could answer (only markers, punctuation or a lone syllable). */
export function isEmptyTranscript(raw: string): boolean {
  const t = cleanTranscript(raw).replace(/[\s.,!?;:…\-–—'"“”‘’()[\]]/g, "");
  return t.length < 2;
}

/** Appends dictated text to a draft the user may already have typed: one space or, after a line break, nothing. */
export function joinDictation(draft: string, text: string): string {
  const add = cleanTranscript(text);
  if (!add) return draft;
  if (!draft) return add;
  if (/\s$/.test(draft)) return draft + add;
  return `${draft} ${add}`;
}

/**
 * Live dictation shows two layers: what the recogniser has committed and the interim guess it may still change.
 * `committed` and `interim` are kept apart so a corrected interim never duplicates or eats committed words.
 */
export class TranscriptMerger {
  private committed = "";
  private interim = "";

  constructor(initial = "") {
    this.committed = initial;
  }

  setInterim(text: string): void {
    this.interim = cleanTranscript(text);
  }

  /** A final segment replaces the interim it grew out of. */
  commit(text: string): void {
    this.committed = joinDictation(this.committed, text);
    this.interim = "";
  }

  /** What the composer shows right now. */
  text(): string {
    return this.interim ? joinDictation(this.committed, this.interim) : this.committed;
  }

  /** What survives when recognition stops mid-guess: an interim of ≥ 2 words is kept, a fragment is dropped. */
  finish(): string {
    if (this.interim && this.interim.split(/\s+/).length >= 2) this.commit(this.interim);
    this.interim = "";
    return this.committed;
  }

  get direction(): "ltr" | "rtl" {
    return directionOf(this.text());
  }
}

/** Whisper reports ISO-639-1 codes; the app's locale ids and TTS want BCP 47. */
export const WHISPER_TO_BCP47: Record<string, string> = {
  en: "en-US",
  he: "he-IL",
  iw: "he-IL",
  ar: "ar-SA",
  de: "de-DE",
  fr: "fr-FR",
  es: "es-ES",
  pt: "pt-BR",
  it: "it-IT",
  ja: "ja-JP",
  zh: "zh-CN",
  ko: "ko-KR",
  ru: "ru-RU",
  uk: "uk-UA",
  tr: "tr-TR",
  nl: "nl-NL",
  pl: "pl-PL",
  el: "el-GR",
  hi: "hi-IN",
};

export const bcp47FromWhisper = (code: string | undefined): string | undefined => (code ? WHISPER_TO_BCP47[code.toLowerCase()] : undefined);
