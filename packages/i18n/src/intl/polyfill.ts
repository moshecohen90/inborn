import { getCanonicalLocales } from "@formatjs/intl-getcanonicallocales";
import { shouldPolyfill as needCanonical } from "@formatjs/intl-getcanonicallocales/should-polyfill.js";
import { Locale } from "@formatjs/intl-locale";
import { shouldPolyfill as needLocale } from "@formatjs/intl-locale/should-polyfill.js";
import { PluralRules } from "@formatjs/intl-pluralrules";
import { shouldPolyfill as needPluralRules } from "@formatjs/intl-pluralrules/should-polyfill.js";

export interface IntlPolyfills {
  getCanonicalLocales: boolean;
  locale: boolean;
  pluralRules: boolean;
}

const define = (name: string, value: unknown) => Object.defineProperty(Intl, name, { value, writable: true, configurable: true, enumerable: false });

/**
 * Hermes ships no `Intl.PluralRules`, so every ICU `{count, plural, …}` message renders raw on Android.
 * Each polyfill is installed only where the engine lacks it; a browser or the desktop webview keeps its native one.
 */
export function installIntlPolyfills(): IntlPolyfills {
  const installed: IntlPolyfills = { getCanonicalLocales: false, locale: false, pluralRules: false };
  if (needCanonical()) {
    define("getCanonicalLocales", getCanonicalLocales);
    installed.getCanonicalLocales = true;
  }
  if (needLocale()) {
    define("Locale", Locale);
    installed.locale = true;
  }
  if (typeof Intl.PluralRules !== "function" || needPluralRules()) {
    define("PluralRules", PluralRules);
    installed.pluralRules = true;
  }
  return installed;
}
