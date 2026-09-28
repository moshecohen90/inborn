/* Markdown files become string modules so docs/legal ships inside the bundle (no fetch, no network). */
const { createHash } = require("node:crypto");
const upstream = require("@expo/metro-config/babel-transformer");

/* The web inlines the public app config into expo-constants at transform time and Metro's key leaves it out, so a
   bundle carried another build's config (F452). The per-commit stamp is not in it (scripts/build-info.cjs). */
function configKey(projectRoot) {
  try {
    const { getConfig } = require("expo/config");
    const { exp } = getConfig(projectRoot, { isPublicConfig: true, skipSDKVersionRequirement: true });
    return createHash("sha256").update(JSON.stringify(exp)).digest("hex");
  } catch {
    return "";
  }
}

module.exports = {
  ...upstream,
  getCacheKey(options) {
    return `${upstream.getCacheKey(options)}:${configKey(options?.projectRoot ?? require("node:path").join(__dirname, ".."))}`;
  },
  transform(args) {
    if (args.filename.endsWith(".md")) return upstream.transform({ ...args, src: `export default ${JSON.stringify(args.src)};` });
    return upstream.transform(args);
  },
};
