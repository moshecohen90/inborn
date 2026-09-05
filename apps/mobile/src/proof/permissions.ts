import { Platform } from "react-native";

export interface PermissionRow {
  key: "internet" | "microphone" | "camera" | "biometrics" | "network";
  state: "none" | "off" | "granted" | "n/a";
}

/** What the proof screen lists (S50). Microphone/camera arrive with M5 and stay "off" until asked. */
export function permissionRows(): PermissionRow[] {
  if (Platform.OS === "android") {
    return [
      { key: "internet", state: __DEV__ ? "granted" : "none" },
      { key: "microphone", state: "off" },
      { key: "camera", state: "off" },
    ];
  }
  if (Platform.OS === "ios") {
    return [
      { key: "network", state: "none" },
      { key: "microphone", state: "off" },
      { key: "camera", state: "off" },
      { key: "biometrics", state: "off" },
    ];
  }
  return [{ key: "network", state: "none" }];
}
