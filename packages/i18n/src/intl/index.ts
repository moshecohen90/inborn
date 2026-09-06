import type { IntlPolyfills } from "./polyfill";

/* Web and the desktop webview have native Intl; Metro picks `index.native.ts` for the phones. */
export const installed: IntlPolyfills = { getCanonicalLocales: false, locale: false, pluralRules: false };
