import { describe, expect, it } from "vitest";
import { AndroidThermal, thermalFromAndroid } from "../src/device";

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
    expect(thermalFromAndroid(AndroidThermal.CRITICAL, { ...cool, headroom: 1.05 })).toBe("critical");
    expect(thermalFromAndroid(AndroidThermal.SEVERE, { ...cool, headroom: 0.9 })).toBe("serious");
    expect(thermalFromAndroid(AndroidThermal.SEVERE, { ...cool, headroom: 0.5 })).toBe("unknown");
  });

  it("once the device was seen cool, every later status is trusted", () => {
    expect(thermalFromAndroid(AndroidThermal.SEVERE, { ...cool, seenCool: true })).toBe("serious");
    expect(thermalFromAndroid(AndroidThermal.SHUTDOWN, { ...cool, seenCool: true })).toBe("critical");
  });
});
