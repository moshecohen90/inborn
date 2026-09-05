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

## Week-0 device prototype (spec §14.1) — status 5.9.2026
Done on real hardware, without buying devices or opening store records:
- Android (OnePlus 6T, 2018): release build without INTERNET, model delivered as a fast-follow asset pack and loaded from it; 15.8 tok/s.
- iOS (iPhone 13 Pro): llama.rn on Metal, 36.3 tok/s, TTFT 328 ms.
- Web (wllama, headless Chromium): 33 tok/s multi-thread, 7 tok/s single-thread, page talks only to its own origin.
- macOS: Tauri shell renders the web export with `connect-src 'none'`, zero sockets.
- Chats persist in SQLCipher; incognito never touches disk; 21 unit tests.
Still open: real Play Console delivery (fast-follow + on-demand from the store) and a Play Billing test purchase; Apple-hosted asset packs;
Pixel 8 / Galaxy S23 / iPhone 15 Pro measurements (devices not bought yet); Windows build; 16 KB-page emulator.

## App shell, onboarding and proof (M4, spec §14.2 row 7)
`expo-router` owns the app (`apps/mobile/src/app/**`): onboarding (5 screens), chat (`index`), chats, vault/documents/paywall placeholders,
settings + its sub-pages, proof, and `inborn://` deep links. The boot that used to live in `App.tsx` (i18n, encrypted store, `prepareEngine`)
now runs once in `AppServicesProvider`; `useAppServices()` hands every screen the store, engine, prefs, lock and exit meter. `Chat`/`Chats`
keep their old props, mounted by the routes.

- **The seal** (`src/components/Seal.tsx`, §3.4/§9.5): one SVG component with every state — open, loading (arc + %), sealing (420 ms spring +
  rigid haptic + green bloom), sealed, generating (breathing + filament glow), unsealed (cracked red), lan (amber). Reduced-motion safe.
- **Onboarding** (`src/screens/Onboarding`, §8.1): Welcome (thesis + open seal + real chip line), model choice, the airplane test, the seal-close
  peak, the optional lock. Under 90 s, no skip, chat starts on the built-in Instant model with nothing downloaded.
- **The airplane test + exit meter** (§3.4): Android reads the kernel's per-uid `TrafficStats` counters through a local Expo module
  (`modules/traffic-meter`); iOS has no per-app counter, so the app shows what its own network layer sent (0 by construction) and points at the
  system App Privacy Report — the narrative §3.4 prescribes. `formatBytes`/`accumulate` are pure and unit-tested (reboot-safe deltas).
- **Lock** (`src/lock`, §5.7/§7.5/S53): `expo-local-authentication` with the correct per-platform label from S53 (Face ID / Touch ID / Optic ID /
  fingerprint or face / Windows Hello / passcode), auto-lock timeout, a passcode fallback (salted SHA-256 in the Keychain), the app-switcher
  privacy cover (`expo-blur`), Android `FLAG_SECURE` screenshot blocking and iOS `UIScreen.isCaptured` hiding (`modules/secure-screen`), and the
  emergency-wipe UI (confirm twice → `src/storage/wipe.*`).
- **Settings + proof** (`src/screens/Settings`, `src/screens/Proof`, §8.6): every S52 row (theme, text size, security, chat, performance,
  language picker from the `@inborn/i18n` locales, downloads, accessibility, storage dashboard, about + licences from §11.4) and the S50 proof
  page (readouts, allowlist, permissions, build hash, network log, "check for yourself" per store).
- **System-wide states** (§8.8): `src/components/shell/Banners.tsx` renders storage-full / thermal / low-power / battery / model-delivering as a
  strip under the header. The policy comes from `useDeviceState()` (`src/device/types.ts` + a stub); the device-guard stream replaces the stub. A
  dev-only preview switch in Settings drives each banner.

FARADAY tokens grew in `packages/ui` (type scale, motion, radius set, glow, web font stack); no existing export changed.

### Run / verify
```
corepack pnpm --filter @inborn/mobile export:web        # router + all screens build for web
APP_VARIANT=development npx expo prebuild -p ios --no-install && (cd apps/mobile/ios && pod install)
```
The iOS build needs `patches/expo-modules-core@57.0.15.patch` (Xcode 26.2's Swift 6 rejects the upstream `nonisolated(unsafe) weak` capture in
`EventEmitter.swift`; the patch boxes it in a `@unchecked Sendable` ref). Proven 6.9.2026:
- **iOS simulator** (iPhone 15 Pro, iOS 17.0): all 5 onboarding screens, the seal closing, the airplane test streaming 391 offline, Face ID
  enrol → app-switcher blur → relaunch lock → match unlocks, proof, settings, `inborn://` deep links.
- **Android emulator** (Pixel_4_API_33): onboarding, real airplane-mode test streaming offline, and `FLAG_SECURE` proven — with screenshot
  protection on, `adb shell screencap` writes a 0-byte file and the window shows `fl=… SECURE`; off, it captures normally.
- **Web** (headless Chromium): the whole flow (onboarding → chat → drawer → settings light/dark → storage → about → licences → language/pseudo →
  proof → network log → cold-reload lock → wrong then right passcode → deep links → wipe→onboarding), 0 console errors.

## Intentionally not built yet
Apple FM adapter, model catalog + downloads, RAG, voice, personas, purchases, NativeWind styling (tokens exist). The device-guard policy behind
`useDeviceState()`, the vault/documents/paywall screens, and per-message ledger actions are owned by other streams.

## Package ids
`com.inbornapp.mobile` (iOS + Android) and `com.inbornapp.desktop`, confirmed by Moshe on 3.9.2026.
