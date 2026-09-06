/**
 * Expo config plugin: at iOS prebuild, copies storekit/Inborn.storekit (StoreKit Testing configuration, spec §12.4)
 * and the XCUITest sources in ios-tests/ into the generated ios/ directory. The Xcode project surgery (UI test target
 * that owns the .storekit resource, scheme reference) is done by scripts/ios-add-storekit-tests.rb, which
 * scripts/ios-storekit-proof.sh runs right after prebuild. Nothing here ships in the app binary.
 */
const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const STOREKIT = "Inborn.storekit";
const TESTS_DIR = "InbornUITests";

function withStoreKitTesting(config) {
  return withDangerousMod(config, [
    "ios",
    (cfg) => {
      const root = cfg.modRequest.projectRoot;
      const ios = cfg.modRequest.platformProjectRoot;
      const storekit = path.join(root, "storekit", STOREKIT);
      if (fs.existsSync(storekit)) fs.copyFileSync(storekit, path.join(ios, STOREKIT));
      const tests = path.join(root, "ios-tests");
      if (fs.existsSync(tests)) {
        const dest = path.join(ios, TESTS_DIR);
        fs.mkdirSync(dest, { recursive: true });
        for (const f of fs.readdirSync(tests)) if (f.endsWith(".swift")) fs.copyFileSync(path.join(tests, f), path.join(dest, f));
      }
      return cfg;
    },
  ]);
}

module.exports = withStoreKitTesting;
