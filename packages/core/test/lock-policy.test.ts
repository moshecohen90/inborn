import { describe, expect, it } from "vitest";
import { attemptsLeft, biometricKindFor, isValidPasscode, shouldLock, showCountdown } from "../src/index";

describe("biometric label (S53)", () => {
  const base = { hasHardware: true, enrolled: true } as const;
  it("names the sensor the device actually has", () => {
    expect(biometricKindFor({ ...base, platform: "ios", types: ["facial"] })).toBe("faceId");
    expect(biometricKindFor({ ...base, platform: "ios", types: ["fingerprint"] })).toBe("touchId");
    expect(biometricKindFor({ ...base, platform: "macos", types: ["fingerprint"] })).toBe("touchId");
    expect(biometricKindFor({ ...base, platform: "ios", types: ["facial"], visionOS: true })).toBe("opticId");
  });
  it("never uses a brand name on Android, and Windows Hello on Windows", () => {
    expect(biometricKindFor({ ...base, platform: "android", types: ["facial", "fingerprint"] })).toBe("android");
    expect(biometricKindFor({ ...base, platform: "windows", types: ["facial"] })).toBe("windowsHello");
  });
  it("falls back to a passcode on the web, without hardware, or without enrolment", () => {
    expect(biometricKindFor({ ...base, platform: "web", types: ["facial"] })).toBe("passcode");
    expect(biometricKindFor({ platform: "ios", hasHardware: false, enrolled: false, types: [] })).toBe("passcode");
    expect(biometricKindFor({ platform: "ios", hasHardware: true, enrolled: false, types: ["facial"] })).toBe("passcode");
  });
});

describe("lock timing", () => {
  it("locks after the timeout, immediately at 0, never when disabled", () => {
    expect(shouldLock(true, 1000, 1000, 0)).toBe(true);
    expect(shouldLock(true, 1000, 30_000, 60)).toBe(false);
    expect(shouldLock(true, 1000, 61_000, 60)).toBe(true);
    expect(shouldLock(false, 1000, 999_999, 0)).toBe(false);
    expect(shouldLock(true, null, 5, 0)).toBe(false);
  });
});

describe("panic wipe countdown", () => {
  it("counts attempts left and shows the countdown from two attempts", () => {
    expect(attemptsLeft(3, null)).toBeNull();
    expect(attemptsLeft(3, 10)).toBe(7);
    expect(attemptsLeft(12, 10)).toBe(0);
    expect(showCountdown(7, 10)).toBe(false);
    expect(showCountdown(8, 10)).toBe(true);
    expect(showCountdown(8, null)).toBe(false);
  });
  it("accepts 4 to 8 digits only", () => {
    expect(isValidPasscode("1234")).toBe(true);
    expect(isValidPasscode("12345678")).toBe(true);
    expect(isValidPasscode("123")).toBe(false);
    expect(isValidPasscode("123456789")).toBe(false);
    expect(isValidPasscode("12a4")).toBe(false);
  });
});
