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

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: dev ? "Inborn (dev)" : "Inborn",
  slug: "inborn",
  scheme: "inborn",
  version: "0.0.1",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: "com.inbornapp.mobile",
    supportsTablet: true,
    infoPlist: {
      CFBundleDocumentTypes: [{ CFBundleTypeName: "GGUF model", LSHandlerRank: "Owner", LSItemContentTypes: [GGUF_UTI], CFBundleTypeRole: "Viewer" }],
      UTExportedTypeDeclarations: [
        { UTTypeIdentifier: GGUF_UTI, UTTypeDescription: "GGUF model", UTTypeConformsTo: ["public.data"], UTTypeTagSpecification: { "public.filename-extension": ["gguf"], "public.mime-type": ["application/octet-stream"] } },
      ],
      /* The file is copied into the vault, never edited in place. */
      LSSupportsOpeningDocumentsInPlace: false,
    },
  },
  android: {
    package: "com.inbornapp.mobile",
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
  web: { bundler: "metro", output: "single" },
  plugins: [
    "llama.rn",
    "expo-localization",
    ["expo-local-authentication", { faceIDPermission: "Unlocks Inborn and hides your chats in the app switcher." }],
    ["expo-sqlite", { useSQLCipher: true }],
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
