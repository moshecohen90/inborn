import { Platform } from "react-native";
import * as Device from "expo-device";
import { Paths } from "expo-file-system";
import { androidChipName, chipClassFor, marketingRamGB, type ChipClass, type DeviceClass, type DeviceProfile } from "@inborn/core";
import { socModel, totalMemoryBytes } from "../../modules/vault-native";
import { DEV_RAM_GB, devBuild } from "./devFlags";

export interface DeviceInfo extends DeviceProfile {
  chip: ChipClass;
  os: "ios" | "android" | "web" | "macos" | "windows";
}

/** The one RAM reading every screen shares (onboarding S01, vault S30): physical bytes, or the dev override, or null on the web. */
export function ramBytes(): number | null {
  const override = devBuild() ? DEV_RAM_GB : NaN;
  if (Number.isFinite(override) && override > 0) return override * 1024 ** 3;
  return totalMemoryBytes();
}

/** Marketing SoC name on Android (Build.SOC_MODEL or the model code); null elsewhere or when unknown. */
export const chipName = (): string | null => (Platform.OS === "android" ? androidChipName(socModel(), Device.modelName) : null);

const os = (): DeviceInfo["os"] => (Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web");

function deviceClass(): DeviceClass {
  if (Platform.OS === "ios") return Platform.isPad ? "tablet" : "phone";
  if (Platform.OS === "android") return "phone";
  return "desktop";
}

/** Reads once per launch; RAM is the only number §6.3 needs. `EXPO_PUBLIC_DEV_RAM_GB` fakes a device class in dev builds. */
export function readDevice(pro = false): DeviceInfo {
  const bytes = ramBytes();
  const ramGB = bytes ? marketingRamGB(bytes) : 8;
  const cls = deviceClass();
  const platform = os();
  return { ramGB, deviceClass: cls, pro, os: platform, chip: chipClassFor({ os: platform, ramGB, appleSilicon: platform === "macos", chipName: chipName() }) };
}

export function freeDiskBytes(): number {
  try {
    return Paths.availableDiskSpace;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}
