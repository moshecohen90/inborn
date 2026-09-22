import { HEADLINE_KEYS } from "@inborn/core";
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
      /* Phone: "Ran out of memory · Switched to Instant · Switch back" once Instant took over (or is queued for the next message); no Instant installed → the answer just stopped. */
      if (r.headline === HEADLINE_KEYS.memorySwitched) recommendation = { kind: "switchToInstant", reason: "memory", auto: true };
      else recommendation = r.stopGeneration ? { kind: "pause", reason: "memory" } : { kind: "switchToInstant", reason: "memory", auto: false };
      break;
    case "memoryBack":
      /* The boot-time RAM floor and a real eviction leave the same standing line; only the first is not an out-of-memory event. */
      recommendation = { kind: "switchToInstant", reason: r.headline === HEADLINE_KEYS.fitSwitched ? "fit" : "memory", auto: true };
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
