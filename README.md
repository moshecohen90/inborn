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
- `scripts/check-android-bundle.sh` — release gate: fails if an AAB has no `base/assets/tessdata/{eng,heb}.traineddata` (no OCR) or any `base/assets/ios` entry.
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

The window's own layout (sidebar, message column, document panel, command palette, the Cmd/Ctrl accelerators) arrived
with fixes round 22 below; it is shared with the browser tier and switches on window width, not on the platform.
## Device guard: battery, heat, memory (spec §6.5, §5.7–5.8, §10.2–10.3)
One policy engine decides what the phone does when it gets hot, low or tight on memory, and one status line under the seal says so.
- `packages/core/src/device/` — pure: `DevicePolicy.update(signals, override, now)` → `{status, headline (i18n key), recommendation propose|act, action,
  button, targetTier, threads, gpuLayers, maxTokens (the 1,024 ceiling / 512 saving), contextCap (4K / 2K under 6 GB), pauseDownloads, pauseIndexing, sealGlow,
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
- The guard's `maxTokens` is a **ceiling**, not the length of an answer: since round 19 each turn asks for what its own question deserves
  (`packages/core/src/chat/length.ts`, `ANSWER_CEILING` 1,024 / `SAVING_CEILING` 512 live there) and `src/engine.ts` clamps it to the guard's cap.
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
../../../scripts/check-android-bundle.sh $AAB                             # OK: OCR data + every pack in, iOS assets out.
```
A **store bundle is built with `INBORN_PACKS` unset**, which is every pack of `ALL_PACKS` (`app.config.ts`): `instant`,
`fast`, `embed`, `speech`, `vision` and the two `sharp` shards, ~5.2 GB of models. `INBORN_PACKS=instant,fast` and the like
exist only to shorten an internal build, and a device that installs one cannot reach Sharp, dictation or image input at all
— the app has no INTERNET permission, so Play is the only way a model gets to it. `check-android-bundle.sh` reads the pack
list out of `ALL_PACKS` and fails the bundle when one is missing. Play's limits: base + install-time ≤ 4 GB, fast-follow +
on-demand ≤ 30 GB, **each pack ≤ 1.5 GB** — which is why Sharp ships as two `llama-gguf-split` shards, one pack each.
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

## Status 22.9.2026 (spec §14 table)
Built and merged (main): M1 engines (llama.rn / wllama / Rust llama.cpp) with S31 Benchmark, chip classes incl. android-legacy and a boot-time RAM floor;
M2 vault (signed catalog, PAD packs, resumable downloads, GGUF import, Hugging Face search on iOS, relative stored paths that survive updates);
M3 chat (Markdown, folders, FTS that never leaks locked vaults, personas, memory, incognito, crisis/report, §7.5 auto-delete enforced, S43 quick
actions, share targets ACTION_SEND / PROCESS_TEXT "Ask Inborn" / iOS share extension, one-owner SQLite connection with reopen, a hardware-keyboard
Enter-to-send module, screen-reader announcements for streaming answers); M4 shell (expo-router, onboarding, seal, exit meter, lock, FLAG_SECURE,
proof, settings, prefs backup, a full-disk banner that keeps chats and drafts intact); M5 documents + RAG with honest page/sheet/part citations,
OCR incl. Hebrew on iOS, voice (dictation, Whisper Pro, hands-free, read-aloud engine choice, dictated sends classified as the "voice" use); M6
licence (StoreKit 2 / Play, paywall with Pro AND Work, Work vaults/audit/signed export/redaction); §6.5 device guard; §6.1/§6.3/§7.8 honest
model-fit mediation (catalog v4, re-signed in round 18 with measured per-language tiers, the chat advice card and vault "Best for" pickers, now
also on the web tier); 8 UI languages (the original six plus Korean and Traditional Chinese, ~1,000 keys each, all complete, model copy
localized); web phase 2; desktop phase 3 CI; legal/QA/ops docs; store copy in all 8 languages; icon. Fixes round 15 (Android bundle no longer
carries iOS Mach-O, Fast survives a Play update, F27 fixed on the floor device); round 16 (F34, strict documents mode refuses instead of
answering from the model with nothing attached); round 17 (`verifyOcrAssets` gate + `check-android-bundle.sh`, OCR restored); round 18 (F35 the
hands-free microphone race, F36 honest photo-input routing to Instant only, F37 Sharp's speed card corrected on legacy chips); round 19 (F38,
`packages/core/src/chat/length.ts`, an answer-length policy shared by every tier); round 20 (F39, `isExplanatoryAsk` in the same file, keeps a
how-to or comparison on its use's own moderate length instead of the short-question rule cutting it to three sentences).
Verified: TestFlight 1.0.0 (5) VALID in the internal group (fixes rounds 10–10d), proven on a real iPhone over USB on 20.9 — exit meter
OUT 0 B, paywall prices read from the App Store, 0 crashes (`docs/qa/ios-device-pass-5-2026-09-20.md`); the chat turn itself was blocked
by the XCTest passcode sheet and stays open for build 6. TestFlight 1.0.0 (6) VALID 20.9, real-iPhone pass 6 all PASS except the live chat
turn (blocked by the phone's UI-Automation passcode sheet, not the app) (`docs/qa/ios-build-6-2026-09-20.md`,
`docs/qa/ios-device-pass-6-2026-09-20.md`). TestFlight 1.0.0 (7) VALID 21.9 01:24 from `main` 7419104, buildNumber 7
(`docs/qa/ios-build-7-2026-09-21.md`); real-iPhone pass 7: 11 routes PASS, 0 crashes, chat turn NOT RUN for the same passcode-sheet reason
(`docs/qa/ios-device-pass-7-2026-09-21.md`). TestFlight 1.0.0 (8) VALID 21.9 12:14 from `main` f27a8c5, buildNumber 8
(`docs/qa/ios-build-8-2026-09-21.md`); real-iPhone pass 8: the same 11 routes PASS plus two screens shown for the first time — the empty
chat with its suggestion chips and the documents screen past onboarding — 0 crashes, chat turn still NOT RUN for the same passcode-sheet
reason (`docs/qa/ios-device-pass-8-2026-09-21.md`). TestFlight 1.0.0 (9) VALID 21.9 22:22 from `main` 9e1157f, buildNumber 9
(`docs/qa/ios-build-9-2026-09-21.md`); real-iPhone pass 9: **22/26 PASS, 0 FAIL, 4 NOT RUN** — the hands-free screen opens and survives
75 s with no microphone permission prompt (new this build), the vault's Instant card shows the catalog-v4 "the only model here that can
look at a photo" copy, and the 4 NOT RUN rows (a live chat turn, the Fast/Sharp "no photos" prose below the fold, a model's Details sheet,
the attach sheet) all need a tap behind the phone's UI-Automation passcode sheet (`docs/qa/ios-device-pass-9-2026-09-21.md`). TestFlight
1.0.0 (10) VALID 22.9 02:13 from `main` 5338fb3, buildNumber 10 (`docs/qa/ios-build-10-2026-09-22.md`) — round 19 is shared TypeScript, so
unlike round 18 (an Android-only patch) it reaches this binary: all five `length.ts` strings are verified in the shipped Hermes bundle.
Real-iPhone pass 10: **23 PASS, 0 FAIL, 5 NOT RUN across the three result tables (28 rows total)** — memory fell rather than rose across
the background/foreground round trip, the F38 strings are confirmed on the phone, and the 5 NOT RUN rows are the same tap-behind-the-
passcode-sheet set as build 9 plus "the policy changing a real answer on this phone", which needs the same live chat turn
(`docs/qa/ios-device-pass-10-2026-09-22.md`). TestFlight 1.0.0 (11) VALID 22.9 06:08 from `main` c7f57c0, buildNumber 11
(`docs/qa/ios-build-11-2026-09-22.md`) — the only change since build 10 is round 20 (F39, `isExplanatoryAsk`), and all four of its
regex tables are verified in the shipped Hermes bundle. Real-iPhone pass 11: **24 PASS, 0 FAIL, 5 NOT RUN of 29 rows across the
three result tables** — the F39 tables are confirmed in the bundle this phone ran, and all 5 NOT RUN rows sit behind the same
UI-Automation passcode sheet as every build since 7 (a live chat turn, and the three tap/scroll-only rows that follow from it:
the vault below the fold, a model's Details sheet, the attach sheet). **Update, 22.9 10:49–10:57**: Moshe accepted the sheet
once and the XCUITest driver then drove the installed build 11 hands-free — a real chat turn (row 6, "What is the capital of
France?" answered correctly), F39's length policy proven live (row 15c, the same how-to question got the moderate 4-sentence
budget instead of the factual ask's 1 sentence), and the two below-the-fold rows (13b, Fast's "No photos" prose; 13d, the
attach sheet with Instant resident) are now **PASS**. Final: **28 PASS, 0 FAIL, 1 NOT RUN of 29 rows** — only row 13c (a
model's Details sheet) stays NOT RUN, because the phone locked itself before the third runner session could start
(`docs/qa/ios-device-pass-11-2026-09-22.md`). The App Manager ASC API key cannot export with cloud-managed
certificates (403 FORBIDDEN_ERROR), which is why builds 6–11 were signed with the Admin key; since 22.9 that key is the
release default and nothing is open on it (see "iOS release: which App Store Connect key"). **TestFlight 1.0.0 (12) VALID 22.9
14:28 from `main` 9da93a2, buildNumber 12** (`docs/qa/ios-build-12-2026-09-22.md`) — the change since build 11 is the round-21
shared-shell work that merged above c7f57c0: F40/F41 (llama.rn out of the browser bundle, the download door out of the desktop
shell), F42 (the §8.9 wide-screen layout, sidebar, command palette, shortcuts), the CDN web allowlist and the OPFS publish
waits. Real-iPhone pass 12 (`docs/qa/ios-device-pass-12-2026-09-22.md`): the archive installed **in place over 1.0.0 (11) and
the 1.2 GB Fast model survived byte-for-byte**, all eleven deep-linked screens drew the **phone** shell with no sidebar and no
command palette (F42 is width-gated at 760 pt and the phone is 390 pt, portrait-locked), 0 error lines across 16 device launches, 0
crash reports, memory flat, and the F42, F39 and F38 strings are all verified in the shipped Hermes bundle. **28 PASS, 0 FAIL, 0
NOT RUN of 28 rows — the first iOS pass with nothing left open**: Moshe granted the UI-Automation sheet once at 14:42 and the
rebuilt XCUITest runner closed the last two rows outstanding since build 7 (a model's Details sheet, and the vault below the
fold), and ran a chat turn on the CDN-downloaded 1.2 GB Fast model, which answered correctly at 13.2 tok/s against a card that
promises ~15-24 (carried as a card-accuracy follow-up, the same class as F37). One defect came out of the pass and is filed as
**F43** (`docs/qa/qa-run-2026-09-11.md`): at launch the device guard shows "Ran
out of memory · Switched to Instant" and refuses the chosen model. The app had **not** run out of memory — its own footprint was
223 MB and the engine never opened the Fast file on any of the 16 device launches, so the switch happens ahead of any load. The
device syslog shows the cause: a **system-wide** critical memory-pressure event landing 4.0 s **before** the app started, which
`DeviceGuardModule.swift` subscribes to and forwards as if it were this app's own. Fast itself is fine — one tap on SWITCH BACK
loads it and it answers at 13.2 tok/s. **Fixed in round 23**, where the pass's "not fully isolated" second path proved to be the
dominant one: the guard read RAM as raw GiB while the rest of the app read the marketed size, and Fast's 6 GB minimum sat exactly
between the two, so the boot-time RAM floor started Instant on a phone the catalog recommends Fast for. Both that and the
system-wide subscription are fixed and proved on the same phone; the two cosmetic knock-ons are filed as F45 and F46 and fixed in
the same round. **TestFlight 1.0.0 (13) VALID 22.9 19:00 from `main` 239a268, buildNumber 13**
(`docs/qa/ios-build-13-2026-09-22.md`) — the first TestFlight binary carrying rounds 23–30, and the pass that proves
**F43 on the shipped build** rather than on a locally built Release app: on the same phone, the same vault and the same
prefs that build 12 ran on, build 13 **boots straight into Fast** with no banner on any screen, llama.cpp opens
`Qwen3.5-2B-Q4_K_M.gguf` and `n_ctx` is 4096 where build 12 was capped at 2048
(`docs/qa/ios-device-pass-13-2026-09-22.md`). **25 PASS, 0 FAIL of the 25 rows that need no tap**, 0 error lines across
every device launch, 0 crash reports, and a **30-minute soak** on one process that caught the 10-minute idle unload
firing on an iPhone for the first time — resident memory drops 1.39 GB when it fires, the header still reads FAST, and
the footprint then moves under 1.4 MB across the remaining twenty minutes with the anonymous peak identical at all seven
samples. Two further round-23/25 fixes are confirmed on the binary: `inborn:///voice` now redirects to the paywall
(**F53**) and the paywall's "No subscription. No account. Yours forever." is legible again (**F45**). App Store Connect
reports `minOsVersion` **17.0** against build 12's 16.4 — commit 3346f27, gap #18 — so this is the first build that will
not install on iOS 16, which belongs in the release notes. **Still open and needing Moshe:** the four tap rows (a
model's Details sheet incl. F46's SOURCE line, the vault below the fold, a chat turn on Fast, a second throughput
sample) — the XCUITest runner is built and both sessions are patched and ready, and the run stopped on the phone's
"Enter iPhone Passcode for 'XCTest' · Enable UI Automation" prompt. Two release-pipeline defects came out of the run and
are filed as **F90** (a stale locked `signing_temp` keychain kills `-exportArchive` with an unexplained
`errSecInternalComponent`) and **F91** (`asc-key-env.sh --cleanup` deletes every stream's staged key, not its own).
**TestFlight 1.0.0 (14) VALID 23.9 09:26 from `main` 8033dce, buildNumber 14** (`docs/qa/ios-build-14-2026-09-22.md`)
— cut because MosheAI found build 13's in-app Legal screens rendering raw `{{…}}` placeholders and claims the code does
not support (**F92–F96**, fixes round 31), and legal text is shared TypeScript plus two Markdown files the screen
imports, so build 13's binary could not carry the fix. **The fix is proved on the shipped Hermes bundle, not on the
source tree**: all six placeholder tokens and both draft notices are **0** where build 13 carried eighteen of them, and
`Cohen Apps`, `support@inbornapp.com` and `+1-440-847-8502` are present; the false `published open-source core`,
`Secure Enclave` and `hardware-backed` claims are **0** and the honest key-store wording is in. A sweep of the whole
6,172,387-byte bundle finds 41 distinct `{{…}}` tokens left, one of them `{{COPYRIGHT}}` (which `licenceText()` fills)
and the other 40 all work-pack prompt templates. Real-iPhone pass 14: **27 PASS, 1 FAIL, 1 PARTIAL, 1 NOT RUN of 30
rows** (`docs/qa/ios-device-pass-14-2026-09-22.md`) — 13 deep-link routes all drew, 0 error lines across every device
log, the chat settles to a frame whose full-frame difference bbox is `None`, F43 still boots the phone on the 1.2 GB
Fast model at `n_ctx` 4096, the vault survived the update byte-identical, and the Proof screen still reads `OUT 0 B ·
IN 0 B`. The **30-minute soak** held one process for 31 min 17 s with 0 error lines and 0 crash reports, caught the
10-minute idle unload again (resident −1.38 GB, header still `FAST`), and settled to a footprint within **0.3 %** of
build 13's — two independent runs agreeing, which is what makes the number trustworthy. **The FAIL is new and is filed
as F98**: the in-app **Terms** screen names no licensor and gives no
phone number, because `legalBody()` returns the document from its first `## ` heading and `terms.md` carries
`Licensor: Cohen Apps`, the effective date, the phone and the scope paragraph **only** above it — the privacy policy
survives the same cut only because it repeats the identity in a numbered section. Round 31's guard could not see it
because it asserts those values on the **file** while the reader gets the **screen**, which is the F96 shape again; the
complement was run to prove the check is not vacuous (it fails on the terms and passes on the privacy policy).
**Still open and needing Moshe:** every tap row (a live chat answer with tok/s, the three Hebrew answers, a model's
Details sheet incl. F46's SOURCE line, the vault below the fold, the privacy policy's lower sections). The runner is
built and all four step files are patched and ready; **three** driver attempts stopped at the phone's "Enter iPhone
Passcode for 'XCTest' · Enable UI Automation" keypad. **New fact about that sheet, measured here:** pass 13 recorded
that it does not clear itself, which holds over 90 seconds but not over six — watched with a hashed screenshot every
two minutes, it **expired on its own** with no grant given. So a passcode typed into a sheet that no runner is waiting
on achieves nothing, and the sheet has to be raised while he is holding the phone. It is also a **keypad, not an
"Enable" button**, which is how the ask has been relayed until now. Neither F90 nor F91 recurred: the keychain
search list was already clean, and `--cleanup` was never called.
**TestFlight 1.0.0 (15) VALID 23.9 13:11 from `main` 202db50, buildNumber 15, archive commit `e64d7e72340e`**
(`docs/qa/ios-build-15-2026-09-23.md`) — cut so the Terms screen a TestFlight reader opens actually names its
licensor. **F98 is closed on the phone**: `inborn:///legal/terms` on build 15 opens on `Effective date: 22 September
2026`, `Licensor: Cohen Apps ("we", "us")` and `Contact: support@inbornapp.com or +1-440-847-8502. We have no
physical reception and offer no in-person service.` above "1. Licence", against **0** occurrences of both `Cohen
Apps` and `+1-440-847-8502` when pass 14 measured that screen; the Privacy screen gains the effective date it was
also missing. The shipped Hermes bundle agrees and carries **0** of `{{DEVELOPER_LEGAL_NAME}}`, `{{EFFECTIVE_DATE}}`,
`{{SUPPORT_EMAIL}}` and `Status: DRAFT`. Real-iPhone pass 15 is deliberately narrow — About reads **`1.0.0 (15)` ·
`e64d7e72340e`**, the vault survived the update **byte-identical** (597 B, Models still 1.19 GB, nothing
re-downloaded), five deep-link routes drew with **0** error lines, and F43 still boots the phone on the 1.2 GB Fast
model at `n_ctx` 4096, and the **10-minute idle soak** held one pid for 11 min 4 s with **0** error lines and **0** crash reports naming Inborn, catching the idle model unload again (rss −1.39 GB between minute 5 and 10, anonymous peak unmoved to the byte, header still `FAST`) (`docs/qa/ios-device-pass-15-2026-09-23.md`). The tap rows were **not repeated**; they stand
proven on build 12. **A release-pipeline defect came out of this run and is worth more than the build:** the first
archive built clean with **no Tesseract OCR at all** — no `DocExtractOcr.bundle`, no `eng`/`heb` traineddata, a 564 MB
`.app` against 572 MB — because a fresh worktree has no `.models` symlink and `DocExtract.podspec` resolves its OCR
inputs from `INBORN_MODELS_DIR` **or** `<repo>/.models`. `pod install` had neither, took its `else` branch, **warned
twice and exited 0**, and Hebrew scans would have silently stopped being read. It was caught before the upload and
the archive was rebuilt. A fresh worktree needs the `.models` symlink **before `pod install`**, not only
`INBORN_MODELS_DIR` at prebuild — the prebuild's own `withBundledModel` copy succeeds from the variable alone, which
is exactly what hides the gap. `ExportOptions.plist` is likewise untracked and the prebuild recreates `ios/` without
it.
Play internal testing 1.0.0 (6) active
(`docs/qa/purchases-run-2026-09-11.md` section I); versionCode 7 released 20.9 from `main` ff39f94 (section J), versionCode 8 released 21.9
from `main` 543a5af with the F33 fix (section K); versionCode 9 released 21.9 from `main` f27a8c5 with fixes rounds 15 and 16 (section L);
versionCode 10 released 21.9 from `main` 7c1d47d with the round-17 OCR fix (section M); versionCode 11 released 21.9 from `main` 50b50f5,
the first internal build to ship the document-index-model pack (section N); versionCode 12 released 21.9 from `main` bab755b, **the first
build with every asset pack Play carries in production** (section O) — Sharp, Whisper and the vision projector reach a device for the
first time, Sharp answers at a measured 0.5 tok/s against its card's old "~3-4 tok/s" (F37), Whisper's pack is delivered and bound but
dictation is untestable because the mic race kills the app (fixed next round), and the vision projector only fits Instant's embedding
width; versionCode 13 released 22.9 from `main` 9e1157f with fixes round 18, on a fresh Play install rather than an update (section P) — F35
(dictation stays alive on the release build, 5 mic open/close cycles, 0 crashes), F36 (the attach sheet is honest about which model can see
a photo) and F37 (Sharp's card now tells the truth on this phone) are all proven through the real Play path, plus a repeat OCR proof through
the `embed` pack; versionCode 14 released 22.9 from `main` fc7b3ee with fixes round 19 (F38), delivered as a real Play update in place over
vc13 (section Q); versionCode 15 released 22.9 from `main` c7f57c0 with fixes round 20 (F39), delivered as a real Play update in
place over vc14 (section R) — this run measured the vc14 baseline and the vc15 fix on the same phone and the same driver before and
after the update, and found the short-question control unchanged (still one sentence, ~5-6 words) while explanatory asks trended
longer on both Instant and Fast; a repeated Fast sample taken twice 14 minutes apart on vc15 itself (93 vs 52 words) shows the numbers
establish direction, not magnitude; **versionCode 17 released 22.9 from `main` 239a268 (section T), the Android
submission candidate** — delivered as a real Play update in place over vc16, About reads 1.0.0 (17) / 239a268a082b,
Proof reads OUT 0 B · IN 0 B, a 22-screen vault sweep found no `install-` node after the update, real Play billing
shows YOU OWN PRO with the Work upgrade at ₪149.90 and Restore answers "Purchase restored", §5.7 incognito passes
paired on real hardware, and soak run 10 is an hour of continuous use (`docs/qa/soak-run-10-2026-09-22.md`); its
upload had to be done twice because `:commit` answered 400 for eleven minutes and took the first edit down with a
good 4.77 GiB bundle already hashed by Play. **Release 1.0.0 (18) — versionCode 18 released 22.9 from `main` 8033dce (section U), the Android
submission candidate**, the first Android build carrying fixes round 31 (F92–F96, the legal texts): delivered as a
real Play update in place over vc17, About reads 1.0.0 (18) / 8033dce21dfc, Proof reads OUT 0 B · IN 0 B, the vault
sweep again finds no `install-` node, real Play billing shows YOU OWN PRO with the Work upgrade at ₪149.90 and
Restore answers "Purchase restored", §5.7 incognito passes paired again, and soak run 11 is half an hour of
continuous use (`docs/qa/soak-run-11-2026-09-22.md`). Three rows are new. **L1** reads both Legal screens off the
phone: the Privacy screen is clean and names Cohen Apps, support@inbornapp.com and +1-440-847-8502, while the Terms
screen names **no licensor, no phone and no effective date** because `legalBody()` cuts everything above the first
`##` heading — filed as **F97**, and not fixed here. **L2** shows the document intake gate refusing a Work format
("Excel and HTML files need Pro for Work"); the one-file Pro cap cannot be reached on this phone because the account
owns Pro. **H1** asks "what does shalom mean" in Hebrew three times on Fast — a prompt no earlier run could type,
delivered through ACTION_SEND — and gets Hebrew back **3 of 3**. **Release 1.0.0 (19) — versionCode 19 released 23.9 from `main` 202db50 (section V), the Android submission candidate**, the first Android build carrying fixes round 32 (F97): delivered as a real Play update in place over vc18 (first press, `DOWNLOAD-STARTED`, versionCode 19 after 945 s), About reads 1.0.0 (19) / 202db50abf36, Proof reads OUT 0 B · IN 0 B before and after use, and the **Terms screen now names `Licensor: Cohen Apps ("we", "us")`, the `+1-440-847-8502` contact line and `Effective date: 22 September 2026`** — F97 closed on the device, and F98 with it (`docs/qa/android-vc19/`). One Fast answer at 6.3 tok/s, one Hebrew answer 73 Hebrew characters to 0 Latin, and a 10-minute soak with 2 F33 cycles, 0 crashes and one pid throughout. The upload needed no retry at all this time, the
first since vc12; the Play update instead cost two hours and one "Can't install". Fixes round 15 (`main` f27a8c5): the Android bundle no longer
carries 229 MB of iOS Mach-O, Fast survives a Play update without a re-download, and F27 (a hardware-keyboard focus trap in the empty
chat's suggestion chips) is fixed on the floor device. Fixes round 16: strict "Answer only from my documents" now refuses instead of
answering from the model when nothing is attached (F34). Fixes round 17: round 15's OCR claim was wrong — a clean build shipped zero
Tesseract language files; the fix names the missing Gradle task dependency, adds a `verifyOcrAssets` gate and
`scripts/check-android-bundle.sh` so it cannot recur silently, and versionCode 11 proves OCR of a scan end to end on the 6T through a
real Play install, with the recognized text answering a chat question with a citation. Fixes round 18 (`docs/qa/purchases-run-2026-09-11.md`
section O): F35, the hands-free microphone race that killed the app about 24 s in (a stale-reference race in
`@fugood/react-native-audio-pcm-stream`'s Android side, patched to give the reader thread its own local reference and to serialize
start/stop through one queue); F36, only Instant's projector matches its embedding width, so the catalog and the attach sheet now say so
instead of silently dropping the photo; F37, Sharp's speed card corrected to the measured `~0.4-0.6 tok/s` on `android-legacy` chips.
Fixes round 19 (`packages/core/src/chat/length.ts`, F38): nothing previously told a turn how long its answer should be, so a 0.8B model
answered "What is 2 plus 2?" with the budget of an essay; a single `planAnswerLength` plan (224/512/1,024/160 tokens by turn shape, or an
explicit word/sentence count the user asked for) is threaded through every tier — mobile, web and desktop share the same core — and shapes
the *request*, never truncates the *answer*. Fixes round 20 (`packages/core/src/chat/length.ts`, F39): round 19's `isShortAsk` counted any
one-line question up to 16 words as short, so a how-to like "How do I set up SSH keys on my Mac?" got the same three-sentence budget as
"What is 2 plus 2?"; `isExplanatoryAsk` now runs ahead of that rule and keeps a how-to, comparison or explanation on its use's own
`moderate` plan (512 tokens) via three small tables (Latin-script question words, CJK/Hebrew markers, a short-exception list so "How much
does it cost?" still counts as short) covering the eight shipped locales plus Hebrew; an explicit length still wins and real one-liners are
unchanged. QA retest 11.9 (`docs/qa/qa-run-2026-09-11.md`, passes 1–3, F1–F15 fixed in round 9);
passes 4a–4d and 5 found F17–F29, fixed in fixes rounds 10, 10b, 10c, 10d and 12 (incl. the web tier's §7.8 mediation and the model-download
race, F22/F23); pass 6 (20.9, `main` ff39f94): 28/29 PASS, the document-import row (4d) NOT RUN, three low findings F30–F32 fixed in fixes
round 14. Soak run 1 (11.9, 2 h 30 on the 6T): PASS
(`docs/qa/soak-run-2026-09-11.md`). Soak run 2 (20.9): 0 crashes over 2 h 30, but not a valid continuous-use soak — F27 (a hardware-keyboard
focus trap on the empty-chat screen) cut the prompt load off after 51 minutes (`docs/qa/soak-run-2026-09-20.md`). Soak run 3 (20.9, vc7,
`docs/qa/soak-run-3-2026-09-20.md`): FAIL on M7 — one crash at minute 45 (F33, a react-native-screens NPE after a deep link to `/vault`
taken right after a background return), 2 h 41 min, 47 prompts attempted / 44 answered / 0 send failures. Fixes round 14
(`README.md` section "Fixes round 14", `main` 543a5af) found F33's root cause to be Android list clipping (`removeClippedSubviews`)
mutating a view tree react-native-screens was re-attaching; fixed in `apps/mobile/src/lib/listClipping.ts` on the four long lists, plus
F30–F32. Soak run 4 (21.9, vc8, `docs/qa/soak-run-4-2026-09-21.md`): PASS, 48 F33 pop cycles with zero crashes, one process for the whole
5 h 39 min run, F27 reproduced as FAIL (not fixed), F28 PASS retested. Soak run 5 (21.9, vc9, `docs/qa/soak-run-5-2026-09-21.md`): PASS,
26 F33 pop cycles with zero crashes, one process for 2 h 31 min — the build reached the phone through a real Play update from vc8 rather
than an adb install; F27 retested fixed (two clean nine-stop TAB rings reaching the composer), Fast survived the update with no
re-download, F28 PASS. Soak run 6 (22.9, vc13, after a fresh Play install, `docs/qa/soak-run-6-2026-09-21.md`): **lifecycle PASS** — 14 F33
pop cycles, zero crashes, one process for 1 h 12 min, zero dropbox entries for versionCode 13 — but six of seventeen prompt turns ran past
the driver's wait (83–139 s); Moshe watched one of them on the phone at 01:00 and filed it as F38. Soak run 7 (22.9, vc14, delivered as a
real Play update over vc13, `docs/qa/soak-run-7-2026-09-22.md`): PASS, **26/26 prompts completed, 0 timeouts**, 12 F33 cycles all OK, one pid
for the whole hour, 0 crashes — and it corrects soak 6's six timeouts (see "Correction 22.9" below "Fixes round 19"). Soak run 8 (22.9,
vc15, delivered as a real Play update over vc14, `docs/qa/soak-run-8-2026-09-22.md`): PASS in two half-hour windows, Fast then Instant,
after the first window's model switch silently failed and had to be re-run — together **26/26 prompts completed, 0 timeouts**, 12 F33
cycles all OK, one pid (29368) across both windows, 0 FATAL/ANR and no dropbox entry belonging to versionCode 15. Soak run 9 (22.9, **vc16**, the Android submission candidate, delivered as a real Play update over vc15,
`docs/qa/soak-run-9-2026-09-22.md`): PASS — **15/15 prompts completed, 0 timeouts, 0 send failures**, 12 F33 cycles all OK, one pid
(25434) for 63 minutes, 0 FATAL/ANR across 39,018 log lines and no dropbox entry naming Inborn at all. It is the first soak to read the
ledger after **every** answer: Fast measured 6.1-7.0 tok/s (median 6.4) against the `~5-7 tok/s` its own vault card promises on this
phone and Instant 14.1-14.2 against the `12-18` its `android-legacy` row carries, so **neither card overstates**; `ms/token` held
steady per model across the hour. Release rows, real Play billing (YOU OWN PRO, Work
upgrade ₪149.90, Restore -> "Purchase restored") and the 4 GB device-tier rows are section S of `docs/qa/purchases-run-2026-09-11.md`;
the same pass closed §5.7 **incognito** on real hardware for the first time (`docs/qa/qa-run-2026-09-11.md` Pass 8). Launch-language
decision (`docs/research/launch-languages-2026-09.md`): 8 launch languages measured on device
(English, Japanese, German, Spanish, French, Portuguese-Brazil, Korean, Traditional Chinese); Indonesian, Simplified Chinese, Gulf Arabic
and Italian for wave 2; Hebrew needs its own model (`DictaLM-3.0-1.7B-Instruct`) and ships the quarter after launch, not at 1.0. Voice on
the real iPhone (`docs/qa/voice-run-2026-09-11.md`); purchases on both stores (`docs/qa/purchases-run-2026-09-11.md`); copy sign-off
rounds 2a–2d and design sign-off (`docs/design/`).
The model CDN is **live** since 22.9: `inbornapp.com` on Cloudflare Registrar, R2 bucket `inborn-models` behind
`models.inbornapp.com`, all 8 catalog objects (7.15 GB) published and verified by `scripts/publish-models.mjs` — size,
`Accept-Ranges`, a ranged read of the first and last MiB hashed against the local file, and a full sha256 on the two
smallest. CORS is proven for the browser's ranged fetch. The web tier downloads Instant from it, verifies it and answers
(`web:smoke`); the iOS **simulator** cannot, because its `nsurlsessiond` refuses the app's background session
(`NSCocoaErrorDomain 4097`) — a simulator limit, not the app. Details and the re-verify command: `docs/ops/cdn-r2.md`.
Open (Moshe only): a model's Details sheet on the real iPhone (row 13c) still needs one more accepted "Enter iPhone Passcode
for 'XCTest' · Enable UI Automation" sheet — the rest of the tap-driven backlog (live chat turn, attach sheet, vault below the
fold) is now proven; the real-iPhone CDN download proof is **done and passed** — Moshe's iPhone pulled Fast, 1.2 GB, from
`models.inbornapp.com` in 151 s, the app's own sha256 check passed and it answered a chat turn with the downloaded model
(`docs/qa/cdn-iphone-2026-09-22.md`); the submission candidates are now **TestFlight 1.0.0 (12)** from `main` **9da93a2** and
**Play versionCode 17** from `main` **239a268**; Cloudflare-side
privacy/support pages are not deployed yet (the site stays parked until design approval); Play Console fields (privacy URL,
sign-in details, IARC rating, target audience, data safety declaration, contact details) and ASC privacy/support URLs + review
information; the 8 legal placeholders (support email, legal name, address and the rest of `docs/legal/`); store screenshots
after his design approval; product decisions — Family Sharing, regional price policy (store conversion vs the country-ratio
table), Work-tier scope, the 8 launch languages; the desktop `.app` runtime proof (Keychain-prompt fix now gives stable signing
via `apps/desktop/scripts/with-signing-identity.sh`; a blank window was seen before F41) to run when Moshe is away from the
Mac; submit the four IAPs with app version 1.0; a share-in via a MediaStore `content://` URI from the shell imports nothing and
the share module swallows the read failure silently — real but low severity, carried as a 1.0.1 card rather than a 1.0 blocker
(`docs/qa/purchases-run-2026-09-11.md` section N); the Arabic tier ranking question in `docs/models/model-fit.md`'s "least
certain judgements" list. The Play payments-profile banner is a self-hold to 16.1.2027, not an open issue. Declared cuts for
1.0: .sealed backup, side-by-side compare, Shortcuts/widgets/keyboard, Apple FM on device.

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

**Pack subset.** `INBORN_PACKS=instant,fast,embed` (keys of `ALL_PACKS` in `apps/mobile/app.config.ts`; unset = all six: instant, fast, embed, sharp, speech, vision)
limits what `plugins/withAssetPacks.js` declares. **Any build that goes to a store track ships at least
`instant,fast,embed`**: the embed pack is the document index model, and without it document indexing and the OCR of scans
answer `onError(-2)` (MODULE_UNAVAILABLE) on the device — vc8 to vc10 shipped without it (round 17, closed by vc11), and
`scripts/check-android-bundle.sh` now fails a bundle that is missing any of the three. The bundle then ships Instant
(fast-follow, 532 MB), Fast (on-demand, 1.28 GB) and embed (on-demand, 274 MB). `INBORN_VERSION_CODE` sets
`android.versionCode` (Play refuses a code it already has; `node scripts/play-upload.mjs --next-version-code` prints the
next free one).

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
INBORN_MODELS_DIR=/Users/moshecohen/dev/inborn/.models INBORN_PACKS=instant,fast,embed INBORN_VERSION_CODE=$(node ../../scripts/play-upload.mjs --next-version-code) \
  npx expo prebuild -p android --no-install
cd android && eval "$(../../../scripts/play-signing-env.sh)" && ./gradlew bundleRelease -PreactNativeArchitectures=arm64-v8a
AAB=app/build/outputs/bundle/release/app-release.aab; BT=/Users/moshecohen/dev/inborn/.tools/bundletool-all-1.18.3.jar
java -jar $BT validate --bundle=$AAB && BUNDLETOOL=$BT ../../../scripts/check-android-permissions.sh $AAB
../../../scripts/check-android-bundle.sh $AAB          # both traineddata, all three asset packs, no base/assets/ios
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

## iOS release: which App Store Connect key
Archive, `-exportArchive`, `altool --validate-app` and `altool --upload-app` all sign through **cloud-managed
distribution certificates**, and Apple grants those only to an ASC API key whose role is Admin or one that has been
given the "Access to cloud-managed distribution certificates" checkbox. The App Manager key `inborn-asc-api`
(`4V4PPDXM5A`) has neither, so it answers 403 FORBIDDEN_ERROR on export, and this Mac holds no local distribution
identity to fall back on. Builds 6–11 were finished by hand with the Admin key; since 22.9.2026 it is the default.

`scripts/asc-key-env.sh` reads the Admin key (Keychain `store-reviews` / `appstore-analytics-config`, key id
`REDACTED-ASC-KEY`, the same key the ASO tooling uses), refuses any entry whose `role` is not Admin, writes
`AuthKey_<kid>.p8` into `~/.appstoreconnect/private_keys` with mode 600 — the only place `altool` reads it from — and
prints the exports. `--cleanup` deletes every staged `.p8`; run it at the end of a build, as the build records do.

```
eval "$(../../../scripts/asc-key-env.sh)"
xcodebuild -exportArchive -archivePath build/Inborn.xcarchive -exportOptionsPlist ExportOptions.plist -exportPath build/export \
  -allowProvisioningUpdates -authenticationKeyPath "$INBORN_ASC_KEY_PATH" -authenticationKeyID "$INBORN_ASC_KEY_ID" \
  -authenticationKeyIssuerID "$INBORN_ASC_ISSUER_ID"
xcrun altool --validate-app -f build/export/Inborn.ipa -t ios --apiKey "$INBORN_ASC_KEY_ID" --apiIssuer "$INBORN_ASC_ISSUER_ID"
xcrun altool --upload-app  -f build/export/Inborn.ipa -t ios --apiKey "$INBORN_ASC_KEY_ID" --apiIssuer "$INBORN_ASC_ISSUER_ID"
../../../scripts/asc-key-env.sh --cleanup
```

Read-only ASC API work (build status, prices, portal identifiers) may keep the App Manager key:
`INBORN_ASC_KEYCHAIN=inborn-asc-api:4V4PPDXM5A INBORN_ASC_ALLOW_NON_ADMIN=1 eval "$(scripts/asc-key-env.sh)"`.
Verified 22.9.2026: the Admin entry answers `GET /v1/builds?filter[app]=6809165161` with HTTP 200 and builds 7–11 VALID.

The alternative, one click for Moshe and not needed once the above is in use: App Store Connect →
[Users and Access → Integrations → App Store Connect API](https://appstoreconnect.apple.com/access/integrations/api) →
key `4V4PPDXM5A` → tick **Access to cloud-managed distribution certificates**. That would let `inborn-asc-api` export
on its own; the recipe would then work with either key.

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
  `maxTokens` from the action's own length plan (round 19: `planAnswerLength`, the 1,024 ceiling for a rewrite or a translation), `temperature: 0.3`,
  offline), then Stop / Copy / Replace (Android PROCESS_TEXT only) / Open in chat (the action
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
  It did reproduce on the real OnePlus 6T, in soak run 2 (`docs/qa/soak-run-2026-09-20.md`) and soak run 4
  (`docs/qa/soak-run-4-2026-09-21.md`); round 15 below fixes it.
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

## Fixes round 21: the web build crashed on the first onboarding click (branch `web-desktop-check`) — 22.9.2026
**F40** (found on the real web export, 22.9.2026): after the download door, pressing **Continue** on S01 Welcome left a
blank page — `pageerror: Cannot read properties of undefined (reading 'get')`. **F41** (found on the real desktop
`.app`, same day): the Tauri window wore the browser's notice strip and its **download door**, a gate asking for a model
the Rust vault already holds.

**Root cause, F40.** S02 (`screens/Onboarding/ModelChoice.tsx`) reads `useInstalledModel` from `../../vault`;
`vault/index.ts` re-exports `resolveEngine` from `vault/resolve.ts`; that imports `adapters/llamaRn.ts`; `llama.rn`
calls `TurboModuleRegistry.get("RNLlama")` at module scope. react-native-web has no `TurboModuleRegistry`, so the page
died the moment Metro evaluated that module — one click into onboarding. Harmless on the phones, and the import had
been there all along.

**Root cause, F41.** `WebShell` is mounted from `app/_layout.tsx` for every web-platform build, and the Tauri shell is
one. Its doors read `web/boot.ts`, which the desktop never runs (`adapters/prepare.web.ts` sends it to
`prepareTauri()`), so the desktop was being gated on a boot that had not happened.

**Why the gate missed F40 — the part worth remembering.** `pn web:smoke` covered the download door, OPFS, the offline
visit, the phone door and the no-space door, and it **passed on the broken build**. Its context set
`localStorage["inborn.prefs"] = {onboarded:true}` in an init script so it could get to the engine faster, so in its whole
life it had never opened an onboarding screen. The bug sat on the one path the gate stepped over.

**Fix.**

| finding | change | pinned by |
|---|---|---|
| F40 | `apps/mobile/src/vault/resolve.web.ts` — a Metro platform variant returning `null`, keeping `llama.rn` out of the web bundle (same discipline as `screens/vault/VaultEntry.web.tsx`); `vault/store.ts` no longer calls `devFallbackFile()` on the web, which built an `expo-file-system` path under a document directory no browser has | `apps/mobile/test/webBundle.test.ts` |
| F41 | `apps/mobile/src/web/doors.ts` — `webDoorsApply()` over the existing `isTauri()`; `WebShell` renders `BrowserShell` only when it is true and otherwise passes its children straight through | `apps/mobile/src/web/doors.test.ts` |

**Gate closed twice.** `scripts/web-smoke.mjs` now walks the real first visit — download door → **S01 Welcome → S02
model → S03 airplane → S04 sealed → S05 lock** → chat → one prompt — and checks for a page error after every screen and
after every click, so a dead page fails in seconds rather than timing out; `skipOnboarding` survives only on the two
contexts that never get past the door. And `apps/mobile/test/webBundle.test.ts` needs no browser: it walks every route
under `src/app` in Metro's web resolution order (`.web.*` wins) and fails if `llama.rn`, `whisper.rn`, `expo-iap`,
`expo-sqlite`, `expo-speech-recognition` or `@fugood/react-native-audio-pcm-stream` is reachable, printing the chain.

**Negative control, run today.** With `vault/resolve.web.ts` moved aside and the export rebuilt, both tripwires fire:

```
FAIL: onboarding-welcome (after the click): the page threw Cannot read properties of undefined (reading 'get')

app/onboarding/model.tsx -> screens/Onboarding/ModelChoice.tsx -> vault/index.ts -> vault/resolve.ts
  -> adapters/llamaRn.ts -> llama.rn
```

**Proof, headless, at 1280×800** against the rebuilt export served on the port Moshe already has open
(`http://127.0.0.1:8477`): the download door, **S02 after Continue** (F40's crash site, "READY NOW · Instant · built
in · 0.5 GB"), and chat answering "The capital of France is Paris." with the chip on INSTANT and the seal shut —
`docs/qa/fixes-r21/`, write-up `docs/qa/fixes-r21-2026-09-22.md`. `[inborn] wllama loaded … in 1300 ms`, zero page
errors across the walk. Chrome headless shell with its own profile; nothing was put on his screen.

**The Keychain prompt on rebuilt desktop builds** (the reason the desktop app annoyed him, not a QA finding). The chat
database is SQLCipher and its key is a login-Keychain item (`com.inbornapp.desktop` / `chat-db-key`). An item's ACL
names the app that created it, and an ad-hoc signature (`"signingIdentity": "-"`) identifies an app only by its own code
hash — so every rebuild is a stranger and macOS asks for the login password. `desktop:build:app` and `desktop:build` now
go through `apps/desktop/scripts/with-signing-identity.sh`, which exports `APPLE_SIGNING_IDENTITY` from the first
**Apple Development** identity on the Mac; that certificate's designated requirement is identifier + team, so one
"Always Allow" holds across rebuilds. Recipe for an item an older ad-hoc build already created, with the real service
and account names, in `apps/desktop/README.md` under "QA launches without keychain prompts".

**NOT RUN.** The desktop shell was **not launched**: Moshe is at this Mac and this stream may not put anything on his
screen. F41's fix, the signing change and the Keychain behaviour are proven only as code, tests and `desktop:check`;
the runtime pass is scheduled. No physical phone was used.

Gates on this branch: `pn install --frozen-lockfile` 0, `pn typecheck` 0, `pn test` 0 (core 505, mobile **180** — 169 +
the 11 new, i18n 10, ui 11 — **706** tests), `pn lint` 0, `pn web:build` 0, `pn web:smoke` 0 (six PASS lines, first
visit 12.6 s at 30.3 tok/s, offline visit 1.6 s with 0 model fetches), `pn desktop:check` 0 (7 Rust tests). `web:smoke`
needs `MODELS_DIR=/Users/moshecohen/dev/inborn/.models` in a worktree, which has no `.models` of its own.
## Fixes round 22: wide screens rendered the phone shell (branch `desktop-layout`) — 22.9.2026
**F42** (Moshe, 22.9.2026): *"on large screens like desktop the app must have a desktop design, not a mobile one,
depending on the screen size."* The web export and the Tauri window stretched the phone shell across the window — one
column at any width, the header's "Chats" button as the only door to the chat list, bottom sheets rising from the edge
of a 1,440 px window. Spec §8.9 and §9.7 had described the desktop shell since the first draft; nothing rendered it.

**Fix** — one threshold table, `apps/mobile/src/lib/layout.ts` (pure, so vitest can read it; the `useWindowDimensions`
hooks sit in `lib/useLayout.ts`): `phone` under 760 pt, `wide` from 760, `desktop` from 1,040 — the §9.7 window
minimum, and the width at which the document panel fits beside a full column.

| mode | shell |
|---|---|
| `phone` | exactly what shipped to the stores; the app is portrait-locked, so no phone reaches 760 pt |
| — | onboarding, the legal screens and the lock screen stay full-bleed at any width |
| `wide` | permanent 280 px sidebar + message column |
| `desktop` | sidebar + 680 px column + 340 px document/citation panel |

What the wide shell contains. The **sidebar** is the chats drawer itself, mounted permanently: the route body moved into
`components/shell/ChatsPane.tsx` so the pushed route and the sidebar render the same pane, `/chats` redirects to `/`
when a sidebar is up (the demo's desktop frame does the same), and `Chats` gained one prop, `embedded`, which drops the
close ✕ and nothing else. Its footer carries Model vault and Documents beside Settings and Proof, so the five §8.9
sections are all reachable there; the phone drawer's footer is untouched. The **chat** keeps the §8.9 measure — stream
and composer centred at 680 px, the header's back button replaced by a spacer so the seal stays centred — and put back,
as the way to reopen the sidebar, whenever Cmd+\\ has hidden it, so the shortcut is never a dead end. The
**document/citation panel** reuses what was already there: `Citations` has carried an `onOpen` hook documented as "the
desktop side panel, for instance" since the documents milestone, and `PassageSheet`'s body became `PassagePanel` so the
sheet and the panel render one passage view. **Sheets** become centred 560 px dialogs with a fade in both `Sheet`
primitives: a window with a sidebar has no bottom edge for a sheet to rise from.

**Keyboard** (browser and desktop only). `lib/desktopKeys.ts` maps Cmd/Ctrl+N (Shift: incognito), +K palette, +F search,
+M model picker, +\ toggle sidebar and Esc stop onto the `lib/shortcuts.ts` bus the Tauri menu has used since phase 3,
so no screen needed new wiring. The three new ids became menu items with the same accelerators
(`apps/desktop/src-tauri/src/shell.rs`), and the browser binding is skipped inside Tauri so a chord never fires twice.
Cmd+N and Cmd+M cannot be taken from a browser (new window / minimise survive `preventDefault`); in the app the menu
owns them. The **command palette** (`components/shell/CommandPalette.tsx`) is one field with no animation over the six
sidebar screens and the recent chats.

**One bug found on the way.** `chatCreated` never bumped `chatsVersion`, so a chats list that stays mounted — the
sidebar is the first one in the app — did not show a chat the moment its first message created it. The phone never saw
it because its drawer reloads on every mount. One line in `services/AppServices.tsx`.

**Proof.** The real deployable web build served by `scripts/serve-web.mjs` and driven headless by
`docs/qa/desktop-layout/shots.mjs` (one Chromium, closed at the end, Instant answering from OPFS): screenshots at
1280×800, 1440×900, 900×800 and 390×844 in `docs/qa/desktop-layout/`, written up in
`docs/qa/desktop-layout-2026-09-22.md`. **The phone shell is pixel-identical, measured**: the same `SHOTS_PHONE_AB=1`
run against `origin/main` 6899f07 in a second worktree produced byte-identical PNGs of the empty chat and the chats
drawer at 390×844. Two things are not proven here and the QA note says so: the citation variant of the panel has no
screenshot (web indexing needs the `nomic-embed` GGUF, which is not on this machine), and **the Tauri window was not
photographed** — launching a freshly built `Inborn.app` re-signs it ad hoc and the vault key's Keychain ACL then asks
the operator for a password on screen, so the desktop shell stays with the `web-desktop-check` stream.

Gates on this branch: `pn install --frozen-lockfile` 0, `pn typecheck` 0, `pn test` 0 (core 505, mobile 179, i18n 10,
ui 11 — **705** tests), `pn lint` 0, `pn web:build` 0, `pn web:smoke` 0 (five PASS lines). `pn desktop:build:app` also
returned 0, but the built app is deliberately not launched here — see the QA note.

## Fixes round 27: three promises the code did not keep (branch `fixes-r25`) — 22.9.2026
**F66, F67, F68** — gaps #15, #18 and #6 of `docs/qa/spec-conformance-2026-09-22.md`. They are one shape three
times: something we tell users or a store reviewer, against a number or a switch in generated or disabled code that
nothing ever compared it to.

### F66 — the 15-second background grace was not real on iOS
§10.3 #21 and §6.5 promise that an answer still streaming when the app leaves the screen gets up to 15 s to finish,
then keeps its partial text and offers *Continue*. iOS suspends a process within seconds of it leaving the screen,
so on a phone that budget simply stopped being spent: `grep beginBackgroundTask` over the whole tree returned
nothing, and T12's pass bar in `docs/qa/release-checklist.md` stated an outcome no build could produce.

`apps/mobile/modules/background-task/` wraps UIApplication's background task. `apps/mobile/src/device/bgHold.ts`
decides when one is held, from the only two facts that decide it — off-screen, and still generating — and the guard
syncs it from the three events it already subscribes to (app state, engine activity, expiry), so a hold cannot
outlive the answer it was taken for. Three things are worth knowing about the edges:

- **When iOS takes its time back before the grace is up**, the answer stops with its partial text kept and is
  reported as the *same* pause the grace raises, so the chat offers Continue through `wasStoppedByGuard()` and
  `notePausedTurn` — the path that already existed, not a second one.
- **Asking for more time in the background episode the OS just reclaimed** is how an app gets killed, so it is
  latched off until the app is in front again.
- **The native side claims its token before `beginBackgroundTask` can expire it**, so the race where the expiration
  handler finds nothing to end cannot leave a task running and the app killed for it.

Built for the real phone: an unsigned arm64 `iphoneos` build carries `_TtC14BackgroundTask20BackgroundTaskModule` and
the selectors `beginBackgroundTaskWithName:expirationHandler:`, `endBackgroundTask:` and `backgroundTimeRemaining` in
its binary, and Expo's autolinking registered the module in `ExpoModulesProvider.swift`
(`docs/qa/fixes-r25/ios-device-build.txt`). **The hold's runtime effect on a backgrounded phone is not proven here.**
Driving the iPhone needs the *"Enter iPhone Passcode for 'XCTest' · Enable UI Automation"* sheet, which only Moshe can
accept and whose grant does not persist, so release-checklist T12 stays open for the next pass he is present for.

### Android takes no foreground service for 1.0 — decided, not deferred
The spec row promised one ("foreground service קצר-חיים עם התראה"); it is now restated. Three reasons:

| | |
|---|---|
| it is not needed | Android does not suspend the process when the app leaves the screen. It pauses JS *timers*, which is exactly why the grace has always been enforced on the token stream in `engine.ts` (`setPauseCheck`, asked once per streamed token) rather than on a `setTimeout` |
| it already works without one | release-checklist T13, 13.9.2026: `KEYCODE_SLEEP` for 25 s on the E-P6-36 emulator gave "Paused while Inborn was in the background. The partial answer is kept." with CONTINUE, the partial in the database, and CONTINUE resumed |
| it costs and buys nothing | a persistent notification on screen for a fifteen-second window, and since Android 14 a `dataSync` service needs a Play Console declaration with a video justification and carries a 6 h / 24 h budget |

What a service *would* cover is a low-memory kill of a backgrounded app, and that is gap #32 — the assistant row is
written only when the stream ends — which is filed separately and not solved by a notification.

### F67 — every build shipped at iOS 16.4 against a declared iOS 17 floor
§6.3, T36 (which *tests* the floor at iOS 17), `docs/legal/privacy-policy.md` and the store listing all say 17.
`ios/` is generated and gitignored, so the number that actually shipped was visible only in App Store Connect,
where builds 6 through 12 read `minOsVersion 16.4`. Two podspecs we own were lower still: `SecureScreen` at 15.1.

Fixed with the key Expo already owns rather than a plugin of our own — `ios.deploymentTarget` in `app.config.ts`,
which `@expo/prebuild-config`'s default chain applies to `ios/Podfile.properties.json` and to the app target's build
configurations. It leaves the *project-level* pair at the template's 16.4, which any target added later would
inherit, so `plugins/withProjectDeploymentTarget.js` carries the same number down to them. Proved by running
the build rather than by reading the config: all four pbxproj entries and the Podfile property read 17.0 after
prebuild (`docs/qa/fixes-r25/ios-deployment-target.txt`), and the `Info.plist` of the arm64 app `xcodebuild` produces
reads `MinimumOSVersion 17.0` (`docs/qa/fixes-r25/ios-device-build.txt`). Three tests hold the config, every podspec
and the two documents to one number, so the next drift fails on a laptop instead of in App Store Connect.

### F68 — the zero-INTERNET CI gate was switched off
`android-permission-gate: if: false`, with a TODO saying it needed a release APK. So the one check behind decision
D3 was a human remembering to run a script on an artifact nobody else could see, while two store questionnaires and
the privacy policy assert the result. Worse, for a guard: it had only ever been watched pass.

Nothing has to be built. The merged release manifest is the artifact that decides the answer, and gradle writes it
from `:app:processReleaseManifest` with no signing key, no models and no build-tools.
`scripts/check-android-permissions.sh` now takes that file alongside an APK or AAB, and **refuses a pre-merge
manifest** rather than passing it: `app/src/main/AndroidManifest.xml` lists INTERNET as `tools:node="remove"` and
nothing else outside the allowlist, so a gate pointed at it would go green while no dependency manifest had been
merged yet. The merger's injected `<uses-sdk>` and dropped `tools` namespace tell the two files apart.

The workflow itself runs on `v*` release tags and manual dispatch only (Moshe's rule 17.9.2026: no CI on every push);
the gate runs in every release run, and before a release it is also run by hand with
`scripts/check-android-permissions.sh` on the merged manifest.

**Watched fail on the real path**, not on a fixture: the same three commands with `APP_VARIANT=development`, which
empties `android.blockedPermissions`, produce a manifest carrying 18 permissions with INTERNET among them, and the
gate exits 1 (`docs/qa/fixes-r25/ci-permission-gate.txt`). That listing also settles gap #25 — the INTERNET does
come from the `openiap-google` wrapper, so the spec's stated reason is wrong and `blockedPermissions` is what
removes it, along with eight others.

Gates on this branch: `pn install --frozen-lockfile` 0, `pn typecheck` 0, `pn test` 0 (core 523, mobile 214,
i18n 10, ui 11 — **758** tests, 16 new), `pn lint` 0. Plus three that only this round's work exercises:
`expo prebuild -p ios` then `pod install` then `xcodebuild -sdk iphoneos` 0 with 0 errors, and the Android
permission gate green on a real merged release manifest and red on a sabotaged one.

## Fixes round 23: the guard dropped a model that fits (branch `fixes-r23`) — 22.9.2026
**F43, F45, F46** — the three findings the real-iPhone pass 12 left open
(`docs/qa/ios-device-pass-12-2026-09-22.md`). On Moshe's iPhone 13 Pro, with the 1.2 GB Fast model downloaded from
`models.inbornapp.com` earlier the same day and left selected, **every cold launch of 1.0.0 (12) drew the amber line
"Ran out of memory · Switched to Instant · SWITCH BACK" and started Instant** — and one tap on SWITCH BACK then loaded
Fast, which answered at 13.2 tok/s. The guard was protecting the phone from a model the phone runs.

**The app was never out of memory, and the pass proved it three ways.** Inborn's own footprint was **223 MB** at every
sample; across 16 launches the logs name `instant.gguf` ×4 and `Qwen3.5-2B-Q4_K_M.gguf` **×0**, so the switch happened
*ahead of* any load attempt rather than because one failed; and the banner never came back after one tap, which a live
pressure signal would have re-raised on the next 5 s tick.

### Root cause 1 — two RAM readings, and Fast's minimum sits exactly between them

The app reads installed RAM in two places, and they did not agree:

| reader | code | on this phone |
|---|---|---|
| vault, catalog fit, chip class, onboarding | `marketingRamGB(bytes)` — the marketed size | **6** |
| the device guard, and through it the boot floor | `Math.round(bytes / 2**30 * 10) / 10` — raw GiB | **≈ 5.5** |

A "6 GB" phone reports about 5.5 GiB, and Fast's `minRamGB` is **exactly 6**. So `bootModel()` — the §6.5 boot-time RAM
floor, which exists so a too-big default is never mapped and then evicted — read 5.5, decided Fast did not fit, started
Instant and called `noteBootSwitch()`. That is recorded as an automatic *memory* switch, and `policy.ts` renders it with
the §6.5 memory headline and a way back. Once per cold launch, latching until the user taps SWITCH BACK. Exactly what
pass 12 saw.

**The phone shows both readings on the same run**, which is why this is not a hypothesis: the vault header says
`RUNS ON: IOS-MID · 6 GB` — a class `chipClassFor` only assigns at `ramGB >= 6` — while the pass-12 ledger on that same
launch says `CONTEXT 144 / **2048**`, and `policy.ts` caps context at 2048 only when `ramGB < 6`. Two numbers off one
device, on opposite sides of the same threshold.

**Fix**: one reading. `ramGBFromBytes` in `packages/core/src/device/chip.ts` wraps `marketingRamGB` with the null
guard both call sites need, and both `apps/mobile/src/device/signals.ts` and `apps/mobile/src/vault/device.ts` call it.
Nothing was loosened: Fast's 6 GB minimum stands, and a 4 GB or 3 GB phone still starts on Instant. The regression is
pinned by asserting the boot floor agrees with `ramFit` for five real phone sizes, so the two can never drift apart
again.

### Root cause 2 — a phone-wide signal read as this app's

`DeviceGuardModule.swift` created `DispatchSource.makeMemoryPressureSource(eventMask: [.warning, .critical])` and
forwarded its level verbatim as this process's `memoryPressure`. That source reports **the whole phone**, not the
process: the pass captured one `ATXMemoryPressureMonitor: received memory pressure warning of type: critical` in the
device syslog **4.0 s before Inborn was launched at all**, and a 6 GB iPhone with an ordinary set of apps reaches that
level routinely. Read as this app's state it raises the same memory row and drops the user's model.

**Fix**: iOS memory events now say where they came from — `source: "app"` for
`UIApplication.didReceiveMemoryWarningNotification`, which is process-scoped, and `source: "system"` for the Dispatch
source. `memoryPressureFromIos` in `packages/core/src/device/ios.ts` — the counterpart of the `memoryPressureFromAndroid`
helper that already existed for the same job on the other platform — believes an app event always, and a phone-wide
event only while `os_proc_available_memory()` is at or below **150 MB**. That is not a new threshold: it is
`IOS_HEADROOM_BYTES`, the number `memoryHealthy()` was already using to decide the same question, now named once and
shared. The protections are unchanged when the app itself is genuinely near its jetsam limit.

### The line the guard leaves behind, when nothing actually went wrong

§6.5 keeps the `memoryBack` line standing until the user acts, deliberately: an eviction is a fact the user should see,
not a toast that scrolls past. That is right when the device really ran out. It is not right when the boot-time RAM
floor merely decided a model does not fit — nothing was evicted, nothing was even mapped, and "Ran out of memory" is
then a false statement about the phone, latched on screen for the rest of the session. Both root causes above reached
that same line; the fixes stop this phone from reaching it, but any phone that genuinely does not fit its chosen model
still will.

So the switch now records **why**. `SwitchReason` in `policy.ts` gains `"fit"` beside `"battery"` and `"memory"`, and
`noteBootSwitch` in `apps/mobile/src/device/guard.ts` uses it. The row's *behaviour* is unchanged and stays unchanged on
purpose — it stands until SWITCH BACK or a dismiss, because the user's own choice of model was overridden and they must
be able to see that and undo it. What follows the reason is the sentence and the tone:

| reason | the line | tone |
|---|---|---|
| `memory` — the device ran out, mid-session | "Ran out of memory · Switched to Instant" | amber |
| `fit` — the boot floor, before anything was loaded | "Not enough memory for the model you chose · Started on Instant" | muted |

Core gets the parameterised form for the desktop policy row, `device.fit.switched` — "Not enough memory for {model} ·
Started on {to}" — in all nine locales.

### What was not measured, and why the third path is still settled

One more path could reach this banner and was asked about by name: the boot read in `signals.ts` compares
`os_proc_available_memory()` against 150 MB, and a launch that read under that floor would demote the model the same
way. **The literal value could not be sampled on the phone.** Printing it needs a JS hook, and a `--dev` bundle embedded
in this Release app redboxes with "Cannot create devtools websocket connections in embedded environments", while the
shipping bundle has no console to read it from. That attempt failed and is reported as failed.

It is settled indirectly, and the argument is tight. `memoryHealthy()` and that 150 MB floor are **unchanged by this
round** — the fix did not touch either — and the fixed build raised **no banner on three cold launches** with Fast
selected under ordinary load. `memoryHealthy(snap)` was therefore true on each, so `os_proc_available_memory()` was
above 150 MB at boot on this phone every time. That path is not the cause here, and the floor is not too high here. What
stays unproven is the margin — how close to 150 MB the number actually runs — which needs a real sample on a loaded
phone before that floor is ever treated as a tuning knob.

### F45 — the banner hid content on screens that did not pad for it

The strip is an absolute overlay drawn from `app/_layout.tsx` at `insets.top + 52`, over whatever screen is up. QA F13
had already introduced `BannerInsetContext`, the strip's measured height, but only Chat and Chats consumed it — so on
the hands-free screen the banner covered the second line of the screen's own headline ("Voice input needs the", rest
cut) and on the paywall it took the slot holding "No subscription. No account. Yours forever."

**Fix**: extend that mechanism instead of moving the strip. `components/shell/bannerInset.tsx` exports `<BannerSpacer />`,
and every screen container now reserves the height: `components/shell/Screen.tsx` (the 18 routes built on it, scrolling
and not), `VaultScreen`, `DocumentsScreen`, `PaywallScreen`, and `HandsFreeScreen` — which pads rather than inserting a
child, because its root is `justify-content: space-between` and a fourth flex item would redistribute the layout. Chat
and Chats moved onto the shared component, so there is one spacer in the app and one `banner-inset` testID. The
geometry itself is a pure module, `lib/bannerGeometry.ts`, so the arithmetic that was wrong on the first attempt is
pinned by six tests — including the one that catches it: reserving the strip's height alone leaves the first line
covered, because the strip ends `BANNER_TOP + height` below the safe area.

### F46 — Play sources listed on an iPhone, twice

For a model that is not installed, the Details sheet printed `model.delivery.map(d => d.kind)`: raw internal kind names,
never translated, never filtered by platform, never deduped. Sharp is split into two Play packs, so on the iPhone its
SOURCE row read **`play-asset-pack, play-asset-pack, https`**.

**Fix**: `deliverySources(model, os)` in `packages/core/src/catalog/manifest.ts` returns the sources this platform can
actually use, in manifest order, each named once, as `DeliverySource` values — which are exactly the `vault.source.*`
keys the sheet already renders for an installed model. Play only on Android, Apple packs only on Apple.

| model | before, on iOS | after, on iOS | after, on Android |
|---|---|---|---|
| Sharp | `play-asset-pack, play-asset-pack, https` | `models.inbornapp.com` | `Google Play, models.inbornapp.com` |
| Fast | `play-asset-pack, https` | `models.inbornapp.com` | `Google Play, models.inbornapp.com` |
| Instant | `bundled, play-asset-pack, https` | `This app, models.inbornapp.com` | `This app, Google Play, models.inbornapp.com` |

### Proof on Moshe's iPhone 13 Pro

A Release archive of this branch (`xcodebuild ... archive`, exit 0, **0** `error:` lines) was installed over the
shipped 1.0.0 (12) with the same bundle id and the same signing identity, so the phone kept its data container. The
**1.2 GB Fast model was untouched**: `vault.json` copied off before and after is identical except for Fast's
`lastLoadedAt`, which moved only because this build actually loaded Fast. Nothing was re-downloaded, the phone was
never locked or unlocked, and no setting was changed.

| # | check | result | evidence |
|---|---|---|---|
| 1 | cold launch with Fast selected, three times | **PASS** — no memory banner on any launch, chat header reads **FAST**, and the log opens `Qwen3.5-2B-Q4_K_M.gguf` ×1 and `instant.gguf` ×0 each time. Pass 12 on the same phone, same vault: the banner on every launch, `instant.gguf` ×4 and the Fast file **×0** across 16 launches | `after-01-chat-coldlaunch-fast.png` |
| 2 | Fast **answers**, with no tap on SWITCH BACK | **PASS** — the XCUITest driver asked "What is the capital of France?" on a cold launch of the fixed build and the chat returned `FAST · ON-DEVICE AI · The capital of France is Paris.` The ledger reads `MODEL FAST · QUANT Q4_K · CONTEXT 144 / 4096 · MS/TOKEN 77 · TOK/S 13.1 · FIRST TOKEN 680 ms · TOKENS IN+OUT 138 + 6`. Pass 12 reached 13.2 tok/s on the same phone and the same model, but only after tapping SWITCH BACK past the banner | `after-08`, `after-09` |
| 3 | the context cap moved with the RAM reading | **PASS** — llama.cpp logs `n_ctx = 4096` on all three launches, where the pass-12 ledger on this phone read `CONTEXT 144 / 2048`. `policy.ts` caps context at 2048 only below 6 GB, so this is the guard's own `ramGB` crossing from 5.5 to 6 | `log-root*.txt` |
| 4 | 0 error lines | **PASS** — a grep for error / exception / fatal / redbox over every launch log returns 0 | `log-root*.txt` |
| 5 | the banner still appears when it should, and hides nothing (F45) | **PASS** — a real `ThermalSerious` condition raised the §8.8 strip ("Slowing down to keep the phone cool · SWITCH TO INSTANT") on four screens. Hands-free shows its whole headline, **"Voice input needs the transcription model"**, where pass 12 showed "Voice input needs the" with the rest cut. The paywall shows **"No subscription. No account. Yours forever."**, which pass 12 lost behind the strip. The vault shows its storage line and Settings its first section | `after-02`…`after-05`, `before-02`, `before-03` |
| 6 | Sharp's SOURCE row on iOS (F46) | **PASS** — the XCUITest driver opened the Details sheet of the **not-installed** Sharp on the phone and it reads `SOURCE · models.inbornapp.com`, where pass 12 read `play-asset-pack, play-asset-pack, https`. Fast, installed, still reads `models.inbornapp.com` | `after-06`, `after-07`, `before-06` |
| 7 | the vault survived, and the phone was left as found | **PASS** — Fast still 1,280,835,840 B, sha256 `aaf42c8b…99223`, `via: "https"`, same `installedAt`; the shipped 1.0.0 (12) archive reinstalled (About reads `1.0.0 (12)` · `9da93a296bbe`), phone on the home screen, every forced device condition cleared | `vault-final.json`, `before-01` |

**The A/B is on one photograph.** `before-01-build12-banner-on-relaunch.png` is the About screen of the *reinstalled*
shipped 1.0.0 (12), taken after all of the above: the same phone, the same vault, the banner back. The fix is in the
build, not in the phone's state.

Gates on this branch: `pn install --frozen-lockfile` 0, `pn typecheck` 0, `pn test` 0 (core 523, mobile 198, i18n 10,
ui 11 — **742** tests), `pn lint` 0, `pn web:build` 0, `pn web:smoke` 0 (six PASS lines), `pn desktop:check` 0.
## Fixes round 29: the desktop shell never followed its own window (branch `desktop-pass-1`) — 22.9.2026

**F47, F48, F49** — the first pass to drive the Mac app against §8.9 and §9.7 rather than a browser at desktop
widths. Round 24 built the channel that makes this possible; this is the first thing put through it.
`docs/qa/spec-conformance-2026-09-22.md` could not class a single §8.9 desktop row better than "PROVEN **in a
browser**", and three of the rows it could not reach were wrong. Moshe worked on the same Mac throughout: no
dialog, no pointer, no focus change. Full clause table and evidence in `docs/qa/desktop-pass-1/README.md`.

### F48 — the shell was decided once, at the first paint, and never again

The sidebar, the 680 px column, the document panel and the command palette's routing all switch on
`useWindowDimensions().width`. In the Tauri WKWebView that number never moved. Measured with counters armed in
the page, over five resizes (1400 → 760 → 700 → 1200 → 1400): `window.innerWidth` and `visualViewport.width`
tracked the window exactly, **`window` fired 0 resize events and `visualViewport` fired 0**, and the 280 px
sidebar was still drawn at an `innerWidth` of 700 — the wide shell in a window 60 px below the phone
threshold.

Two things had to be true at once, which is why neither side looks broken on its own. The WKWebView delivers
no resize event when the Tauri window is resized; and react-native-web 0.21.2 subscribes `Dimensions` to
**`visualViewport`'s** resize event whenever that object exists and to `window`'s only when it does not, so
even a `resize` event dispatched by hand was ignored, and `Dimensions.get()` refreshes once behind a
`shouldInit` flag. Round 22 could not have caught it: it proved §8.9 in headless Chromium, where `resize`
fires normally.

The one event the window does deliver is Tauri's own `tauri://resize`. `adapters/tauri.ts` now drives
`lib/viewportResize.ts::dispatchViewportResize` from it, notifying whichever target this browser's
`Dimensions` actually subscribed to. After the fix three resizes produced three `visualViewport` resize events
and the shell was right at 1600, 1040 and 1280 — 280 px sidebar, 680 px column, 340 px panel at 1400.

### F47 — raising the configured minimum does not reopen an old window at it

`tauri.conf.json` said `minWidth: 720, minHeight: 480` against §9.7's 1,040×720, and `lib/layout.ts:7` had
named the right number all along without it ever reaching the window. Asked for 700×460 the app took it and
drew the phone shell.

Round 26 (F63) raised those two numbers and pinned them with a test; this branch merged that work and keeps
it. The config is half of it, and the other half is what driving the built app found. AppKit's `contentMinSize` constrains a drag and not a size set in code, and
`tauri-plugin-window-state` restores the last size by setting it in code — **after** `setup` and after
`RunEvent::Ready` both, which is where the first two attempts at this fix sat and did nothing at all. Every
install already carries a state file written under the old minimum, so those windows would have gone on
opening under the new one for ever. `shell.rs::hold_to_configured_minimum` therefore hangs off the window's
own `Resized` event, reads the minimum from the same config F63's test asserts, and grows a window that is
under it, so the raised number reaches a window saved under the old one too. From a state file holding 500×400
the app now logs `window was 500x400, under the 1040x720 minimum; grown` and comes up at 1040×720. Still
unproven: that AppKit refuses a *drag* below it — that needs a pointer.

### F49 — Esc did not stop a running answer

`matchKey` maps Escape to `stop` and `_layout.tsx:74` calls Esc "Stop" in a comment, but `useDesktopKeys`
returned early on `isTauri()` — the whole map, so the menu's accelerators would not fire twice. macOS reserves
Esc and no accelerator can carry it, so the menu binds Stop to ⌘. and Esc reached nothing. On one generation
each: after Esc the stop button was still showing 3.5 s later and the answer had grown from 506 to 3,342
characters; after the menu's Stop it was gone inside 500 ms, frozen at 5,033. The decision is now
`webviewShortcut(e, menuOwnsAccelerators)` in `lib/desktopKeys.ts` — under Tauri the webview keeps Esc and
drops every key the menu declares. Esc now stops a streaming answer within 700 ms and also closes the palette.

### Filed and not fixed

**F81** desktop Settings has none of §8.9's desktop rows (no model location, no Launch at login, no Advanced
section — so no backend picker, no VRAM offload, no local server). **F82** the desktop paywall's two buy
buttons are priced and permanently disabled, because the provider is `licence-key` and there is no in-app
checkout; the Work-first ordering §8.9 asks for is correct, so today it orders two dead cards first. **F83**
the native Mac app's screenshot-protection row reads "Not available in a browser."

A fourth row was filed and then **withdrawn**: a document dropped on the window went nowhere on this branch's
base, and round 26's F64 had already built the listener, the queue and the `documents_read` command that
serves the bytes. The merge brought it in. It is not re-observed at runtime here, because a real drag needs a
pointer.

### Tests

7 new: 3 in `apps/mobile/src/lib/viewportResize.test.ts`, 3 in `desktopKeys.test.ts` (the double-fire one red
without the guard), plus 2 in `shell.rs`; and two assertions folded into F63's own `lib/layout.test.ts` rather
than a second file reading the same config.

Gates on this branch, after merging `main` at `28d5b42`: `pn install --frozen-lockfile` 0, `pn typecheck` 0,
`pn test` 0 (core 616, mobile 312, i18n 10, ui 11 — **949** tests, 942 on `main` before the merge), `pn lint`
0, `pn desktop:check` 0 (**17** Rust tests).

## Fixes round 25: the family-safe filter we promised two app stores did not exist (branch `fixes-r24a`) — 22.9.2026
Seven ranked gaps from `docs/qa/spec-conformance-2026-09-22.md` — **1, 3, 16, 19, 20, 21, 33** — filed as
**F50–F56**. Six are small. The first is not, and the reason it is first is not its size.

**F50 · the filter that was declared and not built.** Four published documents said a content filter is on by
default: the privacy policy §9, the terms §4, `app-privacy-details.md` (our literal answer to Apple's
parental-controls question, "Yes: content filter on by default"), and our Guideline 1.2 answer. There was no
classifier, no mode, no setting and no pref. Not a missing feature — a false statement in a published policy.

The gap offered two ways out: build an on-device classifier (**L**), or delete the claim and re-answer both
questionnaires (**S**). What ships is a third, cheaper than the first and honest about being so:

| part | what it does |
|---|---|
| a clause in the system prompt | asks the model not to produce the content at all, while the mode is on |
| a phrase check of the **request** | refuses an explicit ask before a single token is generated, so the mode is free when it fires |
| the same check of the **answer** | run mid-stream on the same 8-token beat as the loop detector, so the text does not finish arriving, and again on the finished reply |

The patterns are phrase-shaped on purpose. Single words — "violence", "sex", "suicide", "overdose" — appear in
ordinary history, medicine and news answers, and a filter that flags the bombing of Dresden is switched off by
every user on the first day, which is the same as having none. Fourteen such sentences across the eight
languages are pinned as a complement test. Two false positives were caught by writing that test rather than
after shipping: `\b` let "bomb-proof argument" match the weapon pattern, and the German pattern only knew the
nominative "steifer", not the "steifen" a real sentence uses.

It reaches both answer surfaces (`screens/Chat.tsx` and `voice/useHandsFree.ts` — a spoken turn is refused
before anything is synthesised aloud). `prefs.contentSafety` defaults on, switches in **Settings → Chat**, and
comes back on for a prefs file written before it existed. A replaced answer carries `safety: "family-safe"`
through all four repositories, and says so under the answer and on the ledger. **It is not a classifier and
every sentence we publish now says that**, in the same words, in the policy, the terms, the store answers and
§11.1 / §11.2 / §11.4 / §11.5 / edge case 64. That single-answer requirement was the actual demand of gap 1.

**F51 · the source we told people to read.** The Proof screen's "Source code ↗" opened a private repository and
404'd for every user who tapped it; the build line told them to "match it against the published hash" with no
hash published and no reproducible build; the terms claimed an MIT open-source core; the policy §10 and the Work
architecture statement said the same. The repository had no `LICENSE` at all. Now: a **source-available**
licence (read, build, publish findings; no redistribution — explicitly not an open-source licence), and
`docs/legal/verification.md` as the one place that says what a user really can check (Android permissions from
the Play page or `aapt2`, the iOS App Privacy Report, any firewall, the in-app airplane test) and what they
cannot. The four texts were rewritten from it, and a test fails on any `en.json` string that offers our source
or a hash to match.

**F52 · `allowBackup="false"` versus what the app told Android users.** One sentence for every platform said
chats are in the device backup. On Android nothing the app stores is backed up at all, so a user who reset
their phone on the strength of that sentence lost every chat. Platform-specific string, and the policy now
splits the two.

**F53 · `/voice` was free by URL.** The chat's mic asked `paywallFor`; the route asked nothing, so a deep link
or a restored route opened a Pro screen. It now asks the same question, and renders nothing while the
entitlement is loading rather than existing for one frame.

**F54 · nobody's licence obligations were discharged.** The Licences screen showed a name, an attribution and a
link. Apache-2.0 §4(d) and MIT both want the text to travel with the distribution, and on an app whose promise
is that it works with no network, a link discharges nothing. The canonical Apache-2.0 and MIT texts now ship
inside the bundle (`docs/legal/model-licences/`, mirrored byte for byte into `packages/core`, with a test that
fails on drift), a **View licence** control opens the full text from the model card and every Licences row, and
MIT's copyright line is filled per component — Phi reads Microsoft's, Whisper reads OpenAI's. A Hugging Face
download now opens the same sheet with an **accept** button and starts only on that tap.

**F55 · two greyed rows selling 1.0 cuts**, one labelled "Export all (encrypted)" while nothing encrypts. Gone,
and their strings deleted from all nine locales rather than left unread — the dead-translation pattern the
conformance audit exists to catch.

**F56 · two of our eight languages had no crisis card.** A user writing 죽고 싶어요 or 我不想活了 got nothing.
Phrases for `ko` and `zh-Hant`, hotlines for KR, TW and HK. Every number was checked live against
findahelpline.com, **and one was wrong before it shipped**: the draft carried 1577-0199 for Korea, which 109
replaced in 2024 and which is no longer published. Swapped for 한국생명의전화 1588-9191.

**One bug found on the way.** `docs/build.py` still named `docs/spec` and `docs/demo`; the sources were renamed
to `*-src` and the script exits on the first missing file, so **the spec has not been rebuildable from source**
for some time. Fixed; `docs/inborn-spec.html` regenerates to the tracked bytes plus this round's amendments.

**Proof** — 863 tests pass (core 593, mobile 249, i18n 10, ui 11) after merging `origin/main` **6fd5494**,
which is 773 on its own, and `docs/qa/fixes-r24a/`
carries the run, a full end-to-end transcript of the family-safe path through the real modules and repository,
the locale coverage, and a **negative control**: each of the seven fixes broken in turn with its guard shown
going red, then restored. **No device, emulator, simulator or browser was available to this stream** — the
emulator and the 6T belong to `android-vc16b` — so none of the seven screens was seen. The evidence README
lists each unseen item and what it would take; the one worth a real pass is what ~245 extra prompt characters
do to a 0.8B model's answers and time-to-first-token.

**One more found by the merge with `main` (6fd5494).** Main's audit had corrected the privacy policy to say
that **conversations are not restored to a new device on any platform** — on iOS the SQLCipher key is
`WHEN_UNLOCKED_THIS_DEVICE_ONLY`, so a restored iCloud backup holds the ciphertext and cannot open it. The S51
screen still read "Chats are included in your device backup, encrypted", which a user reads as "a restore brings
them back". That is F52's bug one platform over, and nothing tied the two texts together, so nobody caught it.
The non-Android string now says the key never leaves the device and a restored backup cannot open the chats, in
all eight languages, and a test asserts the three platform strings exist and differ. §5.3 and edge case 42 say
the same. `web:smoke` passes with six PASS lines on the merged tree.

### Decisions for Moshe (round 25)
1. **The source claim.** The app now says the source is not published. Three ways to close it for good: publish
   under a real open-source licence; publish under the new source-available `LICENSE`; or drop the claim from
   the positioning entirely. Until one is chosen, `docs/legal/verification.md` is what every text may say.
2. **Family-safe: phrase check or classifier.** What ships reduces this content and does not eliminate it, and
   says so everywhere. Upgrading to ShieldGemma costs the Gemma terms, an acceptance screen and a second model
   download per language; an Apache-2.0 classifier costs about a week and a few hundred megabytes. Your call
   whether "reduces" is enough for the 13+ rating you want.
3. **`storage.exportAll` and `storage.transfer` are now unreachable.** Removing the rows is right for 1.0. If
   `.sealed` backup returns, the rows and their nine translations come back with it.

**Decided by Moshe, 22.9.2026 18:05 (stream `docs-decisions`):**
- **Item 1, the source claim, is decided: source-available.** The repository goes public under the existing
  `LICENSE` at release, not before and not by this stream. `docs/legal/verification.md`'s "repository is
  private" status line still holds until that publish actually happens.
- **Item 2, family-safe, is decided: the phrase screen is enough for 1.0.** No ShieldGemma or other classifier
  upgrade before launch; §11.1's answer to both stores stays as written.
- **Trademark (§11.6, ranked gap #24) is decided: filing waits until after launch.** Not before the first
  public store listing, as the gap list assumed — the clearance and the costed plan stand, ready whenever
  Moshe wants to spend the ≈$2,000 and engage counsel.
- **Document tiers (§7.3 row 1) are decided: one attachment per chat is enough for Free.** Verbatim: "one file
  free; if they want another file they must remove the previous one or so. Not greedy, this is v1, we will
  adjust by traffic and demand later; make it sensible." The code and §7.3 already matched this before today;
  what changed is the copy shown when a Free user tries to add a second file (`quick.filePro`, all locales) now
  says to remove the current file or get Pro for a library, instead of only restating the cap.
- **Item 2 from the store-console list (ranked gap #2, filing itself) stays open**, waiting on the report table
  Moshe asked for before he works through it.

## Fixes round 28: the share sheet handed out the paid document features (branch `fixes-r24c`) — 22.9.2026
From the spec-conformance audit's §7 section: one bypass, eleven rows where the enforced tier was not the spec's
tier, and 23 of 39 gate keys that no screen ever asked. F72–F76.

**The bypass.** `Chat.tsx` took each file out of a share payload and called `library.importFile` directly, while
the attach sheet's own picker went through `pickIntoLibrary`, which asked both document gates. So the Free cap of
one file per chat (§7.3 row 1) and the Work formats (§7.3 row 8) held at one door and not at the other — and the
open door is the share sheet, which §7.7 calls the cheapest acquisition surface we have. A Free user could share
in ten files; a Pro user could share in a spreadsheet the picker refuses.

**The fix is one function, not a second copy of the checks.** `packages/core/src/licence/intake.ts`:

```ts
fileIntake(tier, kind, attachedCount) -> { ok } | { paywall, moment: "document" | "office" }
```

Every door calls it — the picker, the S40 library, the share path — and `apps/mobile/test/gates-wired.test.ts`
fails if a fourth module ever calls `library.importFile` without it. The count is answered before the kind, so a
Free user's second spreadsheet opens the paywall on the cap it actually hit.

A shared file is worse than a picked one in one way: the name comes from the sender, and `.docx` and `.xlsx` are
the same ZIP magic bytes. `sharedName()` runs the sender's name and MIME type through the existing
`pickedFileName` — the helper QA F3 built for Android's SAF ids — so an extensionless share of an Excel MIME type
resolves to `blob.xlsx` and is refused.

**The eleven tier rows.** Four needed code, two needed the spec corrected, five were already right.

| §7 row | spec | was | now |
|---|---|---|---|
| OCR on device (§7.3 row 3) | Pro | ungated | `ocr` gate wired; the action reads `Run OCR · PRO` |
| "Answer only from my documents" (§7.3 row 4) | Pro | ungated, on two switches | new `strictDocuments` gate, on the switches **and** on the prompt |
| Memory (§7.6) | Pro | only *add* was gated | every write is Pro; deleting is never sold |
| Detailed statistics (§7.8) | Free basic · Pro detailed | all eight rows free | §7.1's four rows are Free, the rest are `detailedStats` |
| Screenshot blocking, lock-screen wipe (§5.7 vs §7.5) | **Free** | Free, and a test locks it | **the spec was wrong**: §5.7 corrected |
| XLSX, file picker, camera, CSV, DOCX | see below | — | unchanged; the code already matched |

Two of these are gates on the chrome only if you stop at the switch. Strict mode is read at prompt time from
`state.strict`, and memory is read by `store.memoryFor()` on every turn, so a user who turned either on while
subscribed kept the Pro behaviour after the licence lapsed. Both are now masked at the read: one line in
`documents/hooks.ts`, one at the `memoryFor` call site. A lapsed licence stops changing answers, and deletes
nothing.

Memory draws a line rather than gating the panel: every **write** is Pro — add, edit, turning it on, re-enabling a
fact — and every **delete** stays free, because §7 opens by pointing out that a privacy app which charges for
privacy gets called a scam in its own reviews. Turning memory off is free; only turning it on is sold.

**Three places where the spec contradicts itself** got a decision in code and none in the §7 tables, which this
branch did not touch. Each is a one-line reversal if Moshe disagrees, and all three are written out in
`docs/qa/fixes-r24c/tier-matrix.md`: CSV and DOCX are **Free to attach** (§7.3 row 1 names them, which is more
specific than row 5's "table understanding" and row 8's vault import); XLSX and HTML are **Work** (row 8 names
them by format, and the shipping code already said so); the system picker stays **Free**, because row 1's Free
attachment has no other way in and gating the picker would make that row unreachable.

**The dead keys.** 23 of 39 gate keys had no call site — F42's shape in the licensing layer. The 11 whose features
`README.md:596-599` declares "intentionally not built for 1.0" are deleted and return with their features. Three
were wired by this round. The 11 that remain unbuilt but are still sold by §7 are named in `UNBUILT_FEATURES`, and
the new guard fails if a key is neither called nor on that list — and equally if a key on the list turns out to be
enforced.

**Both guards were watched failing before they were watched passing.** With the share fix removed:
`screens/Chat.tsx imports a file without asking fileIntake`. With one unwired key added back:
`expected [ 'keyboardExtension' ] to deeply equal []`. Logs in `docs/qa/fixes-r24c/`.

**Found on the way.** `python3 docs/build.py` has been unable to build the spec since commit `077aacf` renamed
`docs/spec` to `docs/spec-src` without updating the script's `SPEC` constant: it exited `missing
…/docs/spec/00-head.html`. One line. It still writes into `docs/out/`, so publishing `docs/inborn-spec.html` is a
copy, and the demo half of the script is skipped silently for the same rename — left for whoever owns the demo.

**What is not proven.** Nothing in this round was seen on a phone, a simulator, an emulator or a browser: no
device was available to this stream. The gates are pure functions with a full tier × kind matrix in tests, and the
wiring is held by a source scan, but the paywall each gate opens, the `PRO` chips, and the shortened ledger are
unobserved. The next device pass should read: share an `.xlsx` from Files as a Free user, share a second PDF into
a chat that already has one, open the ledger, tap the strict switch.

Gates on this branch: `pn install --frozen-lockfile` 0, `pn typecheck` 0, `pn test` 0 (core 534, mobile 202, i18n
10, ui 11 — **757** tests), `pn lint` 0.

## Fixes round 24: the desktop app could not be tested without Moshe (branch `desktop-headless-qa`) — 22.9.2026
**F44** (Moshe, 22.9.2026): *"Desktop: it's not one dialog, it's a million. Find a way to test it WITHOUT me
entering a password and WITHOUT you moving my mouse all the time."* Two walls stood between an agent and the
desktop build, and the cost is in the record: F41 and F42 both shipped with **runtime proof NOT RUN**, and the
round-22 desktop layout was signed off from the browser tier alone.

**Wall 1 — the Keychain.** The SQLCipher key and the licence-cache key live in login-Keychain items whose ACL
names the code identity that created them. Dev builds are signed ad hoc (`"signingIdentity": "-"`), and an
ad-hoc signature identifies an app only by its own code hash, so every rebuild was a stranger to the item and
macOS asked for the login password on launch.

**Wall 2 — no driver.** macOS has no WebDriver for WKWebView: `tauri-driver` supports Linux and Windows only,
CrabNebula's cross-platform fork is paid, and WebdriverIO's answer is a WebDriver server embedded in the app —
a large dependency in the shipped binary for a QA need. Driving the window meant a human pointer.

**Fix — two answers, because there are two people.**

| who | mechanism |
|---|---|
| Moshe rebuilding his own app | the stable code identity from round 21: `scripts/with-signing-identity.sh` signs with *Apple Development*, whose requirement is identifier + team and does not change between builds. The stale items left by ad-hoc builds were deleted once, so the signed app owns the ones it creates |
| an agent, or CI, on any Mac | **no Keychain at all**: `src-tauri/src/secrets.rs` is now the one source for every at-rest secret, and under `--features qa` with `INBORN_QA_KEY_FILE` set it reads them from a 0600 file. Nothing to ask about, signed or not, first build or fiftieth |

`src/secrets.rs` also gives a QA build its own data directory beside that key file. Two different keys over one
`inborn.db` had each build starting the file fresh — QA runs and Moshe's app were wiping each other's chats. The
model vault stays shared, so a run does not copy 497 MB of GGUF.

**The driving channel.** `src-tauri/src/qa.rs`, compiled only with `--features qa` and opened only when
`INBORN_QA_SOCKET` names a path: a Unix socket answering one JSON line per request — `ping`, `eval` (runs a
snippet through `Webview::eval`; the value comes back by the page invoking `qa_result`), `window` (size and
position, so a run is reproducible), `quit`. A socket rather than a port, so the firewall has nothing to ask
either. Setting the variable also puts the app on `NSApplicationActivationPolicyAccessory`, so the window
renders and can be photographed while the Mac's focus never moves. Clients: `scripts/qa-drive.mjs` and
`scripts/qa-desktop-run.mjs` (the whole proof in one command). Presses are pointer events dispatched in the
page, window ids come from `CGWindowListCopyWindowInfo` (`scripts/qa-windows.swift`), captures are
`screencapture -l <our window id>`. Nothing types, clicks or activates anything. The production binary carries
none of it (`strings`: 0 hits, against 5 in the QA build); `desktop:check` runs the Rust tests both ways.

**One bug found on the way.** macOS marks a window nobody can see as occluded, and WebKit then stops delivering
animation frames — so onboarding S04's *Start*, which is enabled by the seal animation's completion callback,
never enabled, and a run behind Moshe's own windows hung there. Timers keep firing, so the QA plugin installs
one line before the app's bundle: `requestAnimationFrame` backed by `setTimeout`. The shipped bundle keeps real
animation frames.

**Proof** — `docs/qa/desktop-run-2026-09-22.md`, run with Moshe working on the same Mac and the window fully
hidden behind his own: launch with no dialog, onboarding S01–S05, "The capital of France is Paris." on the Rust
Metal engine (159.6 tok/s, TTFT 66 ms), the §8.9 sidebar at the default 1120×720 window, and a relaunch after a
rebuild with the Keychain item's `mdat` unchanged. Zero `SecurityAgent` events, zero `SecurityAgent` windows,
the frontmost app never ours.

## Fixes round 26: twelve mechanisms that shipped without a reader (branch `fixes-r24b`) — 22.9.2026

Twelve gaps from `docs/qa/spec-conformance-2026-09-22.md` — its ranked #5, #7, #10, #11, #12, #13, #17, #30, #32
and the three incognito rows — filed as **F57–F65 and F69–F71** in `docs/qa/qa-run-2026-09-11.md`.

Eight of the twelve have the same shape, and it is worth naming because it will happen again: **a mechanism
built, translated into all eight locales, and read by nothing.** `shouldWait()` had no call site. `ackExplain()`
had no caller. `ChatStore.endSession()` had no caller. `rec.explain` was computed and latched for a sheet that
did not exist. `inborn:documents-dropped` was emitted and relayed to a listener that was never written. A
settings row wrote `prefs.clipboardExpirySec` to a store nothing read. Every one of them passes a unit test of
its own logic, and none of them worked. So every fix in this round ships with a test that fails when the
**wiring** is removed, not only when the logic is — `docs/qa/fixes-r24b/sabotage.txt` has each guard watched
going red with its fix taken out, one at a time, including four that are nothing but wiring.

**The one that could have cost a user everything: F58.** `sqliteRepository.ts` answered "not a database" with
`deleteDatabaseAsync`, and `store.rs` answered it with `remove_file` over the database and its WAL. On an app
whose whole promise is that chats live only on this device, that is not a recovery; it is the loss, performed
silently. A file that opened but failed `PRAGMA quick_check` was not noticed at all. Now:

| where | what happens |
|---|---|
| `packages/core/src/storage/integrity.ts` | the pure part: which SQLite errors mean the file is unusable, how to read `quick_check`, and a salvage that lists a table by row id and retries a failed page **row by row**, so only the rows a broken page actually holds are lost. A table it cannot even list is reported, not passed over |
| phones (`storage/sqliteRepository.ts`, `storage/dbFile.native.ts`) | the damaged file is moved to `inborn.db.corrupt-<stamp>`, one kept copy at a time; a fresh keyed file is migrated, given FTS and the shared document schema, filled by the salvage parents-first, then promoted onto the real name |
| desktop (`src-tauri/src/store.rs`) | the same quarantine instead of the delete, reported to the webview through `db_open` |
| the user | the §8.8 strip, in all eight languages: `state.dbRepaired` with the number of entries that could not be read, or `state.dbStartedFresh` when the file would not open at all. Never nothing |

A row copied into the fresh file has to satisfy the schema it lands in, so a message whose chat did not survive
fails its foreign key and is **counted as lost** rather than dropped in silence. Tested against a real SQLite
(sql.js) with the driver made to throw on chosen rows, which is exactly what a corrupt page looks like from JS.

**The rest, in one line each.** F57 clipboard expiry now runs, on every platform's pasteboard, and never wipes
text it did not put there. F59 the first automatic model switch finally explains itself, in a sheet that offers
"Don't switch automatically", and the once-per-install latch is no longer spent by an unrelated status change.
F60 Wi-Fi-only is one preference read by the one thing that downloads, parking before each shard and waking on
Pause or Cancel instead of on a timer. F61 one inference queue for the process, so a chat turn, a documents ask
and a quick action can no longer reach the same context. F62 the Work signed record carries the AI Act Art.
50(2) marking **inside the hashed content**. F63 the desktop window minimum is 1040×720, and a test reads
`tauri.conf.json` so the two numbers cannot drift from `DESKTOP_MIN` again. F64 a dropped folder is walked in
Rust, a new `documents_read` refuses any path the window did not itself hand over, and the Documents screen
imports what the tier allows and names what it skipped. F65 an answer is written through every 1.5 s, so a
jetsam kill leaves it on disk. F69–F71 an incognito document lives in a RAM store behind the same
`EmbeddingStore` interface and never reaches the encrypted file, leaving the chat ends both sessions, and a
share arriving mid-session stays incognito.

**Counts.** The round added 79 JS tests (742 on `main` before it, 821 on the branch). After merging `main` at
`f85c527` the branch stands at **942 JS tests** (core 616, mobile 305, i18n 10, ui 11) and 13 Rust tests, with
`pnpm lint` and `pnpm typecheck` clean and `pnpm web:smoke` passing on the real export. Green runs, before and
after the merge: `docs/qa/fixes-r24b/tests.txt`.

**Two things the merge changed on purpose.** `main` moved the Work formats into core as `WORK_DOC_KINDS` and
added `fileIntake`, "the one answer for every file that enters the library, whatever door it came through" —
so the round's own `documents/workKinds.ts` was deleted and the drop planner now asks `fileIntake` instead of
re-deciding the tier rules itself. A drop is a door like the picker and the share sheet. `main`'s own guard
(`test/gates-wired.test.ts`) was narrowed to production sources, because it was reading the round's incognito
test as a fourth door.

**What is not proven.** No phone, no emulator and no desktop build were available to this stream, so nothing
here was seen running on a device: the pasteboards themselves, the `expo-network` reading, the SQLite file
moves in `dbFile.native.ts`, the rendered explainer sheet and a real OS drag are all covered by tests and
review only.

## Fixes round 20: round 19 shortened the wrong questions (branch `fixes-r20`) — 22.9.2026
**F39** (MosheAI on the round-19 verdict, 22.9.2026 05:10): round 19's `isShortAsk` calls **any** one-line question of up
to 16 words a short factual ask, so *"How do I set up SSH keys on my Mac?"* was given the short plan — 224 tokens and the
line "Answer in one to three sentences". A how-to, an explanation, a comparison or a procedure is one line long but its
answer is not, and three sentences of it is not an answer. On the emulator the unfixed build spent 47 words of prose on
that question and never listed a step.

**Root cause.** Round 19 shaped the request by **counting** — words, characters, a question mark — precisely so that a
Hebrew or Japanese question would be judged like an English one. Counting cannot tell *"What is the capital of France?"*
from *"How do I set up SSH keys on my Mac?"*: both are one line and both end in a question mark. Length was being read
off the question's size when it belongs to the question's **kind**.

**Fix** — `isExplanatoryAsk` in `packages/core/src/chat/length.ts`, checked before the counting rule. When it fires, the
turn keeps its use's own length (`moderate`, 512 tokens, "Keep the answer as short as the question allows, a paragraph at
most") instead of being shortened. Three small tables, not a language model:

| table | read where | what is in it |
|---|---|---|
| `EXPLAIN_STARTS` | the start of the line, after any opening punctuation | Latin-script question words that only ever open a sentence: how do / how to / how does / how can / how should / how would / how did, why do / why is / why are / why did, `wie` `warum` `wieso` `weshalb`, `comment` `pourquoi`, `cómo` `como` `por qué` `porque` |
| `EXPLAIN_MARKS` | anywhere in the line | explain, walk me through, step by step, tell me about, what happens if / when, what is the difference, difference between, compare, pros and cons, and their German, Spanish, French and Portuguese equivalents — plus the CJK and Hebrew markers, which are read anywhere because those languages put the question word mid-sentence (`Macでどうやって…`, `Mac에서 … 어떻게`, `如何在 Mac 上…`) |
| `EXPLAIN_NOT` | the start of the line | the few openings of those same question words that really are one-liners, so they keep the short plan: how much / how many / how old / how far, `wie viel` `wie alt` `wie heißt`, `cómo se llama`, `comment s'appelle` |

Two details the tests pin. `\b` is useless outside ASCII in JavaScript, so the Hebrew openings carry their own letter
guard (`[^א-ת]`) — without it *"מי היה שלמה המלך?"* matches `למה` and a factual question becomes a how-to. And Spanish and
French questions open with `¿` or a quote, so the start anchor skips leading punctuation.

Nothing above the heuristic moved: an explicit "briefly" or "in one sentence" still wins, a drafted document is still
long, a hands-free turn is still spoken, and the device guard still clamps every plan. `LENGTH_INSTRUCTIONS` is unchanged
— no test asked for a new line. 12 tests in `packages/core/test/fixes-r20.test.ts`.

**The plan, deterministically** (`planAnswerLength(… use: "chat")` on both trees — this is the mechanism, and it is the
only part of this round that is not sampling):

| prompt | before | after |
|---|---|---|
| How do I set up SSH keys on my Mac? | short / 224 | **moderate / 512** |
| Why is the sky blue? | short / 224 | **moderate / 512** |
| What is the capital of France? | short / 224 | short / 224 |
| What is 2 plus 2? | short / 224 | short / 224 |

**Proof, Android emulator.** The `Pixel_6_API_33` AVD itself this time (`google_apis`, `PlayStore.enabled = false`), arm64,
`-memory 4096`, headless on port 5584; release AAB built with `INBORN_PACKS=instant`, versionCode 20, delivered through
bundletool `--local-testing`, so Instant comes from the real asset pack. Same emulator, same model; before = `origin/main`
8729992, after = this branch. Prompts through `EXPO_PUBLIC_AUTOPROMPT=file`, numbers from `Documents/dev-run.json`.
Screenshots in `docs/qa/fixes-r20/`.

| scenario | before | after |
|---|---|---|
| "How do I set up SSH keys on my Mac?" | 47 words in 5.0 s, **one prose paragraph, no steps** | **84 words in 7.4 s, numbered 1.–4.** (resampled: 84 words, 9.6 s, numbered again) |
| "Why is the sky blue?" | 50 words, 4.4 s | 38 words, 4.3 s |
| "What is the capital of France?" | 6 words, 2.3 s | 16 words, 3.9 s — **one sentence**; resampled twice: 6 words / 1.1 s and 6 words / 0.8 s |
| "What is 2 plus 2?" ×2 in one chat | 5 words each, 1.4 / 0.8 s | 5 words each, 1.3 / 1.0 s |

**Honest about the run.** Sampling is unseeded, so no single answer is deterministic on either build — the plan table
above is the claim, the device table is what one sample of it looked like. Two rows are worth saying out loud. The sky
question shows **no visible win**: the unfixed build already happened to answer it in a reasonable paragraph, and 50 → 38
words is noise, not the fix. And answer **quality is unchanged** — both builds invent the same nonsense for SSH (a
fictional `mac-ssh` utility, `ssh-keygen -x` / `-H`); this round buys the answer its shape and its budget, not
correctness from a 0.8B model. The capital-of-France answer at 16 words on the first after-sample was resampled precisely
because a grown answer there would have meant the fix leaked; two further samples came back at 6 words, and the plan is
`short` / 224 either way.

**iPhone 15 Pro simulator** (shared JS): release build of this branch, Instant bundled at `Inborndev.app/instant.gguf`,
the SSH question through the same `EXPO_PUBLIC_AUTOPROMPT=file` hook: **88 words in 4.2 s at 48.4 tok/s, TTFT 1.69 s**
(`i-01-ssh-after.png`), sequential instructions in prose rather than a numbered list — the moderate budget is plainly in
force, the numbered shape is not guaranteed run to run. Simulator shut down afterwards; `xcrun simctl list devices booted`
lists nothing.

**Not verified here.** The same-question-in-a-documents-chat state the 6T was in during soak 6 still needs the `embed`
pack and is out of reach on an `INBORN_PACKS=instant` build, exactly as in round 19. No physical device was used in this
round, so nothing is claimed about the OnePlus 6T or a real iPhone.

**Build trap worth recording.** `INBORN_MODELS_DIR` has to be exported for the **gradle** step too, not only for
`expo prebuild`: without it `:doc-extract:verifyOcrAssets` fails in a worktree that has no `.models` of its own. The
round-19 recipe above only sets it on the prebuild line.

Gates on this branch: `pn install --frozen-lockfile` 0, `pn typecheck` 0, `pn test` 0 (core **505**, 493 + the 12 new, mobile 169, i18n 10, ui 11 — **695** tests),
`pn lint` 0, `pn web:build` 0, `pn web:smoke` 0 (five PASS lines, first visit 10.7 s, 31.5 tok/s), `pn desktop:check` 0 (7 Rust tests).

## Fixes round 19: the model dug into every question, however small (branch `fixes-r19`) — 22.9.2026
**F38** (Moshe, 22.9.2026 01:00, watching the OnePlus 6T during soak 6): *"when the bot answers it really digs / rambles"*.
In `docs/qa/soak-run-5-2026-09-21.md`'s successor run, on the release build 1.0.0 (13) with Instant resident, **"What is 2
plus 2?" cost 20–21 s** (≈200 predicted tokens at ~11 tok/s) and the **third and fourth ask of the same question in the same
chat ran to the 1,024-token cap** (85–86 s, `complete=0`).

**Root cause.** Nothing in a turn ever said how long its answer should be. The default persona's whole prompt was "You are a
helpful, concise assistant."; every path handed llama.rn the same `n_predict` (`maxTokens` 1,024, or the guard's 512 in power
saving); the loop guard (`packages/core/src/chat/loop.ts`) only stops literal n-gram repeats, and a model that elaborates
instead of repeating never trips it. So a 0.8B model answered a one-line arithmetic question with the budget of an essay,
and once its own long answers were in the context it kept going until the cap stopped it.

**Fix** — `packages/core/src/chat/length.ts`, one plan per turn, shaping the **request** twice and never the answer:

| what the turn is | tokens | the line added to the system prompt, last |
|---|---|---|
| short factual ask (a question on one line, or a phrase ≤ 8 words) | 224 | "Answer in one to three sentences: give the answer first, then stop…" |
| chat, math, documents | 512 | "Keep the answer as short as the question allows, a paragraph at most…" |
| draft, translation, code, writing, summarize, `Continue` | 1,024 | "Give the whole answer the task needs, then stop…" |
| hands-free (read aloud) | 160, never above 320 | "Answer in one or two short spoken sentences and stop." |
| "in about N words" / N sentences / N paragraphs | N × 3 + 64, clamped | …"The user asked for about N words; match that length." |

What the user says wins over the heuristic: `detectExplicitLength` reads a number with a unit word in the eight shipped
locales and Hebrew, plus "in detail" / "briefly" families. Everything else is script-agnostic on purpose — it counts words
and characters and looks for a question mark in any script — so a Hebrew, Japanese or Korean question is judged exactly like
an English one and an unlisted language lands on `moderate`, never on a clipped answer.

Wired through core, so there is no second mechanism: `composeSystemPrompt` gained a `length` block that goes last, after the
language hint; `Chat.tsx` (typed turn), `QuickActionsSheet`/`runQuick`, `useHandsFree` and `AskDocuments` all call
`planAnswerLength`; `ANSWER_CEILING` / `SAVING_CEILING` moved beside it and `device/policy.ts` imports them, so the guard's
cap is still the ceiling and `src/engine.ts` still clamps every turn to it (`Math.min(opts.maxTokens, caps.maxTokens)`).
The desktop and web tiers run this same JS (Tauri shell, Expo web export), so they are covered by the same change; their
adapters' `?? 1024` defaults are now `?? ANSWER_CEILING`. 20 tests in `packages/core/test/fixes-r19.test.ts`.

**Proof, Android emulator** (the `Pixel_6_API_33` image, arm64, `-memory 4096`, headless on port 5570; release AAB built with
`INBORN_PACKS=instant`, versionCode 19, delivered through bundletool `--local-testing`, so Instant comes from the real asset
pack at `files/assetpacks/inborn_model/19/19/assets/Qwen3.5-0.8B-Q4_K_M.gguf`). Same emulator, same model, before = `origin/main`
9520fb7, after = this branch; prompts driven through `EXPO_PUBLIC_AUTOPROMPT=file`, numbers from `Documents/dev-run.json`.
Screenshots in `docs/qa/fixes-r19/`. The run used a throwaway clone of that AVD so nothing of another stream's state was
touched; the clone was deleted afterwards, so **re-run this on `Pixel_6_API_33` itself**. It has to be a `google_apis`
image, not `google_apis_playstore`: a release APK is not debuggable, so `Documents/dev-prompt.txt` and `dev-run.json` are
only reachable through `adb root`, which a Play-Store image refuses (that rules out `Pixel_2_API_30`). `adb shell setenforce 0`
is also needed once, or SELinux denies Play Core's FakeAssetPackService the read of the local-testing pack APK on API 33.

| scenario | before | after |
|---|---|---|
| (i) "What is 2 plus 2?" ×4 in one **fresh** chat | 1 word each, 0.3 / 0.5 / 0.9 / 0.8 s | 8 words each, 1.8 / 0.9 / 1.2 / 1.3 s |
| (i′) the same four asks in a chat that already holds one long turn | **46 / 44 / 42 / 40 words**, 4.7 / 4.5 / 4.4 / 4.2 s | **5 / 5 / 5 / 5 words**, 2.6 / 0.7 / 0.9 / 0.8 s |
| (ii) "Summarize the causes of World War One in about 200 words." | 222 words, 14.3 s | **217 words**, 13.7 s — not truncated |
| (iii) "Write a formal letter to my landlord about a broken heater" | 179 words, 10.7 s | 93 words, 7.5 s — subject, salutation, body, sign-off, complete |
| (iv) Hebrew short question, "מה הבירה של צרפת?" | 5 words, 1.4 s | 5 words, 2.1 s |
| "Why is the sky blue?" | 89 words + an invented `nature.com` URL, 6.1 s | 39 words, 4.0 s |
| "What is the capital of Australia?" | 6 words, 0.6 s | 7 words, 0.6 s |
| Hebrew "מה זה בינה מלאכותית?" | 83 words **with a four-bullet loop** ("אם כן / אם לא" repeated), 14.8 s | 22 words, 5.5 s |
| "How does a refrigerator work?" | 144 words, 10.7 s | 30 words, 3.5 s |

The ledger on that last pair is the mechanism in one line: **before 101 + 194 tokens in 10.6 s, after 137 + 33 tokens in 3.5 s**
(`a-15-fridge-ledger-before.png`, `a-16-fridge-ledger-after.png`). The prompt grew by the 36 tokens of the length line and the answer fell by 161.

**Honest about the repro.** Scenario (i) as Moshe saw it does **not** reproduce on this emulator: on a fresh chat the unfixed
build already answered "2 plus 2" in one word, 0.3–0.9 s, nowhere near the cap. What does reproduce is the same behaviour one
step along — as soon as the chat holds any earlier content, the unfixed build spent 40+ words and 4+ s on the same question,
and on open questions it ran to 89–144 words with fabrications and a bullet loop. The 6T's 85 s runs happened in a chat that
also had a **document attached**, which needs the `embed` pack and is not reachable on an `INBORN_PACKS=instant` build; that
exact state stays **unverified here**. Sampling is unseeded, so no single answer is deterministic on either build.

**iPhone 15 Pro simulator** (shared JS): release build of this branch (`Inborndev`, iPhone 15 Pro / iOS 18.1, `9162F167…`, Instant bundled in the app at
`Inborndev.app/instant.gguf`), scenario (i) once through the same `EXPO_PUBLIC_AUTOPROMPT=file` hook in the simulator's data
container: **13 / 4 / 11 / 11 words** in **2.0 / 0.9 / 1.4 / 1.1 s** at 48–50 tok/s (`i-01-four-asks-after.png`). Simulator shut
down afterwards; `xcrun simctl list devices booted` lists nothing.

Gates on this branch: `pn install --frozen-lockfile` 0, `pn typecheck` 0, `pn test` 0 (core **493**, 473 + the 20 new, mobile 169, i18n 10, ui 11 — **683** tests),
`pn lint` 0, `pn web:build` 0, `pn web:smoke` 0 (five PASS lines, first visit 10.9 s, 31.2 tok/s), `pn desktop:check` 0 (7 Rust tests).

**Correction 22.9, from vc13 → vc14 on the real Play path (section Q of `docs/qa/purchases-run-2026-09-11.md`, soak run 7).** The 83–87 s
figures this section opened with — the ones read off soak 6 — were the measuring driver, not the model: soak 6's sender declared a turn
complete when the assistant message's `content-desc` (its first paragraph only) changed since the send, so an identical repeated answer
never registered as done and the poll ran to its own ceiling every time. With the driver fixed (stop-button detection plus a full-text
stability fallback), the same repeated "What is 2 plus 2?" completes in **3–4 s on vc13 itself** — a build that predates this round's
fix entirely — and in **3–5 s on vc14**, which carries it. F38 changes nothing measurable in the exact case Moshe complained about,
because that case was already short; the one place the policy shows is a long open-ended ask ("…in about 200 words"), which measured
**99 words in 11 s** in a chat with earlier turns and **160 words in 21 s** in a fresh chat on vc14 — complete sentences both times, never
truncated. This round's length policy is a real, worthwhile product improvement to answer shape; it is not, and was never, a fix for a
hang.

## Fixes round 18: dictation crashed on Android, image input was Instant-only, Sharp's estimate on legacy chips (branch `fixes-r18`) — 21.9.2026
Three findings from the Play vc12 run (`docs/qa/purchases-run-2026-09-11.md` section O). All three are root-fixed here and
each is proven on the OnePlus 6T (`REDACTED-6T`, Snapdragon 845, Android 11).

- **F35 · the microphone killed the app about 24 s into hands-free** (`patches/@fugood__react-native-audio-pcm-stream@1.1.4.patch`,
  `apps/mobile/src/voice/mic.native.ts`, `packages/core/src/voice/micSession.ts`). Root cause is in the stream module's
  Android side, and it is a genuine race, not a misuse: `stop()` is a `@ReactMethod` that only sets `isRecording = false`
  and returns, so JS is told the recorder is down while the reader thread is still unwinding; that thread's `finally`
  then runs `recorder.release(); recorder = null;` **on the field**, which by then points at the recorder the next
  `init()` has already created. The hands-free listener re-opens the microphone every 12 s of silence, so the third open
  died on `AudioRecord.release()` of a null (`RNLiveAudioStreamModule.java:115`), 3/3 times on vc11 and vc12.
  The patch gives the thread a **local** reference to the recorder it started, so it can never release a later one; makes
  `isRecording` volatile; checks `getRecordingState()` before `stop()` so an already-stopped recorder is not an exception;
  and turns `stop()` into a promise that resolves only after `join()`, with `init()` doing the same join first, so a new
  recorder is never built over a live thread. On our side `MicRecorder.start`/`stop` run through one process-wide queue
  (`serialQueue`) and a four-state machine (`nextMicState`, `micShouldStart`, `micShouldStop`), so an overlapping start
  cannot even be attempted; 10 unit tests in `packages/core/test/voice-mic-session.test.ts`.
- **F36 · only Instant can look at a photo** (`packages/core/src/catalog/manifest.json` v4 re-signed,
  `apps/mobile/src/images/vision*.ts`, `screens/Chat.tsx`, `components/chat/AttachSheet.tsx`, the `models.copy.*` and
  `chat.vision.*` keys in all nine locales). One `mmproj` is built for one embedding width and the one we ship is
  Instant's (`n_embd` 1024); Fast (2048) and Sharp (2560) answer "Failed to initialize multimodal context" and the
  picture was dropped in silence while the cartridge promised photos. The catalog now says so: `vision: false` on Fast
  and Sharp, "No photos" first in their **Weak at** line, "The only model here that can look at a photo" on Instant, and
  the vision companion reads "Lets Instant look at your photos on this device". The engine holds one model at a time
  (`src/engine.ts`, one load per app run), so a turn cannot be routed through Instant behind the user's back; instead the
  attach sheet says "FAST cannot look at photos. INSTANT is the one model here that can." and carries a one-tap **Use
  INSTANT for photos** row, and a picture that reaches a model without the projector is answered honestly in the chat
  ("I cannot look at pictures. INSTANT is the model on this device that can see a photo.") beside a **Switch to INSTANT**
  button, never dropped. Pictures in older turns are stripped from the prompt instead of refusing the whole chat.
- **F37 · Sharp measured 0.5 tok/s on a 2018 flagship while its card promised 3–4** (`packages/core/src/catalog/speed.ts`,
  `catalog/pick.ts`, `catalog/recommend.ts`, `screens/vault/ModelCard.tsx`). The `android-legacy` row now carries the
  measured number (`sharp: [0.4, 0.6]`, vc12 ledger: 1,820 ms/token, TTFT 32.9 s). `tooSlowHere(chip, tier)` marks any
  row whose ceiling is under `USABLE_TOKENS_PER_SEC` (1.5); `DeviceProfile` gained the optional chip class so
  `rankModels` can drop such a tier from the recommendation entirely. Sharp stays in **Fits your phone** with its Install
  button, and the card reads `~0.4-0.6 tok/s on your phone · Too slow to use on this phone`.

**Proof on the OnePlus 6T.** Play's vc12 was uninstalled and a **debug build of this branch (versionCode 13) driven from
Metro on a private port 8137** took its place, because `Documents/whisper.bin` and `Documents/instant.gguf` (the dev
stand-ins) need a debuggable app, and the Pro override `EXPO_PUBLIC_PRO` is compiled out of release bundles. `inborn://voice`
reaches the hands-free screen without the paywall, which is what made a headless proof possible at all.

| F35 | control (branch JS and native reverted to `origin/main`) | fixed |
|---|---|---|
| build | same debug APK, `RNLiveAudioStreamModule.java` restored from `origin/main` | patched class in `classes2.dex` (`strings` finds `stopAndJoin`, `recordingThread`) |
| listen cycles before it died | **3** — `set()` 20:29:23.036, 35.119, 47.168 | **15** across three sessions, none died |
| the race, in the log | `set()` 20:29:47.168 **then** `stop(270)` .169: the new recorder was built while the old thread still ran | `stop(273)` .621/.700/.701 **then** `set()` .718 — teardown finishes first, every time |
| outcome | `FATAL EXCEPTION: Thread-14 · NullPointerException … AudioRecord.release() … RNLiveAudioStreamModule.java:115`, process gone, phone back at the launcher | pid **14119 → 14119** over 135 s, then 20326 and 20333 over 95 s each, **0 FATAL**, 0 `AudioRecord.release` NPEs |
| screen | force-finished | alive: `voice-screen`, `voice-seal`, `whisper 394 ms`, "Ended. Nothing was heard for a while." — the reducer's own silence ceiling, not a crash |

RECORD_AUDIO was granted with `pm grant` for the runs and **revoked again** afterwards (`granted=false`), as vc12 left it.

**iPhone 15 Pro simulator**, because the fix changes shared JS (`mic.native.ts` runs on both platforms; the module patch is
Android-only). Debug build of this branch from this worktree (`Inborndev`, bundle id unchanged) on Metro, `Documents/whisper.bin`
copied into the data container, microphone granted with `simctl privacy grant`. `inborn://voice` at 21:27:39, screen read at
21:28:54: pid **48237 → 48237**, no red box, `[voice] whisper loaded … in 22411 ms (gpu false: Metal is not supported in
simulator)`, and the screen alive on "Ended. Nothing was heard for a while." The simulator was shut down afterwards.

**F36 and F37 on the same phone**, with Instant, Fast and the vision projector installed through the dev HTTPS delivery
(`scripts/serve-models.mjs` on 8791 over `adb reverse`, `EXPO_PUBLIC_MODELS_BASE_URL`, vault commands through
`Documents/dev-vault.txt`), fixture: a 1024 × 640 PNG with a red circle, a blue square and a green triangle.

| check | what the phone showed |
|---|---|
| vault header | `RUNS ON: ANDROID-LEGACY · 8 GB` |
| Sharp card (F37) | `~0.4-0.6 tok/s on your phone · Too slow to use on this phone`, under **FITS YOUR PHONE**, `Install · 2.6 GB` still offered; Sharp-Phi the same |
| recommendation (F37) | `RECOMMENDED ON THIS PHONE · CHAT IN ENGLISH` sits on **FAST**; Sharp carries no recommendation |
| attach sheet, Fast resident (F36) | Photo and Camera disabled, hint `FAST cannot look at photos. INSTANT is the one model here that can.`, plus the row `Use INSTANT for photos` (`attach-use-vision`) |
| that row, one tap | model chip FAST → INSTANT, `llama.rn loaded model INSTANT … in 3354 ms` |
| Instant + the picture | `n_embd=1024`, "Multimodal context initialized successfully", answer: *"Red Circle … Blue Square … Green Triangle"* |
| Fast + the same picture | assistant: *"I cannot look at pictures. INSTANT is the model on this device that can see a photo. Switch to it and send the picture again."*, with `vision-offer` reading "Photos need INSTANT, not FAST." and a **Switch to INSTANT** button; one tap loaded Instant |
| cartridge copy | Fast **Weak at: No photos; code, math, Hebrew; …**; Sharp **Weak at: No photos; slower and warmer than Fast; …**; Instant "The only model here that can look at a photo"; vision companion "Lets Instant look at your photos on this device." |

Gates on this branch: `pn typecheck` exit 0, `pn test` exit 0 (core **473**, mobile 169, i18n 10, ui 11 — 663 tests),
`pn lint` exit 0. The catalog is re-signed (`node scripts/sign-catalog.mjs --check` → "manifest signature OK").

**What the phone holds now.** A **release APK of this branch, versionCode 13** (debug keystore, self-contained, launches
without Metro — onboarding reads `RUNS ON: SNAPDRAGON 845 · 8 GB`), app force-stopped, phone on its launcher, RECORD_AUDIO
revoked, no `adb reverse` left. Play's vc12 and its seven packs went with the uninstall and **cannot be restored from this
Mac**: the OnePlus ignores injected touches in the Play Store app (our own app accepts them, Play does not, and TAB/ENTER
lands on the wrong view), so pressing **Install** on the Play page is a human step.

## Fixes round 17: the OCR data never reached a clean Android bundle (branch `fixes-r17`) — 21.9.2026
The vc9 stream found it in the artifact it had just uploaded (`docs/qa/purchases-run-2026-09-11.md` section L): `unzip -l`
of the vc9 AAB has **zero** `traineddata` entries. `DocExtractModule.kt:171` reads the language files with
`assets.list("tessdata")`, so on vc9 `bundledLanguages()` is empty and `tessFor` fails `ERR_NO_OCR` — OCR of scans was
unavailable on Android, where vc8 had it.
- **Root cause: `assets.srcDir(provider)` does not carry the producing task.** Round 15 staged
  `INBORN_MODELS_DIR/ocr/tessdata/*.traineddata` into `build/generated/ocrAssets` with a `Sync` task and registered the
  directory as `assets.srcDir(stageTessData.map { it.destinationDir })`. A `TaskProvider.map` of a plain getter is not a
  task output, so Gradle wired no dependency: on a clean build `:doc-extract:stageOcrTessData` never ran,
  `:doc-extract:mergeReleaseAssets` merged an empty directory, and the bundle came out without the data and without a
  warning.
- **The fix names the dependency** (`apps/mobile/modules/doc-extract/android/build.gradle`). The assets source is now the
  plain `build/generated/ocrAssets` directory, and every task that reads it says so: `merge*Assets`, `package*Assets`, the
  lint-model and lint-analysis tasks (declaring only the merge tasks failed `:doc-extract:generateReleaseLintModel`
  validation on Gradle 9.3.1, which is why round 15 moved to the provider in the first place) and `preBuild`.
- **A build can no longer produce a bundle without OCR.** `verifyOcrAssets` runs after the staging, is never up-to-date, and
  throws a `GradleException` naming `INBORN_MODELS_DIR` unless both `eng.traineddata` and `heb.traineddata` are staged. It
  is deliberately a second task: the `Sync` skips its own checks when it is UP-TO-DATE, which is exactly the state that hid
  this.
- **And the artifact is checked too.** `scripts/check-android-bundle.sh <aab>` asserts `base/assets/tessdata/eng.traineddata`
  and `heb.traineddata` are present and that nothing sits under `base/assets/ios`; it is in the release recipe beside
  `check-android-permissions.sh`. Run against the shipped vc9 bundle it exits 1 on both language files, against vc10 it
  exits 0.
- **Correction to round 15, finding A.** That section says the Tesseract data was still in the bundle and that the provider
  "carries the task dependency". Neither held. Its `build-release2.log`, `build-verify.log` and `c-build-vc9fixed.log` all
  show `:doc-extract:mergeReleaseAssets UP-TO-DATE` with no `stageOcrTessData` line: the staged directory left behind by the
  **first** formulation was still on disk in that worktree, and `rm -rf android` does not remove
  `modules/doc-extract/android/build`. The iOS half of round 15 A stands — `base/assets/ios` is 0 in vc9 and in vc10.
- **Proof, clean build.** Fresh worktree off `origin/main`, no `android/` directory and no
  `modules/doc-extract/android/build`, `INBORN_MODELS_DIR=…/.models INBORN_PACKS=instant,fast INBORN_VERSION_CODE=10`,
  `bundleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a -Dorg.gradle.jvmargs="-Xmx8g -XX:MaxMetaspaceSize=1g"`
  with a private `GRADLE_USER_HOME` (APFS clone of `~/.gradle-pr2`). `pgrep -fl xcodebuild` was empty before and during;
  `gradlew --stop` was never run. **BUILD SUCCESSFUL in 3 m 29 s**, 1107 actionable tasks, 1107 executed, with
  `:doc-extract:stageOcrTessData` and `:doc-extract:verifyOcrAssets` both in the log.

| check | vc9 (`main`) | vc10 (`fixes-r17`) |
|---|---|---|
| AAB | 1,870,641,095 B | **1,873,100,969 B** (+2,459,874 B compressed) |
| sha256 | `67cc2aad…4beb58` | `593cbb5e297183824eeb746fed3af26b1b01b5d7030196043918508b86cddbda` |
| `base/assets/tessdata/*.traineddata` | **0 entries** | **2** — `eng` 4,113,088 B, `heb` 961,404 B |
| entries under `base/assets/ios` | 0 | **0** |
| `base/assets` | 118 entries / 12,720,769 B | **120 entries / 17,795,262 B** |
| `bundletool validate` | OK | **OK** — `inborn_model` fast-follow, `inborn_model_fast` on-demand, both GGUFs byte-identical (532,517,120 / 1,280,835,840 B) |
| manifest | versionCode 9 | versionCode **10**, versionName 1.0.0, `com.inbornapp.mobile`, minSdk 26, compileSdk 36 |
| `scripts/check-android-permissions.sh` | 9, no INTERNET | **"OK: no INTERNET permission; every declared permission is in the allowlist (9 declared)."** |
| `scripts/check-android-bundle.sh` | **exit 1**, both language files reported missing | **exit 0** |
| module registry (dex strings) | nine | **nine** — AssetPacks, DeviceGuard, DocExtract, HardwareKeys, ReadAloud, SecureScreen, ShareTarget, TrafficMeter, VaultNative |

  Diffing the two `base/assets` listings gives exactly the two language files plus one byte in `app.config` (the version
  code is one character longer). Signed `CN=Inborn Upload Key, O=Inborn, C=IL`, SHA-256 digests, `jarsigner -verify` says
  "jar verified". Gates on this worktree: `pnpm typecheck`, `pnpm test` (core 461, mobile 169, i18n 10, ui 11) and
  `pnpm lint` all exit 0.
- **The data is byte-identical end to end.** `eng.traineddata` `7d4322bd…70b2` and `heb.traineddata` `11f9e43a…04db` in
  `.models/ocr/tessdata`, in the uploaded AAB, and in the 70,243,831-byte `base.apk` that Play generated and installed on
  the OnePlus 6T — where they sit at `assets/tessdata/`, the exact path `assets.list("tessdata")` reads.
- **The OCR run itself could not be exercised on an internal build, for a separate reason.** Indexing a document is what
  calls the OCR engine, and indexing needs the document index model (`embed-nomic`, 262 MB), which Android delivers as the
  `inborn_model_embed` Play asset pack. `INBORN_PACKS=instant,fast` — the internal-testing pack set used for vc8, vc9 and
  vc10 — leaves that pack out of the bundle, so the Documents screen's "Install · 262 MB" answers `AssetPackServiceImpl:
  onError(-2)` (MODULE_UNAVAILABLE) and every imported document stays at "Install the document index model first." A
  scan shared into the app is imported and listed, and its details read PASSAGES 0 · OCR PAGES 0 · INDEX MODEL —, so the
  question it answers comes from the model, not the page. This is not new in vc10: no internal build has ever shipped that
  pack (`bundletool validate` on vc8 and vc9 lists `base`, `inborn_model`, `inborn_model_fast` only), so OCR has never been
  reachable on the internal track. A production build with `INBORN_PACKS` unset ships all packs. **Proving OCR on a real
  device needs an internal build with `INBORN_PACKS=instant,fast,embed`.**
- **Closed by vc11** (`docs/qa/purchases-run-2026-09-11.md` section N, 21.9): Play internal 1.0.0 (11) is the first store
  build that carries `inborn_model_embed`. On the 6T, updated through the Play Store app, "Install · 262 MB" now delivers
  the pack (`onNotifyModuleCompleted(inborn_model_embed)` where vc10 logged `onError(-2)`), the round-17 scan OCRs to
  OCR PAGES 1 · tesseract / PASSAGES 1 and its recognized text answers a question in chat with a citation to the scan.
  `scripts/check-android-bundle.sh` now also fails a bundle that is missing any of the three packs, so the recipe cannot
  silently regress again.
- **iOS is untouched.** This round changes Android build configuration only: `apps/mobile/modules/doc-extract/android/build.gradle`
  and `scripts/check-android-bundle.sh`. The podspec still symlinks `vendor/libtesseract.xcframework` and `vendor/tessdata`
  out of `INBORN_MODELS_DIR/ocr`, and no iOS build was run or needed.

## Fixes round 16: strict documents mode answered from the model when nothing was attached (F34) (branch `fixes-r16`) — 21.9.2026
QA pass 7 (`docs/qa/qa-run-2026-09-11.md`, row 4) found the "Answer only from my documents" switch doing nothing whenever the
chat had no indexed document attached: the model answered from its own weights, confidently wrong about a place that does not
exist, and nothing on screen said the switch was on.
- **Root cause: the whole documents branch hung off `docs.ready`** (`apps/mobile/src/screens/Chat.tsx`), and
  `useDocumentContext` sets `ready` from `library.attachedTo(chatId)`, so it is false for every fresh chat and for every chat
  the user has just detached a document from. With `ready` false the retrieval call, the `noAnswer` check and
  `t("documents.notFound")` were all skipped and the turn fell through to `engine.generate`. The strict switch had no say in
  that condition at all, and the "DOCS ONLY" tag rendered only inside the attachment chip row, so with nothing attached the
  chat showed no strict indicator either.
- **The fix decides the turn before anything reaches the model** (`apps/mobile/src/lib/docsGate.ts` — new, used in
  `screens/Chat.tsx`). `planDocsTurn({ strict, hasAttachment, hasIndex })` returns `retrieve` only when an attached document
  has passages, `model` when the switch is off, and otherwise `refuse` with the message key to answer with. Strict with nothing
  attached answers `documents.noneAttached`, the new key; strict with an attachment that has no index yet answers
  `documents.notFound`. The non-strict path is untouched, and "Continue" still resumes a partial answer with the passages it
  already saw, so the gate only decides fresh turns.
- **Retrieval may not simply be widened instead.** `DocumentLibrary.ask` falls back to *every* indexed document when it is
  handed no ids, so relaxing the old condition to `docs.ready || docs.strict` would have answered a chat with nothing attached
  out of the user's whole library. The gate is what keeps "attached" meaning attached.
- **New copy in all nine locale files** (`packages/i18n/locales/*.json`): `documents.noneAttached` — "No document is attached
  to this chat. Attach one, or turn off “Answer only from my documents”." Each locale quotes its own wording of the switch;
  `pseudo.json` was regenerated with `node scripts/pseudo.mjs`.
- **The DOCS ONLY tag now follows the switch, not the attachments** (`screens/Chat.tsx`): the chip row renders whenever
  `docs.strict` is on, so a chat with nothing attached still says it is in documents-only mode.
- **Unit test** `apps/mobile/src/lib/docsGate.test.ts`: strict with nothing attached refuses with `documents.noneAttached`,
  strict with an unindexed attachment refuses with `documents.notFound`, an indexed attachment retrieves with or without
  strict, and no strict means the model answers. Gates on this worktree: `pnpm typecheck`, `pnpm test`
  (core 461, mobile 164, i18n 10, ui 11) and `pnpm lint` all exit 0.
- **Proof on the Android emulator** (AVD `Pixel_6_API_33`, `-memory 4096`, guest `MemTotal 4,000,208 kB`, debug APK from this
  worktree, Instant / Qwen3.5-0.8B-Q4_K_M, Metro on the private port 8171, `EXPO_PUBLIC_TIER=work`,
  `EXPO_PUBLIC_AUTOINDEX=handbook.pdf`; `docs/qa/fixes-r16/a-01…a-03`). Strict on from `documents.json` before the first
  launch, nothing attached: "What is the capital of Atlantis?" answered **"No document is attached to this chat. Attach one,
  or turn off “Answer only from my documents”."** with the DOCS ONLY tag on screen and no attachment chip. The 3-page
  `handbook.pdf` then imported and indexed (`[documents] handbook.pdf: indexed · 3/3 pages · 3 chunks · 2489 ms`) and attached:
  the same question answered **"I could not find that in your documents."**, and "How many crates were counted at the Reykjavik
  depot?" answered **"5,842"** with one chip, `handbook.pdf · p.2`. The logs show the model was never asked on the two refused
  turns — `[stats] … tokPerSec 0, ttftMs 0, ctxUsed 0, elapsedMs 49` and `elapsedMs 204`, with no `[llama.rn] timings` line —
  while the cited answer has `timings … prompt_n 484, predicted_n 4`.
- **Proof on the iPhone 15 Pro simulator** (`12114C34-288A-4AAB-B50A-693DC6775C60`, iOS 17.0, Debug build for the
  simulator from this worktree, Instant on Metal, Metro on 8081, same env; `docs/qa/fixes-r16/i-01…i-03`). The app was
  reinstalled first so the library started empty, and the same three steps gave the same three answers: the
  `documents.noneAttached` line with DOCS ONLY on screen and nothing attached, then "I could not find that in your
  documents." once `handbook.pdf` was attached (`indexed · 3/3 pages · 3 chunks · 1585 ms`), then "Five, 842 crates were
  counted at the Reykjavik depot." with one chip, `handbook.pdf · p.2`. Same signature in the logs: `[stats] … tokPerSec
  0, elapsedMs 49` and `elapsedMs 64` with no `timings` for the two refusals, `prompt_n 480, predicted_n 16` for the cited
  answer. The Instant model spells the figure as "Five, 842" rather than "5,842"; that is the bundled model's wording of
  the right number from the right page, unchanged by this round.
- **Harness notes.** `idb ui tap` still needs `--duration 0.15` for the onboarding buttons (pass-7 O39), and the attach
  sheet dismisses by tapping the backdrop above it rather than its full-screen Close node. `EXPO_PUBLIC_AUTOINDEX`
  re-imports on every Documents mount (O43), so the library was opened exactly once per platform.
## Fixes round 15: the Android bundle carried iOS binaries, Fast lost after every update, and F27 on the floor device (branch `fixes-r15`) — 21.9.2026
Three findings from soak run 4 (`docs/qa/soak-run-4-2026-09-21.md`) and section K of `docs/qa/purchases-run-2026-09-11.md`.

### The Android bundle shipped 229 MB of iOS Mach-O
- **Root cause: the whole `ocr/` folder was an Android assets source root**
  (`apps/mobile/modules/doc-extract/android/build.gradle`). The module did `assets.srcDirs += file("$INBORN_MODELS_DIR/ocr")`,
  which makes every child of that folder an Android asset. `ocr/` held only `tessdata/` until 20.9, when iOS build 6 put
  `ocr/ios/libtesseract.xcframework` beside it for the podspec to symlink — and vc8 shipped its four slices (ios-arm64,
  simulator, maccatalyst, macos) as **257 entries under `base/assets/ios/`**, none of which Android can load.
- **The exclusion is now structural, not a filter.** A `Sync` task stages the one named path
  `INBORN_MODELS_DIR/ocr/tessdata/*.traineddata` into `build/generated/ocrAssets/tessdata`, and that directory is the assets
  source. A new sibling under `ocr/` cannot reach Android at all, because nothing but `tessdata` is ever named. The source is
  registered as `assets.srcDir(stageTessData.map { it.destinationDir })`, so the provider carries the task dependency and
  merge, package **and lint** all wait for the staging (declaring only the merge tasks failed
  `:doc-extract:generateReleaseLintModel` validation on Gradle 9.3.1).
- **Proof, built exactly as section K records it**: clean `rm -rf android`, prebuild with `INBORN_MODELS_DIR=…/.models
  INBORN_PACKS=instant,fast INBORN_VERSION_CODE=9`, then `bundleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a
  -Dorg.gradle.jvmargs="-Xmx8g -XX:MaxMetaspaceSize=1g"` with a private `GRADLE_USER_HOME` in the session scratch.
  `gradlew --stop` was never run and no xcodebuild ran beside it. **BUILD SUCCESSFUL in 1 m 51 s**, 1105 tasks.
  Nothing was uploaded to Play.

| check | vc8 (`main`) | fixes-r15 |
|---|---|---|
| AAB | 2,092,078,443 B | **1,873,100,390 B** — 218,978,053 B smaller |
| entries under `base/assets/ios` | **257** | **0** |
| `base/assets` uncompressed | 451,697,441 B | **17,792,265 B** |
| base module uncompressed | 636,516,916 B | 202,609,000 B |
| Tesseract data | `base/assets/tessdata/{eng,heb}.traineddata` | same two entries, 4,113,088 + 961,404 B |
| `bundletool validate` (`.tools/bundletool-all-1.18.3.jar`) | OK | **OK** — `inborn_model` fast-follow, `inborn_model_fast` on-demand, both GGUFs byte-identical (532,517,120 / 1,280,835,840 B) |
| manifest | versionCode 8 | versionCode **9**, versionName 1.0.0, `com.inbornapp.mobile`, minSdk 26, compileSdk 36 |
| `scripts/check-android-permissions.sh` | 9 declared, no INTERNET | **"OK: no INTERNET permission; every declared permission is in the allowlist (9 declared)."** |

  sha256 of the new AAB: `38511d83494a1fa5d60a366a6126300507e8c1d3d1ca0b4725596ee8d413008a`.
- **OCR still finds its data.** *(Wrong — see round 17: this was measured against a staged directory an earlier build had
  left on disk, and vc9 shipped with no `traineddata` at all.)* The shipped path `base/assets/tessdata/…` is exactly what the module reads:
  `DocExtractModule.kt:171` `assets.list("tessdata")`, `:175` `assets.open("tessdata/$name")`, `:182` the language list. The
  debug APK built from the same gradle file carries `assets/tessdata/eng.traineddata` and `heb.traineddata` and zero
  `assets/ios` entries.
- **iOS is untouched.** `git diff origin/main -- apps/mobile/modules/doc-extract/ios apps/mobile/ios` is empty; the podspec
  still symlinks `vendor/libtesseract.xcframework` and `vendor/tessdata` out of `INBORN_MODELS_DIR/ocr`, the way
  `docs/qa/ios-build-6-2026-09-20.md` line 28 describes. Only the Android side stopped taking the folder wholesale.

### F27 · a hardware keyboard could not leave the empty chat's suggestion chips
Reproduced first on the **shipped vc8 build** on the OnePlus 6T (Android 11, 1080×2340 at 450 dpi = 384 dp), fresh empty chat
via `inborn://`, `input keyevent TAB` with one serialised `uiautomator dump` per press:
`composer-input → mic → Dismiss → suggestion-summarize → suggestion-translate → suggestion-draft → translate → draft → …`
and from there translate and draft for ever. Round 13 closed F27 against an emulator; the floor device disagrees.
- **Root cause is React Native's scroll view, not our layout** (`ReactScrollView.java:488`, RN 0.86.3). Under the default
  feature flag `enableCustomFocusSearchOnClippedElementsAndroid`, `focusSearch` computes the correct next focus with
  `super.focusSearch`, **throws it away** whenever `findViewById(nextFocus.getId())` says it is not one of its own
  descendants, and substitutes `ReactScrollViewHelper.findNextFocusableView`, which asks Fabric for the next focusable
  *inside the scroll view*. The chips are the chat list's `ListEmptyComponent`, so every TAB that should leave the list is
  rewritten back into it.
- **Measured on the device, not inferred.** With an explicit `nextFocusForward` from chip to chip the prop is honoured
  (draft → summarize, a target inside the scroll view). The same prop pointing at `composer-input` (react tag 202) or at
  `open-chats` (tag 58) is ignored and focus falls back to the chip cycle. Both of those are outside the scroll view; that is
  the only difference between the two runs. Android logged no "couldn't find view with id", so the ids resolve.
  Why the emulator escaped it in rounds 12 and 13 was not established, and is not needed: the fix is proven on the device
  that shows the defect.
- **Fix, part 1 — focus can leave a list again** (`apps/mobile/plugins/withScrollFocusEscape.js`, new, registered in
  `apps/mobile/app.config.ts`). `MainApplication.onCreate` turns that one flag off for the whole app. `loadReactNative`
  already installs the stable overrides through `DefaultNewArchitectureEntryPoint.load`, and a second
  `ReactNativeFeatureFlags.override` throws "Feature flags cannot be overridden more than once", so the plugin uses
  `dangerouslyForceOverride` with `ReactNativeNewArchitectureFeatureFlagsDefaults` — the exact set the stable release level
  installs, since `ReactNativeFeatureFlagsOverrides_RNOSS_Stable_Android` is that class with nothing added and is final —
  plus the one flag. The clipped-element search this disables has nothing to find here anyway: fixes round 14 set
  `removeClippedSubviews: false` on all four long lists. The plugin throws at prebuild if `MainApplication.kt` ever changes
  shape.
- **Fix, part 2 — the order is declared** (`apps/mobile/src/screens/Chat.tsx`). The chips chain
  `nextFocusForward` summarize → translate → draft → `composer-input`, with the handles resolved by `findNodeHandle` once the
  refs are attached. Android only: `chipNext` stays empty on iOS, so no prop reaches the iOS render and no iOS pixel moves.
  `apps/mobile/src/types/react-native-focus.d.ts` declares `nextFocusForward` on `ViewProps`, which RN 0.86 has in its Flow
  props and in `ReactViewManager` but omits from its `.d.ts`.
- **Green on the 6T**, debug APK of this branch driven from Metro, keys only, one serialised dump per press. Fresh empty chat
  opened with `inborn://`; eighteen TABs give two identical nine-stop rings, `composer-input` reached each time, no cycle:
```
 1 model-chip            10 model-chip
 2 attach                11 attach
 3 mic                   12 mic
 4 (notice) Dismiss      13 (notice) Dismiss
 5 suggestion-summarize  14 suggestion-summarize
 6 suggestion-translate  15 suggestion-translate
 7 suggestion-draft      16 suggestion-draft
 8 composer-input        17 composer-input
 9 open-chats            18 open-chats
```
  Shots: `docs/qa/fixes-r15/f27-empty-chat.png`, `f27-tab07-draft-focused.png`, `f27-tab08-composer-focused.png` (the amber
  focus border on the composer and the soft keyboard up).

### After every Play update the vault asked for a 1.2 GB download it already had
Section K of `docs/qa/purchases-run-2026-09-11.md` (line 314): on the vc7 → vc8 update the vault read "508 MB in the vault"
and the Fast card offered `install-fast` "Install · 1.2 GB from Google Play", yet Download **finished instantly** because
the bytes had never left the phone. The same happened on vc6 → vc7. MosheAI called it a release blocker.
- **Root cause: Play stores each asset pack under the app's versionCode, so every update unbinds it.** The engine line in
  logcat shows the path shape: `files/assetpacks/inborn_model_fast/9/9/assets/Qwen3.5-2B-Q4_K_M.gguf` — pack, versionCode,
  pack version. After an update `AssetPackManager.getPackLocation` returns null for an on-demand pack until the app asks for
  it again, and `PlayDelivery.locate` (`apps/mobile/src/vault/playDelivery.ts`) is built on exactly that call. `VaultStore.scan`
  then took "not located" for "not installed", **deleted the install record** and set `not-installed`, which is the Install
  offer with the full catalog size behind it.
- **Why Instant survived and Fast did not.** The tail of `scan` already re-requested packs, but only where
  `d.mode === "fast-follow"` — Instant. Fast, Sharp, the embedder, speech and vision are on-demand and were left to the user.
- **The fix extends that one mechanism instead of adding another** (`apps/mobile/src/vault/store.ts`): `requestKnownPacks()`
  asks Play for every pack that is fast-follow **or** that the vault's own record says this device was delivered
  (`installs[id].via === "play"`), and `scan` no longer deletes a Play record just because the pack is unbound — that record
  is the app's only memory that the bytes are there. It runs at the end of the boot scan and again when the vault opens
  (`apps/mobile/src/screens/vault/VaultScreen.tsx`). Play serves a pack it still holds without downloading anything; a pack
  that is genuinely gone is re-fetched for a model the user had already chosen, under Play's own Wi-Fi and cellular-consent
  rules. Nothing asks for a model this device never had, so no boot starts an unasked download.
- **Unit test**: `apps/mobile/src/vault/store.test.ts`, five cases over a faked Play delivery — the unbound pack is
  re-requested and lands `ready`, the record survives the unbound boot, a model this device never had is left alone, an
  HTTPS file that is really gone still loses its record, and the vault-open path re-asks. Against the pre-fix `store.ts`
  three of the five fail (`expected [ 'instant' ] to include 'fast'`).
- **Proof on the OnePlus 6T** (`REDACTED-6T`, release AABs installed with `bundletool build-apks --local-testing`; the local
  Play Core stub reproduces the fault exactly, and its `FakeAssetPackService : startDownload` lines are what proves who asked):

| step | build | vault header | Fast card |
|---|---|---|---|
| Fast installed | vc8 (`12b0d9f`) | 1.7 GB in the vault | installed, `docs/qa/fixes-r15/c-vc8-fast-installed.png` |
| version bump, no fix | vc9 (`12b0d9f`) | **508 MB in the vault** | **"Install · 1.2 GB from Google Play"**, `c-vc9-unfixed-install-offer.png` |
| version bump, fixed | vc9 (this branch) | **1.7 GB in the vault** | FAST · Loaded · In use, `c-vc9-fixed-vault.png` |

  On the fixed build nothing was tapped: the app itself logged `FakeAssetPackService : startDownload([inborn_model_fast])`
  at 11:22:37, `ExtractChunkTaskHandler` reported the chunk extracted at 11:23:02, and the engine loaded
  `files/assetpacks/inborn_model_fast/9/9/assets/Qwen3.5-2B-Q4_K_M.gguf` in 2,430 ms. "Name three colours." then answered
  **"Red, Blue, and Green."** with the FAST chip (`c-vc9-fixed-fast-answer.png`), and a second cold launch stayed at
  1.7 GB with no Install button anywhere in the vault.
- **Not covered**: a phone whose record the *shipping* vc8 already deleted has nothing left to re-request, so its first
  launch on the fix still offers Install — one tap, and Play returns the bytes instantly. Every update after that is clean.

## Docs audit follow-up (branch `docs-audit-fixes`) — 22.9.2026

Closes the documentation-only findings assigned from `docs/qa/spec-conformance-2026-09-22.md` (the spec-conformance
audit against `main`). Docs only: no app code changed, no device or emulator used.

- **Privacy policy told the wrong download story (gap 4).** `docs/legal/privacy-policy.md` promised Apple-hosted
  Background Assets on iOS 26 with "no domains in your App Privacy Report" — the app does not use Background Assets in
  this release, and a real iPhone was recorded pulling 1.2 GB from `models.inbornapp.com`. Rewrote the iOS, Windows/macOS
  and `app-privacy-details.md` sections to describe the CDN path honestly, on every supported OS version, and added the
  fact that Android has no `INTERNET` permission at all and gets models through Play.
- **Family Sharing wording, everywhere (gap 9).** The code and the real paywall are correct — Family Sharing is off in
  App Store Connect, a one-way door pending Moshe's decision — but eight spec/legal/store files still promised it as
  live: `terms.md`, `app-privacy-details.md`, `08-screens.html` (both the mockup and the `elements` prose), `12-monetization.html`
  (the SKU table, the tier-order note and the entitlement table), `07-features.html` §7.9, `11-store-legal.html` (the
  App Store guideline answer and the checklist line), `10-edgecases.html` cases 48–49, `14-plan.html`'s M6 checklist, and
  all eight `docs/store/listing.*.json` reviewer-notes blocks. All now say Family Sharing is off for 1.0 and point at
  §12.1 for the open decision.
- **Backup line corrected (gap 16).** `Storage.tsx`'s Android copy and `privacy-policy.md:72` told Android users their
  chats were in the device backup; `allowBackup="false"` proves otherwise. Fixed both strings and the edge-case-43 note
  to say conversations are not restored to a new device — export before switching devices.
- **Vision column matches the catalog (gap 22).** `06-models.html` §6.1 marked Fast and Sharp "vision: כן"; `manifest.json`
  ships `vision: false` on both because the only projector in the catalog (`mmproj-Qwen3.5-0.8B-F16`) fits Instant's
  embedding width alone. Table corrected, note added citing F36 (the attach sheet already disables camera/photo off Instant).
- **§5.10's RTL rule was unexecutable (gap 23).** No Hebrew or Arabic locale ships in 1.0 (`docs/research/launch-languages-2026-09.md`),
  so "checked in Hebrew and Arabic in every PR" cannot be run. Replaced it with what's actually enforced today: pseudo-locale
  on every string/layout PR, manual RTL via the `__DEV__`-only `settings.advanced.rtl` switch on every screen the PR
  touches, and a rule to revert to real-locale testing once Hebrew or Arabic ships.
- **`openiap-google`'s INTERNET reasoning (gap 27, was 25).** The end state — the permission is stripped — is right and
  proven; the spec's stated reason ("the Billing library's manifest has no INTERNET") was wrong about the wrapper we
  actually ship. `11-store-legal.html` now names `openiap-google` and the `tools:node="remove"` strip, and points at the
  disabled CI gate (gap 6) as the thing that actually needs closing.
- **§5.7's two tier labels were backwards (gap 26).** `licence-entitlement.test.ts:123` asserts screenshot blocking and
  the lock-screen quick wipe are never gated, and §7.5 already lists them Free — §5.7 alone said Pro. The spec was the
  error, not the code (per the audit: "fix §5.7 before someone builds a gate that a passing test forbids"). Both rows
  now read Free, with a note citing the test and pointing at §7.9 for the full Free/Pro/Work breakdown.
- **§7.3 row 5 vs §7.9's Work list.** "Table understanding (CSV/XLSX)" was tagged Pro in the §7.3 feature table while
  §7.9's Pro-for-Work summary already names XLSX/DOCX/HTML intake as a Work capability. Moved the row to Work to match.
- **Nine named technologies with no cut-list entry (gap 25).** §5.5/§5.6/§4.5 name `mammoth`, ML Kit Text Recognition,
  desktop Tesseract, the Qwen3/MiniLM embedders, `sqlite-vec`, Apple `SpeechAnalyzer`, Core ML (Parakeet) and Kokoro-82M
  as if built; none is verified in the code today and none is on the "Intentionally not built for 1.0" list below. Added
  an explicit status note at §5.5/§5.6 (and a pointer from §4.5) marking all nine **1.0.1**: verify each against the code
  before 1.0 ships, or soften the architecture text to a generic capability description until it's built.
- **`docs/qa/edge-cases-matrix.md` regenerated (gap 14).** The prior version (6.9/13.9) had 43 of 70 rows blank and 16
  factually wrong, with test-id mappings pointing at unrelated tests and open defect F43 absent entirely. Rebuilt every
  row from the audit's own per-case §10 classification (which reads the same code and QA record this matrix draws on),
  mapped to the matrix's `todo`/`partial`/`done`/`n/a-<platform>` vocabulary. New totals: 11 done · 41 partial · 12 todo ·
  6 n/a. F43, F17 and U11 are now cross-referenced from their rows.
- **1.0.1 backlog and the three Moshe-only decisions, restated in the spec.** Added `docs/spec-src/14-plan.html` §14.8:
  the audit's 18-item 1.0.1 list (gaps 26–43) verbatim with fix sizes, plus the three findings no documentation edit can
  close — **#2** store-console filings (IARC is a hard blocker on the first Play upload), **#3** the verifiable-client
  claim (open-source the repo and wire a real bundle hash, soften the four strings, or accept the claim stays weak), and
  **#24** the trademark filing (clearance is done, nothing is filed) — plus two gaps that are on no cut list and aren't a
  decision either (Gemini Nano on Android, SD-card/SAF storage): each needs a deferring sentence or a build, not silence.
- **`docs/build.py` was broken since 3.9.2026.** `docs/spec` and `docs/demo` were renamed to `spec-src` and `demo-src`
  in the Autark→Inborn rename (commit `077aacf`); the build script's `SPEC` and `demo_src` paths were never updated, so
  every run has exited with `missing docs/spec/00-head.html` ever since — several earlier commit messages claiming
  "rebuilt from docs/build.py" were not actually run. Fixed both paths and pointed `OUT` at `docs/` directly (where the
  tracked `inborn-spec.html`/`inborn-demo.html` actually live, not a `docs/out/` that has never existed); the two
  `*.artifact.html` fragment byproducts are now gitignored. Verified: `python3 docs/build.py` now runs clean and both
  outputs were rebuilt from this round's `spec-src`/`demo-src` changes.
- **Demo desktop column: 760px → 680px.** The audit's own live check: the code's `DESKTOP_MIN`/message-column constant is
  680px and §8.9/§9.3 already say 680 — only `docs/demo-src/inborn-demo.src.html` still said 760 (CSS `max-width` and the
  desktop notes copy). Fixed both; rebuilt into `docs/inborn-demo.html`.

**Not done in this round (docs-only, no code or device access):** the nine named technologies are marked 1.0.1, not
verified against the code — that verification is engineering work for the stream that owns `packages/core`. The three
Moshe-only decisions above are recorded, not resolved. `docs/qa/edge-cases-matrix.md`'s new evidence is transcribed from
the audit's classification, not re-run on hardware; the matrix still needs a real re-run at the next milestone.

## Fixes round 30: the three Moshe-only decisions above, decided, plus the document-tier copy (branch `docs-decisions`) — 22.9.2026

Two of the three decisions this README and `14-plan.html` §14.8 recorded as open are now decided — see "Decided by
Moshe, 22.9.2026 18:05" above — and a fourth decision (document tiers) closed the copy gap it left. Docs-only, no app
code beyond one i18n string and its test; no device, emulator or browser.

- **§14.8's "החלטות למשה" list updated to match.** `docs/spec-src/14-plan.html`: **#3** (verifiable client) now reads
  decided — source-available, repo public under the existing `LICENSE` at release, this stream does not publish it.
  **#24** (trademark) now reads decided — filing waits until after launch. **#2** (store-console filings) is
  unchanged and still marked open, per instruction, pending the report table.
- **§7.3's three self-contradictions the `fixes-r24c` tier matrix listed (`docs/qa/fixes-r24c/tier-matrix.md`) are now
  resolved in the spec table itself, not only in a QA note:** row 1 (one free attachment) now states in the note that
  adding a different file means removing the current one, or Pro for a library, quoting Moshe's own wording for why
  it's one file and not more; the "table understanding" row now shows CSV as Pro (inside the document library) and
  XLSX as Work separately, instead of one Work badge covering a format that is not actually Work-gated; the system
  file picker row is corrected from Pro to Free, matching what `fileIntake`/`limits().filesPerChat` have always done
  — Pro was never enforced there and gating it would make row 1's Free attachment unreachable.
- **The paywall copy for the second-file moment was silent about what to do.** `quick.filePro` (fired from
  `Chat.tsx`'s share-in path and `importFile`, both going through `fileIntake`/`pickIntoLibrary`) said only "Free
  attaches one file per chat" — true, but not what Moshe asked for: it must say to remove the current file to add
  another, or get Pro for a library. Rewritten in `en.json` and all 8 other locales (de/es/fr/ja/ko/pt-BR/zh-Hant),
  `pseudo.json` regenerated from `scripts/pseudo.mjs`. A removal affordance already existed and needed no build: the
  attached-file chip in `Chat.tsx` (`attached-chip-<id>`) calls `docs.detach(id)` on tap. New test, "document paywall
  copy tells the user what to do (QA F85)" in `packages/i18n/test/locales.test.ts`, pins that every real locale's
  string both mentions Pro and is long enough to be doing more than restating the cap.

**Proof:** `docs/qa/docs-decisions/` (test run below); `python3 docs/build.py` rebuilds `docs/inborn-spec.html` clean
from the `07-features.html` and `14-plan.html` edits.

**Not done:** no device, emulator or browser touched this round, so the chip-removal affordance is confirmed by
reading `Chat.tsx`, not by tapping it on a phone.

## Fixes round 31: the legal texts shipped with their placeholders still in them (branch `fixes-r26`) — 22.9.2026

MosheAI's sixth verdict, §3: TestFlight 13 and Play `vc17` both carry raw `{{…}}` in the Privacy and Terms screens,
the privacy policy promises a published open-source core the terms deny, and it names a Secure Enclave the code never
asks for. Docs, a site page and one behaviour. F92–F96.

- **F92 — twelve placeholders on a screen a reviewer opens.** `docs/legal/privacy-policy.md` and `terms.md` are
  imported by `Legal.tsx` and rendered as they are, so every unfilled token went to the device. They are filled:
  `SUPPORT_EMAIL` = support@inbornapp.com, `DOMAIN` = inbornapp.com, `PRIVACY_URL` = https://inbornapp.com/privacy,
  `GOVERNING_LAW` = Israeli law with exclusive jurisdiction in the competent court in Israel, `EFFECTIVE_DATE` =
  22 September 2026, `DEVELOPER_LEGAL_NAME` = Cohen Apps. There is no `POSTAL_ADDRESS`: the line is deleted and
  contact is an email and a phone number, the way the Tanach apps' policies do it. Same values in `app-privacy-details.md`,
  `licenses.md` and `NOTICE.json`; `{{TESTER}}` is gone, because a reviewer's own sandbox account buys the
  non-consumable and no licence-tester account is needed. Both "Status: DRAFT / Not yet published" lines are out of
  the shipped texts. `{{COPYRIGHT}}` stays in `docs/legal/model-licences/mit.txt`: `licenceText()` fills it per model.
- **F93 — three texts, three different answers about the source.** All of them now say what
  `docs/legal/verification.md` allows while the repository is private: the policy's §10 drops the "published
  open-source core so that anyone can verify the claims", terms §1 spells out source-available, the site's support
  page stops promising a public issue tracker and gives the support address, and `proof.html` stops offering claims
  that "can be read in code rather than believed". The licences page no longer calls the core open source under MIT;
  `NOTICE.json` carries the real licence name.
- **F94 — the policy named a key store the app never asks for.** A grep over `apps/mobile/src`,
  `apps/desktop/src-tauri/src` and `packages/core/src` returns nothing for `SecureEnclave`, `kSecAttrTokenID` or
  `StrongBox`. What the code does: `SecureStore` with `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (iOS Keychain, Android
  Keystore) and the OS keychain on desktop. §6 says exactly that, and "hardware-backed keys" is out of §10.
- **F95 — an incognito attachment was copied into the document library.** `library.ts` called `copyIntoLibrary`
  unconditionally, so the file sat in `Documents/documents/` for the session while the policy said incognito is
  "never written to disk", and a crash left it there for good. An incognito import now lands in
  `Paths.cache/incognito/`, `endSession` deletes it as before, and `DocumentLibrary.boot()` sweeps that directory on
  every launch, so a killed session cannot leave one behind. The policy line now says what happens: held for the
  session, never in the library, deleted at the end, swept on the next launch.
- **F96 — the F51 guard watched `en.json` and nothing else.** `apps/mobile/test/legal-texts.test.ts` (38 tests) reads
  the shipped files themselves: every markdown under `docs/legal`, every page under `apps/site/src/pages`, the site
  the generator actually produces (it runs `build()` and scans `dist`), the body `legalBody()` hands the screen, and
  the source trees behind the key claim. `legalBody` moved to its own module so the test can render it without
  pulling React Native in.

**Proof:** `docs/qa/fixes-r26/`. Watched red before green: `F92-F94-red.txt` (18 of 38 failing against the texts on
`main`), `F95-red.txt` (both new incognito assertions failing with the unconditional copy restored).
`F92-web-bundle.txt` greps the built web bundle, the same artefact shape MosheAI grepped inside `main.jsbundle` and
`index.android.bundle`: `{{COPYRIGHT}}` twice and no other token, no `Status: DRAFT`. Gates: typecheck, lint,
**991 tests** (core 616, mobile 353, i18n 11, ui 11), `web:build`, `web:smoke` 6/6 PASS, `apps/site/build.mjs` +
`check.mjs` 7 pages clean.

**Not done:** no device or emulator was touched, so the filled screens are proven by the rendered Markdown and by the
built bundle, not by a screenshot of the phone.

**Also fixed, outside F92–F96:** `proof.html` and `support.html` claimed the operating system delivers models on
"iOS 26 or later", which contradicted the privacy policy's "every supported iOS version (iOS 17 and later)… fetches
that one file over HTTPS from `models.inbornapp.com`" and the App Privacy details' "we do not use Apple-hosted
Background Assets". Both pages now say what the app does: Play delivers on Android, and every supported iOS version
and desktop fetches from our host.

### Decisions for Moshe (round 31)
1. **The legal identity is decided by Moshe, 22.9.2026: do it like the Tanach apps' policies.** Owner and service
   provider is **Cohen Apps**, not a personal name. **No postal address anywhere** — the `{{POSTAL_ADDRESS}}` line
   is deleted, not filled, and no text asks a reader to visit or write to one. Contact is
   support@inbornapp.com or +1-440-847-8502, with the same sentence those documents carry: there is no physical
   reception and no in-person service. Governing law is Israeli law with exclusive jurisdiction in the competent
   court in Israel. Effective date 22 September 2026. A test fails if a postal address returns to any legal text.

## Fixes round 32: the Terms screen named no licensor, no phone and no effective date (branch `fixes-r27`) — 23.9.2026

F97, filed by the `vc18` release pass after reading both legal screens off the OnePlus 6T rather than off the file.

- **F97 — the screen rendered the text and dropped the identity above it.** `legalBody()` returned the file from its
  first `##` heading, so the header block went to nobody: in `terms.md` that block is `Effective date: 22 September
  2026`, `Licensor: Cohen Apps ("we", "us")` and `Contact: support@inbornapp.com or +1-440-847-8502`. The Terms screen
  on the phone had 1,444 words, zero `Cohen Apps` and zero `+1-440-847-8502`, while its own §14 told the reader the
  effective date is "at the top". Privacy escaped only because §12 repeats the same facts below a heading, and it lost
  the effective date too. `legalScreen()` now returns that block as `meta` — the `Label: value` lines above the first
  heading, minus the `Spec basis` edit note the screen already shows its own way and any `Status` draft banner — and
  `Legal.tsx` renders them as a small block under the title, above the text. Parsed from the markdown: `Legal.tsx`
  contains none of the values, and a test fails if it ever does.
- **The guard that was green while this shipped.** F96's assertions read the file, where every value is present; its
  one assertion on the rendered body passed on an incidental `support@inbornapp.com` inside §13. Eight assertions are
  added to `apps/mobile/test/legal-texts.test.ts`, all on what the screen renders (`[...meta, body]`): the licensor,
  the email, the phone and the effective date on **both** screens; that they come from the metadata block and not from
  a section that repeats them; that `Legal.tsx` hardcodes none of them; that the edit note and a draft banner stay out
  of the block; a parser case over a synthetic document; and the empty case, a text with no header block getting no
  empty block.

**Proof:** `docs/qa/fixes-r27/`. Watched red before green: `red.txt` — with `legalBody.ts` stubbed back to main's
rendering, **8 fail and 40 pass**, and the 40 include every file-level assertion F96 added. `green.txt` is 48/48.
`f97-rendered-after.txt` re-takes the counts of `android-vc18/f97-legalbody-proof.txt` against the shipping module:
terms `Cohen Apps` 0→1 rendered, `+1-440-847-8502` 0→1, `Effective date` 0→1. Gates: typecheck, lint, **1,000 tests**
(core 616, mobile 362, i18n 11, ui 11), `web:build`, `web:smoke` 6/6 PASS.

**Not done:** no device or emulator was touched, so the block is proven by the string the screen is handed, not by a
screenshot of the phone. The wording of the legal texts is unchanged — this round moved no sentence, it only stopped
the screen from cutting one.

## Fixes round 33: the store listings still claimed an open-source core and a disk-free incognito (branch `store-copy`) — 23.9.2026

F99, filed by MosheAI's read of the eight submission-ready listings against the legal texts rounds 31 and 32 had just
corrected. The legal texts had stopped making three claims; the store copy was still making all three, in eight
languages, and nothing in the gates could see it.

- **F99 — three false claims and one keyword.** `docs/legal/verification.md` lists "open source", "published core"
  and "reproducible build" as wording that may not be published while the repository is private; `terms.md` §1 says
  outright that Inborn is not open source. Every listing said the opposite (`Open Source`, `código abierto`,
  `オープンソース`, `오픈소스`, `開放原始碼` …), each with a published-per-release hash promise beside it that no
  reproducible build can back. The incognito line was false in its own way: `privacy-policy.md` §6 holds an incognito
  **attachment** in a temporary file for the length of the session, so "never touches disk" overstates it. And
  `deepseek` sat in the Apple keyword field of en, ko and zh-Hant for a model the catalogue does not contain — the
  only `deepseek` in the tree is `deepseek2` in the GGUF architecture allow-list, an import format.
- **What the copy says now.** The source claim is replaced by the sentence `verification.md` says is safe: every check
  in the bullet list above it happens outside the app, with no cooperation from us, and the Proof screen names the
  exact build you are running. Each locale uses the shipped name of that screen (`Nachweis`, `Preuve`, `Prueba`,
  `Prova`, `証明`, `증명`, `證明`), taken from `packages/i18n/locales/*.json`, not invented. The incognito line becomes
  "saves nothing and ends with the session", which is what §6 actually says. 35 lines changed in total and nothing
  else in the eight files moved.
- **The guard that could not see any of it.** `docs/store/scripts/check-store-copy.mjs` measured field lengths and
  keyword hygiene, and no gate ran it. It gains five banned-claim rules — open-source, disk, published-hash, DeepSeek,
  and a second disk rule for Korean and Traditional Chinese — that walk **every** string in a listing rather than a
  field list, so a banned phrase in `promotional_text`, `whats_new`, a screenshot line, the reviewer notes or an A/B
  variant fails too, and each error names the locale, the field and the phrase it matched. `pn test` now runs it as
  `check:store` before any test runner.

**Proof:** `docs/qa/store-copy/`. Watched red before green: `red.txt` — **51 errors** against the eight listings
exactly as they stood on `main` 202db50 (`git show HEAD:docs/store/listing.*.json` fed to the new script), every rule
firing in every language it was written for; then, with one banned phrase put back into the English description,
`pn test` exits 1 at `check:store` and no vitest project is reached. `green.txt` is clean and every field is still
inside its store limit. `copy-diff.txt` is the 35 changed lines, old and new, side by side. Gates: lint, **1,000
tests** (core 616, mobile 362, i18n 11, ui 11).

**Not done:** nothing was pushed to App Store Connect. The repository has no script that writes store metadata —
`scripts/asc-key-env.sh` only stages the signing key for `xcodebuild` and `altool` — and the brief said not to build
one, so the corrected text still has to be copied into the live localizations before submission
(`docs/qa/store-copy/asc-update.txt`). The guard reads the JSON in this repository; it cannot see what is live in the
stores. The Play listing is empty, so there was nothing to correct there.

## Fixes round 40: the model was a label, not a choice (branch `model-switch`) — 23.9.2026

Moshe, 23.9.2026: *"How do I change model? Is there a choice of other models? I did not find how to switch models, and
how do you recommend models: by language and by the action I ask for, no? Apart from Instant I saw no other models."*
And, separately: *"Why does Hebrew come out as gibberish 'on purpose'? Do not deal with Hebrew specifically; if a user
wants Hebrew let him, we don't push it but we don't block it."* Both answers were already in the tree and neither was
where he was standing. F150–F154.

- **F150 — the chip named the model and led nowhere.** The chat header's `model-chip` showed `INSTANT` and the
  `model-picker` shortcut was bound to it, but both opened Chat settings, where the model is a `<View>` chip that is
  not a control: name, persona, system prompt, thinking switch, no door. The recommendation engine from round 11
  (`recommend.ts`, use × language × device) and the §6.1 fit map were shipped and correct — and only `/vault` read
  them, three taps away behind the drawer. A user who never opened the vault met one model for the life of the app,
  which is exactly what he reported. The chip now opens a **Model sheet** (§8.4 S30b): the recommendation line, then
  `On this device` (installed, ranked, the loaded one marked `In use`, the rest one tap to switch), `Fits your phone`
  (downloadable, each row carrying what the model is good at, the language tier for *this* chat, the size, and a
  Download that expands the §5.1 confirmation with the Wi-Fi-only switch inside the sheet), then `Too big for N GB`
  greyed with the reason. Chat settings and the full vault sit in its footer, so nothing that was reachable stopped
  being reachable.
- **One ranking, extended, never a second one.** The sheet's sections come from a new pure `modelChoices`, built on the
  existing `rankModels`; the recommendation line reuses the vault's own three strings (`models.recommended`,
  `models.recommendedFor`, `models.recommendedNone`), so the chip and the vault cannot disagree about what is best
  here. The language it ranks for is the chat's detected language, falling back to the app's own in an empty chat.
- **F151 — the weak-language line was a complaint with no handle.** `INSTANT is weak in Hebrew` named no alternative
  and had nothing to tap; the card that does name one fires only when the model is weak on the language *and* on the
  task, and snoozes per chat after one showing. It now reads `INSTANT is weak in Hebrew. SHARP handles it better.`
  with `Switch to SHARP`, or the sheet opened on that model's download. Its new helper, `betterForLanguage`, weighs
  the language alone — a language the model cannot write is reason enough — and lets the task break the tie between
  the models that fix it.
- **F154 — Hebrew is not degraded anywhere, and now there is a test that would notice.** The sweep found no path that
  blocks, rewrites, transliterates or shortens a turn by language: `languageHint` adds one line to the system prompt,
  the token estimate is a budget figure, and the family-safe list carries Hebrew at the same level as the other eight
  languages and only as explicit phrases. `chat-hebrew-unchanged.test.ts` replays the chat's real send path on a
  Hebrew turn and asserts the user's text arrives code point for code point, that the system prompt differs from the
  English one by the hint block and nothing else, and — the complement, so the guard cannot pass by being empty —
  that the one explicit Hebrew phrase the safety list ships still fires. What is left is the models: Instant and Fast
  rate Hebrew `none`, Sharp and Phi `basic`. The sheet now says so on every row instead of leaving the user to guess.
- **F152 — found by that test, not by a report.** An explicit length asked in Hebrew was silently ignored while the
  same ask in English was honoured: `detectExplicitLength` reads number-then-unit, and Hebrew writes the small numbers
  after the unit and spells them (`ענה במשפט אחד` is "answer in sentence one"). A Hebrew table beside the existing
  ones reads both orders; `ענה במשפט אחד` now plans the same answer as `answer in one sentence`.
- **F153 — the browser tier recommended a model it can never load.** Caught in the browser before the push:
  `RECOMMENDED ON THIS BROWSER · CHAT IN ENGLISH` with the tag on `SHARP`, under a paragraph saying Sharp lives in the
  app. `modelChoices` now takes `recommendAmong`, the ids a tier can actually load; the browser and desktop shells
  pass their own, head the second section `In the app`, and leave its rows without actions.

**Proof:** `docs/qa/model-switch/before/` and `after/`, taken by `shots.mjs` against the real web export at 390 and
1440 — the dead Chat settings chip he met, the sheet that replaced it, the sheet after a Hebrew turn with `Hebrew · No`
and `Hebrew · Basic` on the rows, and the footer reached by scrolling. Tests: core 638, mobile 383, i18n 11, ui 11,
plus `check:store`; 43 of them new (core +22, mobile +21). The F150 wiring assertion was watched red by putting `setSettingsOpen` back on the
chip. Spec §7.8 and §8.4 (S30b) updated and rebuilt; five new keys in all eight locales plus pseudo.

**Not done:** the switch and download buttons themselves are exercised only by unit tests and source assertions. They
exist on iOS and Android alone — the browser and desktop shells hold one model by design (§14.3) — and this stream was
assigned no phone, so no screenshot shows a real one-tap switch or a download started from the sheet.
