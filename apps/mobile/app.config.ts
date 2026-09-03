import type { ConfigContext, ExpoConfig } from "expo/config";

/* Release Android builds must not declare INTERNET (spec §5.1, D3). Metro needs it in development only. */
const dev = process.env.APP_VARIANT === "development";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: dev ? "Autark (dev)" : "Autark",
  slug: "autark",
  scheme: "autark",
  version: "0.0.1",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: { bundleIdentifier: "app.autark.mobile", supportsTablet: true },
  android: {
    package: "app.autark.mobile",
    blockedPermissions: dev ? [] : ["android.permission.INTERNET"],
  },
  web: { bundler: "metro", output: "single" },
  plugins: [
    "expo-localization",
    ["expo-local-authentication", { faceIDPermission: "Unlocks Autark and hides your chats in the app switcher." }],
    ["expo-sqlite", { useSQLCipher: true }],
  ],
});
