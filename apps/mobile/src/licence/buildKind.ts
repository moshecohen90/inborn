/**
 * What a bundle is allowed to do, decided from constants baked at build time (QA F255, security review S5).
 *
 * The old rule read a loose environment variable: `ALLOW_TEST_PURCHASES = EXPO_PUBLIC_ALLOW_TEST_PURCHASES === "1"
 * || __DEV__`, and `devBuild() = __DEV__ || EXPO_PUBLIC_DEV_MODEL_HOST !== undefined`. Metro inlines every
 * `EXPO_PUBLIC_*` at bundle time, so one left over in the building shell shipped a store bundle that accepts Apple
 * sandbox and `android.test.*` transactions — a free licence for anyone who can produce a sandbox proof.
 *
 * `devVariant` is the difference: `app.config.ts` decides it from `APP_VARIANT` while the config is evaluated, and a
 * store build cannot be handed it afterwards. An `APP_VARIANT=development` that flips it also declares the INTERNET
 * permission, which `scripts/check-android-permissions.sh` refuses on a release manifest — so it cannot pass quietly.
 */
export interface BuildFacts {
  /** Metro's `__DEV__`: a development bundle. */
  devBundle: boolean;
  /** `extra.devVariant` from the embedded manifest: this build declared itself the development variant. */
  devVariant: boolean;
  /** `EXPO_PUBLIC_DEV_MODEL_HOST` was set when the bundle was built. */
  devModelHost: boolean;
  /** `EXPO_PUBLIC_ALLOW_TEST_PURCHASES === "1"` when the bundle was built. */
  testPurchaseFlag: boolean;
}

/** Dev hooks (auto-install, auto-buy, the HTTPS model host, the RAM override) run in a dev bundle or a QA variant. */
export const isDevBuild = (f: BuildFacts): boolean => f.devBundle || (f.devVariant && f.devModelHost);

/**
 * Whether the licence verifier may trust a sandbox or `android.test.*` proof.
 *
 * A store bundle never may, whatever its environment said: `devVariant` is false in it and no variable can change
 * that after the build. The QA purchases harness (a Release device build with `APP_VARIANT=development` and the
 * switch set, `docs/qa/purchases-run-2026-09-11.md`) still may.
 */
export const allowsTestPurchases = (f: BuildFacts): boolean => f.devBundle || (f.devVariant && f.testPurchaseFlag);
