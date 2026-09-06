const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const config = getDefaultConfig(__dirname);

/* pnpm keeps one react-i18next per peer set (packages/i18n vs the app), and two instances means useTranslation() never sees initReactI18next. Resolve both from the app so there is exactly one. */
const SINGLETONS = ["react-i18next", "i18next"];
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const hit = SINGLETONS.find((m) => moduleName === m || moduleName.startsWith(`${m}/`));
  const ctx = hit ? { ...context, originModulePath: path.join(__dirname, "index.ts") } : context;
  return (upstream ?? ctx.resolveRequest)(ctx, moduleName, platform);
};

/* docs/legal/*.md are bundled as strings (metro/mdTransformer.js); the docs folder sits outside the app root, so watch it. */
config.resolver.sourceExts.push("md");
config.transformer.babelTransformerPath = require.resolve("./metro/mdTransformer.js");
config.watchFolders = [...config.watchFolders, path.resolve(__dirname, "../../docs/legal")];

module.exports = config;
