import type { Recommendation as PolicyRecommendation } from "@inborn/core";

/** What the shell consumes from the device guard (spec §6.5, §8.8). Field names are the shell's; the guard stream extends them additively. */
export type ThermalState = "nominal" | "fair" | "serious" | "critical" | "unknown";
export type MemoryPressure = "normal" | "warning" | "critical" | "unknown";
export type PowerSource = "battery" | "charging" | "unknown";

export interface BatteryState {
  /** 0..1, or null when the platform does not report it (web, desktop). */
  level: number | null;
  lowPowerMode: boolean;
  /** Plugged in (charging or full); undefined until the guard has read the battery. */
  charging?: boolean;
}

export type Recommendation =
  | { kind: "none" }
  /** Offer a smaller model; `auto` = the switch already happened (first time gets the explainer sheet). */
  | { kind: "switchToInstant"; reason: "battery" | "thermal" | "memory" | "lowPower" | "fit"; auto: boolean }
  /** Generation is paused until the device cools. */
  | { kind: "pause"; reason: "thermal" | "memory" }
  | { kind: "storageFull"; freeBytes: number }
  /** The charger brought the previous model back (`auto`), or the battery recovered above 30 % and a return is offered (§6.5). */
  | { kind: "switchBack"; auto: boolean }
  /** An answer was cut at the 15 s background grace; "Continue" resumes it (§6.5, §10.3). */
  | { kind: "paused" }
  /** Below 5 %: ask before a long answer (§6.5). */
  | { kind: "answerAnyway" };

export interface DeviceState {
  battery: BatteryState;
  thermal: ThermalState;
  memoryPressure: MemoryPressure;
  powerSource: PowerSource;
  recommendation: Recommendation;
  /** The full §6.5 recommendation (headline key + params, button, caps) while the guard runs; absent in previews. */
  policy?: PolicyRecommendation;
}

export const idleDeviceState: DeviceState = {
  battery: { level: null, lowPowerMode: false },
  thermal: "nominal",
  memoryPressure: "normal",
  powerSource: "unknown",
  recommendation: { kind: "none" },
};
