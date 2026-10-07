import { Platform } from "react-native";
import type { MeterSample } from "@inborn/core";
import { getUidBytes, hasTrafficCounter } from "../../modules/traffic-meter";

export type MeterKind = "counter" | "log" | "none";

/** Android: kernel per-uid counters. iOS has no per-app counter (spec §3.4 → App Privacy Report + the in-app network log). */
export function meterKind(): MeterKind {
  if (Platform.OS === "android" && hasTrafficCounter()) return "counter";
  return "log";
}

let warned = false;

/* TrafficStats throws when system_server dies; the tick keeps its last reading instead of crashing the app (F462). */
export function sample(): MeterSample | null {
  if (meterKind() !== "counter") return null;
  try {
    return getUidBytes();
  } catch (e: unknown) {
    if (!warned) console.warn(`[meter] counter read failed: ${e instanceof Error ? e.message : String(e)}`);
    warned = true;
    return null;
  }
}
