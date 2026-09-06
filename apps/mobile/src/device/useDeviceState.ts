import { useMemo, useSyncExternalStore } from "react";
import type { UserOverride } from "@inborn/core";
import { getDeviceGuard, type GuardState } from "./guard";
import { toDeviceState } from "./mapState";
import { getEngineState, subscribeEngineState, type EngineState } from "../engine";
import { idleDeviceState, type DeviceState } from "./types";

export interface DeviceActions {
  /** Press the status-line button (Switch / Switch back / Keep / Continue / Answer anyway). */
  accept: () => void;
  /** Close the line without acting; the protections stay, the line comes back on the next step. */
  dismiss: () => void;
  /** The explainer sheet was shown. */
  ackExplain: () => void;
  /** S52 › Performance. */
  setOverride: (patch: Partial<UserOverride>) => void;
}

/* Dev builds preview the §8.8 banners from Settings; passing idleDeviceState hands the screen back to the guard. */
let preview: DeviceState | null = null;
const previewListeners = new Set<() => void>();

export function setDeviceStateForPreview(next: DeviceState): void {
  preview = next === idleDeviceState ? null : next;
  for (const l of previewListeners) l();
}

const subscribe = (l: () => void): (() => void) => {
  previewListeners.add(l);
  const off = getDeviceGuard().subscribe(l);
  return () => {
    previewListeners.delete(l);
    off();
  };
};

let lastGuard: GuardState | null = null;
let lastMapped: DeviceState = idleDeviceState;
const snapshot = (): DeviceState => {
  if (preview) return preview;
  const g = getDeviceGuard().getState();
  if (!g) return idleDeviceState;
  if (g !== lastGuard) {
    lastGuard = g;
    lastMapped = toDeviceState(g);
  }
  return lastMapped;
};

/** The shell's view (spec §8.8): merged signals + the banner recommendation, idle until the guard's first read. */
export function useDeviceState(): DeviceState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** The guard's full state (§6.5 recommendation, override, engine residency) with its actions; null until the first read. */
export function useDeviceGuardState(): (GuardState & DeviceActions) | null {
  const guard = getDeviceGuard();
  const state = useSyncExternalStore(guard.subscribe, guard.getState, guard.getState);
  return useMemo(
    () => (state ? { ...state, accept: guard.accept, dismiss: guard.dismiss, ackExplain: guard.ackExplain, setOverride: guard.setOverride } : null),
    [state, guard],
  );
}

/** Whether the weights are resident: the seal shows "loading" after an idle unload while they come back (§5.7). */
export function useEngineState(): EngineState {
  return useSyncExternalStore(subscribeEngineState, getEngineState, getEngineState);
}
