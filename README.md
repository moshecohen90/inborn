# Inborn

Private, offline, on-device AI chat. One codebase: iOS + Android + web (Expo) and Windows + macOS (Tauri v2).
Spec and demo: `docs/inborn-spec.html`, `docs/inborn-demo.html` (Hebrew, RTL).

## Layout
- `apps/mobile` — Expo app (iOS, Android, web). `App.tsx` boots i18n, opens the encrypted chat store and switches between the Chats list and the Chat screen; `src/adapters` picks the engine per platform (llama.rn on phones, wllama in browsers, in-memory otherwise); `src/storage` is the SQLCipher repository; `plugins/` + `modules/` deliver the Android model as a Play Asset Delivery pack.
- `apps/desktop` — Tauri v2 shell around the web export (macOS built and verified with `connect-src 'none'`; Windows pending).
- `packages/core` — pure TypeScript, no network: the `LocalLM` interface (spec §5.2), `NullLM` for tests/dev, catalog types, the chat domain (`ChatRepository`, `ChatStore`, incognito rule).
- `packages/i18n` — i18next + ICU; `locales/en.json` is the single source. Adding a language = one JSON file.
- `packages/ui` — FARADAY tokens (dark + light, default follows the device) and a Tailwind/NativeWind preset.
- `scripts/check-android-permissions.sh` — release gate: fails if the Android build declares INTERNET.
- `scripts/serve-web.mjs` — static host for the web export with COOP/COEP, a `'self'`-only CSP and Range support; `scripts/web-smoke.mjs` — headless proof of the browser tier.

## Run
```
corepack pnpm install
corepack pnpm typecheck && corepack pnpm test && corepack pnpm lint
cd apps/mobile && APP_VARIANT=development npx expo start      # dev needs INTERNET for Metro; release blocks it
corepack pnpm --filter @inborn/mobile export:web              # web build (also what the desktop shell loads)
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

## Web engine (browser tier, spec §4.4)
The browser runs llama.cpp in WebAssembly through wllama when the host serves `/models/instant.gguf` (one HEAD at boot);
otherwise the in-memory engine streams, like a phone without a GGUF. `pnpm wasm` copies wllama's WebAssembly into
`apps/mobile/public/` before every web build, so the page never touches a CDN.
```
corepack pnpm --filter @inborn/mobile export:web       # dist/ with wllama.wasm next to the bundle
MODELS_DIR=$PWD/.models corepack pnpm web:serve        # http://127.0.0.1:8787 — /models/instant.gguf → .models/instant.gguf or $INSTANT_GGUF
MODELS_DIR=$PWD/.models corepack pnpm web:smoke        # headless Chrome: load, one prompt, tok/s + TTFT, screenshot; skips without a model
```
Threads need the COOP/COEP headers `web:serve` sends; without them (`ISOLATION=off`) wllama runs single-threaded.
The desktop shell (CSP `connect-src 'none'`) gets the same layout: the GGUF and `wllama.wasm` live under the app's own origin, nothing is fetched cross-origin.
Thinking is off for the Instant model (`enable_thinking: false` through the chat template).

Measured 5.9.2026, M-series Mac, Playwright chromium_headless_shell 1208 (no WebGPU), Qwen3.5-0.8B Q4_K_M, `web:smoke`:

| build | tok/s | TTFT | engine load | page → ready |
|---|---|---|---|---|
| multi-thread (COOP/COEP, 6 threads) | 33 | 480 ms | 2.3 s | 2.9 s |
| single-thread (`ISOLATION=off`) | 7 | 2.5 s | 2.6 s | 2.8 s |

## iOS device run (M1, measured 5.9.2026)
iPhone 13 Pro (A15, iOS 26.5.2), Metal, Qwen3.5-0.8B-Q4_K_M (508 MB), thinking off, `n_ctx` 4096. Xcode signs with the
team's wildcard development profile (team `NGCHN95667`); no account login is needed for `xcodebuild`.
```
cd apps/mobile && APP_VARIANT=development npx expo prebuild -p ios --no-install && (cd ios && pod install)
DEV=$(xcrun xctrace list devices | grep -o '(0000[0-9A-F-]*)' | tr -d '()' | head -1)   # Xcode device id, not the CoreDevice UDID
cd ios && echo 'export EXPO_PUBLIC_AUTOPROMPT=1' >> .xcode.env.local   # bundle-time env for the measurement run; remove it afterwards
xcodebuild -workspace Inborndev.xcworkspace -scheme Inborndev -configuration Release \
  -destination "id=$DEV" -derivedDataPath build/dd -allowProvisioningUpdates DEVELOPMENT_TEAM=NGCHN95667 build
UDID=$(xcrun devicectl list devices | grep -o '[0-9A-F-]\{36\}' | head -1); APP=com.inbornapp.mobile
xcrun devicectl device install app --device $UDID build/dd/Build/Products/Release-iphoneos/Inborndev.app
xcrun devicectl device copy to --device $UDID --domain-type appDataContainer --domain-identifier $APP \
  --source ../../../.models/Qwen3.5-0.8B-Q4_K_M.gguf --destination Documents/instant.gguf
xcrun devicectl device process launch --device $UDID --terminate-existing $APP; sleep 30
xcrun devicectl device copy from --device $UDID --domain-type appDataContainer --domain-identifier $APP \
  --source Documents/dev-run.json --destination /tmp/dev-run.json && cat /tmp/dev-run.json
```
`EXPO_PUBLIC_AUTOPROMPT=1` (bundle time, via `.xcode.env.local`) makes the Chat screen send one prompt by itself and
write the numbers to `Documents/dev-run.json`; JS console output is not readable over USB, so this file is the measurement channel. Debug
builds need Metro; an embedded dev bundle (`FORCE_BUNDLING=1`) throws "Cannot create devtools websocket connections in
embedded environments" before `registerRootComponent`, so use Release. Screenshot: `pymobiledevice3 developer dvt screenshot`.

| run | model load | TTFT | generation |
|---|---|---|---|
| first launch after the push (Metal init) | 10.9 s | 415 ms | 26.1 tok/s (6 tokens) |
| warm relaunch, one-sentence answer | 0.45 s | 146 ms | 27.5 tok/s (6 tokens) |
| warm relaunch, 131-token answer | 0.42 s | 328 ms | **36.3 tok/s** (prompt 87.6 tok/s) |

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

## Model vault (M2, spec §5.4 / §6 / §8.4)
The catalog is one signed manifest, `packages/core/src/catalog/manifest.json` (Ed25519; public key committed in
`publicKey.ts`, private seed only in the macOS Keychain `inborn-catalog-signing`). Every edit needs a re-sign, and the
core tests fail otherwise:
```
node scripts/gen-catalog-key.mjs              # once; --rotate to replace the key (re-sign afterwards)
node scripts/sign-catalog.mjs                 # signs manifest.json in place; --check verifies
```
`packages/core/src/catalog/` is pure TypeScript: manifest verification + host allowlist (`models.inbornapp.com` only),
`pickDefault` / `groupByFit` (§6.3: 4 GB sees only Instant, 6–8 GB defaults to Fast), the install state machine
(not installed → delivering → verifying → ready / corrupt / needs space / quarantined), the streaming GGUF header reader
(magic, version, architecture, size, quant; rejects non-GGUF, truncated, unknown architecture), resume/space/Wi-Fi rules
and the §6.4 expected-speed table. 38 vitest tests cover it (`pnpm --filter @inborn/core test`).

On the phone (`apps/mobile/src/vault/`): `VaultStore` scans the vault directory (`Documents/models`, excluded from
backup), the Play packs and the M1 `instant.gguf` dev fallback, verifies SHA-256 natively (`modules/vault-native`,
streaming, 4 MB slices), and drives one `ModelDelivery` per platform:
- Android: Play Asset Delivery only (`modules/asset-packs`: fetch, cancel, remove, Play's cellular dialog, state events).
  `app.config.ts` declares `inborn_model` (Instant, fast-follow) plus `inborn_model_fast` / `inborn_model_sharp`
  (on-demand); the app never opens a socket.
- iOS / desktop: resumable HTTPS through `expo-file-system` download tasks (background URLSession on iOS, pause/resume
  state persisted in `vault.json`, Android-style byte-offset resume where the platform supports it). The confirmation
  sheet names the host and why before any byte moves.
- Import: `.gguf` document type (iOS) / intent filter (Android) + "Import GGUF" picker; the header is checked before the
  file is copied into the vault.
- Sharp (2.6 GB) ships split: `llama-gguf-split --split-max-size 1400M` (brew `llama.cpp`) makes two shards under Play's
  1.5 GB pack cap; the manifest lists them in `parts`, every shard is hashed, llama.cpp opens the first and finds the second.

Screens: `apps/mobile/src/screens/vault/` exports `VaultScreen` (S30 cards with plain-language names, battery tag,
"~min–max tok/s on your phone", RECOMMENDED FOR THIS PHONE, install / pause / cancel / remove / use, storage counter,
too-big rows with the reason, import) and the S31 details sheet. The engine now resolves through the vault
(`src/vault/resolve.ts`): the default installed chat model, else the recommended one, else `Documents/instant.gguf`.
`resetEngine()` in `src/engine.ts` unloads after a switch. Wiring for the host: render `<VaultScreen onClose onModelChanged />`
and bump the chat screen key in `onModelChanged`.

Local stand-in for the CDN (simulator / desktop):
```
MODELS_DIR=$PWD/.models node scripts/serve-models.mjs        # http://127.0.0.1:8790/v1/<file>, HEAD, ETag, Range/206
EXPO_PUBLIC_MODELS_BASE_URL=http://127.0.0.1:8790/v1 EXPO_PUBLIC_DEV_RAM_GB=6 EXPO_PUBLIC_START_SCREEN=vault \
  APP_VARIANT=development npx expo start                       # dev builds only; release builds ignore these
DROP_AFTER=20000000 node scripts/serve-models.mjs             # cuts the first GET after 20 MB to exercise resume
```
Proven 6.9.2026:
- Android, Pixel_6_API_36 emulator (arm64, 6 GB), release AAB (no INTERNET, `check-android-permissions.sh` OK) through
  bundletool `--local-testing`: three packs in the bundle (`inborn_model` fast-follow, `inborn_model_fast` + `inborn_model_sharp`
  on-demand, Sharp as two shards); tapping Install on Fast → Play local testing delivered and verified the 1,280,835,840-byte
  pack, the vault hashed it, the chat screen loaded it from the pack path with llama.rn in 2.2 s and answered at 6.4 tok/s (emulator CPU).
- iOS, iPhone 15 simulator (iOS 17.0): Instant (532,517,120 bytes) downloaded from the local stand-in, SHA-256 matched the catalog;
  Fast with the server cutting the connection after 300 MB resumed by itself with `Range: bytes=300000000-` (206) and verified;
  a 0.6B Qwen3 GGUF imported with its header read (arch, size label, quant, context) while a 5 MB random file was rejected as "not a GGUF".
- 38 catalog unit tests (signature, host allowlist, picker, install reducer, GGUF reader incl. the real Instant file, resume rules, speed table).

iOS simulator: build `-configuration Release -sdk iphonesimulator SWIFT_VERSION=5.0` (Xcode 26.2 rejects
expo-modules-core's EventEmitter.swift in Swift 6 mode, Debug and Release alike) and put the `EXPO_PUBLIC_*` exports in
`ios/.xcode.env.local` so Metro inlines them at bundle time.

## Week-0 device prototype (spec §14.1) — status 5.9.2026
Done on real hardware, without buying devices or opening store records:
- Android (OnePlus 6T, 2018): release build without INTERNET, model delivered as a fast-follow asset pack and loaded from it; 15.8 tok/s.
- iOS (iPhone 13 Pro): llama.rn on Metal, 36.3 tok/s, TTFT 328 ms.
- Web (wllama, headless Chromium): 33 tok/s multi-thread, 7 tok/s single-thread, page talks only to its own origin.
- macOS: Tauri shell renders the web export with `connect-src 'none'`, zero sockets.
- Chats persist in SQLCipher; incognito never touches disk; 21 unit tests.
Still open: real Play Console delivery (fast-follow + on-demand from the store) and a Play Billing test purchase; Apple-hosted asset packs;
Pixel 8 / Galaxy S23 / iPhone 15 Pro measurements (devices not bought yet); Windows build; 16 KB-page emulator.

## Intentionally not built yet
Apple FM adapter, model catalog + downloads, RAG, voice, personas, purchases, NativeWind styling (tokens exist), expo-router navigation.

## Package ids
`com.inbornapp.mobile` (iOS + Android) and `com.inbornapp.desktop`, confirmed by Moshe on 3.9.2026.
