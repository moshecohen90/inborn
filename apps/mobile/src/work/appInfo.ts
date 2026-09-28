import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Application from "expo-application";
import BUILD from "./buildInfo.generated.json";

/** Version + build hash as the About screen shows them; printed on records and the architecture statement. */
export function appVersion(): string {
  return Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? "0.0.1";
}

/** The commit this bundle was built from, from `scripts/build-info.cjs` (the one source on web and native, F452). */
export const buildHash = (): string => BUILD.commit;

/** The day the bundle was built, YYYY-MM-DD. */
export const builtOn = (): string => BUILD.builtAt;

export const statementPlatform = (): "ios" | "android" | "web" => (Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web");
