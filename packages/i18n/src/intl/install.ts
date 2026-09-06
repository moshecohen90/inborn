import { installIntlPolyfills } from "./polyfill";

/* Evaluated before the locale-data modules, which attach only to an already-installed polyfill. */
export const installed = installIntlPolyfills();
