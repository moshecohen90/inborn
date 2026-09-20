import { LANGUAGE_NAME_BY_CODE, chineseScriptOf, languageCodeOf } from "./language";
import { baseLanguageOf } from "../catalog/fit";

/** The 18 UI languages of spec §7.8, as ISO 639-1 codes with their English names (the translation picker and the detector share this list). */
export const TRANSLATION_LANGUAGES: readonly { code: string; name: string }[] = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "pt", name: "Portuguese" },
  { code: "de", name: "German" },
  { code: "fr", name: "French" },
  { code: "it", name: "Italian" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
  { code: "ru", name: "Russian" },
  { code: "ar", name: "Arabic" },
  { code: "he", name: "Hebrew" },
  { code: "hi", name: "Hindi" },
  { code: "tr", name: "Turkish" },
  { code: "pl", name: "Polish" },
  { code: "vi", name: "Vietnamese" },
  { code: "id", name: "Indonesian" },
];

/** Script variants the detector returns are named here, not listed above: they describe a text, they are not extra translation targets. */
export const languageNameOf = (code: string): string => TRANSLATION_LANGUAGES.find((l) => l.code === code)?.name ?? LANGUAGE_NAME_BY_CODE[code] ?? code;

/* Function words that almost never overlap between the Latin-script launch languages; three hits decide. */
const STOPWORDS: Record<string, readonly string[]> = {
  en: ["the", "and", "is", "are", "of", "to", "with", "that", "this", "you", "for", "not", "have", "it"],
  de: ["der", "die", "das", "und", "ist", "nicht", "ich", "mit", "sie", "ein", "eine", "auf", "für", "wir"],
  fr: ["le", "la", "les", "et", "est", "une", "des", "pas", "que", "pour", "vous", "nous", "dans", "avec"],
  es: ["el", "los", "las", "es", "una", "que", "por", "con", "para", "pero", "como", "usted", "está", "muy"],
  pt: ["o", "os", "uma", "é", "não", "com", "para", "você", "muito", "mas", "isso", "das", "dos", "também"],
  it: ["il", "gli", "è", "non", "una", "che", "per", "con", "sono", "anche", "questo", "della", "nel", "come"],
  tr: ["ve", "bir", "bu", "için", "ile", "değil", "çok", "ben", "sen", "var", "gibi", "daha", "ama", "olarak"],
  pl: ["nie", "jest", "się", "na", "to", "że", "jak", "ale", "dla", "tak", "czy", "jego", "przez", "tego"],
  vi: ["và", "của", "là", "không", "có", "được", "cho", "này", "với", "những", "một", "tôi", "bạn", "trong"],
  id: ["dan", "yang", "untuk", "dengan", "tidak", "ini", "itu", "adalah", "dari", "saya", "anda", "akan", "juga", "pada"],
};

const DEVANAGARI = /[ऀ-ॿ]/u;

/**
 * Language of a text for the translation mode (§7.6 "translation mode with language detection"): script decides for
 * non-Latin text, function words for the Latin-script languages; null when the text is too short or ambiguous.
 */
export function detectLanguage(text: string): string | null {
  if (DEVANAGARI.test(text)) return "hi";
  const byScript = languageCodeOf(text);
  /* The two Chinese scripts are separate launch languages, so say which one when the characters tell them apart. */
  if (byScript === "zh") return chineseScriptOf(text) ?? "zh";
  if (byScript) return byScript === "el" ? null : byScript;
  const words = text.toLowerCase().split(/[^\p{L}']+/u).filter(Boolean);
  if (words.length < 3) return null;
  let best: string | null = null;
  let bestHits = 0;
  let second = 0;
  for (const [code, list] of Object.entries(STOPWORDS)) {
    const set = new Set(list);
    let hits = 0;
    for (const w of words) if (set.has(w)) hits++;
    if (hits > bestHits) {
      second = bestHits;
      bestHits = hits;
      best = code;
    } else if (hits > second) second = hits;
  }
  /* Two clear hits with a margin over the runner-up; "the" alone must not label a German sentence English. */
  return best && bestHits >= 2 && bestHits > second ? best : null;
}

/** Target for "Translate": the app language, unless the text is already in it, then English (and Spanish when the app is English). */
export function pickTranslationTarget(detected: string | null, uiLocale: string): string {
  const ui = uiLocale.split("-")[0]?.toLowerCase() ?? "en";
  /* Compare on the plain language: "zh-Hant" into a Chinese UI is still Chinese into Chinese. */
  if (!detected || baseLanguageOf(detected) !== ui) return TRANSLATION_LANGUAGES.some((l) => l.code === ui) ? ui : "en";
  return ui === "en" ? "es" : "en";
}
