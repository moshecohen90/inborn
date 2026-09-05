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
- macOS: Tauri shell with the native Metal engine (156.5 tok/s, TTFT 48 ms warm), SQLCipher chats, zero sockets.
- Chats persist in SQLCipher; incognito never touches disk; 21 unit tests.
Still open: real Play Console delivery (fast-follow + on-demand from the store) and a Play Billing test purchase; Apple-hosted asset packs;
Pixel 8 / Galaxy S23 / iPhone 15 Pro measurements (devices not bought yet); Windows build on CI (workflow written, not yet run); 16 KB-page emulator.

## Intentionally not built yet
Apple FM adapter, model catalog + downloads, RAG, voice, personas, purchases, NativeWind styling (tokens exist), expo-router navigation.

## Package ids
`com.inbornapp.mobile` (iOS + Android) and `com.inbornapp.desktop`, confirmed by Moshe on 3.9.2026.

## Legal, compliance, QA and launch docs (legal-docs stream)
Docs only, no app code. Everything the spec promises "lives in the repo" for §10–§11, §13.5, §14.7, §15:
- `docs/legal/` — `privacy-policy.md` (store + website text, per-platform network list), `terms.md` (EULA, one-time Pro/Work, Family Sharing, refunds via stores, AI disclaimer), `ai-act-notes.md` (Art. 50 duties; Inborn launches after 2.8.2026 so the 2.12.2026 grace does not apply), `licenses.md` + `NOTICE.json` (every model/native/JS component with licence, attribution, obligations; nothing conflicts with a closed Pro app), `app-privacy-details.md` (Apple "Data Not Collected" reasoning, `PrivacyInfo.xcprivacy` content from the manifests actually in node_modules, Play Data safety, AI-content policy, age-rating answers, review notes).
- `docs/qa/` — `release-checklist.md` (the 40 tests T01–T40 with commands, pass criteria and which of our devices can run each) and `edge-cases-matrix.md` (all 70 §10 cases → test ids; status column for the lead).
- `docs/ops/` — `metrics-without-sdk.md` (sources, gates A/B/C, weekly routine, template), `trademark-watch.md` + `com.inbornapp.tm-watch.plist` (monthly `scripts/tm-watch.sh`, not installed; inborn.app expiry 25.10.2026; EU/US/UK filing costs), `developer-account.md` (neutral developer name, App Transfer at gate C).
- `docs/launch/launch-plan.md` — Product Hunt / Show HN / Reddit / creator / promo-code / ASA+UAC drafts. Nothing sent.
Verified: `plutil -lint` on the plist, `NOTICE.json` parses; licence inventory from `pnpm licenses list --json` (534 packages, 447 MIT). `scripts/tm-watch.sh Inborn` run 6.9.2026: 264 TMview results, 0 identical live marks in classes 9/42 at EM/US/GB/WO (exit 0).
