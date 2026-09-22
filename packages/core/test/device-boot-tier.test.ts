import { describe, expect, it } from "vitest";
import { bootMinRamGB, bootModel, ramFit, ramGBFromBytes, type CatalogModel } from "../src/index";

const GB = 2 ** 30;
const instant = { id: "instant", tier: "instant" as const, bytes: 532_517_120, minRamGB: 3 };
const fast = { id: "fast", tier: "fast" as const, bytes: 1_280_835_840, minRamGB: 6 };

describe("bootModel (QA F14: boot-time RAM floor)", () => {
  it("starts Instant when the default needs more RAM than the device has", () => {
    expect(bootModel(fast, 3.8, instant)).toEqual({ id: "instant", switched: true, from: "fast" });
  });
  it("keeps the default when the device meets its minimum", () => {
    expect(bootModel(fast, 6, instant)).toEqual({ id: "fast", switched: false, from: null });
    expect(bootModel(fast, 8, instant)).toEqual({ id: "fast", switched: false, from: null });
  });
  it("keeps the default when RAM is unknown", () => {
    expect(bootModel(fast, null, instant).switched).toBe(false);
    expect(bootModel(fast, Number.NaN, instant).switched).toBe(false);
  });
  it("keeps the default when Instant is not installed or is the default already", () => {
    expect(bootModel(fast, 3.8, null).switched).toBe(false);
    expect(bootModel(instant, 2, instant).switched).toBe(false);
  });
  it("never switches towards a model that needs as much or more", () => {
    expect(bootModel({ id: "x", tier: "sharp", bytes: 3 * GB, minRamGB: 4 }, 3.8, { ...instant, minRamGB: 4 }).switched).toBe(false);
  });
  it("derives an import's floor from its size (bytes + 1 GB, at least 2 GB)", () => {
    expect(bootMinRamGB({ id: "import:phi", tier: null, bytes: 2_491_874_272 })).toBe(4);
    expect(bootMinRamGB({ id: "import:tiny", tier: null, bytes: 100 * 1024 * 1024 })).toBe(2);
    expect(bootMinRamGB({ id: "import:phi", tier: null, bytes: 2_491_874_272, minRamGB: 0 })).toBe(4);
    expect(bootModel({ id: "import:phi", tier: null, bytes: 2_491_874_272 }, 3.8, instant)).toEqual({ id: "instant", switched: true, from: null });
  });
});

/*
 * QA F43: the guard read RAM as raw GiB while the vault, the catalog and the chip class read the marketed size, so a
 * "6 GB" phone was 5.5 to the boot floor and 6 to everything else. Fast's minimum is exactly 6, so the floor started
 * Instant on a phone the catalog recommends Fast for, and the §8.8 memory line came up on every cold launch.
 */
describe("the boot floor reads RAM the way the catalog does (QA F43)", () => {
  const fastCatalog = { minRamGB: 6, recommendedRamGB: 6 } as CatalogModel;
  const sizes: [string, number][] = [
    ["6 GB phone (iPhone 13 Pro, Pixel 6)", 5.53 * GB],
    ["8 GB phone (OnePlus 6T)", 7.4 * GB],
    ["12 GB phone", 11.6 * GB],
    ["4 GB phone", 3.7 * GB],
    ["3 GB phone", 2.8 * GB],
  ];
  for (const [name, bytes] of sizes) {
    it(`agrees with ramFit on a ${name}`, () => {
      const ram = ramGBFromBytes(bytes)!;
      expect(ram).toBeGreaterThan(0);
      expect(bootModel(fast, ram, instant).switched).toBe(ramFit(fastCatalog, ram) === "no");
    });
  }
  it("keeps Fast on a 6 GB phone, where the raw GiB reading switched to Instant", () => {
    const bytes = 5.53 * GB;
    expect(ramGBFromBytes(bytes)).toBe(6);
    expect(ramGBFromBytes(null)).toBeNull();
    expect(ramGBFromBytes(0)).toBeNull();
    expect(bootModel(fast, ramGBFromBytes(bytes), instant).switched).toBe(false);
    /* The reading the guard used before the fix. */
    expect(bootModel(fast, Math.round((bytes / GB) * 10) / 10, instant).switched).toBe(true);
  });
  it("still starts Instant where Fast genuinely does not fit", () => {
    expect(bootModel(fast, ramGBFromBytes(3.7 * GB), instant)).toEqual({ id: "instant", switched: true, from: "fast" });
  });
});
