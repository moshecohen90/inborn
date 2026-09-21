const { withMainApplication } = require("expo/config-plugins");

const IMPORTS = [
  "import com.facebook.react.internal.featureflags.ReactNativeFeatureFlags",
  "import com.facebook.react.internal.featureflags.ReactNativeNewArchitectureFeatureFlagsDefaults",
  "",
].join("\n");

const OVERRIDE = `    /* F27: ReactScrollView.focusSearch discards any next focus that is not a child of the scroll view and substitutes
       one of its own descendants, so a hardware keyboard's TAB can never leave a list. Measured on the OnePlus 6T:
       the empty chat's suggestion chips keep focus for ever and the composer is unreachable. The app's long lists
       set removeClippedSubviews=false (fixes round 14), so the clipped-element search this flag adds finds nothing
       anyway. loadReactNative() has already installed the stable overrides by this point, hence the forced form;
       the provider below is that same set (ReactNativeFeatureFlagsOverrides_RNOSS_Stable_Android is this class
       with nothing added, and is final) plus this one flag. */
    ReactNativeFeatureFlags.dangerouslyForceOverride(
      object : ReactNativeNewArchitectureFeatureFlagsDefaults() {
        override fun enableCustomFocusSearchOnClippedElementsAndroid(): Boolean = false
      }
    )
`;

/**
 * Restores Android's own focus search inside every React Native scroll view (spec §11 keyboard access).
 * @param {import("expo/config").ExpoConfig} config
 */
function withScrollFocusEscape(config) {
  return withMainApplication(config, (config) => {
    const src = config.modResults.contents;
    if (src.includes("enableCustomFocusSearchOnClippedElementsAndroid")) return config;
    let out = src.replace("import com.facebook.react.PackageList\n", `import com.facebook.react.PackageList\n${IMPORTS}`);
    out = out.replace("    loadReactNative(this)\n", `    loadReactNative(this)\n${OVERRIDE}`);
    if (!out.includes("enableCustomFocusSearchOnClippedElementsAndroid")) throw new Error("withScrollFocusEscape: MainApplication.kt has an unexpected shape");
    config.modResults.contents = out;
    return config;
  });
}

module.exports = withScrollFocusEscape;
