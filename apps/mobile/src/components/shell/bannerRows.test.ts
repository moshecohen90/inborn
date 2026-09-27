import { describe, expect, it, vi } from "vitest";
import { DevicePolicy, defaultOverride, type DeviceSignals, type ModelTier } from "@inborn/core";
import { toDeviceState } from "../../device/mapState";
import type { GuardState } from "../../device/guard";
import type { DeviceState } from "../../device/types";
import { bannerRows, type BannerActions } from "./bannerRows";

/* F420: "Slowing down to keep the phone cool · SWITCH TO INSTANT" was offered with Instant already the active model. */

const t = (key: string) => key;
const noop = () => undefined;

/** The guard's path end to end: the real §6.5 policy, the shell's mapping, then the strip's rows. */
function hotPhone(currentTier: ModelTier, availableTiers: ModelTier[]): DeviceState {
  const s: DeviceSignals = {
    battery: { level: 0.8, state: "charging", lowPowerMode: false },
    thermal: "serious",
    memoryPressure: "normal",
    powerSource: "ac",
    deviceClass: "phone",
    ramGB: 6,
    currentTier,
    generating: false,
    backgroundedForMs: null,
    throttling: false,
    baseThreads: 4,
    availableTiers,
  };
  const override = defaultOverride("phone");
  const recommendation = new DevicePolicy().update(s, override, 0);
  const g = { battery: s.battery, thermal: s.thermal, memoryPressure: s.memoryPressure, powerSource: s.powerSource, recommendation, deviceClass: "phone", ramGB: 6, override, engine: "loaded", explain: null };
  return toDeviceState(g as unknown as GuardState);
}

function thermalRow(device: DeviceState, act: Partial<BannerActions> = {}) {
  const actions: BannerActions = { dismissRepair: noop, manageStorage: noop, switchToInstant: noop, switchBack: noop, continueGeneration: noop, continuePaused: noop, ...act };
  return bannerRows({ device, storageFull: false, repair: null, pausedHere: false, delivery: null }, actions, t).find((r) => r.key === "thermal");
}

describe("the thermal line offers a smaller model only when there is one (F420)", () => {
  it("Instant active, nothing smaller installed (pass 20 on the iPhone): the line stays, with no action", () => {
    const row = thermalRow(hotPhone("instant", ["instant"]));
    expect(row?.text).toBe("state.thermalSerious");
    expect(row?.action).toBeUndefined();
  });

  it("Instant active with a bigger model installed beside it: still nothing smaller, no action", () => {
    expect(thermalRow(hotPhone("instant", ["instant", "sharp"]))?.action).toBeUndefined();
  });

  it("Fast active and Instant installed: Switch to Instant, wired to the guard's switch", () => {
    const switchToInstant = vi.fn();
    const row = thermalRow(hotPhone("fast", ["instant", "fast"]), { switchToInstant });
    expect(row?.action?.label).toBe("state.switchToInstant");
    row?.action?.onPress();
    expect(switchToInstant).toHaveBeenCalledOnce();
  });

  it("Fast active before Instant was delivered: no action to a model that is not there", () => {
    const row = thermalRow(hotPhone("fast", ["fast"]));
    expect(row?.text).toBe("state.thermalSerious");
    expect(row?.action).toBeUndefined();
  });
});
