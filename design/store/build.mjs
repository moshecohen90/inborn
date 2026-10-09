#!/usr/bin/env node
/**
 * The three app builds capture.mjs drives, from a clean checkout (models in INBORN_MODELS_DIR, default <repo>/.models):
 *   node design/store/build.mjs [--android] [--proof] [--ios]     (no flag = all three)
 *
 * proof    Android store build: no INTERNET permission, no QA bridge, bundle embedded  → design/store/raw/app-proof.apk (the Proof screen only)
 * android  Android QA variant (com.inbornapp.mobile.qa), release AAB with the Instant, photo and index packs, QA bridge on
 *          → design/store/raw/app-qa.aab; capture.mjs installs it with bundletool --local-testing, so the vault sees Play
 *          Asset Delivery the way a Play install does (a plain sideloaded APK shows "Google Play is not available here")
 * ios      iOS QA variant for the simulator, Release, Instant bundled                   → apps/mobile/ios/build/qa-sim/Build/Products/Release-iphonesimulator/Inborndev.app
 *
 * No Metro: every build carries its JS bundle, so the store copy is what the screenshots show (no dev overlay, no LogBox).
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, symlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "../..");
const MOBILE = join(ROOT, "apps/mobile");
const MODELS = process.env.INBORN_MODELS_DIR || join(ROOT, ".models");
const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
const want = (f) => flags.length === 0 || flags.includes(`--${f}`);
const pnpm = ["pnpm@10.34.5"];
const run = (cmd, args, env = {}, cwd = MOBILE) => execFileSync(cmd, args, { stdio: "inherit", cwd, env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0", CI: "1", EXPO_NO_TELEMETRY: "1", ...env } });
const prebuild = (platform, env) => run("corepack", [...pnpm, "exec", "expo", "prebuild", "-p", platform, "--no-install", "--clean"], env);

/* The QA switches every build of the variant carries: the bridge and the dev-prompt file door (attach). DEV_RAM_GB is the
   RAM of the device class the capture shows (a simulator would report the Mac's): Pixel 6 8 GB, iPhone 17 Pro Max and
   iPad Pro 13" 12 GB. */
const QA_ENV = { APP_VARIANT: "development", EXPO_PUBLIC_QA: "1", EXPO_PUBLIC_AUTOPROMPT: "file" };

/* The proof APK needs the OCR language files at build time (doc-extract's verifyOcrAssets) but no model packs, so it
   gets a models dir that holds only ocr/. */
function ocrOnlyModels() {
  const dir = join(tmpdir(), "inborn-store-ocr-models");
  mkdirSync(dir, { recursive: true });
  if (!existsSync(join(dir, "ocr"))) symlinkSync(join(MODELS, "ocr"), join(dir, "ocr"));
  return dir;
}
/* gradle's bundling node process cannot see pnpm's hoisted @expo/metro-config without this */
const GRADLE_ENV = { NODE_PATH: join(ROOT, "node_modules/.pnpm/node_modules") };
const assemble = (env) => run("./gradlew", ["assembleRelease", "-PreactNativeArchitectures=arm64-v8a"], { ...GRADLE_ENV, ...env }, join(MOBILE, "android"));
const RELEASE_APK = join(MOBILE, "android/app/build/outputs/apk/release/app-release.apk");
mkdirSync(join(__dir, "raw"), { recursive: true });

/* proof first: each prebuild --clean wipes android/, so the QA APK is built last and copied out */
if (want("proof")) {
  const env = { APP_VARIANT: "", INBORN_MODELS_DIR: ocrOnlyModels() };
  prebuild("android", env);
  assemble(env);
  copyFileSync(RELEASE_APK, join(__dir, "raw/app-proof.apk"));
}
if (want("android")) {
  /* the packs the screens use (Instant + its photo pack arrive with the install, Fast, its photo pack and the index on request); the others still list their Play delivery */
  const env = { ...QA_ENV, EXPO_PUBLIC_DEV_RAM_GB: "8", INBORN_MODELS_DIR: MODELS, INBORN_PACKS: "instant,fast,sharp,vision,visionFast,embed" };
  prebuild("android", env);
  /* signReleaseBundle fails on a bundle past 2 GB; bundletool signs the APKs it builds from the unsigned one anyway */
  run("./gradlew", [":app:packageReleaseBundle", "-PreactNativeArchitectures=arm64-v8a"], { ...GRADLE_ENV, ...env }, join(MOBILE, "android"));
  const inter = join(MOBILE, "android/app/build/intermediates/intermediary_bundle/release");
  copyFileSync(join(inter, readdirSync(inter)[0], "intermediary-bundle.aab"), join(__dir, "raw/app-qa.aab"));
}
if (want("ios")) {
  const env = { ...QA_ENV, EXPO_PUBLIC_DEV_RAM_GB: "12", INBORN_IOS_SHARE_EXT: "0", INBORN_MODELS_DIR: MODELS };
  prebuild("ios", env);
  run("pod", ["install"], env, join(MOBILE, "ios"));
  run("xcodebuild", ["-workspace", "ios/Inborndev.xcworkspace", "-scheme", "Inborndev", "-configuration", "Release", "-sdk", "iphonesimulator", "-destination", "generic/platform=iOS Simulator", "-derivedDataPath", "ios/build/qa-sim", "ARCHS=arm64", "ONLY_ACTIVE_ARCH=YES", "build"], env);
}
