import { describe, expect, it } from "vitest";
import { BUNDLED_MANIFEST, ENGINE_VERSION, chipClassFor, defaultTier, expectedSpeed, groupByFit, isLegacyAndroidChip, maxTier, pickDefault, ramFit, type DeviceProfile } from "../src/index";

const models = BUNDLED_MANIFEST.models;
const phone = (ramGB: number, pro = false): DeviceProfile => ({ ramGB, deviceClass: "phone", pro });
const desktop = (ramGB: number, pro = false, gpuGB?: number): DeviceProfile => ({ ramGB, deviceClass: "desktop", pro, gpuGB });

describe("pickDefault (spec §6.3)", () => {
  it("3–4 GB phones get Instant, 6 / 8 / 12 GB phones get Fast", () => {
    expect(pickDefault(models, phone(3))?.id).toBe("instant");
    expect(pickDefault(models, phone(4))?.id).toBe("instant");
    expect(pickDefault(models, phone(6))?.id).toBe("fast");
    expect(pickDefault(models, phone(8))?.id).toBe("fast");
    expect(pickDefault(models, phone(12))?.id).toBe("fast");
  });
  it("desktop defaults follow the table but never hand a free user a Pro tier", () => {
    expect(pickDefault(models, desktop(8, true))?.id).toBe("sharp");
    expect(pickDefault(models, desktop(8, false))?.id).toBe("fast");
    expect(pickDefault(models, desktop(16, true))?.id).toBe("sharp"); // Power is not in catalog v1 yet
    expect(defaultTier(desktop(16))).toBe("power");
  });
  it("never returns a model below the RAM floor and returns nothing when nothing fits", () => {
    expect(pickDefault(models, phone(2))).toBeUndefined();
    expect(pickDefault([], phone(8))).toBeUndefined();
  });
});

describe("maxTier / groupByFit", () => {
  it("a 4 GB device sees only Instant as installable; everything above is too big with the RAM reason", () => {
    const g = groupByFit(models, phone(4), ENGINE_VERSION);
    expect(g.fits.map((m) => m.id)).toEqual(["instant"]);
    expect(g.tooBig.map((t) => [t.model.id, t.reason])).toEqual([
      ["fast", "ram"],
      ["sharp", "ram"],
      ["sharp-phi", "ram"],
    ]);
    expect(maxTier(phone(4))).toBe("instant");
  });
  it("6 GB phones see Sharp (short context); 8 GB and up run it well", () => {
    expect(groupByFit(models, phone(6), ENGINE_VERSION).fits.map((m) => m.id)).toEqual(["instant", "fast", "sharp", "sharp-phi"]);
    expect(ramFit(models.find((m) => m.id === "sharp")!, 6)).toBe("slowly");
    expect(ramFit(models.find((m) => m.id === "sharp")!, 8)).toBe("well");
    expect(maxTier(phone(12))).toBe("power");
    expect(maxTier(desktop(32))).toBe("studio");
    expect(maxTier(desktop(16, false, 24))).toBe("studio");
  });
  it("a catalog entry that needs a newer engine is greyed with the engine reason, not hidden", () => {
    const future = models.map((m) => (m.id === "fast" ? { ...m, minEngine: ENGINE_VERSION + 1 } : m));
    const g = groupByFit(future, phone(8), ENGINE_VERSION);
    expect(g.fits.map((m) => m.id)).toEqual(["instant", "sharp", "sharp-phi"]);
    expect(g.tooBig).toEqual([{ model: future[1], reason: "engine" }]);
  });
  it("companion models are never grouped as tiers", () => {
    const g = groupByFit(models, desktop(64), ENGINE_VERSION);
    expect([...g.fits, ...g.tooBig.map((t) => t.model)].every((m) => m.role === "chat")).toBe(true);
  });
});

describe("expected speed (spec §6.4)", () => {
  it("classes devices by platform and RAM and always answers with a range", () => {
    expect(chipClassFor({ os: "ios", ramGB: 6 })).toBe("ios-mid");
    expect(chipClassFor({ os: "ios", ramGB: 8 })).toBe("ios-high");
    expect(chipClassFor({ os: "android", ramGB: 4 })).toBe("android-entry");
    expect(chipClassFor({ os: "android", ramGB: 12 })).toBe("android-flagship");
    expect(chipClassFor({ os: "macos", ramGB: 16 })).toBe("desktop-apple");
    expect(chipClassFor({ os: "windows", ramGB: 32, discreteGpu: true })).toBe("desktop-gpu");
    const [min, max] = expectedSpeed("ios-high", "sharp")!;
    expect(min).toBeLessThan(max);
    expect(expectedSpeed("android-entry", "sharp")).toBeUndefined();
    expect(expectedSpeed("web", undefined)).toBeUndefined();
  });

  /* Measured on the phones: OnePlus 6T (Snapdragon 845, 8 GB) Instant 12–15.5 tok/s and Fast 5–5.8 tok/s; iPhone 13 Pro Instant 36 tok/s. */
  const within20 = (range: readonly [number, number], measured: number[]) => measured.every((m) => m >= range[0] * 0.8 && m <= range[1] * 1.2 && m >= range[0] && m <= range[1]);
  it("a Snapdragon 845 phone is a legacy chip whatever its RAM, and its ranges hold the OnePlus 6T numbers", () => {
    const sixT = chipClassFor({ os: "android", ramGB: 8, chipName: "Snapdragon 845" });
    expect(sixT).toBe("android-legacy");
    expect(within20(expectedSpeed(sixT, "instant")!, [15.5, 12])).toBe(true);
    expect(within20(expectedSpeed(sixT, "fast")!, [5, 5.8])).toBe(true);
    expect(isLegacyAndroidChip("Snapdragon 865")).toBe(true);
    expect(isLegacyAndroidChip("Snapdragon 8 Gen 2")).toBe(false);
    expect(isLegacyAndroidChip(null)).toBe(false);
  });
  it("modern 8 GB Androids and the iPhone 13 Pro keep their anchors", () => {
    expect(chipClassFor({ os: "android", ramGB: 8, chipName: "Snapdragon 8 Gen 3" })).toBe("android-high");
    expect(chipClassFor({ os: "android", ramGB: 8 })).toBe("android-high");
    expect(expectedSpeed("android-high", "instant")![0]).toBeGreaterThanOrEqual(expectedSpeed("android-legacy", "instant")![1]);
    expect(within20(expectedSpeed(chipClassFor({ os: "ios", ramGB: 6 }), "instant")!, [36])).toBe(true);
  });
});
