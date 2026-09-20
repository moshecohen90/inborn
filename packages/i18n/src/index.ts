import "./intl";
import i18next, { type i18n } from "i18next";
import ICU from "i18next-icu";
import { initReactI18next } from "react-i18next";
import en from "../locales/en.json";
import ja from "../locales/ja.json";
import de from "../locales/de.json";
import fr from "../locales/fr.json";
import es from "../locales/es.json";
import ptBR from "../locales/pt-BR.json";
import ko from "../locales/ko.json";
import zhHant from "../locales/zh-Hant.json";
import pseudo from "../locales/pseudo.json";

export type Locale = "en" | "ja" | "de" | "fr" | "es" | "pt-BR" | "ko" | "zh-Hant" | "pseudo";
export const LAUNCH_LOCALES: readonly Locale[] = ["en", "ja", "de", "fr", "es", "pt-BR", "ko", "zh-Hant"];
export const RTL_LOCALES: ReadonlySet<string> = new Set(["he", "ar", "fa", "ur"]);

/** Each language's own name for the picker (Hermes has no Intl.DisplayNames, so this is the source, not a fallback). */
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = {
  en: "English",
  ja: "日本語",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
  "pt-BR": "Português (Brasil)",
  ko: "한국어",
  "zh-Hant": "繁體中文",
  pseudo: "Pseudo (QA)",
};

export type MessageKey = keyof typeof en;

/** Adding a language = one JSON file registered here; no other code changes (spec §5.10). */
const resources: Record<string, { translation: Record<string, string> }> = {
  en: { translation: en },
  ja: { translation: ja },
  de: { translation: de },
  fr: { translation: fr },
  es: { translation: es },
  "pt-BR": { translation: ptBR },
  ko: { translation: ko },
  "zh-Hant": { translation: zhHant },
  pseudo: { translation: pseudo },
};

export function registerLocale(locale: string, translation: Record<string, string>): void {
  resources[locale] = { translation };
  if (i18next.isInitialized) i18next.addResourceBundle(locale, "translation", translation, true, true);
}

/** `defaultVariables` reach every string (e.g. `{device}` from the shell), so "stays on this {device}" needs no per-call argument. */
export async function initI18n(locale: string, deviceLocales: readonly string[] = [], defaultVariables: Record<string, string> = {}): Promise<i18n> {
  const preferred = [locale, ...deviceLocales].find((l) => resources[l]) ?? "en";
  await i18next.use(ICU).use(initReactI18next).init({
    resources,
    lng: preferred,
    fallbackLng: "en",
    interpolation: { escapeValue: false, defaultVariables },
    returnNull: false,
  });
  return i18next;
}

export const isRTL = (locale: string): boolean => RTL_LOCALES.has(locale.split("-")[0] ?? locale);

export type BiometricKind = "faceId" | "touchId" | "opticId" | "android" | "windowsHello" | "passcode";

/** The word on the lock toggle follows the device: never "Face ID" on a Touch ID device (Apple HIG). */
export function biometricLabel(t: (k: MessageKey) => string, kind: BiometricKind): string {
  const key = `biometric.${kind}` as MessageKey;
  return t(key);
}

export { installed as intlPolyfills } from "./intl";
export { i18next };
export { joinList, listSeparator } from "./list";
