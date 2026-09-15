import { describe, expect, it } from "vitest";
import { BUNDLED_MANIFEST, adviseModel, detectUse, looksLikeCode, looksLikeMath, rankModels, recommendModel, type CatalogModel, type DeviceProfile, type RecommendInput } from "../src/index";

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
  it("Hebrew chat on an 8 GB phone: Sharp, the only model rated good for Hebrew", () => {
    expect(ids(rankModels(input({ languageCode: "he" })))).toEqual(["sharp", "fast", "sharp-phi", "instant"]);
  });
  it("code on an 8 GB phone: Phi first, Sharp second; math the same", () => {
    expect(ids(rankModels(input({ use: "code" }))).slice(0, 2)).toEqual(["sharp-phi", "sharp"]);
    expect(recommendModel(input({ use: "math" }))!.model.id).toBe("sharp-phi");
  });
  it("code in Hebrew: language ranks first, so Sharp beats Phi", () => {
    expect(recommendModel(input({ use: "code", languageCode: "he" }))!.model.id).toBe("sharp");
  });
  it("a 4 GB phone only ever hears about Instant, whatever the use or language", () => {
    expect(ids(rankModels(input({ device: phone(4), languageCode: "he", use: "code" })))).toEqual(["instant"]);
  });
  it("an unknown language does not rank: use decides", () => {
    expect(recommendModel(input({ languageCode: null, use: "translate" }))!.model.id).toBe("sharp");
    expect(recommendModel(input({ languageCode: "tr", use: "chat" }))!.model.id).toBe("fast");
  });
  it("an installed model wins a tie over one still to download", () => {
    expect(recommendModel(input({ installed: ["sharp"] }))!.model.id).toBe("sharp");
    expect(recommendModel(input({ installed: ["sharp"] }))!.reason.installed).toBe(true);
  });
  it("on a 6 GB phone a model that runs slowly loses the tie to one that runs well, but not the language", () => {
    expect(recommendModel(input({ device: phone(6) }))!.model.id).toBe("fast");
    const he = recommendModel(input({ device: phone(6), languageCode: "he" }))!;
    expect(he.model.id).toBe("sharp");
    expect(he.reason.ramFit).toBe("slowly");
  });
  it("desktop 16 GB English chat: Sharp (§6.3 default tier is Power, Sharp is the closest in the catalog)", () => {
    expect(recommendModel(input({ device: desktop(16) }))!.model.id).toBe("sharp");
  });
  it("an entry above the engine version or without a fit block is never recommended", () => {
    const future = catalog.map((m) => (m.id === "sharp" ? { ...m, minEngine: 99 } : m));
    expect(recommendModel(input({ catalog: future, languageCode: "he" }))!.model.id).toBe("fast");
    const stripped = catalog.map((m) => (m.id === "sharp" ? { ...m, fit: undefined } : m));
    expect(ids(rankModels(input({ catalog: stripped })))).not.toContain("sharp");
    expect(recommendModel(input({ catalog: [] }))).toBeNull();
  });
});

describe("adviseModel (the chat card)", () => {
  const advise = (currentId: string, over: Partial<RecommendInput>) => adviseModel({ ...input(over), current: byId(currentId) });
  it("Hebrew on Instant with Fast installed: switch to Fast now, Sharp named as best", () => {
    const a = advise("instant", { languageCode: "he", installed: ["instant", "fast"] })!;
    expect(a.better.model.id).toBe("fast");
    expect(a.better.reason.installed).toBe(true);
    expect(a.language).toEqual({ code: "he", from: "none", to: "basic" });
    expect(a.use).toBeUndefined();
    expect(a.best?.model.id).toBe("sharp");
    expect(a.key).toBe("instant>fast|lang:he|");
  });
  it("Hebrew on Instant with nothing else installed: install Sharp (best), no secondary line", () => {
    const a = advise("instant", { languageCode: "he", installed: ["instant"] })!;
    expect(a.better.model.id).toBe("sharp");
    expect(a.best).toBeUndefined();
    expect(a.language).toEqual({ code: "he", from: "none", to: "good" });
  });
  it("silent when the current model is good enough: English chat on Fast, Hebrew on Sharp", () => {
    expect(advise("fast", { languageCode: "en" })).toBeNull();
    expect(advise("sharp", { languageCode: "he" })).toBeNull();
    expect(advise("instant", { languageCode: "en", use: "chat" })).toBeNull();
  });
  it("silent when nothing better fits this device: Hebrew on Instant on a 4 GB phone", () => {
    expect(advise("instant", { languageCode: "he", device: phone(4) })).toBeNull();
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
    /* Phi: he basic (= Fast), code best (> weak): allowed and installed. */
    expect(a.better.model.id).toBe("sharp-phi");
    expect(a.language).toBeUndefined();
    expect(a.use?.to).toBe("best");
    /* Phi-installed user writing Hebrew prose: Phi is basic; Sharp (good) is the only gain, Instant/Fast never. */
    const b = advise("sharp-phi", { use: "writing", languageCode: "he", installed: ["sharp-phi"] })!;
    expect(b.better.model.id).toBe("sharp");
  });
  it("both dimensions at once carry both reasons and one key", () => {
    const a = advise("instant", { use: "code", languageCode: "he", installed: ["instant", "sharp"] })!;
    expect(a.better.model.id).toBe("sharp");
    expect(a.language?.to).toBe("good");
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
