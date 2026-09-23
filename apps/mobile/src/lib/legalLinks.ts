/**
 * Where the current version of each legal document lives (spec §11.3). The app bundles a copy so it can be read with
 * no network at all, but a bundled copy is frozen at build time, so every legal screen also offers the live page.
 *
 * Opening it is `Linking.openURL`, which hands the URL to the system browser: it needs no INTERNET permission, so
 * this stays true on Android, where the app has none (D3).
 */
export const SITE_ORIGIN = "https://inbornapp.com";

export type LegalLink = "privacy" | "terms" | "licenses" | "accessibility";

/** The path each document is published at; the site generator builds exactly these routes. */
export const LEGAL_PATHS: Record<LegalLink, string> = {
  privacy: "/privacy",
  terms: "/terms",
  licenses: "/licenses",
  accessibility: "/accessibility",
};

export const legalUrl = (doc: LegalLink): string => `${SITE_ORIGIN}${LEGAL_PATHS[doc]}`;

/** What the button says, without the scheme: "inbornapp.com/privacy". */
export const legalHost = (doc: LegalLink): string => `${SITE_ORIGIN.replace(/^https?:\/\//, "")}${LEGAL_PATHS[doc]}`;
