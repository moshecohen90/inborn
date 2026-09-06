#!/usr/bin/env node
/**
 * The three app builds capture.mjs drives, from a clean checkout:
 *   node design/store/build.mjs [--android] [--proof] [--ios]     (no flag = all three)
 *
 * android  dev APK (Metro, run-as, the EXPO_PUBLIC_* dev hooks)          → design/store/raw/app-dev.apk
 * proof    store build: no INTERNET permission, bundle embedded          → design/store/raw/app-proof.apk (the Proof screen only)
 * ios      dev simulator app + UI-test runner (build-for-testing)          → apps/mobile/ios/build/ss/Build/Products/{Debug-iphonesimulator/Inborndev.app,*.xctestrun}
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "../..");
const MOBILE = join(ROOT, "apps/mobile");
const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
const want = (f) => flags.length === 0 || flags.includes(`--${f}`);
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", cwd: MOBILE, ...opts, env: { ...process.env, ...(opts.env ?? {}) } });
const prebuild = (platform, dev) => run("npx", ["expo", "prebuild", "-p", platform, "--no-install"], { env: dev ? { APP_VARIANT: "development" } : { APP_VARIANT: "", INBORN_MODELS_DIR: "/nonexistent" } });

/* proof first: each prebuild wipes android/app/build, so the dev APK is built last and copied out */
if (want("proof")) {
  prebuild("android", false);
  /* gradle's bundling node process cannot see pnpm's hoisted @expo/metro-config without this */
  run("./gradlew", ["assembleRelease", "-PreactNativeArchitectures=arm64-v8a"], { cwd: join(MOBILE, "android"), env: { NODE_PATH: join(ROOT, "node_modules/.pnpm/node_modules") } });
  mkdirSync(join(__dir, "raw"), { recursive: true });
  copyFileSync(join(MOBILE, "android/app/build/outputs/apk/release/app-release.apk"), join(__dir, "raw/app-proof.apk"));
}
if (want("android")) {
  prebuild("android", true);
  run("./gradlew", ["assembleDebug", "-PreactNativeArchitectures=arm64-v8a"], { cwd: join(MOBILE, "android") });
  mkdirSync(join(__dir, "raw"), { recursive: true });
  copyFileSync(join(MOBILE, "android/app/build/outputs/apk/debug/app-debug.apk"), join(__dir, "raw/app-dev.apk"));
}
if (want("ios")) {
  prebuild("ios", true);
  run("pod", ["install"], { cwd: join(MOBILE, "ios") });
  /* the InbornUITests target carries ios-tests/ScreenshotDriverUITests.swift, the only way to tap a simulator screen here */
  run("ruby", ["scripts/ios-add-storekit-tests.rb", "ios/Inborndev.xcodeproj", "Inborndev"]);
  /* Xcode 26.2 rejects expo-modules-core's EventEmitter.swift in Swift 6 mode (README); ad-hoc signing keeps the Keychain usable */
  run("xcodebuild", ["build-for-testing", "-workspace", "Inborndev.xcworkspace", "-scheme", "Inborndev", "-configuration", "Debug", "-sdk", "iphonesimulator", "-destination", "generic/platform=iOS Simulator", "-derivedDataPath", "build/ss", "SWIFT_VERSION=5.0"], { cwd: join(MOBILE, "ios") });
}
