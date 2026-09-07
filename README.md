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

## Status 6.9.2026 (spec §14 table)
Built and merged: M1 engines (llama.rn / wllama / Rust llama.cpp), M2 vault (signed catalog, PAD packs, resumable downloads, GGUF import),
M3 chat (Markdown, folders, FTS, personas, memory, incognito, crisis/report), M4 shell (expo-router, onboarding, seal, exit meter, lock,
FLAG_SECURE, proof, settings), M5a documents + RAG with citations and OCR, M6 licence (StoreKit 2 / Play verification, paywall),
§6.5 device guard, 6 UI languages, IBM Plex + native chrome, web phase 2 (OPFS, service worker, gate), desktop phase 3 (macOS + Windows
CI), legal/QA/ops docs, store copy, icon. Store records exist as drafts (Play app 4973506308577999063, ASC app 6809165161); build 1.0.0 (1)
uploaded to TestFlight on 6.9.2026; build 1.0.0 (2) with Instant inside the app (see "iOS: Instant ships inside the app").
Open: voice/image on real phones (emulators have no host mic), the full 40-test run (`docs/qa/release-checklist.md`), real Play delivery + sandbox purchases, store
screenshots, privacy-policy URL + support email + developer name (Moshe), Windows signing, Apple FM adapter.


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
- **Strings / permissions**: `apps/mobile/locales/<lang>.json` (`ios` section) → Info.plist + `InfoPlist.strings` for de/es/fr/ja/pt-BR
  (`CFBundleLocalizations`); Android gets `RECORD_AUDIO` + `CAMERA` and the `RecognitionService` queries block; the release APK still
  passes `scripts/check-android-permissions.sh` (no INTERNET). Store answers in `docs/legal/app-privacy-details.md` §4.2a.
- Dev proof: `EXPO_PUBLIC_AUTOVOICE=en.wav,he.wav EXPO_PUBLIC_AUTOVOICE_TTS=1` transcribes WAVs pushed into Documents and writes
  `Documents/dev-run.json` (`voice` key). Clips: `say -v Samantha` / `say -v Carmit` → `afconvert -f WAVE -d LEI16@16000 -c 1`.
- Real phone (7.9.2026, `docs/qa/voice-run-2026-09-07.md`): `EXPO_PUBLIC_AUTOVOICE_SAY="…"` makes the phone speak the sentence through its own speaker one second after each listener opens, and every stage (system dictation, whisper, read-aloud, hands-free) lands under `live` in `Documents/dev-run.json`; the taps come from `ios-tests/VoiceDeviceUITests.swift` (`VOICE_STEPS` in the `.xctestrun`). Blocked on the iPhone 13 Pro until UI automation is approved once on the phone ("Timed out while enabling automation mode").

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

## Intentionally not built yet (one list, 6.9.2026)
Apple FM adapter (simulator-only so far), voice + image input (M5b, on `voice-m5b`), OCR in the browser tier, NativeWind styling (tokens
exist), encrypted backup + device-to-device transfer, keyboard extension, custom quick actions, advanced engine controls (LAN, multi-model,
speculative decoding, GPU / context tuning), Shortcuts / widgets, and every Work-only capability (profession packs, client vaults, redaction,
XLSX intake, audit log, signed export, team keys). Nothing in this list is named on the paywall or in the store copy; the voice lines are the
one exception and are marked (`VOICE_LINES` in `packages/core/src/licence/gates.ts`, `voice_lines` in `docs/store/listing.*.json`) so they can
be pulled in one commit if M5b misses 1.0.

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
node design/store/capture.mjs          # Pixel_6_API_33 + iPhone 15 Pro Max (iOS 17.0) + iPad Pro 13" (iOS 17.5), en + ja/de/fr/es/pt-BR
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
