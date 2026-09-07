import type { ThermalState } from "./types";

/** android.os.PowerManager THERMAL_STATUS_* */
export const AndroidThermal = { NONE: 0, LIGHT: 1, MODERATE: 2, SEVERE: 3, CRITICAL: 4, EMERGENCY: 5, SHUTDOWN: 6 } as const;

export interface AndroidThermalContext {
  /** PowerManager.getThermalHeadroom(10): 1.0 = severe throttling; null where the device does not report it. */
  headroom: number | null;
  /** Battery temperature in °C (ACTION_BATTERY_CHANGED), null when unknown. */
  batteryTempC: number | null;
  /** True once a status below SEVERE was observed this run: a stuck sensor never cools. */
  seenCool: boolean;
}

/**
 * THERMAL_STATUS_* → the iOS names the policy speaks (§6.5: LIGHT–MODERATE = fair, SEVERE = serious, CRITICAL+ = critical).
 * SEVERE and above are trusted only when plausible: the OnePlus 6T (Android 11) reports SHUTDOWN from a battery-percentage
 * sensor at 100 % charge while skin and battery are at 31 °C / 24 °C; without this check the app would never answer there.
 */
export function thermalFromAndroid(status: number, ctx?: AndroidThermalContext): ThermalState {
  if (status < 0) return "unknown";
  if (status === AndroidThermal.NONE) return "nominal";
  if (status <= AndroidThermal.MODERATE) return "fair";
  const critical = status >= AndroidThermal.CRITICAL;
  if (!ctx) return critical ? "critical" : "serious";
  const headroomHot = ctx.headroom !== null && ctx.headroom >= (critical ? 1 : 0.85);
  const batteryHot = ctx.batteryTempC !== null && ctx.batteryTempC >= (critical ? 40 : 37);
  /* A sensor that once moved is trusted for "serious"; "critical" stops the answer and drops the weights, so a battery reading of 24 °C still vetoes it (the 6T flips to SHUTDOWN mid-answer). */
  const batteryCool = ctx.batteryTempC !== null && !batteryHot;
  if (ctx.seenCool) return critical && !batteryCool && (headroomHot || batteryHot) ? "critical" : "serious";
  if (critical && batteryCool) return headroomHot ? "serious" : "unknown";
  return headroomHot || batteryHot ? (critical ? "critical" : "serious") : "unknown";
}
