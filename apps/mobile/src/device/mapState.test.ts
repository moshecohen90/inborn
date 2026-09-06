import { describe, expect, it } from "vitest";
import { DevicePolicy, defaultOverride, type DeviceSignals, type Recommendation } from "@inborn/core";
import { toDeviceState } from "./mapState";
import type { GuardState } from "./guard";

const signals = (over: Partial<DeviceSignals> = {}): DeviceSignals => ({
  battery: { level: 0.8, state: "unplugged", lowPowerMode: false },
  thermal: "nominal",
  memoryPressure: "normal",
  powerSource: "battery",
  deviceClass: "phone",
  ramGB: 8,
  currentTier: "fast",
  generating: false,
  backgroundedForMs: null,
  throttling: false,
  baseThreads: 4,
  ...over,
});

function guardState(s: DeviceSignals, policy = new DevicePolicy()): GuardState {
  const recommendation: Recommendation = policy.update(s, defaultOverride(s.deviceClass), 0);
  return { battery: s.battery, thermal: s.thermal, memoryPressure: s.memoryPressure, powerSource: s.powerSource, recommendation, deviceClass: s.deviceClass, ramGB: s.ramGB, override: defaultOverride(s.deviceClass), engine: "loaded", explain: false };
}

describe("toDeviceState (§8.8 banner union from the §6.5 policy)", () => {
  it("quiet device → none, with the policy attached", () => {
    const d = toDeviceState(guardState(signals()));
    expect(d.recommendation).toEqual({ kind: "none" });
    expect(d.policy?.status).toBe("normal");
    expect(d.powerSource).toBe("battery");
    expect(d.battery).toEqual({ level: 0.8, lowPowerMode: false, charging: false });
  });

  it("18 % → battery offer; Low Power → automatic switch; charger → 'charging' power source", () => {
    expect(toDeviceState(guardState(signals({ battery: { level: 0.18, state: "unplugged", lowPowerMode: false } }))).recommendation).toEqual({ kind: "switchToInstant", reason: "battery", auto: false });
    expect(toDeviceState(guardState(signals({ battery: { level: 0.5, state: "unplugged", lowPowerMode: true } }))).recommendation).toEqual({ kind: "switchToInstant", reason: "lowPower", auto: true });
    const charging = toDeviceState(guardState(signals({ battery: { level: 0.5, state: "charging", lowPowerMode: false }, powerSource: "ac" })));
    expect(charging.powerSource).toBe("charging");
    expect(charging.battery.charging).toBe(true);
  });

  it("heat: serious offers Instant, critical pauses; memory pauses on a phone", () => {
    expect(toDeviceState(guardState(signals({ thermal: "serious" }))).recommendation).toEqual({ kind: "switchToInstant", reason: "thermal", auto: false });
    expect(toDeviceState(guardState(signals({ thermal: "critical" }))).recommendation).toEqual({ kind: "pause", reason: "thermal" });
    expect(toDeviceState(guardState(signals({ memoryPressure: "critical" }))).recommendation).toEqual({ kind: "pause", reason: "memory" });
  });

  it("background pause and the charger's switch back use the additive kinds", () => {
    expect(toDeviceState(guardState(signals({ pausedInBackground: true }))).recommendation).toEqual({ kind: "paused" });
    const p = new DevicePolicy();
    p.update(signals({ battery: { level: 0.09, state: "unplugged", lowPowerMode: false } }), defaultOverride("phone"), 0);
    p.noteSwitched("fast", "instant", true);
    const plugged = signals({ battery: { level: 0.09, state: "charging", lowPowerMode: false }, powerSource: "ac", currentTier: "instant" });
    expect(toDeviceState(guardState(plugged, p)).recommendation).toEqual({ kind: "switchBack", auto: true });
  });

  it("a dismissed line shows nothing while its protections stay in `policy`", () => {
    const p = new DevicePolicy();
    const s = signals({ battery: { level: 0.5, state: "unplugged", lowPowerMode: true }, currentTier: "instant" });
    p.update(s, defaultOverride("phone"), 0);
    p.dismiss();
    const d = toDeviceState(guardState(s, p));
    expect(d.recommendation).toEqual({ kind: "none" });
    expect(d.policy?.maxTokens).toBe(512);
  });
});
