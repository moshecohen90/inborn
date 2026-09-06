const fs = require("fs");
const path = require("path");
const { IOSConfig, withXcodeProject } = require("expo/config-plugins");

/**
 * iOS ships the Instant model inside the app (decision D2): at prebuild each model is copied from INBORN_MODELS_DIR
 * (default `<repo>/.models`, gitignored) into `ios/<app>/Models/<id>.gguf` and added to Copy Bundle Resources, so it
 * lands at `<App>.app/<id>.gguf`. Nothing is committed; a missing source file is skipped with a warning and the vault
 * falls back to download / import. Plain resources are not touched by App Thinning and the bundle is never backed up.
 *
 * @param {import("expo/config").ExpoConfig} config
 * @param {{ models: Record<string, string> }} props  catalog model id → GGUF file name in INBORN_MODELS_DIR
 */
function withBundledModel(config, { models }) {
  return withXcodeProject(config, (config) => {
    const { projectRoot, platformProjectRoot, projectName } = config.modRequest;
    const modelsDir = process.env.INBORN_MODELS_DIR || path.join(projectRoot, "..", "..", ".models");
    const destDir = path.join(platformProjectRoot, projectName, "Models");
    for (const [id, file] of Object.entries(models)) {
      const source = path.join(modelsDir, file);
      const resource = `${id}.gguf`;
      const dest = path.join(destDir, resource);
      if (!fs.existsSync(source)) {
        console.warn(`withBundledModel: skipping ${resource} (missing ${source}; set INBORN_MODELS_DIR)`);
        fs.rmSync(dest, { force: true });
        continue;
      }
      fs.mkdirSync(destDir, { recursive: true });
      if (!sameFile(source, dest)) {
        fs.copyFileSync(source, dest);
        const st = fs.statSync(source);
        fs.utimesSync(dest, st.atime, st.mtime);
      }
      const filepath = path.join(projectName, "Models", resource);
      if (!config.modResults.hasFile(filepath)) {
        IOSConfig.XcodeUtils.addResourceFileToGroup({ filepath, groupName: projectName, project: config.modResults, isBuildFile: true, verbose: true });
      }
      console.log(`withBundledModel: ${resource} ← ${source} (${(fs.statSync(source).size / 1e6).toFixed(0)} MB)`);
    }
    return config;
  });
}

/* A 500 MB copy per prebuild is avoidable: same size and mtime means the previous prebuild already copied it. */
function sameFile(a, b) {
  if (!fs.existsSync(b)) return false;
  const sa = fs.statSync(a);
  const sb = fs.statSync(b);
  return sa.size === sb.size && Math.abs(sa.mtimeMs - sb.mtimeMs) < 1000;
}

module.exports = withBundledModel;
