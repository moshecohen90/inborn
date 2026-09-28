import { describe, expect, it } from "vitest";
import { BUNDLED_MANIFEST, USABLE_TOKENS_PER_SEC, chipClassFor, expectedSpeed, groupByFit, rankModels, recommendModel, tooSlowHere, type CatalogModel, type DeviceProfile, type RecommendInput } from "../src/index";

const catalog = BUNDLED_MANIFEST.models;
const byId = (id: string): CatalogModel => catalog.find((m) => m.id === id)!;
const sixT = chipClassFor({ os: "android", ramGB: 8, chipName: "Snapdragon 845" });
const legacyPhone: DeviceProfile = { ramGB: 8, deviceClass: "phone", pro: true, chip: sixT };
const modernPhone: DeviceProfile = { ramGB: 8, deviceClass: "phone", pro: true, chip: chipClassFor({ os: "android", ramGB: 8, chipName: "Snapdragon 8 Gen 3" }) };
const input = (over: Partial<RecommendInput>): RecommendInput => ({ use: "chat", languageCode: "en", device: legacyPhone, installed: [], catalog, ...over });
const ids = (rows: { model: CatalogModel }[]) => rows.map((r) => r.model.id);

/* QA F37: Sharp measured 0.5 tok/s on the OnePlus 6T (Play vc12, 21.9.2026) while the card promised "~3-4 tok/s". */
describe("android-legacy carries the measured Sharp rate (QA F37)", () => {
  it("the 6T's chip class is android-legacy and its Sharp row is the measured 0.5 tok/s", () => {
    expect(sixT).toBe("android-legacy");
    const range = expectedSpeed(sixT, "sharp")!;
    expect(range[0]).toBeLessThanOrEqual(0.5);
    expect(range[1]).toBeGreaterThanOrEqual(0.5);
    expect(range[1]).toBeLessThan(1);
  });

  it("marks that row too slow to use, and no other shipped row", () => {
    expect(tooSlowHere(sixT, "sharp")).toBe(true);
    expect(tooSlowHere(sixT, "fast")).toBe(false);
    expect(tooSlowHere(sixT, "instant")).toBe(false);
    expect(tooSlowHere(modernPhone.chip, "sharp")).toBe(false);
    /* A tier with no row for this class is not a claim either way. */
    expect(tooSlowHere(sixT, "power")).toBe(false);
    expect(tooSlowHere(undefined, "sharp")).toBe(false);
    expect(expectedSpeed(sixT, "sharp")![1]).toBeLessThan(USABLE_TOKENS_PER_SEC);
  });

  it("the recommendation stops offering Sharp on that chip, and still offers it on a modern 8 GB phone", () => {
    expect(ids(rankModels(input({})))).toEqual(["fast", "instant"]);
    expect(ids(rankModels(input({ device: modernPhone })))).toContain("sharp");
    /* Hebrew is the case where Sharp used to win on a 6T: the pick falls to what the phone can actually run. */
    expect(recommendModel(input({ languageCode: "he" }))!.model.id).not.toBe("sharp");
    expect(recommendModel(input({ languageCode: "he", device: modernPhone }))!.model.id).toBe("sharp");
  });

  it("Sharp stays installable on the 6T: the vault lists it under fits, not under Too big", () => {
    const groups = groupByFit([...catalog], legacyPhone, BUNDLED_MANIFEST.models[0]!.minEngine);
    expect(groups.fits.map((m) => m.id)).toContain("sharp");
    expect(groups.tooBig.map((g) => g.model.id)).not.toContain("sharp");
  });
});

/* QA F36: a projector initializes for one embedding width. Round 117 (F437): each Qwen3.5 chat model has its own
   pack (Instant 0.8B, Fast 2B, Sharp 4B), so each one sees with its own file; Phi-4-mini has no projector at all. */
describe("image input goes through each model's own projector (QA F36, F437)", () => {
  it("the three Qwen3.5 tiers claim vision, Sharp (Phi) does not", () => {
    const seeing = catalog.filter((m) => m.role === "chat" && m.vision).map((m) => m.id);
    expect(seeing).toEqual(["instant", "fast", "sharp"]);
    expect(byId("sharp-phi").vision).toBe(false);
  });

  it("the cartridge copy says no photos only where there are none, and no model claims to be the only one that sees", () => {
    expect(byId("fast").fit!.weakAt).not.toMatch(/photo/i);
    expect(byId("sharp").fit!.weakAt).not.toMatch(/photo/i);
    expect(byId("sharp-phi").goodFor).toMatch(/No photos/);
    expect(byId("instant").goodFor).not.toMatch(/only model/i);
    expect(byId("vision-qwen35").goodFor).toBe("Lets Instant look at your photos on this device.");
    expect(byId("vision-qwen35-2b").goodFor).toBe("Lets Fast look at your photos on this device.");
    expect(byId("vision-qwen35-4b").goodFor).toBe("Lets Sharp look at your photos on this device.");
  });
});
