const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const config = getDefaultConfig(__dirname);

/* pnpm keeps one react-i18next per peer set (packages/i18n vs the app), and two instances means useTranslation() never sees initReactI18next. Resolve both from the app so there is exactly one. */
const SINGLETONS = ["react-i18next", "i18next"];
/* The QA bridge (src/qa) is a build-time feature, like the desktop's `--features qa`: without EXPO_PUBLIC_QA=1 the
   entry file resolves to a stub, so metro never walks into the interpreter and no release bundle can contain it.
   A dead `if` would not do — metro records a dependency whether or not the branch can run. */
const QA_BRIDGE = path.join(__dirname, "src", "qa", "Bridge.tsx");
const QA_BRIDGE_STUB = path.join(__dirname, "src", "qa", "Bridge.stub.tsx");
const qaEnabled = process.env.EXPO_PUBLIC_QA === "1";
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const hit = SINGLETONS.find((m) => moduleName === m || moduleName.startsWith(`${m}/`));
  const ctx = hit ? { ...context, originModulePath: path.join(__dirname, "index.ts") } : context;
  const resolved = (upstream ?? ctx.resolveRequest)(ctx, moduleName, platform);
  if (!qaEnabled && resolved && resolved.type === "sourceFile" && resolved.filePath === QA_BRIDGE) return { type: "sourceFile", filePath: QA_BRIDGE_STUB };
  return resolved;
};

/* docs/legal/*.md are bundled as strings (metro/mdTransformer.js); the docs folder sits outside the app root, so watch it. */
config.resolver.sourceExts.push("md");
config.transformer.babelTransformerPath = require.resolve("./metro/mdTransformer.js");
config.watchFolders = [...config.watchFolders, path.resolve(__dirname, "../../docs/legal")];

module.exports = config;
