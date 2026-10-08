export interface PermissionRow {
  key: "internet" | "microphone" | "camera" | "biometrics" | "network";
  /** "none" is Android's missing INTERNET permission; iOS and a browser have no such permission to leave out. */
  state: "none" | "ios" | "web" | "off" | "granted" | "n/a";
}

/** What the proof screen lists (S50). Microphone/camera arrive with M5 and stay "off" until asked. */
export function permissionRows(os: string, dev: boolean): PermissionRow[] {
  if (os === "android") {
    return [
      { key: "internet", state: dev ? "granted" : "none" },
      { key: "microphone", state: "off" },
      { key: "camera", state: "off" },
    ];
  }
  if (os === "ios") {
    return [
      { key: "network", state: "ios" },
      { key: "microphone", state: "off" },
      { key: "camera", state: "off" },
      { key: "biometrics", state: "off" },
    ];
  }
  return [{ key: "network", state: "web" }];
}
