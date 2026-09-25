import { afterEach, describe, expect, it } from "vitest";
import { htmlLang } from "../src/documentLang";
import { i18next, initI18n } from "../src";

describe("htmlLang (F384)", () => {
  it("names every shipped locale by its own BCP 47 tag, left to right", () => {
    for (const l of ["en", "de", "fr", "es", "pt-BR", "ja", "ko", "zh-Hant"]) expect(htmlLang(l)).toEqual({ lang: l, dir: "ltr" });
  });
  it("gives the pseudo-locale the reserved pseudo tag, so a reader keeps an English voice", () => {
    expect(htmlLang("pseudo")).toEqual({ lang: "en-XA", dir: "ltr" });
  });
  it("mirrors a right-to-left language", () => {
    expect(htmlLang("he")).toEqual({ lang: "he", dir: "rtl" });
    expect(htmlLang("ar-EG")).toEqual({ lang: "ar-EG", dir: "rtl" });
  });
});

describe("initI18n writes <html lang> (F384)", () => {
  const g = globalThis as { document?: unknown };
  afterEach(() => {
    delete g.document;
  });
  it("on load and on every language switch", async () => {
    const attrs: Record<string, string> = { lang: "en" };
    g.document = { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v), getAttribute: (k: string) => attrs[k] ?? null } };
    await initI18n("ja");
    expect(attrs).toEqual({ lang: "ja", dir: "ltr" });
    await i18next.changeLanguage("de");
    expect(attrs.lang).toBe("de");
    await i18next.changeLanguage("pseudo");
    expect(attrs.lang).toBe("en-XA");
  });
});
