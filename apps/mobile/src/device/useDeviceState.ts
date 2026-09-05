import { useSyncExternalStore } from "react";
import { idleDeviceState, type DeviceState } from "./types";

/* Stub until the device-guard stream lands: always nominal, plus a setter so the §8.8 banners can be previewed in dev builds. */
let current: DeviceState = idleDeviceState;
const listeners = new Set<() => void>();

export function setDeviceStateForPreview(next: DeviceState): void {
  current = next;
  for (const l of listeners) l();
}

export function useDeviceState(): DeviceState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}
