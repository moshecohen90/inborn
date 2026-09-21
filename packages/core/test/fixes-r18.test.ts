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

/* QA F36: the shipped projector (mmproj-Qwen3.5-0.8B-F16) initializes for Instant's 1024-wide embeddings only. */
describe("image input is Instant only (QA F36)", () => {
  it("exactly one chat model in the catalog claims vision", () => {
    const seeing = catalog.filter((m) => m.role === "chat" && m.vision).map((m) => m.id);
    expect(seeing).toEqual(["instant"]);
    expect(byId("fast").vision).toBe(false);
    expect(byId("sharp").vision).toBe(false);
  });

  it("the cartridge copy no longer promises photos on the models that cannot take the projector", () => {
    expect(byId("sharp").goodFor).not.toMatch(/photo/i);
    expect(byId("fast").goodFor).not.toMatch(/photo/i);
    expect(byId("fast").fit!.weakAt).toMatch(/No photos/);
    expect(byId("sharp").fit!.weakAt).toMatch(/No photos/);
    expect(byId("instant").goodFor).toMatch(/photo/i);
    expect(byId("vision-qwen35").goodFor).toBe("Lets Instant look at your photos on this device.");
  });
});
