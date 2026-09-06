# Inborn

Private, offline, on-device AI chat. One codebase: iOS + Android + web (Expo) and Windows + macOS (Tauri v2).
Spec and demo: `docs/inborn-spec.html`, `docs/inborn-demo.html` (Hebrew, RTL).

## Layout
- `apps/mobile` — Expo app (iOS, Android, web). `App.tsx` boots i18n, opens the encrypted chat store and switches between the Chats list and the Chat screen; `src/adapters` picks the engine per platform (llama.rn on phones, wllama in browsers, in-memory otherwise); `src/storage` is the SQLCipher repository; `plugins/` + `modules/` deliver the Android model as a Play Asset Delivery pack.
- `apps/desktop` — Tauri v2 shell around the web export with a native llama.cpp engine in Rust (Metal / Vulkan / CUDA), SQLCipher chats keyed from the OS keychain, model vault, tray + menu shortcuts, signed updater config; CI matrix in `.github/workflows/desktop.yml`. See `apps/desktop/README.md`.
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

## Web phase 2 (spec §14.3, §4.4, §8.9) — status 6.9.2026
The browser tier now keeps its model and its chats, boots without a network, gates the device and ships as a static origin.
- **Model in OPFS** (`apps/mobile/src/web/opfs.ts`, `modelDelivery.ts`, `public/model-worker.js`): the download door (`src/web/WebShell.tsx`)
  asks `navigator.storage.persist()`, streams the GGUF from `/models/<file>` into `models/<file>` in the Origin Private File System through an
  unbundled module worker, resumes with a `Range` request from whatever is on disk (the SHA-256 midstate is checkpointed every 32 MB, so a
  resume never re-reads the file), verifies the sha256 from the manifest, and refuses to start when `storage.estimate()` leaves less than the
  file plus 256 MB. wllama then loads `opfs://models/<file>` as a File (`wllama.loadModel([file])`): no network on later visits.
  The model list comes from `/models/manifest.json` (catalog shape: id, tier, bytes, sha256, delivery url; only our origin or an allow-listed
  host is accepted); `scripts/serve-web.mjs` serves it for `.models/` with a cached `<file>.sha256` sidecar. The last manifest is kept in
  localStorage so an offline visit still knows which file it holds.
- **Chats in IndexedDB** (`src/storage/web/idbRepository.ts`): the `ChatRepository` contract with the same tests as the in-memory one
  (`fake-indexeddb`, 7 tests) plus reopen persistence. No SQLCipher on the web; the `webStorageNotice` string tells the user so.
- **Service worker**: `apps/web/build.mjs` runs Workbox `generateSW` over the export (precache 12 files, 24 MB; no runtime caching, so nothing
  is ever fetched from another origin by the SW). `src/web/serviceWorker.ts` registers it only on http(s), never inside the desktop shell.
- **Device gate** (`src/web/deviceGate.ts`, 7 tests): phones → Instant + "Install the app" door (iPhone Safari wording per §4.4); tablets → Fast;
  desktop → Sharp when `navigator.deviceMemory` reports 8 GB, Fast at 4–7 GB, and Fast with an honest "this browser does not report memory"
  line when there is no figure (Safari, Firefox). WebGPU presence is recorded; the adapter is still requested at load.
- **Hosting artefacts** (`apps/web/`, `pnpm web:build` → `apps/web/dist`): `_headers` for Cloudflare Pages (COOP/COEP, CSP `default-src 'self'`
  with `connect-src 'self'` + optional `MODELS_ORIGIN`, no-referrer, frame-ancestors none), SRI (`integrity="sha384-…"`) on the bundle,
  `hashes.json` with the sha256 of every shipped file (the published hash, §4.4), `manifest.webmanifest` + icons (a rendering of the approved
  §9.8 mark: closed ring on graphite, filament at 2 o'clock — `public/icons/icon.svg`; not a designer file), so PWABuilder can package it.
  `apps/web/headers.mjs` is the single definition the dev host and `_headers` share. Nothing deploys from here.
- **Chrome Prompt API** (`src/web/chromeNano.ts`): a `LocalLM` over `LanguageModel`, shown as a switch labelled "Google's model, managed by
  Chrome" only when the API exists, off by default; switching reloads the page (the engine is chosen once per load).
```
corepack pnpm web:build                    # export + apps/web/dist (sw.js, _headers, hashes.json, SRI, manifest)
MODELS_DIR=$PWD/.models corepack pnpm web:serve   # serves apps/web/dist when it exists, with /models/manifest.json
MODELS_DIR=$PWD/.models corepack pnpm web:smoke   # 4 passes: download (cancel + resume) → chat; offline reload → chat; phone door; no-space door
```
Measured 6.9.2026, M-series Mac, chromium_headless_shell 1208 (no WebGPU), Qwen3.5-0.8B Q4_K_M from `apps/web/dist`:

| pass | what happened | numbers |
|---|---|---|
| first visit | door → download → cancel at 15 MB → `Range: bytes=15073280-` (206) → sha256 verified → wllama from OPFS | ready 11.4 s after page open (incl. the 533 MB copy), engine load 1.4 s, 32.8 tok/s, TTFT 501 ms, 6 threads, OPFS usage 560 MB |
| offline visit (`context.setOffline(true)`, new page) | service worker served `/`, the bundle and `wllama.wasm`; manifest came from the localStorage copy; model from OPFS, 0 model fetches | ready 1.9 s, 33.1 tok/s, TTFT 474 ms |
| phone (iPhone UA, 390×844) | strip shows "iPhone Safari keeps this tab under 500 MB. Install the app for the full experience." + Get the app | — |
| tight quota (estimate stubbed to 100 MB) | "Not enough space in this browser: 801 MB needed, 105 MB free.", download disabled | — |

Headless Chromium denies `storage.persist()` (no engagement), so `persisted` reads false there; a real profile grants it on the click.
Not done: a real Safari/Firefox run (no OPFS sync-access-handle test outside Chromium here), PWABuilder packaging itself, the catalog host.

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

## Desktop (phase 3, spec §14.4) — status 6.9.2026
`corepack pnpm desktop:build:app` builds `Inborn.app` (web export + Rust). The page talks only to Tauri's in-process IPC
(`connect-src ipc: http://ipc.localhost`, gated by `apps/desktop/scripts/check-csp.mjs`); the engine, the encrypted chat
store (SQLCipher, key in the Keychain / Credential Manager) and the model vault live in Rust. Drop a GGUF on the window or
use *File › Import GGUF Model…*; the tray shows the seal; *Check for Updates…* is the only socket the process can open and
runs only on click. Windows ships as an NSIS `.exe` for the Microsoft Store listing, macOS as a notarized DMG
(`apps/desktop/scripts/release-macos.sh`, ad-hoc + hardened runtime locally). Details and numbers: `apps/desktop/README.md`.

| run (Apple Silicon, Metal, Qwen3.5-0.8B Q4_K_M) | model load | TTFT | generation |
|---|---|---|---|
| first launch (Metal library compile ≈10 s before the load) | 537 ms | 614 ms | 188 tokens |
| warm relaunch | 484 ms | **48 ms** | **156.5 tok/s** (170 tokens), prompt 600 tok/s |

Zero internet sockets on the process for the whole run (`lsof -a -p <pid> -i`, polled every 0.5 s); `inborn.db` is SQLCipher (no SQLite header).
## Device guard: battery, heat, memory (spec §6.5, §5.7–5.8, §10.2–10.3)
One policy engine decides what the phone does when it gets hot, low or tight on memory, and one status line under the seal says so.
- `packages/core/src/device/` — pure: `DevicePolicy.update(signals, override, now)` → `{status, headline (i18n key), recommendation propose|act, action,
  button, targetTier, threads, gpuLayers, maxTokens (1,024 / 512), contextCap (4K / 2K under 6 GB), pauseDownloads, pauseIndexing, sealGlow,
  confirmLongAnswer, stopGeneration, unloadAfterMs, explain}`, exactly the §6.5 table per device class (phone/tablet, laptop on battery,
  desktop on mains, browser) with its priority rule (critical heat › memory › serious heat › <5 % › Low Power/<10 % › proposals). Hysteresis: 2
  battery points, a 20 s hold before heat/memory lines step down, one proposal per step. `SpeedWatch` is the Windows stand-in (35 % drop in 60 s).
  `thermalFromAndroid` refuses a SEVERE+ status that never moved on a cool device (see the OnePlus finding below). 41 tests in `packages/core/test/device-*`.
- `apps/mobile/modules/device-guard/` — local Expo module (Kotlin + Swift): thermal status + listener, `onTrimMemory` / `DispatchSource` memory
  pressure, `ActivityManager.MemoryInfo` / `os_proc_available_memory`, RAM, Battery Saver / Low Power Mode, plugged source, battery temperature,
  thermal headroom (API 30+). `expo-battery` carries level and charging (on the web the Battery Status API, with Chrome's events as listeners).
- `apps/mobile/src/device/` — `guard.ts` merges the signals (debounced 250 ms, 5 s tick), runs the policy and acts: caps every answer
  (`maxTokens`, `threads` per request on llama.rn), stops it (critical heat, memory, the 15 s background grace, checked on the token stream because
  Android pauses JS timers in the background), unloads (memory now, critical after 60 s, idle after 10 min), switches models between answers and
  brings the previous one back on the charger. `useDeviceState()` hands the shell `{battery, thermal, memoryPressure, powerSource, recommendation}`
  plus `accept()` / `dismiss()` / `ackExplain()` / `setOverride()`; `useEngineState()` says whether the weights are resident (seal state).
  `src/engine.ts` wraps every `generate()` so a session unloaded by the guard reloads on the next message.
- Dev switch: `EXPO_PUBLIC_DEVICE_TIER=fast` makes a dev build pretend to run the Fast tier with the one model file, so every row can be driven.

Verified 6.9.2026 on Pixel_3a_API_33 (arm64, 4 GB) through the guard's `[device]` log lines:
`cmd thermalservice override-status 3/4/0` → serious (2 threads, 512 tokens, "Switch to Instant"), critical ("Continue when cool", weights
unloaded 60 s later), cool ("Continue" lit); `dumpsys battery set level 18/9` → proposal, then Instant from the next message (model swapped in
1.6 s); `set ac 1` → "Charging · back to Fast · Keep Instant", swapped back, line gone after 10 s; 34 % unplugged after a switch → "Switch back to
Fast"; `settings put global low_power 1/0` → Low Power line on/off; `am send-trim-memory … RUNNING_CRITICAL` → stopped + unloaded, back to normal
55 s later; an answer at 23 tok/s sent to the background was cut 16 s later and "Paused · Continue" waited on return. Web: `web:smoke` passes with
the guard running (wllama, 30 tok/s, no console errors).

OnePlus 6T (Android 11), read-only trace with `scripts/device-thermal-measure.sh REDACTED-6T 200`: three 1,024-token answers, skin 36 → 51.5 °C in
80 s, CPU up to 95 °C, back to 36 °C two minutes after the last answer. `PowerManager.getCurrentThermalStatus()` is **stuck at 6 (SHUTDOWN)** on this
phone: a sensor named `soc` (type 8, battery-current-limit percentage) reports 100 at full charge and OxygenOS maps it to SHUTDOWN, while the skin
sensor's own status is 3 (SEVERE) under load and 0 at rest. Without the plausibility check the app would never answer there; with it the status is
"unknown" and the device's own throttling is the only protection. Open: whether `getThermalHeadroom` works on that phone (needs a dev build on it).
iOS: the Swift module compiles only once ExpoModulesCore does; on this machine (Xcode 26.2) a simulator build of ExpoModulesCore 57.0.15 fails on
Swift 6 Sendable errors before reaching it, so the iOS side is unverified (the README device path built Release earlier in this milestone).

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
- macOS: Tauri shell with the native Metal engine (156.5 tok/s, TTFT 48 ms warm), SQLCipher chats, zero sockets.
- Chats persist in SQLCipher; incognito never touches disk; 21 unit tests.
Still open: real Play Console delivery (fast-follow + on-demand from the store) and a Play Billing test purchase; Apple-hosted asset packs;
Pixel 8 / Galaxy S23 / iPhone 15 Pro measurements (devices not bought yet); Windows build on CI (workflow written, not yet run); 16 KB-page emulator.

## M3 full chat (spec §7.1, §8.2, §8.3, §8.5) — status 6.9.2026
Everything below is free-tier unless marked PRO; PRO items render with a `PRO` tag and are gated by `apps/mobile/src/lib/entitlements.ts`
(`EXPO_PUBLIC_PRO=1` unlocks them in dev builds; the paywall stream replaces `setEntitlements`).
- Chat (`src/screens/Chat.tsx`, `src/components/chat/*`): native Markdown (headings, lists, tables that scroll sideways, quotes, links as
  text only, images as a placeholder, `$…$` math verbatim), code blocks with language label + Copy (an open fence stays plain text until it
  closes), pulsing dot before the first token, blinking caret, live `N TOK/S` beside the seal, Stop, Regenerate, edit-and-resend the last user
  turn, Copy / Copy as plain text, per-answer `FAST · ON-DEVICE` label, collapsed `Reasoning · 1.2 s` row when the model emits reasoning
  (always off for Instant), the collapsed Ledger (model, quant, context, ms/token, tok/s, TTFT, tokens, time), long-press actions, per-chat
  system prompt + persona + thinking switch behind the model chip, 2 px context meter (amber ≥ 80 %), "This chat is getting long" +
  "Summarize and continue" at 92 % (the summary replaces the folded turns in every later prompt), n-gram loop guard (§10.5 #39) that stops and
  offers Regenerate, "Continue" after a stop (user or system: the app aborts 15 s after going to the background and keeps the partial, §10.3
  #21), language hint from the user's script and an "Answer in Hebrew" action when the answer drifts (§10.5 #40), dismissible "can be
  wrong" notice, Report sheet stored on the phone with an "Email report" share (§8.2 S13), crisis-resources card from a small on-device phrase
  list (§8.2 S14). Attach and mic are visible but disabled until M5.
- Conversations (`src/screens/Chats.tsx`, `src/screens/chat/*`): search across titles + FTS5 with snippets, Pinned / folders (PRO) /
  Recent / Archived sections, swipe-left actions (pin, archive, delete), long-press menu (rename, pin, archive, move to folder, export,
  delete), Select mode with bulk delete, 5 s undo for every delete, export one chat as Markdown / plain text / JSON through the share sheet
  (`expo-sharing`), empty states, new-chat sheet with persona chips + model + incognito switch, footer with Personas / Memory / Folders.
- Personas (§8.5 S41): Assistant, Writer, Tutor, Translator built in; custom ones (name, glyph, prompt, temperature, fixed disclaimer),
  3 on free, unlimited on PRO. Memory (§8.5 S42, PRO): transparent list of facts with source chat, edit / delete / disable each, master
  switch, per-persona switches; never read or written in incognito (`ChatStore.memoryFor` / `remember`).
- Storage: versioned migrations (`PRAGMA user_version`, `apps/mobile/src/storage/schema.ts`, v2 adds archived / system prompt / thinking /
  summary columns and the folders, personas, memory, settings, reports tables). Same-connection transactions only: expo-sqlite's exclusive
  transaction opens a second handle that has no SQLCipher key.
- Core (`packages/core/src/chat/*`): `markdown.ts`, `context.ts` (token estimate + calibration from real usage, newest-first budgeting,
  summary planning), `loop.ts`, `export.ts`, `personas.ts`, `language.ts`, `safety.ts`; 35 new vitest cases (54 total in core).

Verify (Android emulator Pixel_6_API_33, arm64): build as in "Run on a phone" with `-PreactNativeArchitectures=arm64-v8a`; push the model
with `run-as`; if another Metro owns 8081, start yours with `--port 8082` and point the app at it:
`adb shell "run-as com.inbornapp.mobile sh -c 'cat > shared_prefs/com.inbornapp.mobile_preferences.xml'"` with
`<string name="debug_http_host">10.0.2.2:8082</string>`. Emulators cannot type Hebrew, so `EXPO_PUBLIC_AUTOPROMPT="<any text>"` sends that
text once after the model loads. Font scale: `adb shell settings put system font_scale 2.0` (restore `1.0`).

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
Apple FM adapter, model catalog + downloads, RAG, voice, purchases, NativeWind styling (tokens exist), expo-router navigation.

Apple FM adapter, model catalog + downloads, RAG, voice, personas, purchases, NativeWind styling (tokens exist). The device-guard policy behind
`useDeviceState()`, the vault/documents/paywall screens, and per-message ledger actions are owned by other streams.

## Package ids
`com.inbornapp.mobile` (iOS + Android) and `com.inbornapp.desktop`, confirmed by Moshe on 3.9.2026.

## Legal, compliance, QA and launch docs (legal-docs stream)
Docs only, no app code. Everything the spec promises "lives in the repo" for §10–§11, §13.5, §14.7, §15:
- `docs/legal/` — `privacy-policy.md` (store + website text, per-platform network list), `terms.md` (EULA, one-time Pro/Work, Family Sharing, refunds via stores, AI disclaimer), `ai-act-notes.md` (Art. 50 duties; Inborn launches after 2.8.2026 so the 2.12.2026 grace does not apply), `licenses.md` + `NOTICE.json` (every model/native/JS component with licence, attribution, obligations; nothing conflicts with a closed Pro app), `app-privacy-details.md` (Apple "Data Not Collected" reasoning, `PrivacyInfo.xcprivacy` content from the manifests actually in node_modules, Play Data safety, AI-content policy, age-rating answers, review notes).
- `docs/qa/` — `release-checklist.md` (the 40 tests T01–T40 with commands, pass criteria and which of our devices can run each) and `edge-cases-matrix.md` (all 70 §10 cases → test ids; status column for the lead).
- `docs/ops/` — `metrics-without-sdk.md` (sources, gates A/B/C, weekly routine, template), `trademark-watch.md` + `com.inbornapp.tm-watch.plist` (monthly `scripts/tm-watch.sh`, not installed; inborn.app expiry 25.10.2026; EU/US/UK filing costs), `developer-account.md` (neutral developer name, App Transfer at gate C).
- `docs/launch/launch-plan.md` — Product Hunt / Show HN / Reddit / creator / promo-code / ASA+UAC drafts. Nothing sent.
Verified: `plutil -lint` on the plist, `NOTICE.json` parses; licence inventory from `pnpm licenses list --json` (534 packages, 447 MIT). `scripts/tm-watch.sh Inborn` run 6.9.2026: 264 TMview results, 0 identical live marks in classes 9/42 at EM/US/GB/WO (exit 0).
