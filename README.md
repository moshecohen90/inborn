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
iOS (iPhone 15 Pro simulator, iOS 17.0.1, Debug build with `patches/expo-modules-core@57.0.15.patch`): the Swift module compiles, links and
answers at boot with thermal nominal, Low Power off, 64 GB RAM (the Mac's), tablet false; `os_proc_available_memory()` is 0 on the simulator and
is reported as unknown, not as pressure. The simulator's app container is shared by every stream (same bundle id) and remembers the Metro port
in `RCT_jsLocation`; point it at your Metro with `xcrun simctl spawn <udid> defaults write com.inbornapp.mobile RCT_jsLocation localhost:8081`,
and read the guard's first read from `Documents/device-guard.json` (dev builds write it; the simulator's console reaches neither Metro nor `log`).
After the merge with the shell: `useDeviceState()` returns the shell's `DeviceState` (banner union from the policy, `policy` attached), Settings'
banner preview still works, and the three AppServices buttons route to the guard; the thermal override on the emulator renders the shell's
"Slowing down to keep the phone cool · Switch to Instant" banner.

## The no-INTERNET rule (decision D3) and the permission allowlist
`apps/mobile/app.config.ts` blocks `android.permission.INTERNET` unless `APP_VARIANT=development`, and removes every
permission a library brings that is not in the documented allowlist (`android.blockedPermissions`: WIFI_STATE, WAKE_LOCK,
BOOT_COMPLETED, USE_FINGERPRINT, install-referrer). Every release APK/AAB must pass `scripts/check-android-permissions.sh
<file>` (aapt2): it fails on INTERNET and on any permission outside the allowlist in the script, which is the table in
`docs/legal/app-privacy-details.md` §4.2 (BILLING, FOREGROUND_SERVICE(+DATA_SYNC), ACCESS_NETWORK_STATE, USE_BIOMETRIC,
VIBRATE, RECORD_AUDIO, CAMERA, the app's own DYNAMIC_RECEIVER permission). A new permission goes into the script, the
table and the Play data-safety answers in one change. Models arrive through Play Asset Delivery (Instant as fast-follow,
larger tiers on-demand); purchases through Play Billing.
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

## iOS: Instant ships inside the app (D2, spec §5.4 / §6.1) — 6.9.2026
`apps/mobile/plugins/withBundledModel.js` copies each configured model from `INBORN_MODELS_DIR` (default `<repo>/.models`) into
`ios/Inborn/Models/<id>.gguf` at prebuild and adds it to Copy Bundle Resources, so the store build carries `Inborn.app/instant.gguf`
(532,517,120 bytes). Nothing is committed (`ios/` is ignored); a missing source file is skipped with a warning and the vault falls
back to download / import. The bundle is read-only and never in an iCloud/iTunes backup (only the data container is), and App
Thinning leaves plain resources alone (it thins asset catalogs and architectures).
On the phone the vault (`src/vault/paths.ts` `bundledModelFile`, `store.ts` `adoptBundled`) resolves `Paths.bundle/<id>.gguf` as
`via: "bundled"`: ready at once, loaded in place by llama.rn (no copy), hashed once in the background after the first launch with the
verdict kept in `vault.json` (`verifiedAt`), so no later launch re-reads 500 MB; a mismatch shows the model as corrupt.
Resolver order (`src/vault/locate.ts`, unit-tested): bundled > hand-pushed `Documents/instant.gguf` > vault download/import. The
vault card says "Included with the app" (no Remove), the storage counter excludes it. Android is unchanged (PAD fast-follow).
```
cd apps/mobile && npx expo prebuild -p ios --no-install && (cd ios && pod install)   # log: withBundledModel: instant.gguf ← …
grep -c instant.gguf ios/Inborn.xcodeproj/project.pbxproj                              # 4 references
```
Proven 6.9.2026 on the iPhone 13 Pro (Release, production variant, build 1.0.0 (2), same archive as TestFlight):
- The phone still had the M1 hand-pushed `Documents/instant.gguf`; the engine loaded `…/Inborn.app/instant.gguf` anyway
  (`Documents/dev-run.json`, `EXPO_PUBLIC_AUTOPROMPT=1` bundle: `"uri":"file:///var/containers/Bundle/Application/…/Inborn.app/instant.gguf"`).
- `Documents/models/vault.json`: `"via":"bundled"`, `verifiedAt` 570 ms after `installedAt` (native SHA-256 of 508 MB, once),
  sha256 `bd258782…dc517` = catalog; the warm relaunch left `verifiedAt` unchanged (no re-hash).
- No `RCTFatalException` / "Cannot find native module" on `devicectl … launch --console` (build 1 crashed on ExpoBattery; the
  archive is built from a fresh prebuild + `pod install` of this tree, `Podfile.lock` lists `ExpoBattery (57.0.2)`).

| run | model load | TTFT | generation |
|---|---|---|---|
| first launch after install (Metal library init 9.6 s) | 10.2 s | 313 ms | 36.6 tok/s (128 tokens) |
| warm relaunch | 0.43 s | 269 ms | 38.6 tok/s (128 tokens) |

IPA 553,951,589 bytes (528 MB; build 1 without the model was ≈40 MB). TestFlight: build 1.0.0 (2), delivery 074f5575, processingState VALID, in the "Inborn internal" group; build 1 expired.

## Status 20.9.2026 (spec §14 table)
Built and merged (main): M1 engines (llama.rn / wllama / Rust llama.cpp) with S31 Benchmark, chip classes incl. android-legacy and a boot-time RAM floor;
M2 vault (signed catalog, PAD packs, resumable downloads, GGUF import, Hugging Face search on iOS, relative stored paths that survive updates);
M3 chat (Markdown, folders, FTS that never leaks locked vaults, personas, memory, incognito, crisis/report, §7.5 auto-delete enforced, S43 quick
actions, share targets ACTION_SEND / PROCESS_TEXT "Ask Inborn" / iOS share extension, one-owner SQLite connection with reopen, a hardware-keyboard
Enter-to-send module, screen-reader announcements for streaming answers); M4 shell (expo-router, onboarding, seal, exit meter, lock, FLAG_SECURE,
proof, settings, prefs backup, a full-disk banner that keeps chats and drafts intact); M5 documents + RAG with honest page/sheet/part citations,
OCR incl. Hebrew on iOS, voice (dictation, Whisper Pro, hands-free, read-aloud engine choice, dictated sends classified as the "voice" use); M6
licence (StoreKit 2 / Play, paywall with Pro AND Work, Work vaults/audit/signed export/redaction); §6.5 device guard; §6.1/§6.3/§7.8 honest
model-fit mediation (catalog v3 with measured per-language tiers, the chat advice card and vault "Best for" pickers, now also on the web tier);
8 UI languages (the original six plus Korean and Traditional Chinese, ~1,000 keys each, all complete, model copy localized); web phase 2;
desktop phase 3 CI; legal/QA/ops docs; store copy in all 8 languages; icon.
Verified: TestFlight 1.0.0 (5) VALID in the internal group (fixes rounds 10–10d), proven on a real iPhone over USB on 20.9 — exit meter
OUT 0 B, paywall prices read from the App Store, 0 crashes (`docs/qa/ios-device-pass-5-2026-09-20.md`); the chat turn itself was blocked
by the XCTest passcode sheet and stays open for build 6. Play internal testing 1.0.0 (6) active (`docs/qa/purchases-run-2026-09-11.md`
section I); versionCode 7 build **in progress (20.9)**. QA retest 11.9 (`docs/qa/qa-run-2026-09-11.md`, passes 1–3, F1–F15 fixed in round 9);
passes 4a–4d and 5 found F17–F29, fixed in fixes rounds 10, 10b, 10c, 10d and 12 (incl. the web tier's §7.8 mediation and the model-download
race, F22/F23); pass 6 **in progress (20.9)** on `main` ff39f94. Soak run 1 (11.9, 2 h 30 on the 6T): PASS
(`docs/qa/soak-run-2026-09-11.md`). Soak run 2 (20.9): 0 crashes over 2 h 30, but not a valid continuous-use soak — F27 (a hardware-keyboard
focus trap on the empty-chat screen) cut the prompt load off after 51 minutes (`docs/qa/soak-run-2026-09-20.md`). Soak run 3 **in progress
(20.9)** on versionCode 7. Launch-language decision (`docs/research/launch-languages-2026-09.md`): 8 launch languages measured on device
(English, Japanese, German, Spanish, French, Portuguese-Brazil, Korean, Traditional Chinese); Indonesian, Simplified Chinese, Gulf Arabic
and Italian for wave 2; Hebrew needs its own model (`DictaLM-3.0-1.7B-Instruct`) and ships the quarter after launch, not at 1.0. Voice on
the real iPhone (`docs/qa/voice-run-2026-09-11.md`); purchases on both stores (`docs/qa/purchases-run-2026-09-11.md`); copy sign-off
rounds 2a–2d and design sign-off (`docs/design/`).
Open (Moshe only): store screenshots after his design approval, legal fields (support email, domain, legal name, address), Play payments
profile, Family Sharing decision, Apple sandbox purchase password, T31 App Privacy Report (phone setting), site deploy + domain, IAP
submission with 1.0; F27's fix approach (switch the accessibility driver to DPAD or fix the focus trap) and a re-run of the 2-hour soak;
the Arabic tier ranking question in `docs/models/model-fit.md`'s "least certain judgements" list. Declared cuts for 1.0: .sealed backup,
side-by-side compare, Shortcuts/widgets/keyboard, Apple FM on device.

## Voice + image input (M5b, spec §5.6, §7.1, §7.4, §8.2, S44) — status 6.9.2026
Free = the system's dictation with the on-device flag forced + system read-aloud; Pro = whisper.cpp base on the phone + the hands-free
voice mode. Photos (§7.1: Free one per message, Pro several) go to the Qwen3.5 projector in-process. Nothing opens a socket.
- **Core** (`packages/core/src/voice/`, 44 tests): `EnergyVad` (adaptive noise floor, hysteresis, 250 ms min speech, 800 ms end silence,
  30 s cap → a constant tone becomes the floor), `cleanTranscript` / `TranscriptMerger` / `joinDictation` (whisper markers, interim vs
  committed text), the S44 `nextHandsFree` reducer (listen → transcribe → think → speak → listen; tap to interrupt; pause for the
  device guard / background; five silent rounds end it), `chooseDictation` (system only when it runs on-device, whisper on Pro, else the
  reason), `speechLanguage` / `pickVoice` (never a network voice) / `speechChunks` (one utterance per sentence, §10.8 #53).
  `Message.images` / `ChatMessage.images` (schema v4 `images_json`, IndexedDB, Tauri; contract test), `limits().imagesPerMessage`.
- **Dictation** (`apps/mobile/src/voice/`): tap the mic → `expo-speech-recognition` with `requiresOnDeviceRecognition: true`
  (iOS: `SFSpeechRecognizer` local only; Android 13+: `createOnDeviceSpeechRecognizer` + `EXTRA_PREFER_OFFLINE` on
  `com.google.android.as`). The locale's offline pack is checked first (`getSupportedLocales().installedLocales`) and the service's
  "client" error (pack listed but never downloaded) is caught too: the sheet offers the system's own pack download
  (`androidTriggerOfflineModelDownload`) or Whisper (PRO on Free). Android ≤ 12 and the web have no on-device recogniser: whisper only.
  Live partial text lands in the draft; the field pulses amber, the mic becomes a stop square, `Listening… / Transcribing…` line.
- **Whisper** (Pro): `whisper.rn` 0.7.4 + `@fugood/react-native-audio-pcm-stream` (16 kHz mono PCM, `VOICE_RECOGNITION` source);
  companion `speech-whisper-base` (ggml-base.bin, 148 MB, Play pack `inborn_model_speech` / HTTPS / dev fallback `Documents/whisper.bin`),
  language auto-detect, `transcribeData` on the Float32 buffer, no file written. Long-press the mic for the sheet (system / Whisper / conversation).
- **Hands-free S44** (`/voice`, Pro): dark full screen, seal + level wave, `useHandsFree` runs the reducer with mic + VAD → whisper →
  the chat engine (≤ 160 tokens, spoken-answer system hint) → system TTS; turns are saved to the chat (never in incognito); the guard's
  `pause` recommendation and the background pause it; tap interrupts; whisper is unloaded on exit.
- **Read aloud**: the message action now speaks through `expo-speech` sentence by sentence; "Stop reading" while it runs.
- **Photos**: attach sheet → Photo / Camera (`expo-image-picker`, `exif: false`), scaled to ≤ 1024 px and re-encoded as JPEG on the device
  (`expo-image-manipulator`, EXIF gone) into `Documents/images/`, chips above the composer, thumbnails in the bubble. On send the
  projector `vision-qwen35` (mmproj F16, 205 MB, Play pack `inborn_model_vision` / HTTPS / dev `Documents/mmproj.gguf`) is attached with
  `initMultimodal` (512 image tokens; `ctx_shift: false` at load) and the message goes as OAI content parts. Rows are disabled with the
  reason when the projector is missing or the model has no vision (Phi).
- **Strings / permissions**: `apps/mobile/locales/<lang>.json` (`ios` section) → Info.plist + `InfoPlist.strings` for de/es/fr/ja/pt-BR/ko/zh-Hant
  (`CFBundleLocalizations`); Android gets `RECORD_AUDIO` + `CAMERA` and the `RecognitionService` queries block; the release APK still
  passes `scripts/check-android-permissions.sh` (no INTERNET). Store answers in `docs/legal/app-privacy-details.md` §4.2a.
- Dev proof: `EXPO_PUBLIC_AUTOVOICE=en.wav,he.wav EXPO_PUBLIC_AUTOVOICE_TTS=1` transcribes WAVs pushed into Documents and writes
  `Documents/dev-run.json` (`voice` key). Clips: `say -v Samantha` / `say -v Carmit` → `afconvert -f WAVE -d LEI16@16000 -c 1`.
- Real phone (7.9.2026, `docs/qa/voice-run-2026-09-07.md`): `EXPO_PUBLIC_AUTOVOICE_SAY="…"` makes the phone speak the sentence through its own speaker one second after each listener opens, and every stage (system dictation, whisper, read-aloud, hands-free) lands under `live` in `Documents/dev-run.json`; the taps come from `ios-tests/VoiceDeviceUITests.swift` (`VOICE_STEPS` in the `.xctestrun`).
- Real phone, zero hands (11.9.2026, `docs/qa/voice-run-2026-09-11.md`): UI Automation approved on the iPhone 13 Pro, so the driver taps the mic, answers the alerts and reads the screen; `EXPO_PUBLIC_AUTOVOICE_LIVE=1` records the stages without the phone speaking (the Mac speaks via `say`, triggered by the driver's `say:<s>:<voice>:<text>` step through the runner's live NSLog); Pro through the StoreKit harness (`INBORN_SKTEST=buy:inborn.pro` in `UITargetAppEnvironmentVariables`). Proven: onboarding, offline-missing sheet + PRO paywall, read-aloud 334 ms to first audio, whisper base 19.0 s cold / 649 ms per 11 s clip on Metal, the full S44 loop. Open: the phone has dictation off in Settings (system engine untestable there) and the Mac's speaker was too faint for a clean whisper transcript.

Measured 6.9.2026 (11 s clips, whisper base, `language: auto`, 4 threads):

| device | whisper load | EN 11 s clip | HE 11 s clip | TTS start | vision (595-token prompt with one 900×600 photo) |
|---|---|---|---|---|---|
| Pixel_3a_API_33 emulator (arm64, 4 cores, CPU) | 465 ms (174 ms warm) | 3.06 s | 3.77 s | 1.24 s | prefill 175 s (3.4 tok/s), decode 0.26 tok/s, answer correct ("a stylized, geometric house with a brown roof…") |
| iPhone 15 simulator, iOS 17.0 (CPU) | 26.3 s first (Metal shader build), 125 ms warm | 1.29 s | 1.90 s | 457 ms | PHPicker → EXIF-free copy → chip → answer; projector on CPU (the simulator's Metal driver traps in `initMultimodal`, so `use_gpu` is off when `expo-device` says simulator) |

WER by eye: EN 0 word errors (capitalisation and "9" only); HE 8 of 23 words wrong (רופא השיניים → השינה עם אחר, ביצים ולחם → בצימו לכם,
הקניות → הכניות): base is usable for Hebrew commands, not for dictating prose; whisper small (466 MB, §6.2 alternative) is the upgrade.
The Android emulator cannot reach the host microphone (`coreaudio: Could not initialize record`), so the live-mic paths were driven
through the UI only: permission prompt on the first mic tap, the on-device service refusing without a pack, the pack download trigger
(`ModelManagerImpl#triggerModelDownload: en_US` in logcat), whisper listening → transcribing → draft, the S44 screen listening and
ending, read-aloud through Google TTS's embedded voice (`en-us-x-tpf-local`). The iOS simulator has no local speech daemon
(`localspeechrecognition … invalidated`), so system dictation there ends in the error sheet; a device run is still owed for both.

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

## Intentionally not built for 1.0 (one list, 11.9.2026)
Apple FM adapter on device (simulator-only, not sold), encrypted `.sealed` backup + device-to-device transfer (§5.3), side-by-side model
compare (§7.1), keyboard extension, Shortcuts / widgets (§7.7), OCR in the browser tier, NativeWind styling (tokens exist), advanced engine
controls (LAN, multi-model, speculative decoding, GPU / context tuning), Whisper small for Hebrew. Nothing in this list is named on the
paywall, in the store copy or in the legal docs. Everything that was on the 6.9 list and is now built: voice + image input, quick actions,
share targets, Benchmark, Hugging Face search (iOS), and the whole Work tier (profession packs, client vaults, redaction, XLSX/HTML intake,
audit log, signed export).

## Integration round 2 (documents ↔ chat, value moments, legal, shell events) — 6.9.2026
The cross-stream wiring no stream owned, on branch `integrate-r2`:
- **Documents in the chat** (§7.3, §8.2, §8.5): the composer's `+` opens the attach sheet (library rows with attach/detach, the strict switch,
  "Manage documents" → S40); attached files show as chips above the composer with `DOCS ONLY` when strict is on. On send, `useDocumentContext`
  retrieves and fences the passages; strict mode with nothing relevant prints "I could not find that in your documents." without calling the
  model; otherwise the answer carries `<Citations>` chips (tap → passage sheet). Attachments of an incognito chat, or of a chat not created
  yet, live under a `ram:` key that `documents.json` never receives; the first message moves them to the real chat id.
  `ChatMessage.citations` is persisted: schema v3 (`messages.citations_json`), IndexedDB v3, the Tauri repository; the contract test covers
  all three (`apps/mobile/test/`, the desktop one through a sql.js stand-in for the Rust `db_*` commands), plus a v2→v3 migration test.
  The stand-in also caught that the desktop and SQLCipher repositories resolved `updateMessage` on an unknown id; both reject now.
- **Value moments** (§12.3): `paywallFor(tier, moment)` in `packages/core/src/licence/moments.ts` answers every gate the same way (4th persona,
  2nd document, Pro-only model, any feature). Wired at: persona add row, "Add file · PRO" in the library, Sharp's Install in the vault, the mic,
  "Remember this", Memory's add row, Folders, "Export all chats" (new row in the export sheet, Pro exports every saved chat as one Markdown
  file), and every `PRO` tag (tapping one opens `/paywall`). `EXPO_PUBLIC_PRO=1` stays a dev-bundle-only pretence (`DEV_TIER`); release
  bundles read only the licence.
- **Legal in the app**: `/legal/privacy` and `/legal/terms` render `docs/legal/*.md`, bundled as strings by `apps/mobile/metro/mdTransformer.js`
  (no fetch); the paywall's Terms / Privacy links and About point there. The licences page reads `docs/legal/NOTICE.json` (shipped + catalogue
  entries only).
- **Shell events** (§14.4): `new-chat`, `toggle-incognito`, `focus-composer`, `search`, `stop` are handled by the chat screen when it is the one
  in front (`useFocusEffect`), so the drawer's own handlers do not double up. The new-chat sheet's persona travels through
  `AppServices.newChat(incognito, personaId)`; `newChatIntent.ts` is gone.
- **Model delivery banner**: `AppServices` subscribes to the vault; a chat model in `delivering` / `verifying` feeds the §8.8 strip and, while no
  model is loaded, the seal's `loading` state with the pack's progress. When the file lands the engine is reset, re-resolved and the chat
  remounted (first-launch fast-follow case). `switchToInstant` / `switchBack` set the vault default and reload the engine the same way.
- **Web**: the vault record and scan are no-ops on the web (expo-file-system has no web implementation), so the console is clean.
- **Onboarding chip**: Android names the SoC from `Build.SOC_MODEL` (API 31+, `modules/vault-native`) or the model code
  (`androidChipName` in `packages/core/src/device/chip.ts`: "ONEPLUS A6013" → Snapdragon 845, "SM8550" → Snapdragon 8 Gen 2); the emulator
  reports "ranchu" and keeps its model name.
- Paywall presented as a modal skips the top inset on iOS.

Proven 6.9.2026 on the Pixel_6_API_36 emulator (arm64, 6 GB, CPU only), debug APK + Metro, Instant + nomic-embed pushed, the M5a library on the
device (manual200.pdf, 600 passages): attach sheet → chip + `DOCS ONLY` → "What is the rear panel code of the unit?" → retrieval + fenced prompt
(1218 prompt tokens, TTFT 31 s on the emulator CPU, 6.5 tok/s) → answer with `7431-KESTREL` and the chip `[3] manual200.pdf · p.143` → passage
sheet; after `am force-stop` the reopened chat shows the same chip from SQLCipher; the unrelated question in strict mode answered "I could not
find that in your documents." with 0 prompt tokens in 0.6 s; "Add file · PRO" in the library opened the paywall; the paywall's Privacy link
opened the bundled policy; the Settings preview showed "Delivering FAST · 41% of 1.3 GB" on every screen. Gates: typecheck, lint, 202 core +
66 mobile + 4 i18n tests, `web:build` + `web:smoke` (4 passes, 0 vault warnings).

## Work documents: DOCX / XLSX / HTML intake + redaction before sending (spec §7.3 row 8, §7.9) — status 7.9.2026
Branch `work-docs`. Both are Work-tier capabilities (`officeIngest`, `redaction` in `packages/core/src/licence/gates.ts`, unchanged).
- **Intake** (`packages/core/src/rag/extract/`): `xlsx.ts` reads the workbook without a spreadsheet library (sheet list via the
  relationships part, shared + inline strings, formula results, booleans, ISO dates; one sheet = one page, inflated only when its page
  is read) and emits `Sheet · row N: a | b | c` lines; `html.ts` strips markup without a DOM (scripts, styles, `hidden` /
  `display:none` / `aria-hidden` subtrees and comments dropped, so a hidden "ignore previous instructions" never reaches the index),
  keeps `#` headings, `•` / `1.` list items, ` | ` table cells and `<pre>` spacing, and sections the text at h1–h3 into the `§` pages
  a citation points at; DOCX stays the M5a parser (`docx.ts`). `kindOf` routes `.xlsx/.xlsm`, `.html/.htm/.xhtml` and a `.txt` that
  starts with `<!doctype html`; `pageGlyph("xlsx")` is `sheet `, so a chip reads `budget.xlsx · sheet 2`. Both extractors are in the
  native and web extractor lists; the picker offers the two MIME types.
- **Tiering**: a Word file remains the Free single attachment of §7.3 row 1 (as shipped in M5a); Excel and HTML are Work
  (`WORK_KINDS` in `apps/mobile/src/documents/office.ts`, one line to change). The kind is sniffed before the file is copied in: a
  Free/Pro user who picks an Excel or HTML file sees the value-moment card in the library (`office-work-card`: what it does, one
  price line, "See Pro for Work", "Not now"); the file is not imported. The attach sheet gained "Add a file…" (`attach-import`), which
  picks, routes the same way, imports and attaches in one step (`pickIntoLibrary`).
- **Redaction** (`packages/core/src/redaction/`): pure detectors for emails, phones (national / international shapes, `tel:` /
  `נייד` hints; a bare 7-digit number is not a phone), card numbers (Luhn), IBANs (mod-97), Israeli IDs (check digit; nine digits with
  a leading zero read as a landline unless the text says `ת"ז` / ID), SSNs, the user's own names list (Latin case-insensitive on word
  boundaries, Hebrew with one or two clitic prefixes kept outside the placeholder: `ולשרה לוי` → `ול[NAME-1]`) and, opt-in, dates
  (numeric, English and Hebrew month names). Overlaps resolve to the stronger detector. `RedactionSession` numbers placeholders per
  kind (`[EMAIL-1]`, `[PHONE-2]`…), gives the same value the same placeholder in any spelling, `reveal()`s them back in an answer
  (any bracket, any case, `[email 2]` included) and lives in RAM only: one session per chat key
  (`apps/mobile/src/documents/redaction/sessions.ts`), the draft's session follows the first message to the real chat id like
  attachments do, nothing is written to SQLCipher, `documents.json`, exports or backups. The names list and the dates switch are the
  only persisted preferences (`documents.json`).
- **UI**: a chip row above the composer (`RedactBar`): "Redact" while the draft has text, amber "Pasted text · redact before sending?"
  after a paste longer than `PASTE_OFFER_CHARS` (300), and once something was redacted a "Show originals / Hide originals" switch plus
  the `REDACTED` tag. The Redact sheet (`redact-sheet`) lists what was found per kind with switches, the names list (add / remove),
  the dates switch, a preview, "Replace n items" and the memory note. Free/Pro see the locked card with one price line and
  "See Pro for Work". The chat renders every row through `redaction.display(row)`, so user and assistant messages show the originals
  while the switch is on and the placeholders otherwise; the model only ever received the placeholders.
- **Dev bundles**: `EXPO_PUBLIC_PRO=work` pretends to own Work (`DEV_TIER`), next to the existing `EXPO_PUBLIC_PRO=1` for Pro.
- Tests: `packages/core/test/rag-office.test.ts` (xlsx parts, rows, workbook fixture, html tag stripping, sections, sniffing, glyphs),
  `packages/core/test/redaction.test.ts` (checksums, English + Hebrew detection, dates opt-in, session numbering / reveal / clitics),
  `apps/mobile/src/documents/redaction/sessions.test.ts` (per-chat RAM sessions, move on chat creation, forget).
- New keys (English placeholders in de / es / fr / ja / pt-BR): `chat.attach.import`, `chat.attach.importHint`, `documents.office.*`
  (4), `redact.*` (27).

Proven 7.9.2026 on the Pixel_3a_API_33_arm64-v8a emulator (4 GB, CPU only), debug APK + Metro (`EXPO_PUBLIC_PRO=work`, Instant + nomic-embed
pushed, fixtures `lease.docx` / `budget.xlsx` / `policy.html` in the document directory, `EXPO_PUBLIC_AUTOINDEX`): lease.docx 3 sections · 7
passages in 14.9 s, budget.xlsx 2 sheets · 2 passages in 2.7 s, policy.html 6 sections · 6 passages in 2.9 s (SQLCipher store). Ask sheet:
"What was the cloud hosting cost in March?" → `2,275` with the chip `[1] budget.xlsx · sheet 1` (search 341 ms, 997 prompt tokens, answer
15.6 s); "How much is the security deposit in the lease?" → `4,750 shekels, held by Meridian Holdings…` with `lease.docx · §1` first in the
sources (search 467 ms); "Within how many days must a refund request be filed?" → `21 days` with `[1] policy.html · §3` (search 345 ms), and
the page's hidden `<div hidden>` "refund window is 90 days" instruction never reached the index. Redaction in the chat: a message with a
name, Israeli ID, mobile, email, Luhn-valid card and IL IBAN → the sheet counted 1 of each, "David Levi" added to the names list, "Replace 6
items" → the composer holds `[NAME-1]`, `[ID-1]`, `[PHONE-1]`, `[EMAIL-1]`, `[CARD-1]`, `[IBAN-1]`; the model's reply began "Dear [NAME-1]"
(TTFT 4.8 s, 6.3 tok/s); "Show originals" rendered "Dear David Levi" and the original numbers in both bubbles; after a restart the chat's
title still reads `[NAME-1], ID [ID-1]` (only placeholders were saved). Free: the Redact chip opens the locked card with `$69.99 · one-time
purchase` and "See Pro for Work". Pro: picking `budget.xlsx` in the library shows the Excel/HTML card with the same price line and imports
nothing. Work: "Add a file…" in the attach sheet → system picker → `policy.html` indexed in 4.5 s and attached as a chip. One caveat from the
run: on the very first import the DOCX read back as 0 bytes right after its copy and was recorded "empty"; the library now retries such a
read once (400 ms) and the next two clean runs indexed it first time. The "pasted text" amber chip could not be exercised over adb (it types
character by character); the threshold logic is covered by the composer's `onChange` and `PASTE_OFFER_CHARS`. Gates: typecheck, lint,
312 core + 82 mobile + 4 i18n + 8 ui tests, `export:web`.

## Design fixes (review 6.9.2026, `docs/design/review-2026-09-06.md`) — status 6.9.2026
What changed, numbered as in the review:
1–2. **IBM Plex ships.** Plex Sans Regular/Medium/SemiBold + Plex Mono Regular/Medium (OFL 1.1, from the official IBM/plex
   releases) live in `apps/mobile/assets/fonts` (TTF, native via `expo-font` `useFonts` in the root layout; the sealed-ring
   splash stays until they register) and `apps/mobile/public/fonts` (woff2, `@font-face` in `public/index.html`, the Expo web
   template, so the web origin and the Tauri desktop bundle serve them same-origin; the service worker precaches them). One
   type module for every surface: `packages/ui` `fonts` (web stacks ending in `sans-serif` / `monospace`), `fontFaces`
   (one registered face per weight; Android cannot pick a weight inside a custom family) and `fontFace()`, consumed by
   `apps/mobile/src/services/type.ts` (`font()` for a face, `useType()` for the §9.3 scale). Chat, vault, paywall, ledger,
   markdown, legal and the shell all use it; no `fontFamily` string is written anywhere else.
3. **Native chrome (§9.7)** in `components/shell/NativeChrome.tsx`: on iOS 26+ (`expo-glass-effect` `isLiquidGlassAvailable`)
   the chat header + composer bar and every shell header are `GlassView` bars floating over the scrolling content; below 26
   they are plain surfaces. Android gets an M3 Expressive floating toolbar (detached pill, hairline) for the chat and drawer
   headers and an extended new-chat FAB whose corners morph 16→28 on an expressive spring (reduced motion: no spring).
   SDK 57 ships no native M3 toolbar/FAB module and the app has no tab bar (`expo-router` native tabs unused), so the
   Android chrome is drawn in-app; dynamic colour never touches a semantic surface because no Material theme is used.
4–5. **One green.** The context meter is neutral (`text3`) below 80 %, accent from 80 %, danger from 92 %; every switch is
   the `Toggle` primitive (neutral track), the sealed green stays with the seal.
   On the web the same primitive needs `activeTrackColor` / `activeThumbColor` (react-native-web ignores RN's `trackColor` object for the
   ON thumb and paints its own teal); fixed and re-shot in the review-fixes round below.
6–8. **Icons.** `packages/ui/src/icons` (14 Lucide paths, ISC) replaces every text glyph: back/chevrons mirror in RTL
   (`I18nManager.isRTL` → `scaleX(-1)`), airplane, incognito, mic, send, stop, attach, close, check, pin, upload. Attach/mic
   in `text2`, dimmed to `DISABLED_OPACITY` while they wait for M5.
9–11. Disclaimer on the caption step; **Text size** goes to 200 % on every surface (web too) through `useType()` and is set
   once from prefs (`applyTextScale`); `onDanger` token replaces the hardcoded whites.
Vault on the web: `/vault` renders the web door (`VaultEntry.web.tsx`: browser tier, model file, OPFS storage) instead of
constructing the native store; `scripts/web-smoke.mjs` now visits `/vault` and fails on any page error.
Dev-only: Settings › Advanced › "Force RTL layout" toggles `I18nManager.forceRTL` and reloads.

Verify: `pnpm typecheck && pnpm test && pnpm lint && pnpm web:build && pnpm web:smoke`; on device see the report in the
merge commit (iPhone 15 Pro / iOS 17.0 simulator, iOS 26 simulator for glass, Pixel_4_API_33).

## Design round 2 (sign-off 6.9.2026, `docs/design/signoff-2026-09-06.md`) — status 7.9.2026
The sign-off ran on `cbb3810`, before the design-fixes merge, so PC-1 (native chrome), CM-1 (meter colour) and SW-1 (switch
track) were already on `main`; this round closes what was still open and finishes §9.7:
- **§9.7 sheets, menus, popovers.** `NativeChrome.tsx` exports `GlassFill` (a `GlassView` under the panel, iOS 26 only),
  `panelColor()` (the surface at 72 % alpha over the glass so body text keeps contrast; opaque elsewhere) and `panelStyle`
  (clips the glass to the panel's corners). Both `Sheet` primitives and the six bespoke panels (new-chat menu, model details,
  vault confirm, document details, passage sheet, licence key) use them; nothing changes on Android, iOS < 26 or web.
- **VA-2** the vault "recommended" line is the `monoLabel` step (uppercase, tracked) in the accent colour: the interpolated
  device noun is uppercased with the rest, and the sealed green stays with the seal (§9.9).
- **SC-1** the chat header model chip no longer shrinks; from a combined text scale of 150 % (`compactChrome()` in
  `packages/ui`, unit-tested) the header drops the seal caption (the ring and its accessibility label still say SEALED), so
  "INSTANT" is never truncated at 200 %.
- **Full-context banner at 200 %.** The banner text had `flex: 1` (basis 0) beside a `Pressable` whose default `flexShrink`
  is 0, so the button's intrinsic width took the row and the text got zero width (one clipped glyph per line, a tall empty
  card). The row now wraps and the text keeps a 180 pt basis, so the button drops under the text at large sizes.
- Verified 7.9.2026 on Pixel_6_API_36 (Android 16, arm64, dev build + Metro, real Instant model) and iPhone 17 Pro iOS 26.3
  (Debug, `SWIFT_VERSION=5.0`, Metro): chat header / floating toolbar / FAB, model card, context meter at 30 / 85 / 100 %
  (local `nCtx` override, not committed), switches off/on, both themes, 100 % and 200 %.

## Package ids
`com.inbornapp.mobile` (iOS + Android) and `com.inbornapp.desktop`, confirmed by Moshe on 3.9.2026.

## Play internal testing (spec §14.1 "real store delivery") — status 6.9.2026
Play limits (compressed download size, [Play Console Help: app size limits](https://support.google.com/googleplay/android-developer/answer/9859372)):
base module 500 MB, one asset pack 1.5 GB, base + install-time packs 4 GB, fast-follow + on-demand packs 30 GB
cumulative, 100 packs per bundle. Rule for Inborn: every pack is one file under 1.5 GB, all packs are fast-follow or
on-demand (none install-time), so the caps that bind are 1.5 GB per pack and 30 GB for all packs together. Sharp is two
packs since fixes-r4a (`inborn_model_sharp` 1.40 GB + `inborn_model_sharp_2` 1.34 GB; the vault joins the shards, see
"Android release blockers"). All seven packs: Instant 0.53 + Fast 1.28 + embed 0.27 + speech 0.15 + vision 0.20 + Sharp
1.40 + 1.34 = 5.18 GB, every tier stays on Play; the full AAB is base (~60 MB) + 5.18 GB.

**Pack subset.** `INBORN_PACKS=instant,fast` (keys of `ALL_PACKS` in `apps/mobile/app.config.ts`; unset = all six: instant, fast, embed, sharp, speech, vision)
limits what `plugins/withAssetPacks.js` declares. The internal-testing bundle ships Instant (fast-follow, 532 MB) and
Fast (on-demand, 1.28 GB). `INBORN_VERSION_CODE` sets `android.versionCode` (Play refuses a code it already has;
`node scripts/play-upload.mjs --next-version-code` prints the next free one).

**Upload key.** `~/.inborn/keys/inborn-upload.jks` (PKCS12, alias `inborn-upload`, RSA 2048, valid to 2056), created
with `keytool -genkeypair`; its password is the Keychain item `inborn-upload-key` (accounts `store-password` and
`key-password`). Nothing of it is in the repo. `plugins/withUploadSigning.js` adds a `release` signing config that
reads `INBORN_UPLOAD_KEYSTORE`, `INBORN_UPLOAD_KEY_ALIAS`, `INBORN_UPLOAD_STORE_PASSWORD`, `INBORN_UPLOAD_KEY_PASSWORD`
from the Gradle environment and falls back to the debug keystore when the first is unset. `scripts/play-signing-env.sh`
prints the four exports from the Keychain. Play App Signing holds the app signing key; this key only signs uploads.

**Publisher API.** `scripts/play-upload.mjs` (no dependencies) does `edits.insert` → resumable `edits.bundles.upload`
(64 MiB chunks, resume on 5xx) → `edits.tracks.update` → `edits.commit`. The service account comes from
`INBORN_PLAY_SA_JSON=<file>` or `INBORN_PLAY_SA_KEYCHAIN=<service>:<account>`; on this Mac the Bible apps' account
(`google-play@bible-commentary-13d9a.iam.gserviceaccount.com`, Keychain `store-reviews` / `play-service-account`)
already has access to the Inborn app.

```
cd apps/mobile
INBORN_MODELS_DIR=/Users/moshecohen/dev/inborn/.models INBORN_PACKS=instant,fast INBORN_VERSION_CODE=$(node ../../scripts/play-upload.mjs --next-version-code) \
  npx expo prebuild -p android --no-install
cd android && eval "$(../../../scripts/play-signing-env.sh)" && ./gradlew bundleRelease -PreactNativeArchitectures=arm64-v8a
AAB=app/build/outputs/bundle/release/app-release.aab; BT=/Users/moshecohen/dev/inborn/.tools/bundletool-all-1.18.3.jar
java -jar $BT validate --bundle=$AAB && BUNDLETOOL=$BT ../../../scripts/check-android-permissions.sh $AAB
INBORN_PLAY_SA_KEYCHAIN=store-reviews:play-service-account node ../../../scripts/play-upload.mjs --aab $AAB --track internal --status completed
```
One-time products (Pro / Pro launch / Work / Work upgrade) live in Play through `scripts/play-products.mjs` (same
credentials; `--list`, `--dry-run`): the new `monetization.onetimeproducts` API (the legacy `inappproducts` endpoint
answers 403 for this app), US price as the base and Play's own regional conversion for the rest, six listings each,
idempotent. Licence testers (account-level, Play Console → Settings → Licence testing) and the internal-track tester
list are console-only; the app's Play licensing public key is committed in `packages/core/src/licence/roots.ts`
(an empty key makes every real purchase fail with `untrusted-root`).
arm64-v8a only: Play accepts it (64-bit is the requirement) and every test phone is arm64; add `armeabi-v7a` before a
wider rollout.

First run, 6.9.2026: AAB 1,864,941,810 bytes (base + Instant 532 MB + Fast 1.28 GB; 4.10 GB uncompressed), signed by
`CN=Inborn Upload Key` (SHA-256 `E7:02:C9:A9:…:ED:CD`), `bundletool validate` OK, permission gate "OK: no INTERNET
permission", manifests: base minSdk 24 / targetSdk 36 / versionCode 1 / versionName 1.0.0, `inborn_model` fast-follow,
`inborn_model_fast` on-demand. Uploaded as edit `13076337155671403999`: bundle versionCode 1 (sha256 `f735907f…49e7d4`),
track `internal` release "1.0.0 (1) internal" status `completed`, committed. Play App Signing was enrolled by that first
upload with a Google-generated app signing key. Testers are managed in Play Console → Testing → Internal testing
(no tester list was created by the script); the full 6-minute build once failed in `:app:signReleaseBundle` while the
Mac was low on memory and passed on rerun.

## Legal, compliance, QA and launch docs (legal-docs stream)
Docs only, no app code. Everything the spec promises "lives in the repo" for §10–§11, §13.5, §14.7, §15:
- `docs/legal/` — `privacy-policy.md` (store + website text, per-platform network list), `terms.md` (EULA, one-time Pro/Work, Family Sharing, refunds via stores, AI disclaimer), `ai-act-notes.md` (Art. 50 duties; Inborn launches after 2.8.2026 so the 2.12.2026 grace does not apply), `licenses.md` + `NOTICE.json` (every model/native/JS component with licence, attribution, obligations; nothing conflicts with a closed Pro app), `app-privacy-details.md` (Apple "Data Not Collected" reasoning, `PrivacyInfo.xcprivacy` content from the manifests actually in node_modules, Play Data safety, AI-content policy, age-rating answers, review notes).
- `docs/qa/` — `release-checklist.md` (the 40 tests T01–T40 with commands, pass criteria and which of our devices can run each) and `edge-cases-matrix.md` (all 70 §10 cases → test ids; status column for the lead).
- `docs/ops/` — `metrics-without-sdk.md` (sources, gates A/B/C, weekly routine, template), `trademark-watch.md` + `com.inbornapp.tm-watch.plist` (monthly `scripts/tm-watch.sh`, not installed; inborn.app expiry 25.10.2026; EU/US/UK filing costs), `developer-account.md` (neutral developer name, App Transfer at gate C).
- `docs/launch/launch-plan.md` — Product Hunt / Show HN / Reddit / creator / promo-code / ASA+UAC drafts. Nothing sent.
Verified: `plutil -lint` on the plist, `NOTICE.json` parses; licence inventory from `pnpm licenses list --json` (534 packages, 447 MIT). `scripts/tm-watch.sh Inborn` run 6.9.2026: 264 TMview results, 0 identical live marks in classes 9/42 at EM/US/GB/WO (exit 0).

## Website (staging, spec §13.4 / §11.3 / §3.3–3.4) — status 6.9.2026
`apps/site/` is the static site: plain HTML + CSS, **zero JavaScript in the output, zero third-party requests**, IBM Plex self-hosted from `apps/site/public/fonts` (copies of `apps/mobile/public/fonts`). `privacy.html` and `terms.html` are rendered at build time from `docs/legal/privacy-policy.md` and `docs/legal/terms.md` (minimal Markdown renderer in `build.mjs`; the "Notes for the maintainer" sections never ship; `{{PLACEHOLDER}}` tokens render as visible chips until filled at launch, `{{PRIVACY_URL}}` resolves to `/privacy`). `licenses.html` is rendered from `docs/legal/NOTICE.json`. Hand-written pages: `index` (thesis, three messages, three proofs, tiers, store badge placeholders), `proof` (airplane test, Play permissions page, App Privacy Report, exit meter, firewall, what-can-leave list, release-hash table), `support` (in-app Report, common fixes, refunds via stores, contact placeholders: no support address is invented), `404`. `public/_headers` sets `Content-Security-Policy: default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self' data:` plus nosniff / no-referrer / frame-ancestors none.

- Build: `pnpm --filter @inborn/site build` → `apps/site/dist` (7 pages + sitemap.xml, robots.txt, favicon.svg, icons from `design/icon`).
- Gate: `pnpm --filter @inborn/site check` fails on any `<script>`, any off-origin asset, any dead internal link, a missing meta description or `lang`, or a CSP that does not start from `default-src 'none'`.
- Deploy (staging, `inborn-site.pages.dev`, no custom domain): `CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=9de3aac0325f2ec6294e00714a0772b7 pnpm --filter @inborn/site deploy`. The token needs **Account → Cloudflare Pages → Edit**; the Keychain token `CLOUDFLARE_CLAUDE_LOCAL` is zone-scoped only and gets `Authentication error [code: 10000]` on `/accounts/…/pages/projects` (6.9.2026), so the first deploy is pending a token with that permission. `SITE_ORIGIN` overrides the canonical/sitemap origin.
- Verified locally 6.9.2026: build + check pass; headless Chromium (playwright-core) rendered all 7 pages at 1280 px dark and 390 px light with 0 external requests; `eslint apps/site` clean.
- Deliberately not built yet: the SEO guides and the Models page from §13.4 (skeleton only), Cloudflare Web Analytics (opt-in later, §15), custom domain / production DNS.

## Review fixes round 3 (MosheAI final review, 6.9.2026) — branch `fixes-r3`
- **Honest paywall** (§2.3, §12.3): `PAYWALL_BULLETS` lists only shipped capabilities: unlimited documents + OCR with citations, unlimited
  personas + memory, folders + export all, the Sharp models, and the voice line (marked in `VOICE_LINES`). Backup, keyboard extension, advanced
  controls and the whole Work list are gone from the copy. Work has no capability of its own on main, so `sellable("work")` is false and the
  Work card is not offered (the gate map, products and owned-state stay; the card returns with its first real feature). Core test
  `licence-gates.test.ts` pins every bullet to an `en.json` key.
- **Proof on the web** (§3.4, §8.9): "Last delivery" reads the OPFS model (`src/proof/webDelivery.ts`): name, bytes, the origin the tab fetched
  it from and whether the stored sha256 equals the manifest's. The download worker's fetch never appears in the page's resource timing, so the
  finished download is recorded in `localStorage` (`src/web/transfers.ts`) and seeded into the session `NetworkLog`: the meter shows
  `OUT 0 B · IN <model size>` and the log lists the transfer.
- **Web toggles** are neutral on the web too (see design fix 4–5).
- **Airplane test** asks the model for one or two plain sentences (S03 shows "391.") and renders the answer through the chat `Markdown`, so a
  table can never appear as raw pipes.
- **{device} wording** (§9.9): `lib/deviceNoun.ts` (phone / tablet / computer / browser from the guard's device class) feeds the shared strings
  (`onboarding.headline`, `chats.emptyHint`, `chat.canBeWrong`, `memory.explain`, `report.explain`, `onboarding.sealed.line`,
  `onboarding.slowDevice`, `documents.state.needsOcr`, `models.recommended`); the five locales inflect with an ICU `select`.
- Docs: one "not built" list above, privacy policy §3 web row says the model is served from the page's own origin, the store README documents
  `voice_lines`.

## Store screenshots (spec §13.3) — status 6.9.2026
`design/store/` renders the six store screens per language from the real app, not mockups:
```
node design/store/build.mjs            # dev APK, store-build APK (no INTERNET), iOS simulator app → design/store/raw/
node design/store/capture.mjs          # Pixel_6_API_33 + iPhone 15 Pro Max (iOS 17.0) + iPad Pro 13" (iOS 17.5), en + ja/de/fr/es/pt-BR/ko/zh-Hant
node design/store/compose.mjs          # design/store/out/<apple|play>/<locale>/<set>/NN-<screen>.png + out/preview.html
```
- Copy comes from `docs/store/listing.<locale>.json` (`screenshots[]`), fonts from `design/store/fonts/` (IBM Plex Sans/Mono/Sans JP TTFs
  from the official IBM releases, OFL, gitignored; download them there before composing).
- capture.mjs drives the app through deep links and the existing dev hooks (`EXPO_PUBLIC_AUTOPROMPT`, `AUTOINDEX`, `AUTOASK`, one Metro per
  locale on port 8095 so other worktrees' Metro on 8081 is untouched), writes `prefs.json` into the app container per locale, taps the
  few things that need a finger (the first-run notice, the passcode) with uiautomator on Android and `idb` on the simulators
  (`brew install idb-companion` from the facebook/fb tap + `pipx install fb-idb`), and pushes the Instant model, the nomic embedder and a
  generated three-page lease PDF as the documents fixture. Android runs in real airplane mode (the status bar shows it); the Proof screen
  on Android is captured from the store build after a clean uninstall, so the kernel counter reads OUT 0 B and Internet is
  "none (not in the manifest)"; on iOS the dev build's Proof screen is the honest one already (log meter, no Internet permission concept).
- Sets: Apple 6.9" 1320×2868, 6.5" 1284×2778, iPad 13" 2064×2752 (real iPad capture); Play phone 1080×1920, 7" 1200×1920 and 10"
  1600×2560 (the phone capture on a tablet canvas, noted on the panel until there is an Android tablet capture), feature graphic 1024×500.
- Only the English set is committed (`out/apple/en`, `out/play/en`, `out/preview.html`); other locales and raw captures are regenerated.

## QA bug fixes round 4b (`docs/qa/qa-run-2026-09-06.md` B7–B13, B17) — branch `fixes-r4b`
- **B7 wipe** deletes every Keychain / Keystore item: `src/storage/secureItems.ts` is the single list (db key, lock passcode) that the
  passcode store, the SQLCipher key and `wipe.native.ts` all use; `AppLock.refresh()` re-reads it after a wipe so Settings shows "Set a
  passcode" again (Pixel_4 emulator: SecureStore.xml held both items, after the wipe only the fresh db key; Settings row back to "Set a passcode").
- **B8 background mid-generation**: the guard's pause (`wasStoppedByGuard`) now counts as a system stop, so the partial answer gets the inline
  "The system stopped generation · Continue"; the §8.8 strip shows "Paused while Inborn was in the background" with CONTINUE, which accepts the
  guard line and fires the `continue` shortcut the chat screen handles. Emulator: 600-word essay, Home after 6 s, back after 22 s → banner +
  CONTINUE → the essay resumed (second `[stats]` run at 14 tok/s).
- **B9** the passcode sheet catches a failed `setPasscode()` and shows `passcode.saveFailed` with the OS error instead of four silent dots.
- **B10 iOS 26 glass composer**: `maintainVisibleContentPosition` pinned index 0 while the list was empty, so the bar inset the list grew by was
  scrolled straight back under the composer; it is off for the empty list, and the chat re-anchors the end when the floating bar grows.
  `ChromeBar` measures with a plain View (the glass fills it underneath). iPhone 17 Pro / iOS 26.3 Release build: the three chips sit above the bar.
- **B11 contrast**: `text3` is `#7A8794` (dark) / `#5E6975` (light); `contrastRatio()` in `packages/ui` and a test keep text/text2/text3 ≥ 4.5:1
  on bg, surface1, surface2 and well in both schemes.
- **B12 Settings › Reports** (`src/screens/Settings/Reports.tsx`, `/settings/reports`): every saved report with reason, date and size; a detail
  sheet with "Email report" (share sheet, `reportText()` in core, also used by the chat) and "Delete report". Nothing is sent by the app.
- **B13**: the Wi-Fi-only and lock switches carry `accessibilityLabel`; the composer no longer doubles its placeholder as a label.
- **B17**: `.gguf` files in `Documents/models` that no catalog part, import or download owns are listed as `FILE · <name>` with
  "Unverified file in the vault folder", counted in the vault header and in Settings › Storage, and removable; never loaded.
- New i18n keys (English placeholders in the five locales until translated): `passcode.saveFailed`, `state.pausedInBackground`,
  `reports.title|row|explain|empty|emailNote|delete`, `vault.stray.label|status`.
- Emulator traps met on the way: Pixel_4 needs `-memory 4096` (2 GB gets the app killed while the model loads); the simulator's dyld shared
  cache can break under host memory pressure (`_dyld_sim_prepare` SIGBUS at launch): shut the simulator down and boot it again.

## Pro for Work on mobile (work-tier, spec §7.5–§7.9, §8.7, §12.1–§12.3) — status 7.9.2026
Work is real on the phone, so the paywall shows it: Pro card first, Work below with the "For professionals" tag (both always visible, §12.2
anchor), Pro owners see the $49.99 upgrade card. Bullets are only what ships (`PAYWALL_BULLETS.work`): vaults, audit log, signed export,
profession packs, architecture statement; redaction and office intake join when the work-docs stream lands. `sellable()` stays the guard.
- **Core** (`packages/core/src/work/`, 27 vitest tests in `test/work-*.test.ts`): `vault.ts` (folder + own passcode: per-vault salt, SHA-256
  hash, never the code; session rule: closes when the app lock engages or after 30 min), `audit.ts` (append-only, hash-chained entries: who/when/
  what, never message content; `verifyAudit` detects edits, removals, reordering and truncation against the head mirrored in the vault record),
  `signedRecord.ts` (chat → canonical JSON → SHA-256 → Ed25519 with a per-install key; the public key rides in the file; `verifyRecord`, a
  Markdown companion, and verification instructions whose Node one-liner the test really runs), `packs/*.json` + `packs.ts` (legal, therapy,
  medical, accounting: a declaration each and 4 templates with `{{placeholders}}`; a test asserts no "HIPAA-compliant / privileged / certified /
  guarantee" wording), `statement.ts` (dated architecture statement per platform, vaults and signing key listed, explicit non-claims).
  `licence/cache.ts` now exposes `sealJson`/`openJson` with a domain label, so audit files and the entitlement cache use unrelated keys.
- **Phone** (`apps/mobile/src/work/`): `WorkStore` (vault records + signing seed in the Keychain/Keystore, both in `SECURE_ITEMS` so the wipe
  removes them; sealed audit files under `Documents/work/`; unlocked set in memory, relocked by `useWork()` when `lock.locked` flips),
  `VaultCodeSheet`, `TemplatesSheet` (pack → declaration → template → blanks → insert into the composer), `WorkTag`; screens under
  `screens/Work/` + routes `/work/audit`, `/work/verify`, `/work/statement` (Settings → Pro for Work). Chats list: VAULT / LOCKED chip on the
  folder header (tap = lock / ask the code), hidden chats while locked, "Vault / Code / Unvault" on the folder rows, moves in and out logged;
  Export sheet: "Signed record" (.json, then a readable .md of the same record); Attach sheet: "Templates". Free/Pro see the value moment
  (preview + one price line + WORK tag, §12.3), no popups. Dev bundles: `EXPO_PUBLIC_TIER=pro|work` pretends a tier (`LicenceManager.pretendTier`).
- **Not built here**: DOCX/XLSX/HTML intake and the redaction sheet (work-docs stream), documents inside vaults, PDF rendering (the statement and
  the readable record are Markdown handed to the OS share sheet), the Modal sheets do not move for the Android keyboard (app-wide, also the
  app-lock and folder sheets): typing works, the field is hidden until the keyboard is dismissed.

Verified 7.9.2026 on a private `Pixel_3a_API_33_arm64-v8a` instance (`-memory 4096`, the two assigned AVDs were both in use by other streams), Debug
APK + Metro on a private port: paywall Free (Pro first, Work below, five Work lines), paywall as Pro owner (You own Pro + Upgrade to Work $49.99),
template picked from the Legal pack with one blank filled and inserted into the composer, folder "Client A" made a vault (code set twice), chat
moved in (VAULT badge), locked from the badge (chat hidden, "1 chats · locked"), wrong code refused, right code unlocks, relaunch relocks, signed
record exported through the share sheet and the pulled `.json` verified VALID by the Node snippet (tampered copy INVALID), audit log screen
"Chain verified · 5 entries" (created, moved in, locked, unlocked, signed export), architecture statement rendered, templates as Free show the
price line + WORK tag.

## Keyboard never hides the field (Moshe 7.9.2026: "when the keyboard opens you must see what you type") — branch `sheets-keyboard`
- One mechanism, app-wide: `src/lib/keyboard.ts` `useKeyboardLift()` listens to the RN `Keyboard` events and returns the keyboard top above the
  window bottom (Android reports the IME above the navigation bar, so the bar inset is added; iOS from the screen edge; 0 on web). The pure
  geometry lives in `src/lib/keyboardLayout.ts` (`keyboardLift`, `sheetGeometry`) with 5 vitest cases.
- Where it is applied: both bottom-sheet primitives (`components/chat/Sheet.tsx`, `components/shell/Sheet.tsx`: `bottom` = lift, safe inset
  dropped while the keyboard covers it, `maxHeight` capped to the visible room, scroll body `flexShrink: 1`), the `Screen` primitive (root pads
  by the lift so the scroll view shrinks and Android scrolls the focused field into view), the chat root (replaces `KeyboardAvoidingView`,
  which added the keyboard height on top of the safe inset) plus the iOS 26 glass composer overlay (`bottom: lift`; Yoga does not offset
  absolute children by the parent's padding), the rename dialog and the licence-key dialog (centred in the room above the keyboard) and the
  Ask-documents modal. Every Modal-based sheet (folder, vault code, passcode, persona, memory, report, templates, redaction, chat settings)
  inherits it from the primitives; no new dependency.
- Verified with the keyboard open on Pixel_6_API_33 (edge-to-edge, own AVD, dark + light + 200 % text) and iPhone 17 Pro / iOS 26.3 Release
  (dark + light 200 %): New folder, vault code, passcode, persona (last field), memory, report, templates blanks, redact names, chat settings
  prompt, rename, composer (last message stays visible above it), airplane test, verify record. Long forms at 200 % keep the focused field
  visible; the Save button below it is one scroll away inside the sheet.
- Not reachable on a phone: the licence-key dialog exists only for the web/desktop store (`store === "licence-key"`); Ask documents needs the
  262 MB embedder and shares the chat root's padding, so it is covered by the same code path, not by a screenshot.

## Android release blockers (QA run 6.9.2026 B1/B2/B3/B5/B14/B16/B18/B19, branch fixes-r4a) — status 7.9.2026
- **B1 16 KB pages**: `modules/doc-extract` now depends on `cz.adaptech.tesseract4android:tesseract4android:4.9.0` (JitPack;
  4.8.0 added 16 KB page-size support, NDK r27c). Proof on the release APK: every `lib/arm64-v8a/*.so` LOAD segment
  aligned 0x4000 (`llvm-readelf -l`, the four OCR libs included), `zipalign -c -P 16 -v` OK, and a launch on the API 36.1
  `google_apis_ps16k` emulator with no "isn't 16 KB compatible" dialog. Measured 7.9.2026 on the release AAB (1,870,410,071 bytes, Instant + Fast
  packs, arm64-v8a, signed by the upload key): 45 of 45 `.so` files at 0x4000 (4.7.0 had libtesseract/libleptonica/libjpeg/libpngx
  at 0x1000), `zipalign -c -P 16` OK for `base-master.apk` and `base-arm64_v8a.apk`. Emulator `qa_ps16k` (API 36.1 google_apis_ps16k, `getconf PAGE_SIZE` = 16384), release splits installed via
  bundletool local testing, 7.9.2026 08:15: welcome screen up, focus on MainActivity, no compat dialog, logcat has no
  page-size/ELF-alignment line (`scratchpad ps16k-3.png`). Also launched clean on the OnePlus 11 (Android 16, 4 KB kernel).
- **B2 permissions**: allowlist gate + blocked permissions (section above). Gate output on the release AAB (7.9.2026): "OK: no INTERNET permission; every declared
  permission is in the allowlist (9 declared)" — BILLING, FOREGROUND_SERVICE, FOREGROUND_SERVICE_DATA_SYNC, ACCESS_NETWORK_STATE,
  USE_BIOMETRIC, VIBRATE, RECORD_AUDIO, CAMERA, DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION. `bundletool validate` OK; merged
  manifest minSdk 26 / targetSdk 36 / allowBackup false.
- **B3 backup**: `android.allowBackup: false` in `app.config.ts`; merged manifest `android:allowBackup="false"`.
- **B5 packs**: one Play pack per shard. `app.config.ts` `ALL_PACKS` maps a tier key to a list of packs; the catalog
  (`packages/core/src/catalog/manifest.json`, re-signed) lists one `play-asset-pack` delivery per shard with its `file`;
  `src/vault/playDelivery.ts` fetches the packs one after another (one cumulative progress bar) and, when the shards live
  in different pack directories, links them into `Documents/assetpacks-joined/<model>/` through the new
  `linkInto` function of `modules/asset-packs` (`Os.symlink`; llama.cpp opens the first shard and finds the second beside
  it). Relinked on every locate because Play may move a pack; `remove` deletes the join directory.
- **B14 status bar**: not reproduced on this build — ps16k emulator, system night mode, welcome screen: clock and icons
  render light on the dark background (`ps16k-dark.png`). No code change; if QA still sees it, record the screen and
  whether the app theme override (Settings → Appearance) or system dark mode was in use.
- **B16 onboarding model step**: `ModelChoice` reads `useInstalledModel()` (vault subscription) instead of the engine once,
  so the card flips to "Instant · built in" the moment the fast-follow pack is extracted. **Not proven on a device**:
  on the ps16k emulator the fast-follow pack never arrived in 4 minutes (bundletool local testing pushed
  `inborn_model-master.apk` to `/sdcard/…/local_testing/`, but no Play Core / WorkManager / `[inborn]` line ever appeared
  for the app process and the step stayed "No model on this device"). The 5.9 README run proved this path with WAKE_LOCK
  still declared; whether blocking WAKE_LOCK/RECEIVE_BOOT_COMPLETED stops Play Core's extraction worker is the open
  question — re-test on the OnePlus 6T (local testing) or through the Play internal track before release; if extraction
  needs it, move WAKE_LOCK back to the allowlist with that justification.
- **B18** duplicate `expo-iap` was already removed on main. **B19** `plugins/withMinSdk.js` writes
  `android.minSdkVersion=26` into gradle.properties (merged manifest minSdk 26).
- Build note: `gradlew --stop` from any other worktree kills a running build (daemons are per Gradle version, not per
  project). Build with `GRADLE_USER_HOME=~/.gradle-r4a` (APFS-cloned `caches/modules-2` + `wrapper`, instant) or agree on a
  no-`--stop` rule while several streams build.


## Models run on the OnePlus 6T (spec §5, §6.3–6.5, branch `models-verify`) — status 7.9.2026

Every catalog entry (Instant, Fast, Sharp two-shard, Sharp-Phi, nomic embed, whisper base, vision mmproj) plus an external GGUF import was installed through the vault's HTTPS path with SHA-256 verification and exercised on the OnePlus 6T (Snapdragon 845, 8 GB, Android 11). Full table, defects and repro: `docs/qa/models-run-2026-09-06.md`.

- Numbers: Instant 12–15.5 tok/s (TTFT 2–10 s), Fast 5–5.8 tok/s (TTFT 3–24 s), Sharp 1.3–2.5 tok/s (load 12.5 s, TTFT 20–102 s, PSS 3.6 GB), Phi-4-mini 2.2–2.9 tok/s, vision answer after 61 s image encoding, whisper 7 s per 4 s clip (EN exact, HE near-exact), PDF question answered correctly with sources in 20 s.
- Fixed here: false thermal "critical" on the 6T (stuck SHUTDOWN status, battery 24 °C) that stopped answers and crashed the app on unload, llama.rn release-while-computing SIGSEGV, sharded Sharp forgotten after relaunch, engine not reloaded when an installed model became active, import hashing a half-copied file, SD845 rated as a Pixel 9 (chip-aware class), "7 GB" vs "8 GB" RAM label.
- Driving a phone whose touch input adb cannot reach: `EXPO_PUBLIC_AUTOPROMPT=file` (Chat consumes `Documents/dev-prompt.txt`; `image:<name>` attaches, `/scroll` scrolls) and `EXPO_PUBLIC_AUTOINSTALL=file` (vault consumes `Documents/dev-vault.txt`: `install|use|remove <id>`, `import <uri>`); `EXPO_PUBLIC_MODELS_BASE_URL` now also switches Android dev builds to HTTPS delivery (`scripts/serve-models.mjs` over `adb reverse`), with `Documents/instant.gguf` adopted as the bundled stand-in.
## Model-run fixes round 5 (OnePlus 6T models verification, 7.9.2026) — branch `fixes-r5`
Five defects from the models run, each reproduced on a private Pixel 6 API 33 emulator clone (7.6 GB guest RAM, Metro on a private port) before the fix:
1. **Stale engine after an install** (`src/services/AppServices.tsx`): the vault re-resolves its active model after every install (a newly installed FAST outranks INSTANT when no default is set), but the engine only reloaded when it held the NullLM. The vault subscription now compares the engine's file with `activeModel().path` and reloads between answers (`reloadWhenIdle`, never mid-stream, §6.5). Proven: INSTANT loaded → FAST installed → log `engine unloaded (switch)` → `llama.rn loaded …Qwen3.5-2B… in 2275 ms`, header chip FAST.
2. **7 GB vs 8 GB** (`packages/core/src/device/chip.ts`, `src/vault/device.ts`, `src/screens/Onboarding/deviceLine.ts`): onboarding rounded the raw bytes (`Math.round(7.17 GiB)` → 7) while the vault used the marketing steps (→ 8). One reading (`ramBytes()`, dev override included) and one rounding rule (`marketingRamGB`, now in core) feed both screens.
3. **Table clipped, no horizontal scroll** (`src/components/chat/Markdown.tsx`): a `selectable` Text on Android tells its parent not to intercept touches, so a drag over table cells (and code lines) never reached the horizontal ScrollView; the header row (not selectable) scrolled, the body rows did not. Cells and code text are selectable on iOS only.
4. **Answer not followed on Android** (`src/screens/Chat.tsx`): two causes measured with a scroll log. With `maintainVisibleContentPosition` on Android the native offset advanced per token while the view stayed pinned; without it the animated send scroll lands short (new cells unmeasured), the 100 px `nearBottom` check goes false and no follow-up scroll runs. MVCP is now iOS-only (its purpose is the floating-bar inset) and a `follow` flag, set on send and cleared only by the user's own drag, drives the per-token `scrollToEnd`. Verified keyboard open (second answer in a long chat) and keyboard closed (first answer).
5. **Speed estimates** (`packages/core/src/catalog/speed.ts`): RAM alone put the 8 GB Snapdragon 845 in `android-high` (18–28 / 10–14 tok/s). New `android-legacy` class for LPDDR4X flagships (Snapdragon 845/855/865, resolved from `androidChipName`): Instant 12–18, Fast 5–7, Sharp 3–4 tok/s, holding the measured 6T numbers (15.5/12 and 5–5.8); iPhone 13 Pro 36 and the modern 8 GB anchors unchanged. `chipClassFor` takes an optional `chipName`; unknown SoCs keep the RAM classes.

Emulator recipe used: `emulator -avd <clone> -port 5590 -memory 7600 -cores 4 -no-window -no-snapshot`, `debug_http_host` → `localhost:8105`, Metro without watchman misses scripted edits — restart `expo start --clear` after every batch. An Android debug build can install over the dev stand-in (`scripts/serve-models.mjs`, `EXPO_PUBLIC_MODELS_BASE_URL`) only with a local one-line switch from `PlayDelivery` to `HttpsDelivery` in `src/vault/store.ts` (not committed).

## Model-run fixes round 6 (leftovers D10–D18, 11.9.2026) — branch `fixes-r6`
Reproduced on a private Pixel 6 API 33 emulator (4 GB guest, 16 GB data partition, Metro on a private port, `scripts/serve-models.mjs` behind a 20 MB/s throttle so five installs overlap) before each fix:
1. **D10 model loaded "twice"** (`src/app/vault.tsx`): `router.replace("/")` from the vault pushed a second chat screen over the one still mounted underneath; both awaited the same `loadSession()` promise and each printed its own "loaded … in N ms" line (and the hidden one consumed the dev prompt). The native load ran once. `router.dismissTo("/")` pops back to the existing chat, which the key bump already remounts: one screen, one line.
2. **D11 memory guard silent** (`packages/core/src/device/android.ts` `memoryPressureFromAndroid`, `src/device/guard.ts`): the only Android memory sources were `onTrimMemory` edges and `MemoryInfo.lowMemory`, neither of which Android raises for the foreground app while it evicts the mapped weights. The 5 s tick now reads `availMem` against the resident (or loading) model: below `threshold + 0.5 × modelBytes` → `warning` (6T: 853 MB free with Sharp 2.6 GB → warning; 3.5 GB right after the load → normal). Recovery requires the polled reading to be normal too. Emulator: Fast resident → `[device] memory`, generation stopped, weights unloaded, banner shown, where the unfixed build was killed by lmkd ("thrashing 710 %", 3.16 GB RSS) with the guard still `normal`. Follow-up for the shell: the automatic switch to Instant needs `registerModelResolver` outside `EXPO_PUBLIC_DEVICE_TIER`, and `mapState` shows the memory row as "stopped generation" rather than "switched to Instant".
3. **D12 raw import id** (`src/lib/models.ts` `importDisplayName`): chips, labels and the photo note show "QWEN3-0.6B" for `import:Qwen3-0.6B-Q8_0.gguf` (extension and quant tag stripped).
4. **D13 "Delivering … 100 %" while hashing** (`AppServices`, `Banners`): `DeliveryState.status` gained `verifying`; the banner reads "Verifying FAST · 1.19 GB".
5. **D14 small companion verified 40 s late** (`packages/core/src/catalog/lanes.ts`, `src/vault/store.ts`): five parallel tasks each ticked progress every 100 ms and every tick dispatched a store notification plus a vault/AppServices re-render, so the native hash completion of the 148 MB whisper file queued behind hundreds of progress renders (downloaded at 9 s, ready at 51 s; Fast alone: 1 s). `DeliveryLanes` runs one ≥ 1 GB file beside two small ones (smallest first when a lane frees), and progress is dispatched at most every 500 ms per file. After: whisper ready at 9 s, every companion verified within 0.5 s of its download, `[vault] <id> ready · verified in N ms` logged in dev.
6. **D15** (`buildRagPrompt` `citeMarkers`): Instant is not asked for `[n]` marks (it never places them); the chips show as SOURCES as before.
7. **D16 duplicate document** (`src/documents/library.ts`, `dedupe.ts`): the copied file is hashed (after the copy has every byte) and a record with the same SHA-256 + size is returned instead of a second row.
8. **D17 Hebrew routing hint** (`betterModelForLanguage`, `Chat.tsx`): a non-Latin script the loaded model does not list in `goodLanguages` shows one line under the header naming the catalog model that does (installed first, else installable and fitting): "SHARP handles Hebrew better than this model · Install/Switch" → opens the vault.
9. **D18 sharp-phi on Android** (`VaultEntry.importOnly`, `ModelCard`): a catalog model without a Play pack reads "Not offered through Google Play. Download the file in your browser, then import it here." with an Import GGUF button; a Play-less build (sideloaded debug) says "Google Play is not available here…" the same way. No dead card.
10. **Dev hooks** (`VaultScreen`, `store.importFile`): `EXPO_PUBLIC_AUTOINSTALL/AUTOIMPORT` run once per app run, and importing a file already in the vault (same name and size, copy complete) returns the verified record instead of re-copying 640 MB over the file the engine has mapped; a short copy clears its record and state. `scripts/check-store-env.sh` refuses a store build while any `EXPO_PUBLIC_*` dev switch (models base URL, dev host, hooks, Pro override) is set in the environment; the Android dev HTTPS switch itself is `EXPO_PUBLIC_MODELS_BASE_URL` + `__DEV__` only (D8 above).

## Purchases round 2: StoreKit configuration on the iPhone, Play versionCode 3 to 6 (branch `purchases-verify`) — 11.9.2026
Report: `docs/qa/purchases-run-2026-09-11.md` (previous round: `docs/qa/purchases-run-2026-09-06.md`). Proven on Moshe's iPhone 13 Pro without
UI automation: Pro purchase → "You own Pro" + the $49.99 upgrade card, Pro → Work upgrade → "You own Pro for Work", Work bought directly, Restore
(found 0 on an empty session, found 1 after an external purchase), refund → Free. All on the local StoreKit configuration (`environment: "xcode"`).
- `apps/mobile/ios-dev/StoreKitTestHarness.swift` + `apps/mobile/scripts/ios-add-storekit-harness.rb` (run after `expo prebuild -p ios`, dev builds
  only; `ios/` is gitignored, so no store build contains it): with `INBORN_SKTEST=<ops>` in the launch environment the app opens an in-process
  `SKTestSession` on `Inborn.storekit` (ops `clear` · `buy:<sku>` · `refund:<index>` · `dialogs:on`) and writes `Documents/sktest.json`.
- Launch with `DYLD_FRAMEWORK_PATH=/System/Developer/Library/Frameworks:/System/Developer/Library/PrivateFrameworks` (StoreKitTest links
  `@rpath/XCTest.framework/XCTest`, which only the developer disk image has) and `--payload-url inborn://paywall`; the bundle-time
  `EXPO_PUBLIC_AUTOBUY=<sku|restore>` (`ios/.xcode.env.local`) makes the paywall buy or restore by itself and write `Documents/licence-run.json`.
  Screenshots: `pymobiledevice3 developer dvt screenshot out.png` (no root needed on iOS 17+).
- Trap: without the session a dev build talks to Apple's real sandbox (the phone has a sandbox account signed in) and shows a "Sandbox" payment
  sheet that outlives the app; it is hosted by `PassbookUIService` — `xcrun devicectl device process signal --pid <pid> --signal SIGKILL` dismisses it.

- versionCode 4 (main 90a82f9, share target + "Ask Inborn"): same recipe, 2,091,988,850 bytes, sha256 `db345f5d…f4ae`, "1.0.0 (4) internal". On the
  OnePlus 6T the Play update re-delivers the fast-follow Instant pack (`…/assetpacks/inborn_model/4/4/…`) and both Android surfaces work on the
  real build: system share sheet → Inborn → Quick actions; select text in Google Docs → ⋮ → Ask Inborn → Fix grammar → Replace puts the corrected
  text back into Docs' field. "Ask Inborn" only appears in apps that declare the `PROCESS_TEXT` query (Docs, Gmail, Messages, WhatsApp … yes; Keep,
  Chrome no). Finding: the first launch of (4) showed onboarding again after the update.
- Driving the 6T when taps are ignored (OnePlus keeps simulated touch behind a security setting we do not change): keys work (`input keyevent
  KEYCODE_TAB/DPAD_*` + `uiautomator dump` to see the focused node); the floating text-selection toolbar needs `apps/mobile/android-dev/a11y-drive/`,
  a self-instrumenting test APK that performs accessibility actions by text / content-desc / view id (`am instrument -w -e steps "click:Select all;
  click:More options;click:Ask Inborn" com.inbornapp.mobile.uitest.test/androidx.test.runner.AndroidJUnitRunner`, log tag `UIDRIVE`). Build it with
  the app project's gradle wrapper (`assembleDebug assembleDebugAndroidTest`), install both APKs, uninstall both when done.
- versionCode 5 (main 07bc402, fixes-r9): 1,870,567,596 bytes, sha256 `861d805d…04eb`, "1.0.0 (5) internal". Trap: `bundleRelease` dies in
  `:app:signReleaseBundle` with `OutOfMemoryError: Java heap space` under prebuild's default `-Xmx2048m`; run it (or just that task) with
  `-Dorg.gradle.jvmargs="-Xmx8g -XX:MaxMetaspaceSize=1g"`. On the 6T the (4)→(5) Play update is a small delta (packs unchanged) and a cold launch
  opens straight to the chat screen, no onboarding (F12 on a real device); model from `…/assetpacks/inborn_model/5/5/…` in 1.5 s.
- versionCode 6 (main 70e1cfa, fixes-r10): 2,092,019,571 bytes, sha256 `847bac90…42c8`, "1.0.0 (6) internal". A new native module (here
  `modules/hardware-keys`) needs a CLEAN prebuild (`rm -rf android` first), otherwise the incremental prebuild leaves it out of the module
  registry; confirm with `strings base/dex/*.dex | grep -o "Lcom/inbornapp/[a-z]*/[A-Za-z]*Module;"` on the AAB. 6T sanity on the real build:
  Instant answer, assistant-row content-desc carries the answer, soft Enter newlines, Fast pack delivered by Play in ~2 min (25 chunks), Pro
  owned + Restore. `input keyevent KEYCODE_ENTER` counts as a virtual device, i.e. the soft-keyboard path, not the hardware-Enter path.
## Fixes round 7: auto-delete, memory switch, benchmark, Hebrew OCR on iOS (branch `fixes-r7`) — 11.9.2026
Proven on a private Pixel 6 API 33 emulator (4 GB guest, debug APK + Metro on a private port, `scripts/serve-models.mjs` for Fast) and on the
iPhone 17 Pro simulator (iOS 26.3, Release build with `ios/.xcode.env.local`).
1. **§7.5 auto-delete after N days** (`packages/core/src/chat/retention.ts`, `src/services/retention.ts`, `AppServices`): the S52 setting
   was stored and never enforced. `applyRetention` removes every non-pinned, non-incognito chat whose last change is older than N days
   (inclusive boundary, archived chats included); it runs at boot, on every return to the foreground, every hour while open and at once when the
   setting changes, one run at a time (two overlapping runs opened two SQLite transactions on one connection and both failed). The chat on
   screen is skipped until the user leaves it; the drawer re-reads the list after a run (`chatsVersion`) and tags rows "Deletes in N days" /
   "Deletes when Inborn next opens" (`chats.deletesIn`); the Settings row explains the rule (`settings.security.autoDelete.on/off`).
   Dev: `EXPO_PUBLIC_AUTODELETE_DAY_MS=60000` shrinks a day to a minute. Emulator: with "1 day" the chat that was open survived three
   ticks (`[retention] run · open chat <id>`), and the first tick after "New chat" deleted it (`[retention] deleted 1 chat(s)…`), the drawer
   showing "No chats yet" without a reopen.
2. **§5.8 / §6.5 memory pressure → Instant** (`src/device/boot.ts`, `src/vault/tiers.native.ts`, `guard.ts`, `mapState.ts`, `policy.ts`):
   the real boot path registered no model resolver, so the guard's "switch to smaller" had nothing to load; the line read "stopped
   generation". Now `registerModelResolver` answers with the installed catalog model of the tier and `availableTiers` tells the policy which
   tiers exist (no Instant installed → stop + unload with "Ran out of memory · answer stopped", the spec fallback). The line reads "Ran out of
   memory · Switched to Instant · Switch back" and stays as a proposal (`memoryBack`) after memory recovers, because a Switch back during the
   pressure is re-switched at once. Emulator: Fast loaded on the 4 GB guest → the OS trim (and `am send-trim-memory … RUNNING_CRITICAL`) →
   `[device] memory · device.memory.switched` → header chip INSTANT, Instant answered the next message, Switch back after the hold → FAST.
   Also: a rejected `load()` no longer leaves the "loading" mark that quarantines a healthy file at the next boot (`engine.ts`).
3. **§7.2 / S31 Benchmark on this phone** (`packages/core/src/catalog/benchmark.ts`, `engine.ts` `benchmarkModel`, `llamaRn.ts` `bench`,
   `ModelDetails`, `VaultScreen`): PP 512 / TG 128 through `llama.rn` `bench`, load time, prompt and generation tok/s, first token after a
   512-token prompt, weights in memory, the §6.4 expectation for the chip class with a verdict, stored under `benchmark.<model>` in the
   library settings and shown again on reopen. Emulator (Instant, android-mid): load 3.4 s · prompt 85.2 tok/s · generation 12.2 tok/s ·
   TTFT 6.0 s · 497 MB · expected 12–20 tok/s → as expected.
4. **§5.5 / §14 M5 Hebrew OCR on iOS** (`modules/doc-extract/ios/DocExtractModule.swift`, `DocExtract.podspec`): Vision has no Hebrew on
   iOS 26 (`supportedRecognitionLanguages`), so the module links `libtesseract.xcframework` (Tesseract 4.1, from
   `INBORN_MODELS_DIR/ocr/ios/`, gitignored) with the `eng`/`heb` traineddata as a resource bundle; a requested script Vision lacks goes to
   Tesseract and the read that carries the page wins (`engine` in the result, `ocrEngine()` = `vision+tesseract`). Without the files the pod
   builds Vision-only and warns. Simulator (`EXPO_PUBLIC_AUTOINDEX=heb-scan.png,eng-scan.png`, `AUTOOCR=1`, both fixtures rendered scans):
   English → Vision 1.00, Hebrew → Tesseract 0.92 with the lease text read correctly; "Ask this document" answered "The monthly rent is
   4,500 shekels" from the Hebrew scan. The documents dev proof no longer needs `__DEV__` (its flags are bundle-time), so a Release
   simulator build runs it.
## TestFlight build 1.0.0 (5) — 14.9.2026
fixes-r10 rounds 10–10d (F17/F18/N1, full disk, screen-reader announcements, O12 iOS VoiceOver row, httpsDelivery fixes) on top of build 4;
same recipe, share extension included; `modules/hardware-keys` is Android-only. Record: `docs/qa/ios-build-5-2026-09-14.md`.

## TestFlight build 1.0.0 (4) — archived 11.9.2026, uploaded 13.9.2026
fixes-r9 (F1–F15, incl. the F11 relative-document-paths data-loss fix) on top of build 3; same recipe, share extension included.
`modules/read-aloud` and `withStoredNightMode` are Android-only (no-ops on iOS). Record: `docs/qa/ios-build-4-2026-09-13.md`.

## TestFlight build 1.0.0 (3) — 11.9.2026
Everything merged since build 2 (fixes-r5…r8, design-r2, sheets-keyboard, i18n deltas 10–13, copy-r2c, purchases-verify, voice-r2), Instant bundled,
Tesseract OCR inputs, and the "Ask Inborn" share extension (App Group `group.com.inbornapp.mobile`). Portal prerequisites via the ASC API:
APP_GROUPS on `com.inbornapp.mobile`, the extension's App ID `com.inbornapp.mobile.share-extension` registered with APP_GROUPS; the App Group
itself has no ASC API resource (spec has only betaGroups/gameCenterGroups) and was created in the portal UI. Archive/export/upload commands,
device evidence and the TestFlight state: `docs/qa/ios-build-3-2026-09-11.md`.

## Quick actions, share targets, Hugging Face search (spec §7.6 / S43, §7.7, §7.2) — branch `fixes-r8`, 11.9.2026
Three Free-tier features from the MosheAI gap report (`docs/qa/mosheai-gap-2026-09-11.md` rows §7.6, §7.7, §7.2).
- **Quick actions (S43)** — `packages/core/src/chat/quickActions.ts` (six actions: summarize, rephrase, fix grammar, translate, explain,
  extract tasks; prompt builder fences the text as data, 6 000-char clip on a word boundary), `detectLanguage.ts` (script + stop-word
  detection for 17 languages; the translate target is the UI language, or English when the text already is the UI language, or Spanish
  for an English UI) and `apps/mobile/src/components/chat/QuickActionsSheet.tsx`: source preview, six chips, "Detected · Translate to"
  row (tap cycles the target and restarts a running translation), the result streamed with the loaded model (`reasoning: false`,
  `maxTokens: 1024`, `temperature: 0.3`, offline), then Stop / Copy / Replace (Android PROCESS_TEXT only) / Open in chat (the action
  becomes a user turn and the result an assistant turn of the open conversation). Reachable from every message's long-press sheet
  ("Quick actions") and from every share target.
- **Share targets (§7.7)** — Android: `apps/mobile/modules/share-target` (own Expo module, no permission): `ACTION_SEND` for text/plain and
  the document types of `src/documents/pickTypes.json` (the same list drives the picker; `app.config.ts` writes the intent filters), and
  `ACTION_PROCESS_TEXT` "Ask Inborn" through a transparent standard-launch `ProcessTextActivity` that lives in the caller's task, hands the
  text to the singleTask MainActivity and, on "Replace", returns `EXTRA_PROCESS_TEXT` with `RESULT_OK` (the app moves back behind the
  caller). Shared files are copied into `cacheDir/shared/` and attached to a new chat through the documents library; shared text opens the
  quick-action sheet on a new chat. iOS: `expo-share-intent` 8.0.1 (iOS part only; the Android module is excluded from autolinking) adds
  the "Ask Inborn" Share Extension target (App Group `group.com.inbornapp.mobile`; text, one URL, one file or image) and `src/app/+native-intent.ts`
  routes the handoff URL to the chat. `INBORN_IOS_SHARE_EXT=0` at prebuild skips the extension (a provisioning profile without App Groups
  cannot sign it). Payload parsing is pure: `packages/core/src/chat/shareTarget.ts`.
- **Hugging Face search (§7.2, iOS only)** — `packages/core/src/catalog/huggingface.ts` (URLs on `huggingface.co` only, search + repo
  parsing: whole `.gguf` files with an LFS SHA-256, no shards, no `mmproj`; quant and parameter tags from the file name; RAM need =
  file size + 1 GB rounded up), `apps/mobile/src/vault/hf.ts` (fetch with host assertion, optional token for gated repos in the Keychain,
  every request recorded to the network log) and `src/screens/vault/HfSearch.tsx` (Vault → "Search Hugging Face"). A picked file becomes
  a catalog model with the new delivery kind `hf` (`hf:<repo>/<file>` id, `vendor: "Hugging Face"`) that `HttpsDelivery` downloads through
  the existing controlled path: HEAD size check, `.part` resume, native SHA-256 against the LFS hash, then the usual vault card. Vault copy
  on Android says the search exists on iOS and desktop because the Android release has no INTERNET permission; the desktop screen is not
  built in this round. Proof screen (S50): the iOS allowlist now names `huggingface.co` and the `*.hf.co` CDN the redirect lands on, and
  `src/proof/transfers.ts` feeds HF search bytes and model bytes into the iOS OUT/IN meter (before this round nothing on iOS recorded model
  downloads there).

Verified 11.9.2026 (screenshots in the stream's scratch dir; numbers from the Proof screen and the app container):
- **iOS, iPhone 15 Pro simulator (iOS 17.0, Release build):** search "qwen3 0.6b" against the real API (20 repos, downloads and likes),
  unsloth/Qwen3-0.6B-GGUF expanded to 20 whole GGUF files with size, quant and "Fits your phone"; the confirm sheet names
  huggingface.co and the size; a 16 MB file (`ggml-org/stories15M_MOE/moe_shakespeare15M.gguf`) downloaded, native SHA-256
  `d1e0617d…fe1a` equals the LFS hash and the Mac's `shasum`, the card reads "Use this model" and Details shows source huggingface.co.
  Cancel of a running download and Remove of a pending row work. Proof: OUT 1.47 KB · IN 51.4 MB, allowlist rows huggingface.co and
  `*.hf.co`, network log with one line per request (HEAD 240 B, search 955 B, repo 7 KB, file 15.6 MB). Share sheet: Safari → share →
  "Inborn (dev)" → new chat with the quick actions sheet holding the URL; quick actions from a message: Summarize streamed three bullets,
  Translate to Spanish (detected English), Open in chat appended both turns.
- **Simulator traps:** (1) build the simulator app with ad-hoc signing (no `CODE_SIGNING_ALLOWED=NO`): without the simulated
  entitlements `nsurlsessiond` refuses the background session (`NSCocoaErrorDomain 4097`) and every vault download fails with
  "unknown error"; (2) the simulator's background `URLSession` moves 50–100 KB/s where `curl` on the Mac gets 20 MB/s, so pick a small
  file for a proof (a device downloads at line speed); (3) a share that arrives while another sheet (a Modal) is open would present a
  second Modal, which iOS drops, and react-native-screens keeps the popped screen mounted until its sheet is gone. So every sheet and
  modal registers its close handler (`src/lib/openSheets.ts`, `useOpenSheet`), the share handler in `_layout.tsx` calls
  `closeOpenSheets()` before it pops to the chat, `Sheet` remounts its Modal every 600 ms (8 tries) until `onShow` fires, and the Chat
  screen opens the shared-text sheet only once it is in front (`useIsFocused`).
- **Android, Pixel 3a API 33 emulator (arm64, debug build + Metro, Instant pushed):** `am start -a android.intent.action.SEND -t text/plain
  --es android.intent.extra.TEXT '…'` opened a new chat with the quick actions sheet on the text (Detected: English, Translate to Spanish);
  Extract tasks streamed three checkbox lines and Open in chat appended both turns. Files app → shared.txt → Share → Inborn: the file is
  copied, imported and attached as a chip on a new chat. Text selection in a plain EditText (Contacts, first name) → ⋮ → "Ask Inborn" →
  the sheet with Replace → Fix grammar → Replace: the field reads the corrected text and Contacts is in front again (Inborn moved its task
  back). The Settings search field ignores the returned text (it drops the selection when it loses the foreground); a shell-launched
  `am start … ProcessTextActivity` is a task root and is finished before Replace, so test PROCESS_TEXT from a real text field.
  Release APK: `scripts/check-android-permissions.sh` → OK, 9 permissions, no INTERNET, no new permission for the share targets.

## Fixes round 9: QA run 3 follow-ups (branch `fixes-r9`) — 11.9.2026
Items F1–F11 and N1 of `docs/qa/qa-run-2026-09-11.md`. Pure logic in `packages/core` with tests (`packages/core/test/fixes-r9.test.ts`);
proven on a private Pixel 6 API 33 emulator (4 GB guest, debug APK + Metro on port 8117, Work and Pro bundles) and on the iPhone 15 Pro
simulator (iOS 17.0, Release build with `ios/.xcode.env.local`). Pixel_4_API_33 was held by another stream, so Pixel_6_API_33 stood in.
1. **F1 · locked vault chats never surface in search** (`packages/core/src/chat/repository.ts` `SearchOptions.hiddenFolderIds` +
   `searchExclusions`, the in-memory, SQLite/FTS5, IndexedDB and Tauri repositories, `work/store.ts` `hiddenFolderIds`, `Chats.tsx`): the query
   layer drops every chat whose folder is a locked vault (FTS limit grows by the excluded count so the page stays full), and a search hit or
   row of a hidden chat opens only after the vault code (`openGuarded` → VaultCodeSheet verify → open). Emulator: vault "Client A" open →
   "zebra" 2 hits; locked → 1 hit (the non-vault chat), "deposit" → "Nothing found." (`shots 08–10`).
2. **F11 · document and photo paths survive an iOS container move** (`packages/core/src/paths/storedPath.ts` `toStoredPath` /
   `resolveStoredPath`, `documents/files.native.ts`, `library.ts` boot migration, `images/pick.native.ts`, `UserMessage.tsx`): paths are stored
   relative to the document directory and resolved at read time; an absolute `file://` URI from an older container is re-based on its
   `/Documents/` (`/files/` on Android) tail at boot and written back once. Simulator (`EXPO_PUBLIC_AUTOINDEX=policy.html`, `AUTOASK`,
   `AUTOASK_STRICT=1`, `Documents/embed.gguf` as the index model): first launch stored `uri: "documents/mtx62qiq-1-6bmnm10u.html"`,
   725 bytes on disk, 6 chunks, answer "Within 21 days." with 3 citations (`Documents/dev-run.json`); `xcrun simctl install` of the same
   build moved the data container `6AADAB78…` → `CBC11B6C…` (old path gone); the next launch read the same relative record with 725 bytes
   on disk, the passage sheet showed "§3 Time limit … within 21 days" and a fresh ask answered "21 days" (search 6 ms · 3 passages ·
   answer 3.5 s · 48 tok/s). `dev-run.json` `docs[]` now records `uri` and `bytesOnDisk` for this proof.
3. **F3 · SAF picks keep their display name** (`modules/share-target` `contentMeta(uri)` → `OpenableColumns.DISPLAY_NAME` + MIME,
   `packages/core/src/rag/extract/sniff.ts` `pickedFileName`: display name → real file name in the URI → MIME extension → magic bytes →
   "document"; `documents/office.ts` `pickedName`): the office gate runs on the resolved name. Emulator: `budget.xlsx` under Work → chip
   "budget.xlsx" and imports; under Pro → the Work paywall (`13-xlsx-work.png`, `25-xlsx-pro.png`); `policy.html` under Work → "policy.html".
4. **F2 · wipe keeps `files/models/`** (`packages/core/src/paths/wipePolicy.ts` `keepOnWipe`, `storage/wipe.native.ts`): with "Also delete
   downloaded models" off, the `models/` and `assetpacks-joined/` directories and every top-level `*.gguf`/`*.bin` stay. Emulator: 7 entries
   in `files/models` before and after "Delete everything" (diff empty), documents/work/chats gone, onboarding back.
5. **F4 · one theme source** (`services/theme.ts` owns the override, `lib/theme.ts` delegates; six screens that read `useColorScheme()`
   directly now use `useTheme()`; `_layout.tsx` applies the stored mode before the first render; `plugins/withStoredNightMode.js` reads
   `themeMode` from `prefs.json` in `MainActivity.attachBaseContext` and adds `values-night` splash colours): app Dark + system Light shows no
   split (`26–28-f4-*.png`), a cold start with the lock on paints the dark splash and a dark window with light status icons (`29-cold-*.png`).
6. **F5 · read aloud binds an engine that speaks the language** (`modules/read-aloud` Android module: engine list, `isLanguageAvailable`
   probe with local voices, bound `TextToSpeech(ctx, cb, engine)`; `packages/core/src/voice/ttsEngine.ts` `chooseTtsEngine`: default
   engine if it reports the language, else Google, else any able engine, else none; `voice/tts.ts` returns `"no-voice"`): no engine ever
   opens its settings activity. Emulator: English → `Synthesis request for locale eng-USA` from `com.google.android.tts` (`14-read-aloud.png`);
   Hebrew answer "שלום" → "No voice for this language is installed on this device", nothing launched (`16-hebrew-novoice.png`).
7. **F6/F7/F8/F9/F10/N1** — vault PRO chip only when the tier locks the model (`ModelCard` `lockedForTier`, no chip on Sharp under Work,
   `18-vault-work.png`); audit entries carry `chat <8 hex>` instead of the title (`work/audit.ts` `cleanSubject`/`subjectRef`, "Chat moved in ·
   chat 8ed4bcaa", `17-audit-log.png`); citations read `p. N` for PDFs/scans, `sheet N` for spreadsheets and `part N` otherwise
   (`rag/citations.ts` `pageUnit`, keys `documents.cite.*`, `documents.parts`/`documents.sheets` on the library row; "policy.html · part 3",
   `22-citations.png`); every switch has an accessibilityLabel (report-include, thinking, strict, redact kinds, memory, wipe models) and the
   persona chips wrap (`19-chat-settings.png`, `20-report-sheet.png`); the dev LogBox toast under the lock screen came from Expo's dev-only
   `DevLoadingView` (`new NativeEventEmitter()` on a legacy module, SDK 57 on RN 0.86) — filtered in `index.ts` for dev bundles, and the
   "state update on a component that hasn't mounted" line did not reproduce in three cold starts with the lock on after the theme change;
   the chat list scrolls to the end once when a stream finishes and again when the keyboard shrinks the list (`Chat.tsx` settle window +
   `onLayout`, `04-n1-after.png`, `23-n1-keyboard.png`).
8. **F12 · persisted state survives an app update** (`services/prefsStore.native.ts`, `services/prefsTypes.ts` `recoverPrefs` +
   `isPrefsLike`, `vault/httpsDelivery.ts`). The Play 3 → 4 update on the OnePlus 6T that showed onboarding again did not reproduce on the
   emulator: `adb install -r` of a rebuilt debug APK (versionCode 1 → 2 → 3, `firstInstallTime` unchanged) opened the lock screen, the passcode
   unlocked, the chat list held the earlier chat, header SEALED · INSTANT, `prefs.json` unchanged (`f12-06-after-vc3-install-lock.png`,
   `f12-07-…-unlocked-chat.png`, `f12-08-…-chat-list.png`). Nothing persisted is keyed by version or build, prefs hold no paths, and no boot
   path resets them; the one hole in the app was that a `prefs.json` the OS left missing, empty or cut short was silently read as "no prefs",
   the defaults were written back within 5 s by the exit-meter tick, and onboarding came back for good. Now every write also lands in
   `prefs.bak.json`, a primary that does not parse as prefs (no boolean `onboarded`) falls back to that copy, and an unreadable file is logged
   as `[prefs] <name> unreadable` so the next real update carries evidence. Paused HTTPS downloads resume on the part's current URI instead
   of the absolute one saved before an iOS container move (same family as F11). Test: `services/prefsTypes.test.ts` (6 cases). The lead's
   read-only check on the 6T afterwards: `dumpsys package com.inbornapp.mobile` → `firstInstallTime=14:21:29`, `lastUpdateTime=15:32:57`,
   `versionCode=4`, so Android kept the data directory across the Play update and the loss was app-level: exactly the unreadable-primary
   path this item closes (the backup copy is read, and the `[prefs] … unreadable` line names the file if it happens again).
9. **F13 · the device line stacks above the AI notice** (`components/shell/bannerInset.ts`, `_layout.tsx`, `Chat.tsx`): the §8.8 strip is
   still drawn under the header of any screen, but its measured height reaches the chat screen through `BannerInsetContext`, which pads its
   first row by it. Emulator with the memory switch forced by the boot floor below: "Ran out of memory · Switched to Instant · SWITCH BACK"
   above "This is AI running on your phone…", both fully visible (`f13-f14-03-boot-floor.png`).
10. **F14 · boot-time RAM floor** (`packages/core/src/device/bootTier.ts` `bootModel` / `bootMinRamGB`, `device/boot.ts` `applyBootFloor`,
    `guard.ts` `noteBootSwitch`, `signals.ts` `deviceRamGB`): before the first load the default model's minimum RAM (catalog `minRamGB`, or
    the size rule for imports, which record 0) is compared with the device's RAM; when it does not fit and Instant is installed and smaller,
    the engine starts on Instant as a session override (the vault default is untouched) and the guard records a memory switch, so the
    existing line offers "Switch back". Test: `packages/core/test/device-boot-tier.test.ts` (6 cases). Emulator (3.8 GB): a 2.5 GB import as
    the vault default → `[device] boot floor: import:Phi-4-mini… needs more RAM than this device has (3.8 GB), starting on instant`, Instant
    loaded in 2.0 s, no 1.2 GB load first (before the fix the same boot started "Loading PHI-4-MINI-INSTRUCT…", `f13-f14-01-boot-floor.png`).
11. **F15 · the chat database survives its handle dying** (`storage/reopen.ts` `isDeadHandleError` / `ReopeningHandle`,
    `storage/reopeningDb.ts`, `storage/sqliteRepository.ts`, `packages/core/src/chat/{repository,store}.ts` `close()`, `AppServices.tsx`,
    `Chat.tsx`, `engine.ts`). Mechanism found in expo-sqlite 57 on Android: `NativeDatabase.sharedObjectDidRelease` closes the native
    connection whenever any JS wrapper of it is garbage-collected, and the module hands the same cached connection to every
    `openDatabaseAsync(name)` without `useNewConnection` (a second wrapper for one connection: a JS reload, a second boot, or a wipe's
    re-boot). The next statement then fails with `NativeDatabase.prepareAsync … NullPointerException` (`isClosed` is never set on that
    path), every send fails and the drawer reads "No chats yet". Fix: the repository owns one `ReopeningDatabase`; a statement that fails
    with a dead-handle error (NPE, "Access to closed resource", released shared object) reopens the keyed connection once, re-applies the
    pragmas and FTS, and runs again; concurrent statements share one reopen; transaction bodies run on the raw handle so a death mid-body
    reruns the whole body, never half of it; any other error passes through. A wipe now closes the store first, so `deleteDatabaseAsync`
    really deletes and the next boot cannot inherit the old handle on the unlinked file. A send the store could not take puts the text back
    in the composer next to the toast. Tests: `storage/reopen.test.ts` (9 cases). Dev hooks (bundle time): `EXPO_PUBLIC_IDLE_UNLOAD_MS`
    shortens the idle unload, `EXPO_PUBLIC_DEAD_DB_AFTER_MS` closes the chat handle underneath the repository after N ms. Emulator
    (`IDLE_UNLOAD_MS=15000`, `DEAD_DB_AFTER_MS=20000`): `engine unloaded (idle)` at 15 s, `[storage] dev: closing the chat handle` at 20 s,
    the next send logged `[storage] chat database handle died underneath, reopening: Call to function 'NativeDatabase.prepareAsync' has been
    rejected.` (the QA run's exact text), the answer streamed, and the drawer listed the chat (`f15-01-send-after-dead-handle.png`,
    `f15-02-chat-list-after-reopen.png`).
12. **F16 · the launch log names what loaded, and says nothing when nothing did** (`lib/models.ts` `describeLoad`, `Chat.tsx`).
    The Play build logged `[inborn] null loaded bundled://null in 90 ms` right after `Running main`: the Chat warm-up logs the
    engine id and model URI, and the no-model engine (`NullLM`, id `null`, uri `bundled://null`) is what a fresh install runs until
    the bundled Instant model is registered. The warm-up itself is harmless for that engine (in-memory, no file, `markLoading`
    finds no install record), so the fix is in the line: `describeLoad` returns nothing for the null engine and otherwise reads
    `[inborn] llama.rn loaded model INSTANT (instant) from file:///…/instant.gguf in 1498 ms` (shape kept for `scripts/web-smoke.mjs`).
    2 unit tests. Emulator cold start (development build, Pixel 6 API 33): no `null loaded` line; the named line above appears.

## Fixes round 10: QA run 3 pass 3 follow-ups (branch `fixes-r10`) — 14.9.2026
Items F17, F18, N1 and observations O1–O3 of `docs/qa/qa-run-2026-09-11.md` "Pass 3". Pure logic with tests
(`apps/mobile/src/storage/reopen.test.ts`, `packages/core/test/fixes-r10.test.ts`); proven on a private Pixel 6 API 33 emulator
(4 GB guest, debug APK, Metro on port 8121, Work tier, models from a private `serve-models` on 8791).
1. **F18 · native SIGABRT in libexpo-sqlite on close** (`storage/reopen.ts`, `reopeningDb.ts`, `sqliteRepository.ts`). Two causes, both
   closed. (a) The chat DB uses FTS5, and FTS5 keeps its own prepared statements on the connection. expo-sqlite's `closeDatabase` walks
   `sqlite3_next_stmt` and finalizes every statement it finds (`finalizeUnusedStatementsBeforeClosing`, default on), then `sqlite3_close`
   disconnects the FTS5 virtual table, which finalizes the same statements again: double free → "Scudo ERROR: invalid chunk state when
   deallocating" (`exsqlite3_free ← exsqlite3_finalize ← exsqlite3_close`). The chat DB is now opened with
   `finalizeUnusedStatementsBeforeClosing: false` and `useNewConnection: true` (its own native connection, so a garbage-collected wrapper of
   a shared one can never release it under a statement). A/B on the emulator with the same JS: default option → tombstone on the second
   dev close; with the option off → 30 closes, no tombstone. (b) A close could still overlap a statement on another `Dispatchers.IO` thread.
   `ReopeningHandle` now gates both directions: every statement is tracked per connection, `close()` / `closeUnderneath()` wait for the
   in-flight set to drain (bounded by `DRAIN_TIMEOUT_MS` 5 s, reported as `drained=false`) before `closeAsync`, and a statement that arrives
   while a close runs waits for it (then reopens after a dev close, or rejects with `CLOSED_MESSAGE` after the terminal close on wipe /
   `store.close()`; nothing ever reopens after a terminal close). The snapshot is synchronous: no await sits between the gate checks and
   the tracking, so a statement is either in the set a close waits for or behind the close. Dev hooks: `EXPO_PUBLIC_DEAD_DB_AFTER_MS=N`
   closes the handle underneath the repository every N ms (repeating), and `EXPO_PUBLIC_DEAD_DB_MID_STATEMENT=1` makes each tick fire
   only while a statement is in flight; both log `[storage] dev: closing … (firing n, in flight k)` and `handle closed (firing n, waited
   for W in-flight, drained=B)`. Emulator (mid-statement mode, closes during a streaming answer and during chat list queries): 30 firings,
   28 with 1–3 statements in flight, all drained, 28 `[storage] reopened` lines, 0 undrained, tombstones 8 before and 8 after, no
   `am_crash`, answer streamed to the end (`fixes-r10/shots/a-03-fixed-final.png`), chats intact (`b-01-drawer-after-storm.png`). Tests: 8
   new cases in `reopen.test.ts` (drain, late statement waits then rejects, closeUnderneath reopens, twice on the same dead handle closes
   once, hung statement times out, concurrent closes share one drain, dead-handle error during the terminal close never reopens, close
   during a reopen).
2. **F17 · every action on a locked vault asks for the code** (`packages/core/src/work/vault.ts` `guardVaultAction`: allow when not a
   vault or open; `move-in` denied; `open`, `move-out`, `rename`, `delete`, `unvault`, `change-code` verify; `Chats.tsx` `guarded()` routes the
   verdict through the same VaultCodeSheet verify as F1 and runs the pending action after the sheet closes; `FolderSheet.tsx` `beforeAction`
   for rename / delete / move-out). Emulator: locked "Client A" → Unvault → "Vault passcode" sheet (`b-03`); wrong code → "Wrong passcode",
   still LOCKED · 1 chat (`b-04`, `b-05`); right code → unvaulted, chat back as a plain row (`b-06`, `b-07`); rename and delete of the locked
   vault ask too (`b-08`, `b-10`); audit "Chain verified · 4 entries" incl. "Vault unlocked" (`b-11-audit-log.png`). Test: 4 cases.
3. **N1 · the list stays pinned to the end while streaming with the keyboard up** (`Chat.tsx` `pinToEnd`): Android clamps a far
   `scrollToOffset` to the real end, while `scrollToEnd` targets the last cell's frame from the previous layout and landed a line short
   with the keyboard open; the pin is applied on `keyboardDidShow`, on every content-size change while streaming or settling, when the
   list shrinks, and once more at stream end (the animated `scrollToEnd` there overrode the pins). Emulator, keyboard shown
   (`mInputShown=true`) throughout a 20-item answer: last line and LEDGER above the composer at 5/10/25/45 s (`n1g-*.png`).
4. **O1** the drawer search field sits below the device banner (`Chats.tsx` reads `BannerInsetContext` from F13; with the thermal banner
   forced, search at y 348 under the banner ending at 316, `o1-drawer-banner.png`). **O2** Documents shows the vault's own "Free up N"
   line above Install when space is short (`DocumentsScreen.tsx`; with 0.9 GB free of the 2.26 GB required: "Free up 1.28 GB",
   `o2-needs-space.png`) and the ask-error text goes through `documents.error.*`. **O3** the Documents library re-checks the embedder when
   the vault reports it ready (`embedder.native.ts` `watchEmbedder`, `library.ts` boot): installed from the Model vault with Documents
   closed, reopening Documents showed the empty library with no embedder card and no relaunch (`o3-documents-after-vault-install.png`).
   Seen on the way, not fixed: with `/data` at 100 % the 5 s prefs tick throws ENOSPC from `prefsStore.native.ts` `writePrefsRaw` as an
   uncaught error (dev red box).

## Fixes round 10b: QA run 4 never-run rows (branch `fixes-r10`) — 14.9.2026
Round 4 findings of `docs/qa/qa-run-2026-09-11.md` (numbered F13–F19 in that section; called R4-F13… here to avoid colliding with pass 3).
Merged `main` (`21459c3`) first. Proven on the same private Pixel 6 API 33 emulator, plus the web smoke.
1. **R4-F13 · a full disk no longer loses chats or crashes** (High; `services/storageFull.ts`, `prefsStore.native.ts`, `storage/reopeningDb.ts`,
   `screens/Chat.tsx`, `components/shell/Banners.tsx`, `packages/core/src/paths/noSpace.ts`, `catalog/install.ts`, `vault-native` `usableDiskBytes`,
   `vault/device.ts`). Four parts. (a) The 5 s exit-meter tick wrote prefs outside a try; `writePrefsRaw` now catches ENOSPC
   (`isNoSpaceError` in core matches ENOSPC / SQLITE_FULL / "disk or disk is full"), keeps the last good value in memory, logs once, and flushes
   it when space returns. (b) A send that cannot be written surfaces the existing `state.storageFull` §8.8 strip (was dead code) through a small
   `storageFull` switch that any writer flips and a 10 s poll clears; the assistant row with the raw "cannot rollback" text is gone. (c) The
   user's text stays in the composer and a user row the store took without an answer is rolled back, so nothing is silently lost. (d) A new chat
   is blocked before the first message when under 50 MB free (`MIN_FREE_BYTES_TO_CHAT`), and `reopeningDb.withTransactionAsync` now runs its own
   BEGIN/COMMIT/ROLLBACK so a failed write reports the real error instead of "no transaction is active". Free space is read with a new native
   `usableDiskBytes` (statvfs `f_bavail`), not expo's `f_bfree`, which had shown 144 MB on a disk the app found full. Emulator with `/data`
   filled to 0 bytes: the send is blocked and the amber "Storage is full" strip shows with the draft kept (`fixes-r10/shots/r4f13-storage-strip.png`,
   `[storage] disk full · 0 bytes free`); freeing space clears the strip; the chat and its earlier answers survive a relaunch. Tests: `isNoSpaceError`
   and the no-space install transition in `packages/core/test/fixes-r10.test.ts`.
2. **R4-F14 · a download that runs out of space pauses cleanly** (`vault/httpsDelivery.ts` `NoSpaceError`, `vault/store.ts`, `catalog/install.ts`
   `no-space` event): an ENOSPC mid-download keeps the `.part` and its resume state and moves the card to the vault's own "needs-space" state
   with fresh numbers, instead of the raw native text and a stale free-space figure; "Try again" resumes byte-exact. The reducer transition is
   unit-tested; the needs-space line itself was shown on device in round 10 (`o2-needs-space.png`).
3. **T26 · streaming answers are announced to a screen reader** (`components/chat/AssistantMessage.tsx`, `lib/announce.ts`): the assistant row's
   accessibility label is now its model header plus the answer's first line (was the header alone), it exposes a "Read this answer" action, the
   message list a "Read latest answer" action, and while a screen reader is on each completed sentence is announced once (throttled to 1.5 s) with
   "Answer finished" at the end. TalkBack is not on this emulator image, so the label is shown from the accessibility tree
   (`content-desc="INSTANT · ON-DEVICE AI · Here are three primary colors:"`, `t26-01-row-a11y-label.png`); the sentence-chunking logic has unit
   tests (`lib/announce.test.ts`, 3 cases).
4. **T28 · a hardware keyboard sends on Enter, breaks the line on Shift+Enter** (`modules/hardware-keys` new Android module, `components/chat/Composer.tsx`):
   a window-callback captures a physical Enter (no Shift, real keyboard device, not the soft keyboard's flag) while the composer is focused and
   sends; Shift+Enter and the on-screen keyboard's Enter still insert a newline. Emulator with the emulated hardware keyboard: Enter clears the
   composer and posts the message, Shift+Enter yields a two-line draft, `input keyevent 66` (virtual, device -1) inserts a newline
   (`t28-01-enter-sent.png`, `t28-02-shift-enter-newline.png`). iOS is unchanged in this round (the module is Android-only).
5. **R4-F19 · a 0-byte file reads as empty** (`screens/documents/DocumentRow.tsx`): a document whose bytes are 0 shows "The file is empty
   (0 bytes)." (`documents.error.empty`) instead of the generic "No text in this file". **R4-F18 · the Ask sheet renders Markdown**
   (`screens/documents/AskDocuments.tsx`): the answer now goes through the same `Markdown` component the chat uses, so `**bold**` no longer prints
   its asterisks. Both are covered by the changed components' own tests and typecheck; not re-shot on device this round.
Not done: R4-F17 (iOS-only paused-strip Continue) needs the iPhone simulator, which this Android stream did not run; the row-level clear was made
in `packages/core` (`policy.ts`: a foreground run ends the paused status without the strip's own button) and is unit-tested, but the iOS strip
behaviour itself was not verified on a device. New i18n keys: `chat.a11y.readLatest`, `chat.a11y.readAnswer`, `chat.a11y.answerFinished` (all seven locales).

### Fixes round 10b, part 2: QA pass-4a observations O9–O11 (`fixes-r10`)

1. **O9 · Documents follows a removal too** (`documents/embedder.native.ts`, `documents/library.ts`): `watchEmbedder` now fires whenever the
   index model's ready path changes (installed *or* removed from the vault, any screen), the library re-resolves on every such change and
   unloads the embedder that left; `resolveEmbedder` also refuses a "ready" vault entry whose file is gone. Emulator, one process (pid 6504):
   Documents with no card → Model vault › Details › Remove → Documents shows "DOCUMENT INDEX MODEL · Install · 262 MB" again
   (`o9-01-documents-ready-no-card.png`, `o9-03-documents-card-after-removal.png`).
2. **O11 · "Free up N" follows the disk** (`packages/core/catalog/install.ts` new `space-check` event, `vault/store.ts` `recheckSpace()`,
   `DocumentsScreen.tsx`, `VaultScreen.tsx`): while any model sits in `needs-space` the store re-reads the free bytes every 5 s (one statfs) and
   both screens re-check on mount; the line updates its number while space is still short and clears to a plain Install once there is room.
   Emulator: `/data` filled to 1.0 GB free → Install tap → "Free up 1.25 GB" on the Documents card / "Free up 1.3 GB" on the vault card; fill
   removed → both lines gone within 2–4 s with no tap and no navigation (`o11-01-documents-needs-space.png`, `o11-02-documents-cleared-same-screen.png`,
   `o11-03-vault-needs-space.png`, `o11-04-vault-cleared.png`).
3. **O10 · the verify-after-download ENOENT** (`vault/httpsDelivery.ts`): found. SDK 57's `File.move()` returns a promise; `finish()` called it
   without awaiting, so the hash could open the final path before the rename settled on a busy disk (the fill had just been deleted in the
   QA run). The rename is awaited now. The same review found a worse regression from round 10b's own R4-F14 edit: the `.part` → final rename and
   the resume-record reset had landed after a `throw` inside the new catch block, so no HTTPS download could ever verify. Both fixed; the
   repo now compiles with `allowUnreachableCode: false` (`tsconfig.base.json`, `apps/mobile/tsconfig.json`), which flags that shape as a
   typecheck error (verified: the round 10b file fails with TS7027, the fixed one passes). Emulator: two full 262 MB installs (Documents card
   and vault card) end `[vault] embed-nomic ready · verified in 839 / 770 ms`, `files/models` holds the final file and no `.part`
   (`o10-01-vault-ready.png`, `o10-02-documents-no-card.png`). `vault/store.ts` `importFile` awaits `File.copy()` for the same reason.
Tests: `packages/core/test/fixes-r10.test.ts` (+2, `space-check`), `apps/mobile/src/documents/watchEmbedder.test.ts` (new, 1). No new i18n keys.

### Fixes round 10d: QA pass-4b O12, the F20 delivery test, O14 (`fixes-r10`)

1. **O12 · VoiceOver reaches the row's inline controls again** (`components/chat/AssistantMessage.tsx`): on iOS the row Pressable is
   `accessible={false}` and the T26 summary label plus the "Read this answer" action sit on the header text, so Continue, Regenerate, the
   reasoning toggle, LEDGER and citation chips stay separate elements; on Android the row keeps the label itself (an unlabelled accessible
   row would otherwise read every child text as its description) and the children were already separate nodes. iPhone 15 Pro simulator
   (iOS 17.0, Debug sim build, `idb ui describe-all`): a stopped answer lists `StaticText "INSTANT · ON-DEVICE AI · 1. As"`, `StaticText
   "Stopped"`, `Button "Continue"`, `Button "LEDGER"` as four elements (`o12-ios-tree.json`, `ios-03-stopped.png`). Pixel 6 emulator
   (uiautomator): `assistant-message` `content-desc="INSTANT · ON-DEVICE AI · 1. abacache"` with `regenerate` and `ledger-toggle` as its own
   focusable child buttons (`o12-android-tree.xml`, `o12-android-stopped.png`).
2. **F20 · delivery unit tests** (`vault/httpsDelivery.test.ts`, new, 3 tests over an in-memory File/DownloadTask): a completed download
   lands the final file with no `.part` and no resume record; Try again with a full-size `.part` renames it without a GET (that path was
   `resumePlan` "done" → fresh download from byte 0; `deliverPart` now short-circuits when the part already has every byte); Try again with
   a partial `.part` resumes from its last byte.
3. **O14** (`services/storageFull.ts`): the log reads `[storage] disk full · N bytes usable (f_bavail; df also counts the root reserve)`.

## Fixes round 11: model recommendation by use + language (branch `fixes-r11`) — 15.9.2026
Moshe, 15.9.2026: "recommend a model by USE and by LANGUAGE, with a MAP of what every model is good at and in which languages, so we mediate honestly."
Spec §6.1 (fit map), §6.3 (recommended within the device floor), §7.8 (recommendation rule, chat card, vault "Best for").
- **Catalog v2** (`packages/core/src/catalog/manifest.json`, re-signed with `scripts/sign-catalog.mjs`): every chat model carries `fit`
  = `uses` (chat, writing, summarize, translate, code, documents, voice, math → best / good / weak), `languages` (≥ en, he, ar, ru,
  es, fr, de, pt, ja, ko, zh → native / good / basic / none) and `weakAt`; `goodLanguages` is now derived (native + good). Sources
  of every judgement: `docs/models/model-fit.md`. Schema + derivation checked by `packages/core/test/catalog-fit.test.ts` (6 tests).
- **Core** (`packages/core/src/catalog/fit.ts`, `recommend.ts`): `rankModels` / `recommendModel({ use, languageCode, device,
  installed, catalog })` → best model + structured reason (use tier, language tier, RAM fit, installed); `adviseModel({ current, … })`
  → the chat card (only when the loaded model is basic/none for the language or weak for the use, and something on this device does
  better on that dimension without doing worse on the other; installed model first, top-ranked named as "best"); `detectUse` (documents
  › quick action › code/math in the text › dictation › persona › chat). `packages/core/test/catalog-recommend.test.ts` (21 tests).
- **Chat** (`screens/Chat.tsx`, `components/chat/ModelAdvice.tsx`, `lib/modelAdviceMemory.ts`): the one-line language strip is
  replaced by a card that says why in plain words, with Switch (installed: the vault default changes and the same chat remounts on the
  new model, `AppServices.reloadChat`) or Install · size (opens the vault; PRO tag when locked), a "best here" line, and Not now; each
  reason shows once per chat and Not now snoozes it for the rest of the chat (per app run). A caption under the header says
  "INSTANT is weak in Hebrew" while the detected language is basic/none for the loaded model. Nothing shows when nothing better fits.
- **Vault** (`screens/vault/FitMap.tsx`, `ModelCard.tsx`, `VaultScreen.tsx`, `ModelDetails.tsx`): every cartridge shows its fit map
  (Good at · Best/Good/Weak, Languages · Native/Good/Basic/No, Weak at); "Best for" pickers (use, language; default chat in the app
  language) rank the cartridges inside each group and move the RECOMMENDED tag, whose line now reads
  "RECOMMENDED ON THIS PHONE · CHAT IN HEBREW"; Details lists every language with its tier.
- **Spec**: §6.1 fit-map tables (uses + languages, copied from catalog v2), §6.3 "recommended within the floor", §7.8 rule + card + vault.
- **Tests**: core 441 (+27: `catalog-fit` 6, `catalog-recommend` 21), mobile 128 (+3 `lib/modelAdviceMemory.test.ts`); i18n 4, ui 11.
  Gates: `pn typecheck`, `pn test`, `pn lint`, `pn --filter @inborn/mobile export:web`, `pn web:build`, `pn web:smoke` (first visit 11.8 s,
  18.4 tok/s; offline 1.7 s; three doors) all pass.

Verify (private Pixel_6_API_33 emulator, `-port 5630 -memory 7600` so Fast passes the boot floor, debug APK from this worktree, Metro
`--port 8137` with `EXPO_PUBLIC_MODELS_BASE_URL=http://127.0.0.1:8794/v1 EXPO_PUBLIC_DEV_RAM_GB=8 EXPO_PUBLIC_AUTOPROMPT=file`,
`scripts/serve-models.mjs` on 8794 over `adb reverse`, Hebrew through `Documents/dev-prompt.txt`; shots in the fixes-r11 scratch dir):
1. Hebrew on Instant, nothing else installed → header "INSTANT is weak in Hebrew"; card "SHARP handles Hebrew much better than INSTANT." ·
   Install SHARP · 2.6 GB · PRO · Not now (`01-hebrew-instant.png`). Not now → card gone; a second Hebrew message → still gone, weak line stays
   (`02`, `03`).
2. Fast installed from the local server (1,280,835,840 bytes verified in the vault, `13-fast-installed.png`) → Hebrew on Instant: "FAST handles
   Hebrew better than INSTANT." + "SHARP is the best here for Hebrew · 2.6 GB" + Switch to FAST (`20-hebrew-on-instant.png`). Switch → same chat,
   FAST loaded in 2.9 s, header now FAST, card "SHARP handles Hebrew better than FAST." · Install (`21-after-switch.png`); Hebrew answered by
   FAST at 7.0 tok/s (`22`); English on FAST → no card, no weak line (`23`); a JavaScript question on FAST → "SHARP (PHI) is better at code than
   FAST." · Install SHARP (PHI) · 2.3 GB (`24-code-on-fast.png`).
3. Vault: fit map on every cartridge (`10-vault-top.png`); with Fast installed, "Best for Chat in English" puts Fast first with
   "RECOMMENDED ON THIS PHONE · CHAT IN ENGLISH" (`14`); Code → Sharp (Phi) carries the tag (`16`); Code in Hebrew → Sharp (`17`).
Not in this round: dictation is not yet reported as the "voice" use by the chat (the map and `detectUse` support it; the composer does not
flag a dictated message); the snooze memory lives for the app run, not in the chat record.
### Round 11b (same branch) — honest tag, dictated use, persisted snooze, Sharp Hebrew spot check — 15.9.2026
- **Honest tag** (`recommendationIsWeak` in `recommend.ts`): when even the top pick is basic/none for the language or weak for the use,
  the vault card says `NOTHING ON THIS PHONE IS GOOD AT CHAT IN HEBREW · CLOSEST: FAST` (new key `models.recommendedNone`, testID
  `recommended-none-<id>`) instead of RECOMMENDED. The chat card never suggested a switch that does not improve the weak dimension; a
  4 GB test now pins it (Fast/Sharp on disk but not fitting → no card).
- **Dictated = voice** (`lib/dictatedDraft.ts`, `Chat.tsx`): `useDictation`'s `onFinal` text is remembered; `submit()` marks the send
  dictated when that text is still inside what was sent and passes `dictated` into `detectUse`.
- **Snooze on the chat row**: `Chat.adviceSnoozed?: string[]` / `ChatPatch.adviceSnoozed` (null or [] clears); migration v5
  `ALTER TABLE chats ADD COLUMN advice_snoozed TEXT` (SQLCipher + Tauri, JSON, null when empty), IndexedDB field; Not now / Switch /
  Install write it, so "Not now" survives relaunch for that chat. `modelAdviceMemory` keeps only "seen once" per app run.
  Contract test case (all three repositories) + Tauri v4 → v5 migration test.
- **Sharp Hebrew spot check** (`docs/models/model-fit.md`, shots `docs/models/fit-check/`): a paragraph, a five-item list and a short
  translation on Sharp; each reply had a garbled clause or a wrong meaning (the translation changed "meeting on Thursday" into
  "confirmation the next morning"). Verdict: better than Fast, not fluent → catalog v2 re-signed with `sharp.he = basic`; no model is
  good at Hebrew. Copy: "FAST handles Hebrew better than INSTANT, but not fluently." (`chat.modelAdvice.language`, new `basic` branch;
  non-English locales fall back to "better" until i18n-delta16 translates it).
- **Tests**: core 444, mobile 134 (+ `dictatedDraft`, `modelAdviceMemory`, contract, Tauri migration). Gates all pass.
- **Verify** (same private emulator recipe, Metro restarted after edits because `CI=1` disables watch): Sharp installed from the local
  server (two shards verified); vault Best for Chat · Hebrew → Fast tagged "NOTHING … CLOSEST: FAST", Code · Hebrew → "CLOSEST: SHARP (PHI)";
  Hebrew on Instant → "FAST handles Hebrew better than INSTANT, but not fluently." + Switch to FAST + Not now; Not now → force-stop →
  relaunch → same chat → another Hebrew message → no card (weak line stays); a new chat shows the card again.


## Fixes round 12: QA run 3 pass 5 follow-ups (branch `fixes-r12`) — 20.9.2026
Findings F22–F26 of `docs/qa/qa-run-2026-09-11.md` (pass 5, `qa-r6`).
- **F22 · a browser download that stored the right bytes could still read as "stored file does not match"**
  (`apps/mobile/public/model-worker.js`, `src/web/opfs.ts`, `src/web/boot.ts`, `src/web/WebShell.tsx`). Root cause: the worker
  announced `done` while its `FileSystemSyncAccessHandle` was still open (the `finally` closed it), and `WebModelDelivery` terminates
  the worker the instant that message arrives, so the close that publishes the file's size to `getFile()` could be cut short; the door
  then re-read the file once, did not find it ready, and called a sha256-verified download a failure. (The worker hashes every byte
  before it says done, so a file that reads as "does not match" is never a bad download, only one the page looked at too early.)
  The worker now closes the file, waits until a fresh handle reports the full size (`awaitPublished`) and only then writes the meta
  and posts `done` (same order for `paused` and `error`, so a resume state always describes bytes that are on record), and the door
  re-reads through `readyModelStatus` / `settleModelStatus` instead of failing on the first miss. `src/web/modelWorkerDownload.test.ts`
  (6 tests) drives the shipped worker against a fake OPFS that only publishes a file when its handle closes.
- **F23 · the browser tier said nothing about a model that cannot do the job** (`screens/Chat.tsx`,
  `packages/core/src/catalog/recommend.ts`). The web holds the single model boot picked and offers no install and no switch
  (`screens/vault/VaultEntry.web.tsx`), so the advice card with Switch / Install stays phone-and-desktop only; the two platform guards
  also hid the honest part. The "INSTANT is weak in Hebrew" caption is no longer platform-gated, and a new grey line under it states the
  same verdict the vault's picker gives, with no action: `NOTHING ON THIS BROWSER IS GOOD AT CHAT IN HEBREW · CLOSEST: INSTANT`
  (`models.recommendedNone`, testID `model-none-line`). New pure helper `modelShortfall(current, use, languageCode)`.
- **F24 · onboarding said "Fast (1.3 GB)", everywhere else 1.2 GB** (`screens/Onboarding/ModelChoice.tsx`, all seven locale files):
  `onboarding.model.fast` is now `Fast ({size})` and the size comes from the catalog entry, like every other size in the app. A locale
  test refuses a digit in that key, so the number cannot drift back into the copy.
- **F25 · the drawer meter printed `NULL · OUT 226 KB` with no model installed** (`app/chats.tsx`, `lib/models.ts`): new `meterLabel`
  gives the friendly model name, or the localized "No model on this device" for the null engine; imports no longer show their raw id.
- **F26 · the Instant row in the vault** (`vault/playDelivery.ts`, `vault/delivery.ts`, `vault/store.ts`). As filed the finding does not
  reproduce: `model-card-instant` is rendered whether or not the file is present, third in "Fits your phone" behind two tall cards, which
  is why the pass read it as missing. What was really wrong is what the row said. On a build Play did not install, Play Core cannot bind,
  and the boot scan's fast-follow install turned that into raw Java text — "Could not install: Failed to bind to the service." — behind a
  "Try again" that could never work. A Play failure to bind is now recognised (`isPlayUnavailable`), takes Play delivery out of the run,
  and lands in the existing `no-delivery` state, so the row reads "Google Play is not available here. Import a model file instead." with
  an Import GGUF button. The brief's other route, an https Install on Android, is not open to us: `app.config.ts` strips
  `android.permission.INTERNET` from every non-development build (spec §5.1, D3), so a download button there would be the dead UI F23
  asks us to avoid.
- **O18 · the model-details sheet said "GOOD LANGUAGES" over a list that includes every tier** (`vault.details.languages`
  in all seven locale files). Since the fit map landed, the row reads "Hebrew (No)" and "Italian (Basic)" too, so the heading is
  now the tier-neutral "Languages" and the tiers in the row carry the meaning.
- **Dictated drafts now have a device-level proof** (`voice/devFlags.ts`, `voice/useDictation.ts`, `screens/Chat.tsx`). Every
  final transcript, system or whisper, now leaves `useDictation` through one `deliver()`; the dev-only hook
  `EXPO_PUBLIC_AUTOVOICE_DICTATE=1` sends an `EXPO_PUBLIC_AUTOVOICE` fixture through that same path and submits it, so §7.8's
  "a dictated draft is the voice use" can be exercised where there is no speech service. The classification goes into
  `dev-run.json` because no screen names it: every model in the catalog is good at voice, so the advice card never has a reason
  to mention it, and `detectUse` ranks code and math above dictation, so a spoken code question reads as code, not voice.
- **F28 · the "Paused while Inborn was in the background" banner outlived its answer** (`lib/pausedTurn.ts`,
  `screens/Chat.tsx`, `components/shell/Banners.tsx`, `device/guard.ts`). The guard's paused status is one app-wide latch that
  only Continue or a dismiss clears, and `Banners` rendered it from `device.recommendation` with nothing tying it to a
  conversation, so it followed the user into every later chat and sat over empty ones. The chat that owns the partial answer is
  now recorded when a generation ends (`afterGeneration`), the banner only renders where `ownsPausedTurn` says it belongs, and
  once the partial is released the guard drops the latch instead of masking the other §8.8 lines.
- **F27 · TAB focus trap between the empty-chat suggestion chips: not reproduced.** On Android 11 and Android 13, from the top
  of the screen and from the composer, with and without a draft, the ring is composer → mic → send → the three chips → Chats →
  model chip → attach → composer, and it wraps. Send is skipped only while the draft is empty, because it is disabled then.
## i18n: Korean + Traditional Chinese (branch `i18n-ko-zhhant`) — 20.9.2026
The launch set of `docs/research/launch-languages-2026-09.md` §1 is eight languages; six shipped. This adds the last two.
- **Locales**: `packages/i18n/locales/ko.json` and `zh-Hant.json`, 1000 keys each, the same count as the other six. Translated against
  the render site, not the English string: Korean is 해요체 throughout (labels stay noun-form, the way Korean UI reads), Traditional
  Chinese uses Taiwan vocabulary (軟體 / 裝置 / 設定 / 隱私 / 飛航模式 / 低耗電模式) and Apple's own Taiwanese strings for system paths
  ("設定 → 隱私權與安全性 → App 隱私權報告"). `Instant` / `Fast` / `Sharp`, `PRO`, `WORK`, `GGUF`, `Face ID` and the host names stay Latin.
- **The `{device}` argument** is a bare noun (`phone` / `tablet` / `computer` / `browser`), so both files wrap it in an ICU select the way
  `ja.json` does — "이 휴대폰" / "這支手機" — instead of dropping an English word into the sentence. Korean and Chinese have one CLDR plural
  category, so every `plural` is `other` (with `=0` kept where English has it). Placeholders and ICU argument names are unchanged, which is
  what `packages/i18n/test/locales.test.ts` pins.
- **Korean particles**: model, file and language names are Latin and unpredictable, so sentences are built to avoid a particle right after
  the placeholder; where one is unavoidable the `(으)로` / `을(를)` form is used, the standard Korean localisation convention.
- **Registered** in `packages/i18n/src/index.ts` (`Locale`, `LAUNCH_LOCALES`, `LOCALE_NAMES` → 한국어 / 繁體中文, `resources`) and in
  `apps/mobile/app.config.ts` (`locales` map + `CFBundleLocalizations`), with `apps/mobile/locales/{ko,zh-Hant}.json` carrying the four iOS
  usage strings. The picker, the web export and the desktop shell all read `LAUNCH_LOCALES`, so no other registration point exists; the
  answer-language list in `Settings/Language.tsx` already carried `ko` and `zh-Hant`. The registry key is `zh-Hant`, not `zh-TW`: that is
  what the answer list, `packages/core` and iOS `.lproj` already use.
- **Store copy**: `docs/store/listing.ko.json` and `listing.zh-Hant.json`, same shape as the other six.
  `node docs/store/scripts/check-store-copy.mjs` passes for all eight with zero warnings. The Apple keyword field is byte-limited, and a
  CJK character costs three bytes, so both keyword lines lean on the Latin model names (gguf, qwen, gemma, mistral, phi, pdf, deepseek) and
  use 3-character-or-longer native phrases, which is also what the checker requires.
- **Proven on the emulator** (Pixel_6_API_33, 4 GB, debug APK + Metro on a private port, `EXPO_PUBLIC_DEV_RAM_GB=8`,
  shots in `docs/qa/i18n-ko-zhhant/`): onboarding, chat, the model-advice card, the vault and settings in both languages.
  The `{device}` select resolves ("이 휴대폰" / "這支手機"), the fit map and both plural forms render, and nothing is clipped at
  the default text size. The advice card was triggered per language: Korean on Instant is `basic`, so `chat.modelWeak` +
  `chat.modelAdvice.language` show ("INSTANT는 한국어에 약해요" / "FAST가 INSTANT보다 한국어를 잘 다뤄요."); Instant is
  native at Chinese, so the zh-Hant card was raised with a Hebrew message instead ("INSTANT 的希伯來文能力較弱" +
  the `basic` branch "FAST 處理希伯來文比 INSTANT 好，但還稱不上流利。"), which also shows a right-to-left answer inside an
  LTR Chinese UI without breaking the layout.
- **Korean particles, fixed from the screenshots**: `은/는` and `이/가` depend on the sound before them, and every model label
  here reads vowel-final in Korean, so `chat.modelWeak` and the two battery lines take `는`, the three keys whose argument can
  be an imported GGUF name take the `은(는)` variable form, and `chat.modelAdvice.best`, `desktop.update.available` and
  `vault.import.unsupportedArch` were rewritten so no particle follows a placeholder at all.
- **Not done here**: `design/store/compose.mjs` has no Korean or Traditional Chinese font. `design/store/capture.mjs` now carries the ko and
  zh-Hant prompt fixtures, but composing those two locales needs IBM Plex Sans KR and TC in `design/store/fonts/` first.
- **Collides with `fixes-r12`, which is not on `main` yet**: that branch edits two values in all seven existing locale files, and it
  branched before ko and zh-Hant existed, so whoever merges both must add the same two edits here or the ICU test goes red.
  `vault.details.languages` loses "Good" (ja becomes 言語) → ko `"언어"`, zh-Hant `"語言"`. `onboarding.model.fast` becomes
  `"Fast ({size})"`, gaining a placeholder → ko and zh-Hant both `"Fast ({size})"`. The second one is the red test: the locale
  suite requires every file to carry exactly en's placeholders, and today's en has none there. Neither edit can be made on this
  branch first, because against today's `main` it is this branch that would fail.
- **Pre-existing, not this branch**: each model's `goodFor` and `fit.weakAt` come from the signed catalog
  (`packages/core/src/catalog/manifest.json`) and are English only, so the vault card shows two English sentences in ko and
  zh-Hant exactly as it already does in ja, de, fr, es and pt-BR. Localising them means localising the signed catalog.

## i18n: localized model copy + CJK list joins (branch `i18n-model-copy`) — 20.9.2026
Closes the gap the previous section left open: every model's plain-language "good at / weak at" now reads in the user's
language, and the fit-map rows stop joining Japanese and Chinese words with a Latin comma.
- **The catalog stays signed and English.** `packages/core/src/catalog/manifest.json` is untouched. Each entry's `goodFor`
  and `fit.weakAt` gained a locale key instead — `models.copy.<catalog id>.goodFor` and `models.copy.<catalog id>.weakAt`,
  11 keys per file (four chat models plus the embedding, speech and vision companions, which have no `weakAt`) — and
  `modelCopy(t, model)` in `apps/mobile/src/lib/models.ts` resolves them, falling back to the manifest line for imported and
  Hugging Face files, which carry no key. `apps/mobile/test/modelCopy.test.ts` pins `en.json` to the manifest word for word,
  so a catalog edit that forgets the locale files goes red rather than shipping two different sentences.
- **Translated in context** (de, fr, es, ja, pt-BR, ko, zh-Hant), against the cartridge, not the English string: `Instant`,
  `Fast` and `Sharp` stay Latin, "thinking mode" reuses each file's own `chatSettings.thinking` wording (Nachdenken /
  Réflexion / Pensar / 思考モード / 생각 표시 / 思考過程), and "on this phone" became a device-neutral noun, since the same card
  renders in the browser and on the desktop.
- **`joinList(locale, items)`** (`packages/i18n/src/list.ts`) replaces every user-facing `join(", ")`: the fit-map use and
  language rows, the model-details languages and source rows, and the document names on the Ask sheet. `Intl.ListFormat` is
  deliberately not used — for these data rows every style it offers inserts a word or the wrong mark (zh-Hant `A、B和C`,
  ko `A, B 및 C`, de `A, B und C`, ja `unit` gives `A B C`) — and Hermes ships none, which would make the phone and the
  browser disagree. `packages/i18n/test/list.test.ts` pins ja / zh-Hant / zh → `、` and ko / en / de / pt-BR → `, `.
- **Proven on the emulator** (Pixel_6_API_33, 4 GB, debug APK + Metro on a private port, shots in `docs/qa/i18n-model-copy/`):
  the vault card and the details sheet in zh-Hant, ja and de show the localized tagline and "weak at" line, the ja and
  zh-Hant tier rows and the details languages row join with `、`, and `en` is unchanged word for word.

## Fixes round 13: the launch-language measurements reach the catalog (branch `fixes-r13`) — 20.9.2026
Work items 1, 4, 5 and 6 of `docs/research/launch-languages-2026-09.md` §7, against catalog v2 (15.9.2026).
Catalog is now **v3, published 20.9.2026**, re-signed with `scripts/sign-catalog.mjs`.
- **The tiers were model-card guesses where a device run disagreed** (`packages/core/src/catalog/manifest.json`,
  `docs/models/model-fit.md`, `docs/spec-src/06-models.html` §6.1). Root cause: catalog v2 rated every language from the
  Qwen3.5 card's multilingual table, and the 20.9 run of 132 real generations (§3.1) contradicts it in ten cells. Fast `de`
  good → **basic** (three of three paragraph samples opened *"Gutem Schlaf ist"*, a case error), Fast `ko` good → basic,
  Fast `he` basic → **none**, Fast `ar` good → native, Instant `de` / `fr` / `es` good → basic, Instant `zh` native → good,
  Sharp `ja` / `ko` / `ru` good → **native** (3/3/3 each). `goodLanguages` follows the map, and both doc tables were rewritten
  to cite the measured P/L/T score instead of the model card.
- **An unrated language was a negative claim** (`packages/core/src/catalog/fit.ts`, `recommend.ts`). Root cause:
  `languageTierOf` read `model.fit.languages[code] ?? "none"`, so `id`, `tr`, `pl`, `hi` and `vi` — which no fit block rates —
  resolved to the worst tier, and an Indonesian user (3/3/2.5 on Sharp) was told nothing on the phone is good at Indonesian.
  Unrated now returns `null`, the same "unknown" an imported model already carried: no weak-language caption, no grey
  `models.recommendedNone` tag, no advice card, and no effect on the ranking. `modelShortfall` returns null for an unrated
  language too, so a weak *use* on the web tier cannot borrow the language's name for a claim we never measured.
- **Traditional Chinese was not representable** (`fit.ts`, `chat/language.ts`, `chat/detectLanguage.ts`, `manifest.json`,
  `screens/vault/FitMap.tsx`). Root cause: `validateFit` enforced `/^[a-z]{2}$/` on fit keys and `detectLanguage` collapsed both
  scripts to `zh`, so a launch language had no tier of its own. Keys now accept a BCP-47 script subtag, the script-tagged tier
  wins with the plain code as fallback (`baseLanguageOf`), `chineseScriptOf` splits the two scripts on eighty character pairs,
  and the manifest rates `zh-Hans` and `zh-Hant` from the §3.1 rows. `goodLanguages` stays plain codes so an older reader still
  matches on `zh`, and the cartridge hides a script variant that agrees with its own language.
- **Proven on the emulator** (Pixel_6_API_33, 6 GB, the debug APK driven from Metro on a private port, shots in
  `docs/qa/fixes-r13/`): a German prompt on Fast shows the caption "FAST is weak in German" and the card
  "SHARP handles German better than FAST." with Switch to SHARP (`de-fast-steers-to-sharp.png`); the same Fast model answering
  an Indonesian prompt shows no caption, no grey tag and no card (`id-no-caption-no-tag.png`).
- **One tier to decide before Arabic ships.** Fast `ar` native now sits above Sharp `ar` good, which the measurements
  (Fast 2/2/3, Sharp 2.5/2.5/2.5) do not support, and §7.8 ranks language before use — so an Arabic user gets Fast recommended
  for code and writing. It is item 1 of the "least certain judgements" list in `docs/models/model-fit.md`.

## Fixes round 14: F33, the vault deep link crashed the app on the way back, plus the pass-6 lows (branch `fixes-r14`) — 20.9.2026
The Play-internal release vc7 died on the OnePlus 6T during soak run 3 with
`java.lang.NullPointerException: Attempt to invoke virtual method 'int android.view.View.getVisibility()' on a null object
reference` at `ViewGroup.dispatchAttachedToWindow` under `ScreenStack.onUpdate`, 153 ms after the BACK that popped `/vault`.
- **Android's list clipping mutated a view tree react-native-screens was in the middle of attaching**
  (`apps/mobile/src/lib/listClipping.ts` — new, applied in `screens/Chat.tsx`, `screens/Chats.tsx`,
  `screens/vault/VaultScreen.tsx`, `screens/documents/DocumentsScreen.tsx`). Root cause: every route in this app is opaque and
  `activityState` is always 2, so `ScreenStack.onUpdate` keeps only the top fragment — pushing `/vault` destroys the chat's
  fragment and popping back makes `FragmentStateManager.createView` re-attach the whole chat subtree in one
  `dispatchAttachedToWindow` walk. React Native's `removeClippedSubviews`, which `FlatList` and `SectionList` turn on by default
  on Android, adds and removes row views directly on the scroll content `ViewGroup` from inside `onAttachedToWindow`, so a row
  disappears from the `mChildren` array that the walk above it already snapshotted and the next slot reads back null.
- **The fix is to stop the mutation, not to catch the NPE.** `listClipping` is one shared `removeClippedSubviews: false` prop
  spread onto the four long lists that can be mounted when a screen is popped back to. Nothing in the render path changes; only
  the off-screen row recycling that RN performs behind Fabric's back is disabled.
- **Upstream, this is known and unfixed.** [react-native-screens#2989](https://github.com/software-mansion/react-native-screens/issues/2989)
  is the same stack with no repro; in [#4677](https://github.com/software-mansion/react-native-screens/issues/4677) the
  maintainer confirms that `Screen.startTransitionRecursive` marks the outgoing subtree with `startViewTransition`, that AOSP
  keeps `mParent` set on transitioning views, and that "I don't think there is much we can do about it in stack v4"; the
  core-side fix for exactly this `removeClippedSubviews` interaction,
  [facebook/react-native#47634](https://github.com/facebook/react-native/pull/47634), was closed unmerged. Upgrading
  react-native-screens does not help: 4.28.0's #4571 only touches translucent/form-sheet routes, which this app has none of.
- **The crash never reproduced headlessly.** About 75 pop cycles on Pixel_2_API_30 (Android 11, 4 GB) against the *unfixed*
  release APK — the exact soak sequence ten times, 40 aggressive push/pop cycles at animation scale 0, and a seeded 12-message
  chat with a 10 s dwell — all ended with 0 FATAL. The frame depths in the 6T stack (4×3521 + 1×3522) map through a real
  `dumpsys` hierarchy onto the scroll content `ReactViewGroup`, which is what identifies the mutating group; the fix rests on
  that localisation and the upstream confirmations rather than on a red-to-green reproduction.
- **Green on the patched release build.** Same emulator, the patched `assembleRelease` APK installed over the unfixed one: the
  mandated sequence ten times (HOME → 60 s → launcher relaunch → 10 s → `am start -a android.intent.action.VIEW -d
  inborn://vault` while a chat is foregrounded → BACK) and the seeded 25-cycle run, both `done; fatals=0`.
- **F30 · Settings printed `NULL` for the chat model** (`screens/Settings/Settings.tsx`). Root cause: the row rendered
  `engine.model.id.toUpperCase()`, and with no model installed that id is the NullLM's `"null"`. It now goes through
  `meterLabel`, the resolver F25 gave the drawer, so the row reads "No model on this device" in the user's language.
- **F31 · model details listed Chinese three times** (`packages/core/src/catalog/fit.ts`, `screens/vault/ModelDetails.tsx`,
  `screens/vault/FitMap.tsx`). Root cause: the languages row mapped every key of `fit.languages`, and since round 13 that
  includes the `zh-Hans` and `zh-Hant` script variants, so Fast printed Chinese, Chinese (Simplified) and Chinese (Traditional)
  at the same tier. The cartridge already hid a variant that agreed with its plain language; that rule is now the exported
  `distinctLanguageCodes` and the details sheet uses it too, so a variant shows up only when its tier differs.
- **F32 · the Traditional Chinese ledger was English** (`packages/i18n/locales/zh-Hant.json`). Root cause: the three ledger
  labels that name a token were never translated, unlike `ja` ("MS / トークン") and `ko` ("MS / 토큰"). They now read
  "MS / 詞元", "第一個詞元" and "詞元 輸入 + 輸出", keeping MS and TOK / S as Latin units the way ja and ko do.
