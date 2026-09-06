import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Application from "expo-application";

/** Version + build hash as the About screen shows them; printed on records and the architecture statement. */
export function appVersion(): string {
  return Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? "0.0.1";
}

export function buildHash(): string | undefined {
  const extra = (Constants.expoConfig?.extra ?? {}) as { commit?: string };
  return extra.commit;
}

export const statementPlatform = (): "ios" | "android" | "web" => (Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web");
