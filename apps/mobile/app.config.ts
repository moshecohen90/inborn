import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ConfigContext, ExpoConfig } from "expo/config";
import PICK_TYPES from "./src/documents/pickTypes.json";

/* Release Android builds must not declare INTERNET (spec §5.1, D3). Metro needs it in development only. */
const dev = process.env.APP_VARIANT === "development";

/**
 * The store-bundle gate (QA F257, security review S5). Metro inlines every `EXPO_PUBLIC_*` at bundle time, so one
 * left over in the building shell ships inside a store bundle — `EXPO_PUBLIC_ALLOW_TEST_PURCHASES` would make it
 * accept Apple sandbox and `android.test.*` transactions. `scripts/check-store-env.sh` has said so since round 9 and
 * nothing ever called it; this file is the one every build path evaluates (prebuild, export, gradle, Xcode), and it
 * reads that script's own list so there is one list and two gates.
 */
const DEV_SWITCHES = readFileSync(path.join(__dirname, "../../scripts/dev-switches.txt"), "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));
if (!dev) {
  const leaked = DEV_SWITCHES.filter((v) => process.env[v]);
  if (leaked.length) throw new Error(`store build refused: dev switch set in the environment: ${leaked.join(", ")} — unset it or build with APP_VARIANT=development (scripts/check-store-env.sh)`);
}

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
/* Share target (spec §7.7): text and the document types the app imports arrive through ACTION_SEND; "Ask Inborn" (PROCESS_TEXT) lives in modules/share-target. No permission is involved. */
const shareIntentFilters = [
  { action: "SEND", category: ["DEFAULT"], data: [{ mimeType: "text/plain" }] },
  { action: "SEND", category: ["DEFAULT"], data: PICK_TYPES.map((mimeType) => ({ mimeType })) },
];
/* iOS share sheet (S43): expo-share-intent's extension hands the item to the app through the App Group. INBORN_IOS_SHARE_EXT=0 skips the
   extension target for builds signed with the wildcard development profile only (the App ID needs the App Groups capability). */
const iosShareExtension = process.env.INBORN_IOS_SHARE_EXT !== "0";
/* Usage strings for the microphone, speech recognition, camera and photos (spec §11); one file per UI language, English in Info.plist itself. */
/* Under an "ios" key so Expo never copies them into Android string resources (lintVital rejects untranslated extras). */
const USAGE = (JSON.parse(readFileSync(path.join(__dirname, "locales/en.json"), "utf8")) as { ios: Record<string, string> }).ios;
const LOCALES = Object.fromEntries(["de", "es", "fr", "ja", "pt-BR", "ko", "zh-Hant"].map((l) => [l, `./locales/${l}.json`]));

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
    buildNumber: "16",
    supportsTablet: true,
    /* The floor §6.3, the release checklist and the privacy policy all declare; Expo's Podfile template would leave 16.4. */
    deploymentTarget: "17.0",
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
      ...USAGE,
      CFBundleLocalizations: ["en", "de", "es", "fr", "ja", "pt-BR", "ko", "zh-Hant"],
    },
  },
  locales: LOCALES,
  android: {
    package: "com.inbornapp.mobile",
    /* Play rejects a versionCode it has already seen, so each upload bumps it via INBORN_VERSION_CODE (scripts/play-upload.mjs --next-version-code prints the next free one). */
    versionCode: Number(process.env.INBORN_VERSION_CODE) || 1,
    adaptiveIcon: {
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
      backgroundColor: "#0D1115",
    },
    intentFilters: [ggufIntentFilter, ...shareIntentFilters],
    /* Chats, keys and models never leave the device through Google's backup either (spec §10.6 #42). */
    allowBackup: false,
    /* The release manifest is exactly the allowlist in scripts/check-android-permissions.sh; everything a library adds beyond it is removed here (docs/legal/app-privacy-details.md §4.2). */
    blockedPermissions: dev
      ? []
      : [
          "android.permission.INTERNET",
          "android.permission.SYSTEM_ALERT_WINDOW",
          "android.permission.READ_EXTERNAL_STORAGE",
          "android.permission.WRITE_EXTERNAL_STORAGE",
          /* expo-network: only ConnectivityManager is read (proof screen S03); Wi-Fi details are Play's business. */
          "android.permission.ACCESS_WIFI_STATE",
          /* androidx.work (Play asset-delivery transitive): extraction runs through JobScheduler on API 26+, no boot receiver, no wake lock of its own. */
          "android.permission.RECEIVE_BOOT_COMPLETED",
          "android.permission.WAKE_LOCK",
          /* installreferrer (Play Billing transitive): attribution is telemetry. */
          "com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE",
          /* Pre-API 28 alias of USE_BIOMETRIC. */
          "android.permission.USE_FINGERPRINT",
        ],
  },
  web: { bundler: "metro", output: "single", favicon: "./assets/favicon.png" },
  /* `devVariant` is decided here, at config time, and baked into the bundle: a store build cannot be given it by an
     environment variable later, and an APP_VARIANT that flips it also declares INTERNET, which the Android permission
     gate refuses. It is what lets the licence verifier accept sandbox proofs in a QA build and never in a store one. */
  extra: { commit, builtAt: new Date().toISOString().slice(0, 10), devVariant: dev },
  plugins: [
    ["expo-router", { root: "./src/app" }],
    "llama.rn",
    ...(iosShareExtension
      ? [
          [
            "expo-share-intent",
            {
              disableAndroid: true,
              iosShareExtensionName: "Ask Inborn",
              iosActivationRules: { NSExtensionActivationSupportsText: true, NSExtensionActivationSupportsWebURLWithMaxCount: 1, NSExtensionActivationSupportsFileWithMaxCount: 1, NSExtensionActivationSupportsImageWithMaxCount: 1 },
            },
          ] as [string, Record<string, unknown>],
        ]
      : []),
    /* StoreKit 2 + Play Billing (spec §12.4). Purchases are verified in @inborn/core; the plugin only links the native billing SDKs. */
    "expo-iap",
    /* Dev builds only: puts storekit/Inborn.storekit into the Xcode project + a UI test target that drives StoreKit Testing (ios-tests/). */
    "./plugins/withStoreKitTesting",
    "expo-localization",
    ["expo-local-authentication", { faceIDPermission: "Unlocks Inborn and hides your chats in the app switcher." }],
    /* Dictation (spec §7.4): RECORD_AUDIO + the on-device recogniser's package visibility; the flag that forbids the network is set at start(). */
    ["expo-speech-recognition", { microphonePermission: USAGE.NSMicrophoneUsageDescription, speechRecognitionPermission: USAGE.NSSpeechRecognitionUsageDescription, androidSpeechServicePackages: ["com.google.android.as", "com.google.android.tts"] }],
    /* Image input (spec §7.1): photos are downscaled + EXIF-stripped on the device. (`microphonePermission: false` would strip RECORD_AUDIO from the whole app.) */
    ["expo-image-picker", { photosPermission: USAGE.NSPhotoLibraryUsageDescription, cameraPermission: USAGE.NSCameraUsageDescription }],
    ["expo-sqlite", { useSQLCipher: true }],
    /* iOS ships Instant inside the app (D2): copied from INBORN_MODELS_DIR at prebuild into the bundle as `<id>.gguf`, never committed (plugins/withBundledModel.js). */
    ["./plugins/withBundledModel", { models: { instant: "Qwen3.5-0.8B-Q4_K_M.gguf" } }],
    /* Pack sources come from INBORN_MODELS_DIR at prebuild (plugins/withAssetPacks.js); models are never committed. Asset names must equal the catalog `file` names: the vault looks the delivered pack up by them. */
    ["./plugins/withAssetPacks", { packs: selectedPacks() }],
    /* Release signing with the Play upload key when INBORN_UPLOAD_KEYSTORE is set at build time; debug keystore otherwise. */
    "./plugins/withUploadSigning",
    /* Spec floor is Android 8.0 (docs/qa/release-checklist.md T30). */
    ["./plugins/withMinSdk", { minSdkVersion: 26 }],
    /* The stored theme decides the night mode before the first paint; the dark ground is the FARADAY bg token (packages/ui tokens.ts). */
    ["./plugins/withStoredNightMode", { darkBackground: "#0A0D11" }],
    /* A hardware keyboard's TAB must be able to leave a list (QA F27); React Native's own scroll-view focus search cannot. */
    "./plugins/withScrollFocusEscape",
    /* Expo pins ios.deploymentTarget on the app target only; this carries it to the project level too (§6.3, gap #18). */
    "./plugins/withProjectDeploymentTarget",
  ],
});

/* Tier keys match the catalog (§5.1); INBORN_PACKS="instant,fast" ships a subset (Play internal testing), unset = all. Pack names and asset names must match the catalog's play-asset-pack deliveries. */
const ALL_PACKS = {
  instant: [{ name: "inborn_model", deliveryType: "fast-follow", assets: { "Qwen3.5-0.8B-Q4_K_M.gguf": "Qwen3.5-0.8B-Q4_K_M.gguf" } }],
  fast: [{ name: "inborn_model_fast", deliveryType: "on-demand", assets: { "Qwen3.5-2B-Q4_K_M.gguf": "Qwen3.5-2B-Q4_K_M.gguf" } }],
  /* Document index companion (spec §6.2): Play delivers it too, so the app still opens no socket. */
  embed: [{ name: "inborn_model_embed", deliveryType: "on-demand", assets: { "nomic-embed-text-v1.5.f16.gguf": "nomic-embed-text-v1.5.f16.gguf" } }],
  /* Voice (whisper base) and vision (Qwen3.5 projector) companions, same rule. */
  speech: [{ name: "inborn_model_speech", deliveryType: "on-demand", assets: { "ggml-base.bin": "ggml-base.bin" } }],
  vision: [{ name: "inborn_model_vision", deliveryType: "on-demand", assets: { "mmproj-Qwen3.5-0.8B-F16.gguf": "mmproj-Qwen3.5-0.8B-F16.gguf" } }],
  /* Play caps one pack at 1.5 GB, so each llama-gguf-split shard is its own pack; the vault links them into one directory (src/vault/playDelivery.ts). */
  sharp: [
    { name: "inborn_model_sharp", deliveryType: "on-demand", assets: { "Qwen3.5-4B-Q4_K_M-00001-of-00002.gguf": "Qwen3.5-4B-Q4_K_M-00001-of-00002.gguf" } },
    { name: "inborn_model_sharp_2", deliveryType: "on-demand", assets: { "Qwen3.5-4B-Q4_K_M-00002-of-00002.gguf": "Qwen3.5-4B-Q4_K_M-00002-of-00002.gguf" } },
  ],
} as const;

function selectedPacks() {
  const raw = process.env.INBORN_PACKS?.trim();
  if (!raw) return Object.values(ALL_PACKS).flat();
  return raw.split(",").flatMap((k: string) => {
    const packs = ALL_PACKS[k.trim() as keyof typeof ALL_PACKS];
    if (!packs) throw new Error(`INBORN_PACKS: unknown pack "${k}" (known: ${Object.keys(ALL_PACKS).join(", ")})`);
    return packs;
  });
}
