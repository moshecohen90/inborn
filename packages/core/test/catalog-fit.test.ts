import { describe, expect, it } from "vitest";
import { BUNDLED_MANIFEST, FIT_LANGUAGES, USE_CASES, baseLanguageOf, distinctLanguageCodes, goodLanguagesOf, languageTierOf, useTierOf, validateFit, verifyManifest, CATALOG_PUBLIC_KEY, type CatalogModel, type ModelFit } from "../src/index";

const chat = BUNDLED_MANIFEST.models.filter((m) => m.role === "chat");
const byId = (id: string): CatalogModel => BUNDLED_MANIFEST.models.find((m) => m.id === id)!;
const fit = (id: string): ModelFit => byId(id).fit!;

describe("catalog fit schema (spec §6.1 fit map)", () => {
  it("every chat model carries a complete, valid fit block and companions carry none", () => {
    expect(chat.map((m) => m.id)).toEqual(["instant", "fast", "sharp", "sharp-phi"]);
    for (const m of chat) expect(validateFit(m), m.id).toEqual([]);
    for (const m of BUNDLED_MANIFEST.models.filter((x) => x.role !== "chat")) expect(m.fit, m.id).toBeUndefined();
  });
  it("rates all eight uses and at least the eleven required languages", () => {
    for (const m of chat) {
      expect(Object.keys(m.fit!.uses).sort()).toEqual([...USE_CASES].sort());
      for (const l of FIT_LANGUAGES) expect(m.fit!.languages[l], `${m.id} ${l}`).toBeDefined();
      expect(m.fit!.weakAt.length).toBeGreaterThan(10);
    }
  });
  it("goodLanguages is exactly the native + good codes of the fit block", () => {
    for (const m of chat) expect([...m.goodLanguages].sort(), m.id).toEqual(goodLanguagesOf(m.fit!).sort());
  });
  it("the signed manifest (v5) still verifies with the fit blocks inside the signature", () => {
    expect(BUNDLED_MANIFEST.version).toBe(5);
    expect(verifyManifest(BUNDLED_MANIFEST, CATALOG_PUBLIC_KEY)).toBe(true);
    const tampered = { ...BUNDLED_MANIFEST, models: BUNDLED_MANIFEST.models.map((m) => (m.id === "instant" ? { ...m, fit: { ...m.fit!, languages: { ...m.fit!.languages, he: "native" as const } } } : m)) };
    expect(verifyManifest(tampered, CATALOG_PUBLIC_KEY)).toBe(false);
  });
  it("the judgements the product relies on: no catalog model is good at Hebrew (Fast rated none on 20.9.2026: its translation was not Hebrew), Phi is the code and math model", () => {
    expect(fit("instant").languages.he).toBe("none");
    expect(fit("fast").languages.he).toBe("none");
    expect(fit("sharp").languages.he).toBe("basic");
    expect(fit("sharp-phi").languages.he).toBe("basic");
    expect(fit("sharp-phi").uses.code).toBe("best");
    expect(fit("sharp-phi").uses.math).toBe("best");
    expect(fit("sharp-phi").uses.translate).toBe("weak");
    expect(fit("instant").uses.code).toBe("weak");
  });
  it("the tiers the 20.9.2026 device run corrected (docs/research/launch-languages-2026-09.md §4.1)", () => {
    /* Fast German opened three of three samples with the same wrong case; this is what steers a German user to Sharp. */
    expect(fit("fast").languages.de).toBe("basic");
    expect(fit("sharp").languages.de).toBe("good");
    expect(fit("fast").languages.ko).toBe("basic");
    expect(fit("instant").languages.de).toBe("basic");
    expect(fit("instant").languages.fr).toBe("basic");
    expect(fit("instant").languages.es).toBe("basic");
    expect(fit("instant").languages.zh).toBe("good");
    /* Measured 3/3/3 on Sharp: native, not good. */
    for (const l of ["ja", "ko", "ru"]) expect(fit("sharp").languages[l], l).toBe("native");
    /* Arabic was the one `native` on a single 2/2/3 run whose prose scored 2 (docs/models/model-fit.md); `good` until a second run. */
    expect(fit("fast").languages.ar).toBe("good");
  });
  it("Traditional and Simplified Chinese are expressible and validate; a bad script subtag is still a problem", () => {
    expect(fit("fast").languages["zh-Hant"]).toBe("native");
    expect(fit("sharp").languages["zh-Hans"]).toBe("native");
    expect(fit("instant").languages["zh-Hant"]).toBe("good");
    /* The script-tagged key wins; an unlisted script falls back to the plain language. */
    expect(languageTierOf(byId("instant"), "zh-Hant")).toBe("good");
    expect(languageTierOf(byId("instant"), "zh-Hans")).toBe("good");
    expect(languageTierOf(byId("sharp-phi"), "zh-Hant")).toBe("basic");
    expect(baseLanguageOf("zh-Hant")).toBe("zh");
    const bad = { ...byId("fast"), fit: { ...fit("fast"), languages: { ...fit("fast").languages, "zh-hant": "good" as const, "zh-Hanttt": "good" as const } } };
    expect(validateFit(bad)).toEqual(["language.zh-hant", "language.zh-Hanttt"]);
    /* goodLanguages stays a flat list of plain codes, so an older reader still matches on "zh". */
    for (const m of chat) expect(m.goodLanguages.some((c) => c.includes("-")), m.id).toBe(false);
  });
  it("an unrated language is unknown, not none: the app never claims the models are bad at a language it did not measure", () => {
    for (const code of ["id", "tr", "pl", "hi", "vi"]) for (const m of chat) expect(languageTierOf(m, code), `${m.id} ${code}`).toBeNull();
    /* The eleven required codes are still rated everywhere. */
    for (const code of FIT_LANGUAGES) for (const m of chat) expect(languageTierOf(m, code), `${m.id} ${code}`).not.toBeNull();
  });
  it("validateFit names each hole; models without a block rate unknown", () => {
    const broken = { fit: { uses: { chat: "best" }, languages: { en: "native", xx: "great" }, weakAt: "" }, goodLanguages: ["en"] } as unknown as CatalogModel;
    const problems = validateFit(broken);
    expect(problems).toContain("use.writing");
    expect(problems).toContain("language.he");
    expect(problems).toContain("language.xx");
    expect(problems).toContain("weakAt");
    expect(validateFit({ goodLanguages: [] })).toContain("use.chat");
    expect(languageTierOf({}, "he")).toBeNull();
    expect(useTierOf({}, "chat")).toBeNull();
    expect(languageTierOf(chat[0]!, "tr")).toBeNull();
    expect(languageTierOf(chat[0]!, null)).toBeNull();
  });
});

describe("distinctLanguageCodes (QA F31: one Chinese row, not three)", () => {
  it("drops a script variant that repeats its plain language's tier", () => {
    expect(distinctLanguageCodes({ zh: "native", "zh-Hans": "native", "zh-Hant": "native" })).toEqual(["zh"]);
    expect(distinctLanguageCodes({ zh: "good", "zh-Hant": "good" })).toEqual(["zh"]);
  });
  it("keeps a script variant that disagrees, and every plain language", () => {
    expect(distinctLanguageCodes({ zh: "good", "zh-Hant": "basic" })).toEqual(["zh", "zh-Hant"]);
    expect(distinctLanguageCodes({ en: "native", he: "basic" })).toEqual(["en", "he"]);
  });
  it("keeps a script variant whose plain language is unrated", () => {
    expect(distinctLanguageCodes({ "zh-Hant": "good" })).toEqual(["zh-Hant"]);
  });
  it("shows one Chinese row for every chat model in the shipping catalog", () => {
    for (const m of chat) expect(distinctLanguageCodes(fit(m.id).languages).filter((c) => c.startsWith("zh")), m.id).toEqual(["zh"]);
  });
});
