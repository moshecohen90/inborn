import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as Device from "expo-device";
import { biometricKindFor, type AuthType, type BiometricKind, type LockPlatform } from "@inborn/core";

const TYPE_NAMES: Record<number, AuthType> = {
  [LocalAuthentication.AuthenticationType.FINGERPRINT]: "fingerprint",
  [LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION]: "facial",
  [LocalAuthentication.AuthenticationType.IRIS]: "iris",
};

const platform = (): LockPlatform => (Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : Platform.OS === "macos" ? "macos" : Platform.OS === "windows" ? "windows" : "web");

/** S53: the sensor the device really has, read at runtime; anything else is "a passcode". */
export async function detectBiometricKind(): Promise<BiometricKind> {
  if (Platform.OS === "web") return "passcode";
  try {
    const [hasHardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    return biometricKindFor({
      platform: platform(),
      hasHardware,
      enrolled,
      types: types.map((t) => TYPE_NAMES[t]).filter((t): t is AuthType => !!t),
      visionOS: Device.osName === "visionOS",
    });
  } catch {
    return "passcode";
  }
}

export type AuthOutcome = "success" | "failed" | "cancelled" | "unavailable";

/** One system prompt; the device passcode is the fallback inside it (disableDeviceFallback: false). */
export async function authenticate(promptMessage: string, cancelLabel: string): Promise<AuthOutcome> {
  try {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel, disableDeviceFallback: false });
    if (r.success) return "success";
    if (r.error === "user_cancel" || r.error === "system_cancel" || r.error === "app_cancel") return "cancelled";
    if (r.error === "not_enrolled" || r.error === "not_available") return "unavailable";
    return "failed";
  } catch {
    return "unavailable";
  }
}
