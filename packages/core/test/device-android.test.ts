import { describe, expect, it } from "vitest";
import { AndroidThermal, memoryPressureFromAndroid, thermalFromAndroid } from "../src/device";

const cool = { headroom: null, batteryTempC: 24.1, seenCool: false };

describe("thermalFromAndroid", () => {
  it("maps THERMAL_STATUS_* to the policy's names", () => {
    expect(thermalFromAndroid(-1)).toBe("unknown");
    expect(thermalFromAndroid(AndroidThermal.NONE)).toBe("nominal");
    expect(thermalFromAndroid(AndroidThermal.LIGHT)).toBe("fair");
    expect(thermalFromAndroid(AndroidThermal.MODERATE)).toBe("fair");
    expect(thermalFromAndroid(AndroidThermal.SEVERE)).toBe("serious");
    expect(thermalFromAndroid(AndroidThermal.CRITICAL)).toBe("critical");
    expect(thermalFromAndroid(AndroidThermal.EMERGENCY)).toBe("critical");
    expect(thermalFromAndroid(AndroidThermal.SHUTDOWN)).toBe("critical");
  });

  it("OnePlus 6T: SHUTDOWN since launch on a cool phone is not believed", () => {
    expect(thermalFromAndroid(AndroidThermal.SHUTDOWN, cool)).toBe("unknown");
    expect(thermalFromAndroid(AndroidThermal.SEVERE, cool)).toBe("unknown");
  });

  it("a hot battery or a headroom reading corroborates the status", () => {
    expect(thermalFromAndroid(AndroidThermal.CRITICAL, { ...cool, batteryTempC: 41 })).toBe("critical");
    expect(thermalFromAndroid(AndroidThermal.CRITICAL, { ...cool, batteryTempC: 38 })).toBe("unknown");
    expect(thermalFromAndroid(AndroidThermal.SEVERE, { ...cool, batteryTempC: 38 })).toBe("serious");
    expect(thermalFromAndroid(AndroidThermal.CRITICAL, { ...cool, headroom: 1.05, batteryTempC: null })).toBe("critical");
    expect(thermalFromAndroid(AndroidThermal.SEVERE, { ...cool, headroom: 0.9 })).toBe("serious");
    expect(thermalFromAndroid(AndroidThermal.SEVERE, { ...cool, headroom: 0.5 })).toBe("unknown");
  });

  it("once the device was seen cool, every later status is trusted", () => {
    expect(thermalFromAndroid(AndroidThermal.SEVERE, { ...cool, seenCool: true })).toBe("serious");
    expect(thermalFromAndroid(AndroidThermal.SHUTDOWN, { ...cool, seenCool: true })).toBe("serious");
    expect(thermalFromAndroid(AndroidThermal.SHUTDOWN, { ...cool, seenCool: true, batteryTempC: 41 })).toBe("critical");
    expect(thermalFromAndroid(AndroidThermal.SHUTDOWN, { ...cool, seenCool: true, batteryTempC: null })).toBe("serious");
    expect(thermalFromAndroid(AndroidThermal.CRITICAL, { ...cool, seenCool: true, headroom: 1.05 })).toBe("serious");
    expect(thermalFromAndroid(AndroidThermal.CRITICAL, { ...cool, seenCool: true, headroom: 1.05, batteryTempC: null })).toBe("critical");
    expect(thermalFromAndroid(AndroidThermal.CRITICAL, { ...cool, headroom: 1.05 })).toBe("serious");
  });
});

describe("memoryPressureFromAndroid", () => {
  const GB = 1024 ** 3;
  const sharp = 2740938080;
  it("OnePlus 6T with Sharp resident: 853 MB free is a warning although lowMemory is false", () => {
    expect(memoryPressureFromAndroid({ availMem: 853 * 1024 ** 2, threshold: 300 * 1024 ** 2, lowMemory: false }, sharp)).toBe("warning");
  });
  it("the same phone right after the load (3.5 GB free) is normal", () => {
    expect(memoryPressureFromAndroid({ availMem: 3.5 * GB, threshold: 300 * 1024 ** 2, lowMemory: false }, sharp)).toBe("normal");
  });
  it("without a resident model only the system's own lowMemory flag counts", () => {
    expect(memoryPressureFromAndroid({ availMem: 100 * 1024 ** 2, threshold: 300 * 1024 ** 2, lowMemory: false }, null)).toBe("normal");
    expect(memoryPressureFromAndroid({ availMem: 100 * 1024 ** 2, threshold: 300 * 1024 ** 2, lowMemory: true }, null)).toBe("critical");
  });
  it("Instant (508 MB) on the same free RAM stays normal", () => {
    expect(memoryPressureFromAndroid({ availMem: 853 * 1024 ** 2, threshold: 300 * 1024 ** 2, lowMemory: false }, 532517120)).toBe("normal");
  });
});
