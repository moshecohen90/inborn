import { execSync } from "node:child_process";
import type { ConfigContext, ExpoConfig } from "expo/config";

/* Release Android builds must not declare INTERNET (spec §5.1, D3). Metro needs it in development only. */
const dev = process.env.APP_VARIANT === "development";

/* The proof screen shows the commit the build came from so a reader can match it against the published hash (S50). */
const commit = (() => {
  try {
    return execSync("git rev-parse --short=12 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "unknown";
  }
})();

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: dev ? "Inborn (dev)" : "Inborn",
  slug: "inborn",
  scheme: "inborn",
  version: "0.0.1",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: { bundleIdentifier: "com.inbornapp.mobile", supportsTablet: true },
  android: {
    package: "com.inbornapp.mobile",
    blockedPermissions: dev
      ? []
      : [
          "android.permission.INTERNET",
          "android.permission.SYSTEM_ALERT_WINDOW",
          "android.permission.READ_EXTERNAL_STORAGE",
          "android.permission.WRITE_EXTERNAL_STORAGE",
        ],
  },
  web: { bundler: "metro", output: "single" },
  extra: { commit, builtAt: new Date().toISOString().slice(0, 10) },
  plugins: [
    ["expo-router", { root: "./src/app" }],
    "llama.rn",
    "expo-localization",
    ["expo-local-authentication", { faceIDPermission: "Unlocks Inborn and hides your chats in the app switcher." }],
    ["expo-sqlite", { useSQLCipher: true }],
    /* Pack sources come from INBORN_MODELS_DIR at prebuild (plugins/withAssetPacks.js); the model is never committed. */
    ["./plugins/withAssetPacks", { packs: [{ name: "inborn_model", deliveryType: "fast-follow", assets: { "instant.gguf": "Qwen3.5-0.8B-Q4_K_M.gguf" } }] }],
  ],
});
