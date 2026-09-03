import i18next, { type i18n } from "i18next";
import ICU from "i18next-icu";
import { initReactI18next } from "react-i18next";
import en from "../locales/en.json";

export type Locale = "en" | "ja" | "de" | "fr" | "es" | "pt-BR" | "pseudo";
export const LAUNCH_LOCALES: readonly Locale[] = ["en", "ja", "de", "fr", "es", "pt-BR"];
export const RTL_LOCALES: ReadonlySet<string> = new Set(["he", "ar", "fa", "ur"]);

export type MessageKey = keyof typeof en;

/** Adding a language = one JSON file registered here; no other code changes (spec §5.10). */
const resources: Record<string, { translation: Record<string, string> }> = { en: { translation: en } };

export function registerLocale(locale: string, translation: Record<string, string>): void {
  resources[locale] = { translation };
  if (i18next.isInitialized) i18next.addResourceBundle(locale, "translation", translation, true, true);
}

export async function initI18n(locale: string, deviceLocales: readonly string[] = []): Promise<i18n> {
  const preferred = [locale, ...deviceLocales].find((l) => resources[l]) ?? "en";
  await i18next.use(ICU).use(initReactI18next).init({
    resources,
    lng: preferred,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
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

export { i18next };
