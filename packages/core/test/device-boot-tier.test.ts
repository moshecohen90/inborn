import { describe, expect, it } from "vitest";
import { bootMinRamGB, bootModel } from "../src/device";

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
