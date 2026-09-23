import { describe, expect, it } from "vitest";
import { BUNDLED_MANIFEST, adviseModel, detectUse, looksLikeCode, looksLikeMath, modelShortfall, rankModels, recommendModel, recommendationIsWeak, type CatalogModel, type DeviceProfile, type RecommendInput } from "../src/index";

const catalog = BUNDLED_MANIFEST.models;
const byId = (id: string): CatalogModel => catalog.find((m) => m.id === id)!;
const phone = (ramGB: number, pro = false): DeviceProfile => ({ ramGB, deviceClass: "phone", pro });
const desktop = (ramGB: number): DeviceProfile => ({ ramGB, deviceClass: "desktop", pro: true });
const input = (over: Partial<RecommendInput>): RecommendInput => ({ use: "chat", languageCode: "en", device: phone(8), installed: [], catalog, ...over });
const ids = (rows: { model: CatalogModel }[]) => rows.map((r) => r.model.id);

describe("recommendModel (spec §7.8: use + language + device)", () => {
  it("English chat on an 8 GB phone with nothing installed: Fast (the §6.3 default among the equally good)", () => {
    const r = recommendModel(input({}))!;
    expect(r.model.id).toBe("fast");
    expect(r.reason).toEqual({ use: "chat", useTier: "best", languageCode: "en", languageTier: "native", ramFit: "well", installed: false });
  });
  it("Hebrew chat on an 8 GB phone: only Sharp and Phi are basic (Fast and Instant are none after the 20.9 run), so those two lead and use orders them", () => {
    expect(ids(rankModels(input({ languageCode: "he" })))).toEqual(["sharp", "sharp-phi", "fast", "instant"]);
    expect(recommendationIsWeak(recommendModel(input({ languageCode: "he" }))!)).toBe(true);
  });
  it("code on an 8 GB phone: Phi first, Sharp second; math the same", () => {
    expect(ids(rankModels(input({ use: "code" }))).slice(0, 2)).toEqual(["sharp-phi", "sharp"]);
    expect(recommendModel(input({ use: "math" }))!.model.id).toBe("sharp-phi");
  });
  it("code in Hebrew: Hebrew is basic on Sharp and Phi alike, so the use decides: Phi", () => {
    expect(recommendModel(input({ use: "code", languageCode: "he" }))!.model.id).toBe("sharp-phi");
    /* §7.8 ranks language above use; Fast and Sharp are both `good` at Arabic since the 24.9 downgrade, so the use breaks the tie. */
    expect(ids(rankModels(input({ languageCode: "ar" })))).toEqual(["fast", "sharp", "instant", "sharp-phi"]);
    expect(recommendModel(input({ use: "code", languageCode: "ar" }))!.model.id).toBe("sharp");
  });
  it("a 4 GB phone only ever hears about Instant, whatever the use or language", () => {
    expect(ids(rankModels(input({ device: phone(4), languageCode: "he", use: "code" })))).toEqual(["instant"]);
  });
  it("says so when even the top pick is weak: code in Hebrew on a 4 GB phone is Instant, and Instant is not good at it", () => {
    const top = recommendModel(input({ device: phone(4), languageCode: "he", use: "code" }))!;
    expect(top.model.id).toBe("instant");
    expect(recommendationIsWeak(top)).toBe(true);
    expect(recommendationIsWeak(recommendModel(input({ device: phone(4), languageCode: "en", use: "chat" }))!)).toBe(false);
    expect(recommendationIsWeak(recommendModel(input({ device: phone(8), languageCode: "ar", use: "writing" }))!)).toBe(false);
    expect(recommendationIsWeak(recommendModel(input({ device: phone(8), languageCode: "he", use: "code" }))!)).toBe(true);
    /* Weak on one dimension only is still weak: Hebrew is basic on Fast even though chat is best. */
    expect(recommendationIsWeak(recommendModel(input({ device: phone(4), languageCode: "he", use: "chat" }))!)).toBe(true);
    expect(recommendationIsWeak(recommendModel(input({ device: phone(4), languageCode: null, use: "code" }))!)).toBe(true);
  });
  it("an unknown language does not rank: use decides", () => {
    expect(recommendModel(input({ languageCode: null, use: "translate" }))!.model.id).toBe("sharp");
    expect(recommendModel(input({ languageCode: "tr", use: "chat" }))!.model.id).toBe("fast");
  });
  it("a language the fit map never rated is unknown, so the vault claims nothing about it", () => {
    for (const code of ["id", "tr", "pl", "hi", "vi"]) {
      const top = recommendModel(input({ languageCode: code }))!;
      expect(top.reason.languageTier, code).toBeNull();
      expect(recommendationIsWeak(top), code).toBe(false);
      /* Unrated ties every model on language, so the ranking is the one an unknown language already produced. */
      expect(ids(rankModels(input({ languageCode: code }))), code).toEqual(ids(rankModels(input({ languageCode: null }))));
    }
  });
  it("a script subtag reads the script-tagged tier, then the plain language", () => {
    expect(recommendModel(input({ languageCode: "zh-Hant" }))!.reason.languageTier).toBe("native");
    expect(recommendModel(input({ languageCode: "zh-Hans", device: phone(4) }))!.reason.languageTier).toBe("good");
    expect(recommendModel(input({ languageCode: "zh-Hans" }))!.model.id).toBe("fast");
  });
  it("an installed model wins a tie over one still to download", () => {
    expect(recommendModel(input({ installed: ["sharp"] }))!.model.id).toBe("sharp");
    expect(recommendModel(input({ installed: ["sharp"] }))!.reason.installed).toBe(true);
  });
  it("on a 6 GB phone a model that runs slowly loses the tie to one that runs well, but not the use", () => {
    expect(recommendModel(input({ device: phone(6) }))!.model.id).toBe("fast");
    const code = recommendModel(input({ device: phone(6), use: "code" }))!;
    expect(code.model.id).toBe("sharp-phi");
    expect(code.reason.ramFit).toBe("slowly");
  });
  it("desktop 16 GB English chat: Sharp (§6.3 default tier is Power, Sharp is the closest in the catalog)", () => {
    expect(recommendModel(input({ device: desktop(16) }))!.model.id).toBe("sharp");
  });
  it("an entry above the engine version or without a fit block is never recommended", () => {
    const future = catalog.map((m) => (m.id === "sharp" ? { ...m, minEngine: 99 } : m));
    expect(recommendModel(input({ catalog: future, languageCode: "ar" }))!.model.id).toBe("fast");
    const stripped = catalog.map((m) => (m.id === "sharp" ? { ...m, fit: undefined } : m));
    expect(ids(rankModels(input({ catalog: stripped })))).not.toContain("sharp");
    expect(recommendModel(input({ catalog: [] }))).toBeNull();
  });
});

describe("adviseModel (the chat card)", () => {
  const advise = (currentId: string, over: Partial<RecommendInput>) => adviseModel({ ...input(over), current: byId(currentId) });
  it("Hebrew on Instant with Fast installed: Fast is none too now, so the offer is Sharp (basic: better, not fluent); no 'best' line because nothing here is good", () => {
    const a = advise("instant", { languageCode: "he", installed: ["instant", "fast"] })!;
    expect(a.better.model.id).toBe("sharp");
    expect(a.language).toEqual({ code: "he", from: "none", to: "basic" });
    expect(a.use).toBeUndefined();
    expect(a.best).toBeUndefined();
    expect(a.key).toBe("instant>sharp|lang:he|");
  });
  it("Hebrew on Fast: Sharp is the only model that reads Hebrew at all, so the card offers it", () => {
    const a = advise("fast", { languageCode: "he", installed: ["fast", "sharp"] })!;
    expect(a.better.model.id).toBe("sharp");
    expect(a.language).toEqual({ code: "he", from: "none", to: "basic" });
  });
  it("German on Fast: the 20.9 correction is what makes the card steer a German user to Sharp", () => {
    for (const installed of [["fast", "sharp"], ["fast"]]) {
      const a = advise("fast", { languageCode: "de", installed })!;
      expect(a.better.model.id).toBe("sharp");
      expect(a.language).toEqual({ code: "de", from: "basic", to: "good" });
      expect(a.use).toBeUndefined();
    }
    /* Korean is the other Fast downgrade; Sharp is native at it. */
    expect(advise("fast", { languageCode: "ko", installed: ["fast", "sharp"] })!.language).toEqual({ code: "ko", from: "basic", to: "native" });
  });
  it("no card at all for a language the fit map never rated: no claim, so no offer", () => {
    for (const code of ["id", "tr", "pl", "hi", "vi"]) expect(advise("instant", { languageCode: code, installed: ["instant"] }), code).toBeNull();
  });
  it("Arabic on Instant: Fast is good at it (basic → good), installed or not; no 'best' line since Fast is the top pick", () => {
    const a = advise("instant", { languageCode: "ar", installed: ["instant", "fast"] })!;
    expect(a.better.model.id).toBe("fast");
    expect(a.language).toEqual({ code: "ar", from: "basic", to: "good" });
    expect(a.best).toBeUndefined();
    expect(advise("instant", { languageCode: "ar", installed: ["instant"] })!.better.model.id).toBe("fast");
  });
  it("silent when the current model is good enough, and when Hebrew is basic on Sharp already: no switch improves it", () => {
    expect(advise("fast", { languageCode: "en" })).toBeNull();
    expect(advise("sharp", { languageCode: "he" })).toBeNull();
    expect(advise("instant", { languageCode: "en", use: "chat" })).toBeNull();
    /* Chinese in either script is native on Fast, so a Traditional user is never nagged. */
    expect(advise("fast", { languageCode: "zh-Hant" })).toBeNull();
    expect(advise("fast", { languageCode: "zh-Hans" })).toBeNull();
  });
  it("silent when nothing better fits this device: Hebrew on Instant on a 4 GB phone", () => {
    expect(advise("instant", { languageCode: "he", device: phone(4) })).toBeNull();
  });
  it("4 GB, code in Hebrew: Fast and Sharp may be on disk, but they do not fit, so no switch is suggested", () => {
    expect(advise("instant", { languageCode: "he", use: "code", device: phone(4), installed: ["instant", "fast", "sharp", "sharp-phi"] })).toBeNull();
    /* Fast on a 4 GB phone (imported earlier, RAM freed): Instant is the only fit and is worse on both, so still nothing. */
    expect(advise("fast", { languageCode: "he", use: "code", device: phone(4), installed: ["instant", "fast"] })).toBeNull();
  });
  it("code on Fast: Phi is better at code (installed first: Sharp when only Sharp is there)", () => {
    const a = advise("fast", { use: "code", installed: ["fast", "sharp"] })!;
    expect(a.better.model.id).toBe("sharp");
    expect(a.use).toEqual({ use: "code", from: "weak", to: "good" });
    expect(a.best?.model.id).toBe("sharp-phi");
    expect(advise("fast", { use: "code", installed: ["fast"] })!.better.model.id).toBe("sharp-phi");
  });
  it("never trades one dimension for the other: Hebrew code on Fast does not offer Phi (worse Hebrew than... no, equal) but never Instant", () => {
    const a = advise("fast", { use: "code", languageCode: "he", installed: ["fast", "sharp-phi"] })!;
    /* Phi: he basic (> Fast's none), code best (> weak): it gains on both, and it is installed. */
    expect(a.better.model.id).toBe("sharp-phi");
    expect(a.language).toEqual({ code: "he", from: "none", to: "basic" });
    expect(a.use?.to).toBe("best");
    /* Phi-installed user writing Arabic prose: Phi is basic at Arabic; Sharp is good at it and best at writing, so it wins both dimensions. */
    const b = advise("sharp-phi", { use: "writing", languageCode: "ar", installed: ["sharp-phi"] })!;
    expect(b.better.model.id).toBe("sharp");
    expect(b.language).toEqual({ code: "ar", from: "basic", to: "good" });
  });
  it("both dimensions at once carry both reasons and one key", () => {
    const a = advise("instant", { use: "code", languageCode: "he", installed: ["instant", "sharp"] })!;
    expect(a.better.model.id).toBe("sharp");
    expect(a.language?.to).toBe("basic");
    expect(a.use?.to).toBe("good");
    expect(a.key).toBe("instant>sharp|lang:he|use:code");
  });
  it("no advice for an import or with no model loaded", () => {
    expect(adviseModel({ ...input({ languageCode: "he" }), current: { ...byId("instant"), id: "import:x.gguf", fit: undefined } })).toBeNull();
    expect(adviseModel({ ...input({ languageCode: "he" }), current: null })).toBeNull();
  });
});

describe("detectUse", () => {
  it("documents beat everything, then a quick action", () => {
    expect(detectUse({ text: "```js\nlet x\n```", hasDocuments: true })).toBe("documents");
    expect(detectUse({ text: "fix this", quickAction: "fixGrammar" })).toBe("writing");
    expect(detectUse({ text: "x", quickAction: "extractTasks" })).toBe("summarize");
    expect(detectUse({ text: "x", quickAction: "translate" })).toBe("translate");
  });
  it("code and math are read from the text", () => {
    expect(looksLikeCode("```python\nprint(1)\n```")).toBe(true);
    expect(looksLikeCode("why does this throw an exception? const a = fetch(url); a.then(r => r.json())")).toBe(true);
    expect(looksLikeCode("I had coffee with my function-loving friend")).toBe(false);
    expect(looksLikeMath("solve 3x + 2 = 11")).toBe(true);
    expect(looksLikeMath("what is 12 * 7 + 3")).toBe(true);
    expect(looksLikeMath("I moved on 12 March")).toBe(false);
    expect(detectUse({ text: "def f(x):\n  return x;" })).toBe("code");
    expect(detectUse({ text: "prove the theorem" })).toBe("math");
  });
  it("dictation, then the persona, then chat", () => {
    expect(detectUse({ text: "hello", dictated: true })).toBe("voice");
    expect(detectUse({ text: "hello", personaId: "builtin:writer" })).toBe("writing");
    expect(detectUse({ text: "hello", personaId: "builtin:translator" })).toBe("translate");
    expect(detectUse({ text: "hello", personaId: "custom:1", personaIcon: "code" })).toBe("code");
    expect(detectUse({ text: "hello", personaId: "builtin:tutor" })).toBe("chat");
    expect(detectUse({ text: "hello" })).toBe("chat");
  });
});

describe("modelShortfall (QA F23: the browser tier states what it cannot offer)", () => {
  it("names the pair the loaded model is weak at, whichever dimension fails", () => {
    expect(modelShortfall(byId("instant"), "chat", "he")).toEqual({ use: "chat", languageCode: "he" });
    expect(modelShortfall(byId("instant"), "code", "en")).toEqual({ use: "code", languageCode: "en" });
    expect(modelShortfall(byId("fast"), "chat", "he")).toEqual({ use: "chat", languageCode: "he" });
  });
  it("is null when the loaded model is up to the job", () => {
    expect(modelShortfall(byId("instant"), "chat", "en")).toBeNull();
    expect(modelShortfall(byId("sharp"), "writing", "fr")).toBeNull();
  });
  it("says nothing without a model, a fit block or a detected language", () => {
    expect(modelShortfall(null, "chat", "he")).toBeNull();
    expect(modelShortfall(byId("instant"), "chat", null)).toBeNull();
    expect(modelShortfall({ ...byId("instant"), fit: undefined }, "chat", "he")).toBeNull();
  });
  it("says nothing about a language the fit map never rated, even when the use is weak", () => {
    for (const code of ["id", "tr", "pl", "hi", "vi"]) {
      expect(modelShortfall(byId("instant"), "chat", code), code).toBeNull();
      expect(modelShortfall(byId("instant"), "code", code), code).toBeNull();
    }
    /* A rated language keeps the line: the use is the failing dimension and Indonesian is not being blamed for it. */
    expect(modelShortfall(byId("instant"), "code", "de")).toEqual({ use: "code", languageCode: "de" });
  });
});
