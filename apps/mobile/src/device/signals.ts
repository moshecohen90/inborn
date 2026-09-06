import { Dimensions, Platform } from "react-native";
import * as Battery from "expo-battery";
import { thermalFromAndroid, type AndroidThermalContext, type BatterySignal, type BatteryState, type GuardDeviceClass, type MemoryPressure, type PowerSource, type ThermalState } from "@inborn/core";
import { AndroidTrim, DeviceGuard, isAndroidSnapshot, type AndroidSnapshot, type Snapshot } from "../../modules/device-guard";

/** Raw device signals before the policy: every field falls back to "unknown" where the platform has no API (§6.5 signal table). */
export interface RawSignals {
  battery: BatterySignal;
  thermal: ThermalState;
  memoryPressure: MemoryPressure;
  powerSource: PowerSource;
  deviceClass: GuardDeviceClass;
  ramGB: number | null;
  baseThreads: number;
}

type Listener = (patch: Partial<RawSignals>) => void;
type Nav = Navigator & { deviceMemory?: number; hardwareConcurrency?: number };

const web = Platform.OS === "web";
const tauri = web && typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Memory pressure is an edge, not a level: after a warning the guard polls until the device looks healthy again for this long. */
export const MEMORY_RECOVERY_MS = 30_000;

const batteryState = (s: Battery.BatteryState): BatteryState =>
  s === Battery.BatteryState.CHARGING ? "charging" : s === Battery.BatteryState.FULL ? "full" : s === Battery.BatteryState.UNPLUGGED ? "unplugged" : "unknown";

/* A status below SEVERE seen this run proves the sensor moves; until then SEVERE+ needs a hot battery or headroom to be believed. */
let seenCool = false;

function androidThermal(status: number, snap?: AndroidSnapshot | null): ThermalState {
  const s = snap ?? (snapshot() as AndroidSnapshot | null);
  if (status >= 0 && status < 3) seenCool = true;
  const ctx: AndroidThermalContext = { headroom: s?.thermalHeadroom ?? null, batteryTempC: s?.batteryTempC ?? null, seenCool };
  return thermalFromAndroid(status, ctx);
}

export const thermalFromIos = (state: number): ThermalState => (["nominal", "fair", "serious", "critical"] as const)[state] ?? "unknown";

/** onTrimMemory levels that mean pressure now; UI_HIDDEN / BACKGROUND / RUNNING_MODERATE are bookkeeping, not danger. */
export function pressureFromTrim(level: number): MemoryPressure | null {
  if (level === AndroidTrim.RUNNING_LOW || level === AndroidTrim.MODERATE) return "warning";
  if (level === AndroidTrim.RUNNING_CRITICAL || level === AndroidTrim.COMPLETE) return "critical";
  return null;
}

function classFromSnapshot(s: Snapshot | null): GuardDeviceClass {
  if (web) return tauri ? "desktop" : "browser";
  const { width, height } = Dimensions.get("window");
  const tablet = s?.isTablet ?? (Platform.OS === "ios" ? Platform.isPad : Math.min(width, height) >= 600);
  return tablet ? "tablet" : "phone";
}

function ramFromSnapshot(s: Snapshot | null): number | null {
  if (s) return Math.round(((isAndroidSnapshot(s) ? s.totalMem : s.physicalMemory) / 2 ** 30) * 10) / 10;
  const mem = (globalThis.navigator as Nav | undefined)?.deviceMemory;
  return typeof mem === "number" ? mem : null;
}

function baseThreads(): number {
  const cores = (globalThis.navigator as Nav | undefined)?.hardwareConcurrency;
  /* Phones: llama.rn picks its own default; 4 is what the guard halves and decrements from. Web mirrors wllama's default. */
  return web && cores ? Math.max(1, Math.floor(cores / 2)) : 4;
}

/** Whether a snapshot says memory is fine again (jetsam threshold on Android, 150 MB of process headroom on iOS; unknown counts as fine). */
export function memoryHealthy(s: Snapshot): boolean {
  return isAndroidSnapshot(s) ? !s.lowMemory : s.availableMemory === null || s.availableMemory > 150 * 1048576;
}

export function snapshot(): Snapshot | null {
  try {
    return DeviceGuard?.getSnapshot() ?? null;
  } catch {
    return null;
  }
}

/** One read of everything at boot. */
export async function readSignals(): Promise<RawSignals> {
  const snap = snapshot();
  const out: RawSignals = {
    battery: { level: null, state: "unknown", lowPowerMode: null },
    thermal: "unknown",
    memoryPressure: snap ? (memoryHealthy(snap) ? "normal" : "warning") : "unknown",
    powerSource: "unknown",
    deviceClass: classFromSnapshot(snap),
    ramGB: ramFromSnapshot(snap),
    baseThreads: baseThreads(),
  };
  if (snap) {
    if (isAndroidSnapshot(snap)) {
      out.thermal = androidThermal(snap.thermalStatus, snap);
      out.battery.lowPowerMode = snap.powerSaveMode;
      out.powerSource = snap.plugged ? "ac" : "battery";
    } else {
      out.thermal = thermalFromIos(snap.thermalState);
      out.battery.lowPowerMode = snap.lowPowerMode;
    }
  }
  try {
    if (await Battery.isAvailableAsync()) {
      const p = await Battery.getPowerStateAsync();
      out.battery.level = p.batteryLevel >= 0 ? p.batteryLevel : null;
      out.battery.state = batteryState(p.batteryState);
      out.battery.lowPowerMode ??= p.lowPowerMode;
      if (out.powerSource === "unknown") out.powerSource = out.battery.state === "unplugged" ? "battery" : out.battery.state === "unknown" ? "unknown" : "ac";
    }
  } catch {
    /* no battery API (desktop browsers other than Chrome): the browser row proposes nothing */
  }
  return out;
}

/** Subscribes to every live source; the callback gets partial patches. Returns the unsubscribe. */
type BatteryManagerLike = EventTarget & { level: number; charging: boolean };
type BatteryNavigator = Navigator & { getBattery?: () => Promise<BatteryManagerLike> };

/** Subscribes to every live source; the callback gets partial patches. Returns the unsubscribe. */
export function subscribeSignals(onPatch: Listener): () => void {
  const subs: { remove(): void }[] = [];
  const add = (f: () => { remove(): void }): boolean => {
    try {
      subs.push(f());
      return true;
    } catch {
      return false;
    }
  };
  const level = add(() => Battery.addBatteryLevelListener(({ batteryLevel }) => onPatch({ battery: { ...current.battery, level: batteryLevel >= 0 ? batteryLevel : null } })));
  add(() =>
    Battery.addBatteryStateListener(({ batteryState: s }) => {
      const state = batteryState(s);
      const source: PowerSource = state === "unplugged" ? "battery" : state === "unknown" ? "unknown" : "ac";
      onPatch({ battery: { ...current.battery, state }, powerSource: source });
    }),
  );
  add(() => Battery.addLowPowerModeListener(({ lowPowerMode }) => onPatch({ battery: { ...current.battery, lowPowerMode } })));
  /* expo-battery reads the Battery Status API on the web but has no listeners there; Chrome's events fill the gap (§6.5 browser row). */
  if (web && !level) {
    let removed = false;
    void (globalThis.navigator as BatteryNavigator | undefined)?.getBattery?.().then((b) => {
      const onLevel = () => onPatch({ battery: { ...current.battery, level: b.level } });
      const onCharging = () => onPatch({ battery: { ...current.battery, state: b.charging ? "charging" : "unplugged" }, powerSource: b.charging ? "ac" : "battery" });
      if (removed) return;
      b.addEventListener("levelchange", onLevel);
      b.addEventListener("chargingchange", onCharging);
      subs.push({
        remove() {
          b.removeEventListener("levelchange", onLevel);
          b.removeEventListener("chargingchange", onCharging);
        },
      });
    }, () => undefined);
    subs.push({ remove: () => void (removed = true) });
  }
  const dg = DeviceGuard;
  if (dg) {
    add(() =>
      dg.addListener("thermal", (e) => {
        if (e.thermalStatus !== undefined) onPatch({ thermal: androidThermal(e.thermalStatus) });
        else if (e.thermalState !== undefined) onPatch({ thermal: thermalFromIos(e.thermalState) });
      }),
    );
    add(() =>
      dg.addListener("memory", (e) => {
        const level = e.trimLevel !== undefined ? pressureFromTrim(e.trimLevel) : (e.level ?? null);
        if (level) onPatch({ memoryPressure: level });
      }),
    );
    add(() =>
      dg.addListener("power", (s) => {
        if (isAndroidSnapshot(s)) onPatch({ battery: { ...current.battery, lowPowerMode: s.powerSaveMode }, powerSource: s.plugged ? "ac" : "battery", thermal: androidThermal(s.thermalStatus, s) });
        else onPatch({ battery: { ...current.battery, lowPowerMode: s.lowPowerMode }, thermal: thermalFromIos(s.thermalState) });
      }),
    );
  }
  return () => subs.forEach((s) => s.remove());
}

/* Listeners patch one field; the guard keeps the merged copy here so battery patches keep the other battery fields. */
let current: RawSignals = {
  battery: { level: null, state: "unknown", lowPowerMode: null },
  thermal: "unknown",
  memoryPressure: "unknown",
  powerSource: "unknown",
  deviceClass: "phone",
  ramGB: null,
  baseThreads: 4,
};

export const setCurrentSignals = (s: RawSignals): void => void (current = s);
