import { Platform } from "react-native";
import * as Device from "expo-device";
import { belowFloor, chipForModelId, ramLabel } from "@inborn/core";

export interface DeviceLine {
  chip: string;
  ram: string | null;
  slow: boolean;
}

/** "RUNS ON: A17 Pro · 8 GB" (S01). Android has no public chip name, so the phone's model name stands in. */
export function deviceLine(): DeviceLine {
  const ram = ramLabel(Device.totalMemory);
  const slow = belowFloor(Device.totalMemory);
  if (Platform.OS === "ios") return { chip: chipForModelId(Device.modelId) ?? Device.modelName ?? "Apple silicon", ram, slow };
  if (Platform.OS === "android") return { chip: Device.modelName ?? Device.manufacturer ?? "this phone", ram, slow };
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency : undefined;
  return { chip: cores ? `${cores} cores` : "this browser", ram, slow };
}
