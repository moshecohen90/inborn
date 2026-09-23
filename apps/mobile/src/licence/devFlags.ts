import Constants from "expo-constants";
import { allowsTestPurchases, isDevBuild, type BuildFacts } from "./buildKind";

/**
 * Bundle-time switches for purchase proofs on simulators/emulators. Store builds never set them, so release bundles
 * trust only Apple's production root and Play's real signature (spec §12.4, §10.7 #51).
 *
 * Which build this is comes from `extra.devVariant`, baked by `app.config.ts`, never from an environment variable a
 * release shell could be carrying (QA F257): `Constants.expoConfig` missing at all reads as "not a dev variant".
 */
const FACTS: BuildFacts = {
  devBundle: __DEV__,
  devVariant: (Constants.expoConfig?.extra as { devVariant?: boolean } | undefined)?.devVariant === true,
  devModelHost: process.env.EXPO_PUBLIC_DEV_MODEL_HOST !== undefined,
  testPurchaseFlag: process.env.EXPO_PUBLIC_ALLOW_TEST_PURCHASES === "1",
};

export const devBuild = (): boolean => isDevBuild(FACTS);
/** Sandbox / Xcode StoreKit transactions and `android.test.*` SKUs verify only in a dev bundle or the QA variant. */
export const ALLOW_TEST_PURCHASES: boolean = allowsTestPurchases(FACTS);
/** Play licence public key (base64 SPKI) at bundle time until it is pasted into roots.ts. */
export const PLAY_LICENCE_KEY: string = process.env.EXPO_PUBLIC_PLAY_LICENCE_KEY ?? "";
/** Launch day as ISO date for the 30-day launch price (§12.1); unset = launch SKU hidden. */
export const LAUNCH_AT: number | null = process.env.EXPO_PUBLIC_LAUNCH_AT ? Date.parse(process.env.EXPO_PUBLIC_LAUNCH_AT) : null;
/** Headless proofs: the paywall taps "Unlock Pro" by itself after the store answers, then writes licence-run.json. Dev bundles only. */
export const DEV_AUTOBUY: string | undefined = process.env.EXPO_PUBLIC_AUTOBUY || undefined;
/** Simulates "no store" (airplane mode) on a simulator: every store call rejects, so the sealed cache is the only source. Dev bundles only. */
export const DEV_STORE_OFFLINE: boolean = process.env.EXPO_PUBLIC_STORE_OFFLINE === "1";
export const DEV_RESULT_FILE = "licence-run.json";
/** Dev bundles may pretend to own Pro (`EXPO_PUBLIC_PRO=1`) or Work (`EXPO_PUBLIC_TIER=work` / `EXPO_PUBLIC_PRO=work`); release bundles only trust the licence. */
export const DEV_TIER: "pro" | "work" | null = !__DEV__ ? null : process.env.EXPO_PUBLIC_TIER === "work" || process.env.EXPO_PUBLIC_PRO === "work" ? "work" : process.env.EXPO_PUBLIC_PRO === "1" || process.env.EXPO_PUBLIC_TIER === "pro" ? "pro" : null;
