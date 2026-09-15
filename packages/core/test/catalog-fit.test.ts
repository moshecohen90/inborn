import { describe, expect, it } from "vitest";
import { BUNDLED_MANIFEST, FIT_LANGUAGES, USE_CASES, goodLanguagesOf, languageTierOf, useTierOf, validateFit, verifyManifest, CATALOG_PUBLIC_KEY, type CatalogModel, type ModelFit } from "../src/index";

const chat = BUNDLED_MANIFEST.models.filter((m) => m.role === "chat");
const fit = (id: string): ModelFit => BUNDLED_MANIFEST.models.find((m) => m.id === id)!.fit!;

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
  it("the signed manifest (v2) still verifies with the fit blocks inside the signature", () => {
    expect(BUNDLED_MANIFEST.version).toBe(2);
    expect(verifyManifest(BUNDLED_MANIFEST, CATALOG_PUBLIC_KEY)).toBe(true);
    const tampered = { ...BUNDLED_MANIFEST, models: BUNDLED_MANIFEST.models.map((m) => (m.id === "instant" ? { ...m, fit: { ...m.fit!, languages: { ...m.fit!.languages, he: "native" as const } } } : m)) };
    expect(verifyManifest(tampered, CATALOG_PUBLIC_KEY)).toBe(false);
  });
  it("the judgements the product relies on: no catalog model is good at Hebrew (Sharp spot-checked 15.9.2026: better than Fast, not fluent), Phi is the code and math model", () => {
    expect(fit("instant").languages.he).toBe("none");
    expect(fit("fast").languages.he).toBe("basic");
    expect(fit("sharp").languages.he).toBe("basic");
    expect(fit("sharp-phi").languages.he).toBe("basic");
    expect(fit("sharp-phi").uses.code).toBe("best");
    expect(fit("sharp-phi").uses.math).toBe("best");
    expect(fit("sharp-phi").uses.translate).toBe("weak");
    expect(fit("instant").uses.code).toBe("weak");
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
    expect(languageTierOf(chat[0]!, "tr")).toBe("none");
    expect(languageTierOf(chat[0]!, null)).toBeNull();
  });
});
