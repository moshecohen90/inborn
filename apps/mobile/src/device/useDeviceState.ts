import { useMemo, useSyncExternalStore } from "react";
import type { UserOverride } from "@inborn/core";
import { getDeviceGuard, type GuardState } from "./guard";
import { getEngineState, subscribeEngineState, type EngineState } from "../engine";

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

/** Merged device signals + the policy's recommendation (spec §6.5), debounced; null until the first read completes. */
export function useDeviceState(): (GuardState & DeviceActions) | null {
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
