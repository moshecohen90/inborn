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

module.exports = config;
