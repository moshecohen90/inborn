import type { MemoryPressure } from "./types";

/** `os_proc_available_memory()` below this and the process itself is near its jetsam limit (§6.5 iOS row). */
export const IOS_HEADROOM_BYTES = 150 * 1048576;

export interface IosMemoryEvent {
  /** `app` = UIApplication.didReceiveMemoryWarning, this process. `system` = DispatchSource, the whole phone. */
  source: "app" | "system";
  level: MemoryPressure & ("warning" | "critical");
  /** `os_proc_available_memory()`; null where the process limit is unknown (simulator, macOS). */
  availableMemory: number | null;
}

/**
 * Whether an iOS memory event is about **this app** (§6.5 memory row), or null to ignore it.
 * `DispatchSource.makeMemoryPressureSource` reports the phone's pressure, not the process's, and a 6 GB iPhone with an
 * ordinary set of apps open reaches warning routinely — read as this app's state it dropped a model that fits and made
 * the user re-choose it on every launch (QA F43). The process's own headroom is what decides; the UIApplication
 * warning is already process-scoped and is always believed.
 */
export function memoryPressureFromIos(e: IosMemoryEvent): MemoryPressure | null {
  if (e.source === "app") return e.level;
  if (e.availableMemory === null) return null;
  return e.availableMemory <= IOS_HEADROOM_BYTES ? e.level : null;
}
