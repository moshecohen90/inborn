import { describe, expect, it } from "vitest";
import { androidChipName, belowFloor, chipForModelId, marketingRamGB, ramLabel } from "../src/index";

describe("runs-on line (S01)", () => {
  it("maps hardware ids to chip names, by exact id then by family", () => {
    expect(chipForModelId("iPhone16,1")).toBe("A17 Pro");
    expect(chipForModelId("iPhone17,3")).toBe("A18");
    expect(chipForModelId("iPhone14,5")).toBe("A15 Bionic");
    expect(chipForModelId("iPhone18,2")).toBe("A19 Pro");
    expect(chipForModelId("Pixel 8")).toBeNull();
    expect(chipForModelId(null)).toBeNull();
  });
  it("rounds RAM to the marketed size and knows the floor", () => {
    expect(ramLabel(5.6e9)).toBe("6 GB");
    expect(ramLabel(7818096 * 1024)).toBe("8 GB");
    expect(ramLabel(6 * 2 ** 30 - 400e6)).toBe("6 GB");
    // OnePlus 6T: ActivityManager reports 7.4 GiB; onboarding and the vault must both say 8 GB.
    expect(ramLabel(7.4 * 2 ** 30)).toBe("8 GB");
    expect(marketingRamGB(7.4 * 2 ** 30)).toBe(8);
    expect(marketingRamGB(3.7 * 2 ** 30)).toBe(4);
    expect(marketingRamGB(11.6 * 2 ** 30)).toBe(12);
    expect(ramLabel(0)).toBeNull();
    expect(belowFloor(3 * 2 ** 30)).toBe(true);
    expect(belowFloor(8 * 2 ** 30)).toBe(false);
  });
  it("names Android chips from the SoC id, then the model code, else nothing", () => {
    expect(androidChipName("SM8550", "SM-S911B")).toBe("Snapdragon 8 Gen 2");
    expect(androidChipName("sm8650-ab", null)).toBe("Snapdragon 8 Gen 3");
    expect(androidChipName("Zuma", "Pixel 8")).toBe("Tensor G3");
    expect(androidChipName(null, "ONEPLUS A6013")).toBe("Snapdragon 845");
    expect(androidChipName("unknown", "Pixel 6")).toBe("Tensor");
    expect(androidChipName("ranchu", "sdk_gphone64_arm64")).toBeNull();
    expect(androidChipName(null, null)).toBeNull();
  });
});
