const { withAppBuildGradle } = require("expo/config-plugins");

/**
 * Signs `release` with the Play upload key when INBORN_UPLOAD_KEYSTORE is set in the Gradle process environment
 * (INBORN_UPLOAD_KEY_ALIAS, INBORN_UPLOAD_STORE_PASSWORD, INBORN_UPLOAD_KEY_PASSWORD alongside it; see
 * scripts/play-signing-env.sh), and keeps the Expo default (debug keystore) otherwise. The decision is made at build
 * time, not prebuild time, so one prebuilt project serves local bundletool runs and Play uploads alike.
 * The keystore lives outside the repo (~/.inborn/keys) and is never read here.
 *
 * @param {import("expo/config").ExpoConfig} config
 */
function withUploadSigning(config) {
  return withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;
    if (contents.includes("INBORN_UPLOAD_KEYSTORE")) return config;
    contents = contents.replace(
      /( {4}signingConfigs \{\n {8}debug \{\n(?:.*\n)*? {8}\}\n)/,
      `$1        release {
            def uploadKeystore = System.getenv("INBORN_UPLOAD_KEYSTORE")
            if (uploadKeystore) {
                storeFile file(uploadKeystore)
                storePassword System.getenv("INBORN_UPLOAD_STORE_PASSWORD")
                keyAlias System.getenv("INBORN_UPLOAD_KEY_ALIAS") ?: "inborn-upload"
                keyPassword System.getenv("INBORN_UPLOAD_KEY_PASSWORD")
            }
        }
`,
    );
    if (!contents.includes("uploadKeystore")) {
      throw new Error("withUploadSigning: could not find the Expo signingConfigs block in app/build.gradle");
    }
    // Appended after the whole DSL: the Expo template assigns release.signingConfig = signingConfigs.debug twice inside buildTypes.
    contents += `
// plugins/withUploadSigning.js: Play upload key when INBORN_UPLOAD_KEYSTORE is set, debug keystore otherwise.
if (System.getenv("INBORN_UPLOAD_KEYSTORE")) {
    android.buildTypes.release.signingConfig = android.signingConfigs.release
}
`;
    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withUploadSigning;
