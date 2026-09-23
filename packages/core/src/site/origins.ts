import origins from "./origins.json";

/**
 * The three origins the product is served from, in one place (spec §13.4).
 *
 * The app's legal links, the site generator, the web build and the Cloudflare deploy each used to write them out
 * themselves; on bibleapps that same shape shipped a purge and a schema URL against a domain that was not the one
 * being deployed. JSON so the `.mjs` build and deploy scripts can read the same file without a TypeScript loader.
 */
export const SITE_ORIGIN: string = origins.site;
export const APP_ORIGIN: string = origins.app;
export const MODELS_ORIGIN: string = origins.models;
