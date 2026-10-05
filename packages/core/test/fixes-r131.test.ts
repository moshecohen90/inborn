import { describe, expect, it } from "vitest";
import { BUNDLED_MANIFEST, FIT_LANGUAGES, USE_CASES, chipClassFor, deviceRecommendation, goodAtAll, rankModels, recommendationIsWeak, weakestUse, type CatalogModel, type DeviceProfile, type RecommendInput } from "../src/index";

const catalog = BUNDLED_MANIFEST.models;
const byId = (id: string): CatalogModel => catalog.find((m) => m.id === id)!;
const phone = (ramGB: number): DeviceProfile => ({ ramGB, deviceClass: "phone" });
const legacyPhone: DeviceProfile = { ramGB: 8, deviceClass: "phone", pro: true, chip: chipClassFor({ os: "android", ramGB: 8, chipName: "Snapdragon 845" }) };
const devices: DeviceProfile[] = [phone(4), phone(6), phone(8), { ramGB: 8, deviceClass: "phone", pro: true }, legacyPhone, { ramGB: 16, deviceClass: "desktop", pro: true }];
const input = (over: Partial<RecommendInput>): RecommendInput => ({ use: "chat", languageCode: "en", device: phone(8), installed: [], catalog, ...over });
const ids = (rows: { model: CatalogModel }[]) => rows.map((r) => r.model.id);

/* Moshe 5.10: "Best for" takes several uses; a model is as good as its weakest one. */
describe("vault Best for with several uses (round 131)", () => {
  it("one use ranks exactly as before, for every use, language and test device", () => {
    for (const device of devices)
      for (const use of USE_CASES)
        for (const languageCode of [...FIT_LANGUAGES, null]) {
          const before = rankModels(input({ device, use, languageCode }));
          const after = rankModels(input({ device, use, uses: [use], languageCode }));
          expect(after, `${device.ramGB} ${device.chip} ${use} ${languageCode}`).toEqual(before);
          expect(deviceRecommendation(input({ device, use, uses: [use], languageCode }))).toEqual(deviceRecommendation(input({ device, use, languageCode })));
        }
  });

  it("the device recommendation callers that pass no uses are untouched", () => {
    expect(deviceRecommendation(input({}))!.model.id).toBe("fast");
    expect(deviceRecommendation(input({ device: phone(4) }))!.model.id).toBe("instant");
    expect(deviceRecommendation(input({ device: { ramGB: 16, deviceClass: "desktop", pro: true } }))!.model.id).toBe("sharp");
  });

  it("the weakest picked use decides, the first one on a tie", () => {
    expect(weakestUse(byId("fast"), ["chat", "documents"])).toEqual({ use: "documents", tier: "good" });
    expect(weakestUse(byId("instant"), ["chat", "documents", "code"])).toEqual({ use: "documents", tier: "weak" });
    expect(weakestUse(byId("sharp"), ["chat"])).toEqual({ use: "chat", tier: "best" });
  });

  it("Chat + Documents: the models good at both come first, the one weak at documents last, naming it", () => {
    const ranked = rankModels(input({ uses: ["chat", "documents"] }));
    expect(ids(ranked)).toEqual(["sharp", "fast", "sharp-phi", "instant"]);
    expect(ranked.map(goodAtAll)).toEqual([true, true, true, false]);
    const instant = ranked[3]!.reason;
    expect(instant.use).toBe("documents");
    expect(instant.useTiers).toEqual([{ use: "chat", tier: "good" }, { use: "documents", tier: "weak" }]);
  });

  it("good at all of them outranks a better language: Chinese Chat + Math puts Phi (basic Chinese) above Fast (native, weak at math)", () => {
    const ranked = rankModels(input({ languageCode: "zh", uses: ["chat", "math"] }));
    expect(ids(ranked)).toEqual(["sharp", "sharp-phi", "fast", "instant"]);
    expect(ranked.map(goodAtAll)).toEqual([true, true, false, false]);
  });

  it("every use selected: Sharp alone is good at all of them where it runs", () => {
    const ranked = rankModels(input({ uses: USE_CASES }));
    expect(ranked.filter(goodAtAll).map((r) => r.model.id)).toEqual(["sharp"]);
    expect(ids(ranked)[0]).toBe("sharp");
  });

  it("none good at all of them: everything is still listed, closest first, and the top pick says it is weak", () => {
    const ranked = rankModels(input({ device: legacyPhone, uses: USE_CASES }));
    expect(ids(ranked)).toEqual(["fast", "instant"]);
    expect(ranked.some(goodAtAll)).toBe(false);
    expect(recommendationIsWeak(deviceRecommendation(input({ device: legacyPhone, uses: USE_CASES }))!)).toBe(true);
    expect(ids(rankModels(input({ device: phone(4), uses: ["chat", "documents"] })))).toEqual(["instant"]);
  });
});
