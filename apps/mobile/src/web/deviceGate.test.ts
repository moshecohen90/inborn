import { describe, expect, it } from "vitest";
import { classifyDevice, tierFits, type DeviceSignals } from "./deviceGate";

const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const IPAD_AS_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
const base = (userAgent: string, extra: Partial<DeviceSignals> = {}): DeviceSignals => ({ userAgent, webgpu: false, ...extra });

describe("classifyDevice", () => {
  it("desktop with 8 GB reported goes up to Sharp", () => {
    expect(classifyDevice(base(MAC, { deviceMemoryGB: 8, uaMobile: false, webgpu: true }))).toMatchObject({ formFactor: "desktop", maxTier: "sharp", ramGB: 8, iphone: false, webgpu: true });
  });
  it("desktop with 4 GB stops at Fast, under 4 GB at Instant", () => {
    expect(classifyDevice(base(MAC, { deviceMemoryGB: 4 })).maxTier).toBe("fast");
    expect(classifyDevice(base(MAC, { deviceMemoryGB: 2 })).maxTier).toBe("instant");
  });
  it("desktop without a memory figure (Safari, Firefox) is capped at Fast and says so", () => {
    const gate = classifyDevice(base(MAC));
    expect(gate).toMatchObject({ formFactor: "desktop", maxTier: "fast", ramGB: null });
  });
  it("phones get Instant only, whatever memory they report", () => {
    expect(classifyDevice(base(ANDROID, { deviceMemoryGB: 8, uaMobile: true }))).toMatchObject({ formFactor: "phone", maxTier: "instant", iphone: false });
    expect(classifyDevice(base(IPHONE))).toMatchObject({ formFactor: "phone", maxTier: "instant", iphone: true });
  });
  it("UA client hints decide when the UA string is silent", () => {
    expect(classifyDevice(base("Mozilla/5.0", { uaMobile: true })).formFactor).toBe("phone");
    expect(classifyDevice(base("Mozilla/5.0", { uaMobile: false })).formFactor).toBe("desktop");
    expect(classifyDevice(base("Mozilla/5.0")).formFactor).toBe("unknown");
  });
  it("iPad posing as a Mac is a tablet: Fast unless 8 GB is reported", () => {
    expect(classifyDevice(base(IPAD_AS_MAC, { maxTouchPoints: 5 }))).toMatchObject({ formFactor: "tablet", maxTier: "fast" });
    expect(classifyDevice(base(IPAD_AS_MAC, { maxTouchPoints: 5, deviceMemoryGB: 8 })).maxTier).toBe("sharp");
  });
  it("tierFits orders the tiers", () => {
    expect(tierFits("instant", "fast")).toBe(true);
    expect(tierFits("sharp", "fast")).toBe(false);
    expect(tierFits("power", "power")).toBe(true);
  });
});
