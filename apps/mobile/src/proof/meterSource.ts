import type { MeterSample } from "@inborn/core";

export type MeterKind = "counter" | "log" | "none";

/** Web: the browser's resource timing is the record of what this tab fetched; we never send a request body, so OUT stays 0. */
export function meterKind(): MeterKind {
  return typeof performance !== "undefined" && typeof performance.getEntriesByType === "function" ? "log" : "none";
}

export function sample(): MeterSample | null {
  if (meterKind() !== "log") return null;
  let rx = 0;
  for (const e of performance.getEntriesByType("resource") as PerformanceResourceTiming[]) rx += e.transferSize || 0;
  return { tx: 0, rx };
}
