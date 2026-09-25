export const RTL_LOCALES: ReadonlySet<string> = new Set(["he", "ar", "fa", "ur"]);

/** `<html lang dir>` for a UI locale. The pseudo-locale takes the reserved pseudo tag so a screen reader keeps an English voice. */
export function htmlLang(locale: string): { lang: string; dir: "ltr" | "rtl" } {
  const lang = locale === "pseudo" ? "en-XA" : locale;
  return { lang, dir: RTL_LOCALES.has(lang.split(/[-_]/)[0] ?? lang) ? "rtl" : "ltr" };
}

interface HtmlRoot {
  setAttribute(k: string, v: string): void;
}

/** Screen readers pick their voice from `<html lang>`; native has no document and skips this. */
export function writeHtmlLang(locale: string): void {
  const root = (globalThis as { document?: { documentElement?: HtmlRoot } }).document?.documentElement;
  if (!root) return;
  const { lang, dir } = htmlLang(locale);
  root.setAttribute("lang", lang);
  root.setAttribute("dir", dir);
}
