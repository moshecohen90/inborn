/** What the shell consumes from the device-guard stream (spec §6.5, §8.8). The stub in useDeviceState.ts is replaced there. */
export type ThermalState = "nominal" | "fair" | "serious" | "critical";
export type MemoryPressure = "normal" | "warning" | "critical";
export type PowerSource = "battery" | "charging" | "unknown";

export interface BatteryState {
  /** 0..1, or null when the platform does not report it (web, desktop). */
  level: number | null;
  lowPowerMode: boolean;
}

export type Recommendation =
  | { kind: "none" }
  /** Offer a smaller model; `auto` = the switch already happened (first time gets the explainer sheet). */
  | { kind: "switchToInstant"; reason: "battery" | "thermal" | "memory" | "lowPower"; auto: boolean }
  /** Generation is paused until the device cools. */
  | { kind: "pause"; reason: "thermal" | "memory" }
  | { kind: "storageFull"; freeBytes: number };

export interface DeviceState {
  battery: BatteryState;
  thermal: ThermalState;
  memoryPressure: MemoryPressure;
  powerSource: PowerSource;
  recommendation: Recommendation;
}

export const idleDeviceState: DeviceState = {
  battery: { level: null, lowPowerMode: false },
  thermal: "nominal",
  memoryPressure: "normal",
  powerSource: "unknown",
  recommendation: { kind: "none" },
};
