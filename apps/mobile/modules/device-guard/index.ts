import { requireOptionalNativeModule, type NativeModule } from "expo";

/** android.content.ComponentCallbacks2 TRIM_MEMORY_* */
export const AndroidTrim = { RUNNING_MODERATE: 5, RUNNING_LOW: 10, RUNNING_CRITICAL: 15, UI_HIDDEN: 20, BACKGROUND: 40, MODERATE: 60, COMPLETE: 80 } as const;

export interface AndroidSnapshot {
  thermalStatus: number;
  thermalHeadroom: number | null;
  availMem: number;
  totalMem: number;
  threshold: number;
  lowMemory: boolean;
  powerSaveMode: boolean;
  /** BatteryManager.EXTRA_PLUGGED: 0 unplugged, 1 AC, 2 USB, 4 wireless, 8 dock */
  plugged: number;
  /** ACTION_BATTERY_CHANGED temperature in °C, null when the device does not report it. */
  batteryTempC: number | null;
  isTablet: boolean;
  sdk: number;
  model: string;
}

export interface IosSnapshot {
  /** ProcessInfo.ThermalState: 0 nominal, 1 fair, 2 serious, 3 critical */
  thermalState: number;
  lowPowerMode: boolean;
  /** os_proc_available_memory(); null where the process limit is unknown (simulator, macOS). */
  availableMemory: number | null;
  physicalMemory: number;
  isTablet: boolean;
  model: string;
  system: string;
}

export type Snapshot = AndroidSnapshot | IosSnapshot;

export type DeviceGuardEvents = {
  thermal(e: { thermalStatus?: number; thermalState?: number }): void;
  memory(e: { trimLevel?: number; source?: "app" | "system"; level?: "warning" | "critical"; availableMemory?: number | null }): void;
  power(e: Snapshot): void;
};

declare class DeviceGuardNative extends NativeModule<DeviceGuardEvents> {
  getSnapshot(): Snapshot;
  getThermalHeadroom(seconds: number): number | null;
}

/** Null on the web and wherever the native part is not built; callers fall back to "unknown" (spec §6.5 browser row). */
export const DeviceGuard = requireOptionalNativeModule<DeviceGuardNative>("DeviceGuard");

export const isAndroidSnapshot = (s: Snapshot): s is AndroidSnapshot => "thermalStatus" in s;
