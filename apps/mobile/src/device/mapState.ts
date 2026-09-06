import type { GuardState } from "./guard";
import type { DeviceState, Recommendation } from "./types";

/** The shell's banner union from the policy's status (§8.8 rows); the full recommendation rides along as `policy`. */
export function toDeviceState(g: GuardState): DeviceState {
  const r = g.recommendation;
  const lowPowerMode = g.battery.lowPowerMode === true;
  const charging = g.battery.state === "charging" || g.battery.state === "full" || g.powerSource === "ac";
  let recommendation: Recommendation = { kind: "none" };
  switch (r.status) {
    case "thermalCritical":
      recommendation = { kind: "pause", reason: "thermal" };
      break;
    case "memory":
      recommendation = r.stopGeneration ? { kind: "pause", reason: "memory" } : { kind: "switchToInstant", reason: "memory", auto: false };
      break;
    case "paused":
      recommendation = { kind: "paused" };
      break;
    case "thermalSerious":
    case "throttling":
      if (r.targetTier) recommendation = { kind: "switchToInstant", reason: "thermal", auto: false };
      break;
    case "batteryCritical":
      recommendation = { kind: "answerAnyway" };
      break;
    case "lowPower":
      recommendation = { kind: "switchToInstant", reason: lowPowerMode ? "lowPower" : "battery", auto: r.recommendation === "act" };
      break;
    case "batteryLow":
      recommendation = { kind: "switchToInstant", reason: "battery", auto: false };
      break;
    case "charging":
      recommendation = { kind: "switchBack", auto: true };
      break;
    case "recovered":
      recommendation = { kind: "switchBack", auto: false };
      break;
    case "normal":
      break;
  }
  /* A dismissed line stays dismissed for its step; the protections in `policy` still apply. */
  if (r.headline === null && r.status !== "normal") recommendation = { kind: "none" };
  return {
    battery: { level: g.battery.level, lowPowerMode, charging },
    thermal: g.thermal,
    memoryPressure: g.memoryPressure,
    powerSource: g.powerSource === "ac" ? "charging" : g.powerSource,
    recommendation,
    policy: r,
  };
}
