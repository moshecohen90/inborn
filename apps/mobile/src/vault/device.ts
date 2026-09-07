import { Platform } from "react-native";
import { Paths } from "expo-file-system";
import * as Device from "expo-device";
import { androidChipName, chipClassFor, type ChipClass, type DeviceClass, type DeviceProfile } from "@inborn/core";
import { socModel, totalMemoryBytes } from "../../modules/vault-native";
import { DEV_RAM_GB, devBuild } from "./devFlags";

export interface DeviceInfo extends DeviceProfile {
  chip: ChipClass;
  os: "ios" | "android" | "web" | "macos" | "windows";
}

/* Phones report a little under their marketing size (5.6 GB on a "6 GB" phone); §6.3 speaks in marketing sizes. */
export function marketingRamGB(bytes: number): number {
  const gb = bytes / 1024 ** 3;
  const steps = [2, 3, 4, 6, 8, 12, 16, 24, 32, 64, 128];
  return steps.find((s) => gb <= s + 0.05) ?? Math.round(gb);
}

const os = (): DeviceInfo["os"] => (Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web");

function deviceClass(): DeviceClass {
  if (Platform.OS === "ios") return Platform.isPad ? "tablet" : "phone";
  if (Platform.OS === "android") return "phone";
  return "desktop";
}

/** Reads once per launch; RAM is the only number §6.3 needs. `EXPO_PUBLIC_DEV_RAM_GB` fakes a device class in dev builds. */
export function readDevice(pro = false): DeviceInfo {
  const bytes = totalMemoryBytes();
  const override = devBuild() ? DEV_RAM_GB : NaN;
  const ramGB = Number.isFinite(override) && override > 0 ? override : bytes ? marketingRamGB(bytes) : 8;
  const cls = deviceClass();
  const platform = os();
  return { ramGB, deviceClass: cls, pro, os: platform, chip: chipClassFor({ os: platform, ramGB, appleSilicon: platform === "macos", chipName: platform === "android" ? androidChipName(socModel(), Device.modelName) : null }) };
}

export function freeDiskBytes(): number {
  try {
    return Paths.availableDiskSpace;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}
