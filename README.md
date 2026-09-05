# Inborn

Private, offline, on-device AI chat. One codebase: iOS + Android + web (Expo) and Windows + macOS (Tauri v2).
Spec and demo: `docs/inborn-spec.html`, `docs/inborn-demo.html` (Hebrew, RTL).

## Layout
- `apps/mobile` — Expo app (iOS, Android, web). `App.tsx` boots i18n and a single Chat screen streaming from the engine.
- `apps/desktop` — Tauri v2 shell (stub until Rust ≥ 1.77 is installed; see its README).
- `packages/core` — pure TypeScript, no network: the `LocalLM` interface (spec §5.2), `NullLM` for tests/dev, catalog types.
- `packages/i18n` — i18next + ICU; `locales/en.json` is the single source. Adding a language = one JSON file.
- `packages/ui` — FARADAY tokens (dark + light, default follows the device) and a Tailwind/NativeWind preset.
- `scripts/check-android-permissions.sh` — release gate: fails if the Android build declares INTERNET.

## Run
```
corepack pnpm install
corepack pnpm typecheck && corepack pnpm test && corepack pnpm lint
cd apps/mobile && APP_VARIANT=development npx expo start      # dev needs INTERNET for Metro; release blocks it
npx expo export -p web                                        # web build (also what the desktop shell loads)
```

## Run on a phone (M1 dev path)
Android + iOS use llama.rn when a GGUF named `instant.gguf` sits in the app's document directory; otherwise the
in-memory engine streams. Nothing downloads: put the file there yourself (models live in `.models/`, gitignored).
```
cd apps/mobile && APP_VARIANT=development npx expo prebuild -p android --no-install
cd android && ./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a       # first run installs NDK 27 + CMake
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb exec-in "run-as com.inbornapp.mobile sh -c 'cat > files/instant.gguf'" < ../../../.models/<model>.gguf
adb reverse tcp:8081 tcp:8081 && cd .. && APP_VARIANT=development npx expo start   # Metro, then open the app
```
The header shows the engine, tok/s and time-to-first-token after each reply (`stats()`).

## The no-INTERNET rule (decision D3)
`apps/mobile/app.config.ts` blocks `android.permission.INTERNET` unless `APP_VARIANT=development`.
Every release APK/AAB must pass `scripts/check-android-permissions.sh <file>` (aapt2). Models arrive through
Play Asset Delivery (Instant as fast-follow, larger tiers on-demand); purchases through Play Billing.
An AAB (what Play receives) is checked through bundletool:
`BUNDLETOOL=.tools/bundletool-all-1.18.3.jar scripts/check-android-permissions.sh apps/mobile/android/app/build/outputs/bundle/release/app-release.aab`

## Android model delivery (PAD)
Play Asset Delivery carries the model; the app never opens a socket (it has no INTERNET permission).
- `apps/mobile/plugins/withAssetPacks.js` (Expo config plugin): at prebuild, every pack listed in `app.config.ts` becomes a
  Gradle asset-pack module `android/<name>` (`inborn_model`, fast-follow, `instant.gguf`) whose files are symlinked from
  `INBORN_MODELS_DIR` (default `<repo>/.models`, gitignored). A missing source file skips the pack with a warning.
- `apps/mobile/modules/asset-packs` (local Expo module, Kotlin): `getPackPath`, `fetchPack`, `getPackState` over Play Core
  `AssetPackManager`. On Android `devModel.native.ts` loads the model from the pack first, then from the document directory;
  when the pack is not there yet it asks Play for it so the next launch finds it.

Build the AAB with the pack, then test locally with bundletool (no Play Console needed; get the jar from
github.com/google/bundletool/releases into `.tools/`, gitignored):
```
cd apps/mobile && INBORN_MODELS_DIR=$PWD/../../.models npx expo prebuild -p android --no-install
cd android && ./gradlew bundleRelease -PreactNativeArchitectures=arm64-v8a
BT=../../../.tools/bundletool-all-1.18.3.jar; AAB=app/build/outputs/bundle/release/app-release.aab
java -jar $BT dump manifest --bundle=$AAB --module=inborn_model            # <dist:fast-follow/>
java -jar $BT build-apks --bundle=$AAB --output=/tmp/inborn.apks --local-testing
java -jar $BT install-apks --apks=/tmp/inborn.apks --device-id=<serial>    # slow USB? see below
BUNDLETOOL=$BT ../../../scripts/check-android-permissions.sh $AAB          # OK: no INTERNET permission.
```
`install-apks` pushes the 532 MB pack APK into `/sdcard/Android/data/com.inbornapp.mobile/files/local_testing/`; on a slow
USB link push `asset-slices/inborn_model-master.apk` from the `.apks` zip there yourself. First launch: Play Core's local
testing service delivers the pack (`FakeAssetPackService … notifyModuleCompleted` in logcat); every launch after that logs
`[inborn] instant model from asset pack inborn_model: file:///data/data/com.inbornapp.mobile/files/assetpacks/inborn_model/…`
and `[inborn] llama.rn loaded … in N ms`.

Proven on 5.9.2026 (OnePlus 6T, Android 11, release AAB 579 MB = base + 532 MB pack): pack module present with
fast-follow delivery, base manifest without INTERNET, pack delivered and extracted by Play Core local testing
(status COMPLETED, 532,525,407 bytes), model found at the pack path and loaded by llama.rn in 2.2 s.

## Week-0 device prototype (spec §14.1) — not done yet
1. Android test app without INTERNET receiving a real fast-follow and an on-demand asset pack via Play Asset Delivery,
   plus a Play Billing test purchase, on a real Pixel and Galaxy; `aapt2 dump permissions` on the AAB.
2. Apple-hosted asset packs on an iPhone with iOS 26.
3. Test devices: iPhone 15 Pro (8 GB), iPhone 14 (6 GB), Pixel 8, Galaxy S23, a cheap Android tablet, 16 KB-page emulator.

## Intentionally not built yet
Apple FM adapter, SQLCipher schema,
model catalog + downloads, RAG, voice, personas, purchases, NativeWind styling (tokens exist), expo-router navigation.

## Package ids
`com.inbornapp.mobile` (iOS + Android) and `com.inbornapp.desktop`, confirmed by Moshe on 3.9.2026.
