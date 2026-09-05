import { Platform } from "react-native";
import type { MeterSample } from "@inborn/core";
import { getUidBytes, hasTrafficCounter } from "../../modules/traffic-meter";

export type MeterKind = "counter" | "log" | "none";

/** Android: kernel per-uid counters. iOS has no per-app counter (spec §3.4 → App Privacy Report + the in-app network log). */
export function meterKind(): MeterKind {
  if (Platform.OS === "android" && hasTrafficCounter()) return "counter";
  return "log";
}

export function sample(): MeterSample | null {
  return meterKind() === "counter" ? getUidBytes() : null;
}
