const { withGradleProperties } = require("expo/config-plugins");

/**
 * Sets `android.minSdkVersion` in gradle.properties, which Expo's android/build.gradle reads for every module.
 * @param {import("expo/config").ExpoConfig} config
 * @param {{ minSdkVersion: number }} props
 */
function withMinSdk(config, { minSdkVersion }) {
  return withGradleProperties(config, (config) => {
    const key = "android.minSdkVersion";
    const item = { type: "property", key, value: String(minSdkVersion) };
    const i = config.modResults.findIndex((p) => p.type === "property" && p.key === key);
    if (i >= 0) config.modResults[i] = item;
    else config.modResults.push(item);
    return config;
  });
}

module.exports = withMinSdk;
