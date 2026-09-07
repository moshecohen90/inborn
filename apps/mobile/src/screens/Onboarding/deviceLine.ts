import { Platform } from "react-native";
import * as Device from "expo-device";
import { belowFloor, chipForModelId, ramLabel } from "@inborn/core";
import { chipName, ramBytes } from "../../vault/device";

export interface DeviceLine {
  chip: string;
  ram: string | null;
  slow: boolean;
}

/** "RUNS ON: A17 Pro · 8 GB" (S01). Android names the SoC from `Build.SOC_MODEL` or the model code; the model name is the last resort. */
export function deviceLine(): DeviceLine {
  const bytes = ramBytes();
  const ram = ramLabel(bytes);
  const slow = belowFloor(bytes);
  if (Platform.OS === "ios") return { chip: chipForModelId(Device.modelId) ?? Device.modelName ?? "Apple silicon", ram, slow };
  if (Platform.OS === "android") return { chip: chipName() ?? Device.modelName ?? Device.manufacturer ?? "this phone", ram, slow };
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency : undefined;
  return { chip: cores ? `${cores} cores` : "this browser", ram, slow };
}
