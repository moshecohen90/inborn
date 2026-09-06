import { execSync } from "node:child_process";
import type { ConfigContext, ExpoConfig } from "expo/config";

/* Release Android builds must not declare INTERNET (spec §5.1, D3). Metro needs it in development only. */
const dev = process.env.APP_VARIANT === "development";

/* Inborn is the handler for .gguf so a browser download opens straight in the vault (spec §7.2, §5.4). */
const GGUF_UTI = "app.inborn.gguf";
const ggufIntentFilter = {
  action: "VIEW",
  category: ["DEFAULT", "BROWSABLE"],
  data: [
    { scheme: "content", mimeType: "application/octet-stream", pathPattern: ".*\\.gguf" },
    { scheme: "file", mimeType: "application/octet-stream", pathPattern: ".*\\.gguf" },
    { scheme: "content", mimeType: "*/*", pathPattern: ".*\\.gguf" },
    { scheme: "file", mimeType: "*/*", pathPattern: ".*\\.gguf" },
  ],
};
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
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  /* All icon files come from design/icon/build.mjs (spec §9.8); edit the SVG master there, never these PNGs. */
  icon: "./assets/icon.png",
  ios: {
    bundleIdentifier: "com.inbornapp.mobile",
    buildNumber: "2",
    supportsTablet: true,
    /* Icon Composer bundle: Xcode 26 renders Liquid Glass + the iOS 18 light/dark/tinted fallbacks from its layers. */
    icon: "../../design/icon/Inborn.icon",
    infoPlist: {
      CFBundleDocumentTypes: [{ CFBundleTypeName: "GGUF model", LSHandlerRank: "Owner", LSItemContentTypes: [GGUF_UTI], CFBundleTypeRole: "Viewer" }],
      UTExportedTypeDeclarations: [
        { UTTypeIdentifier: GGUF_UTI, UTTypeDescription: "GGUF model", UTTypeConformsTo: ["public.data"], UTTypeTagSpecification: { "public.filename-extension": ["gguf"], "public.mime-type": ["application/octet-stream"] } },
      ],
      /* The file is copied into the vault, never edited in place. */
      LSSupportsOpeningDocumentsInPlace: false,
      /* Only HTTPS via the OS for the model download: exempt, so TestFlight never blocks on export compliance. */
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: "com.inbornapp.mobile",
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
      backgroundColor: "#0D1115",
    },
    intentFilters: [ggufIntentFilter],
    blockedPermissions: dev
      ? []
      : [
          "android.permission.INTERNET",
          "android.permission.SYSTEM_ALERT_WINDOW",
          "android.permission.READ_EXTERNAL_STORAGE",
          "android.permission.WRITE_EXTERNAL_STORAGE",
        ],
  },
  web: { bundler: "metro", output: "single", favicon: "./assets/favicon.png" },
  extra: { commit, builtAt: new Date().toISOString().slice(0, 10) },
  plugins: [
    ["expo-router", { root: "./src/app" }],
    "llama.rn",
    /* StoreKit 2 + Play Billing (spec §12.4). Purchases are verified in @inborn/core; the plugin only links the native billing SDKs. */
    "expo-iap",
    /* Dev builds only: puts storekit/Inborn.storekit into the Xcode project + a UI test target that drives StoreKit Testing (ios-tests/). */
    "./plugins/withStoreKitTesting",
    "expo-localization",
    ["expo-local-authentication", { faceIDPermission: "Unlocks Inborn and hides your chats in the app switcher." }],
    ["expo-sqlite", { useSQLCipher: true }],
    /* iOS ships Instant inside the app (D2): copied from INBORN_MODELS_DIR at prebuild into the bundle as `<id>.gguf`, never committed (plugins/withBundledModel.js). */
    ["./plugins/withBundledModel", { models: { instant: "Qwen3.5-0.8B-Q4_K_M.gguf" } }],
    /* Pack sources come from INBORN_MODELS_DIR at prebuild (plugins/withAssetPacks.js); models are never committed. Asset names must equal the catalog `file` names: the vault looks the delivered pack up by them. */
    [
      "./plugins/withAssetPacks",
      {
        packs: [
          { name: "inborn_model", deliveryType: "fast-follow", assets: { "Qwen3.5-0.8B-Q4_K_M.gguf": "Qwen3.5-0.8B-Q4_K_M.gguf" } },
          { name: "inborn_model_fast", deliveryType: "on-demand", assets: { "Qwen3.5-2B-Q4_K_M.gguf": "Qwen3.5-2B-Q4_K_M.gguf" } },
          /* Document index companion (spec §6.2): Play delivers it too, so the app still opens no socket. */
          { name: "inborn_model_embed", deliveryType: "on-demand", assets: { "nomic-embed-text-v1.5.f16.gguf": "nomic-embed-text-v1.5.f16.gguf" } },
          /* Split with llama-gguf-split (Play caps a pack at 1.5 GB); llama.cpp opens the first shard and finds the second beside it. */
          {
            name: "inborn_model_sharp",
            deliveryType: "on-demand",
            assets: { "Qwen3.5-4B-Q4_K_M-00001-of-00002.gguf": "Qwen3.5-4B-Q4_K_M-00001-of-00002.gguf", "Qwen3.5-4B-Q4_K_M-00002-of-00002.gguf": "Qwen3.5-4B-Q4_K_M-00002-of-00002.gguf" },
          },
        ],
      },
    ],
  ],
});
