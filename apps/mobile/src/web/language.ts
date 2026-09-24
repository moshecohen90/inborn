import { readPrefsRaw } from "../services/prefsStore";

/**
 * What language to rank models for, before i18next exists. The web boot runs in parallel with `initI18n`
 * (AppServices.boot), so asking i18next here would race it and rank the door in whatever language lost.
 * Same order AppServices uses: the saved preference, else what the browser asks for.
 */
export function bootLanguage(): string | null {
  const saved = (readPrefsRaw() as { locale?: unknown } | null)?.locale;
  const tag = typeof saved === "string" && saved ? saved : (globalThis.navigator?.language ?? "");
  const code = tag.split("-")[0];
  return code ? code : null;
}
