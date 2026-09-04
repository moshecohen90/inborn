# Inborn desktop (Tauri v2)

Windows and macOS ship together from the same web build of `apps/mobile` (`expo export -p web`), wrapped in a
Tauri v2 window. Decision D9: Windows through the Microsoft Store, macOS as a notarized DMG from the site — same code.

## What exists today
- `src-tauri/` — the Tauri v2 shell: `tauri.conf.json` (identifier `com.inbornapp.desktop`, window 1120×720 titled
  "Inborn"), a Rust binary that only opens the window, icons generated from `apps/mobile/assets/icon.png`
  (`pnpm tauri icon ../mobile/assets/icon.png`).
- `build.frontendDist = ../../mobile/dist` (paths in `tauri.conf.json` are relative to `src-tauri/`);
  `beforeBuildCommand` runs the Expo web export, so `pnpm desktop:build` from the repo root is the whole pipeline.
  The export's absolute `/_expo/...` asset paths resolve unchanged because Tauri serves the bundle from the root of
  its own origin (`tauri://localhost` on macOS, `http://tauri.localhost` on Windows) — no `baseUrl` change needed.
- No network: CSP `default-src 'self'; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' data:` (the string in `tauri.conf.json`) — the page cannot fetch, open sockets or load anything
  outside the bundle (`lsof -i -p <pid>` on the running app lists no sockets).
  `dangerousDisableAssetCspModification: ["style-src"]` stops Tauri from adding a nonce to the inline `<style>` of
  `index.html`: a nonce in `style-src` makes browsers ignore `'unsafe-inline'`, so react-native-web's runtime
  `<style>` sheet gets blocked and the whole layout collapses into the top-left corner. `script-src` keeps Tauri's
  hashes. The frontend does not use `@tauri-apps/api` yet; when the engine lands, `connect-src` needs
  `ipc: http://ipc.localhost` for Tauri's fetch-based IPC (without it Tauri falls back to `postMessage`).
  No updater, no plugins, no analytics, `withGlobalTauri` off.
- Engine: `NullLM` (the in-memory engine from `@inborn/core`), exactly as on web. The Rust engine is M-desktop work.

## Build and run
```
corepack pnpm install
corepack pnpm desktop:build                          # expo export -p web, then tauri build (app + dmg on macOS)
corepack pnpm --filter @inborn/desktop build:app     # .app bundle only — the local verification path
open apps/desktop/src-tauri/target/release/bundle/macos/Inborn.app
```
Dev loop: `corepack pnpm desktop:dev` starts Metro on :8081 (`APP_VARIANT=development`) and opens the window on
`devUrl`. Needs Rust ≥ 1.77.2 (`rustup update stable`) and Xcode command-line tools on macOS; on Windows the MSVC
toolchain and the WebView2 runtime (part of Windows 11).

Unsigned on purpose: `bundle.macOS.signingIdentity` is `null`; the linker's ad-hoc signature is enough to run a local
build. Developer ID signing and notarization belong to the release pipeline, never to a dev machine.

## Plan for M-desktop (spec §4.5, §14.4)

### 1. Engine: `llama-cpp-2` crate vs `llama-server` sidecar
| | `llama-cpp-2` in-process | `llama-server` sidecar |
|---|---|---|
| Wiring | Rust crate (Apache-2.0) bound to llama.cpp; `LocalLM` = Tauri commands + `ipc::Channel` token stream | Tauri shell sidecar, HTTP on `127.0.0.1` |
| Binary | one executable, no child process, no ports | +10–30 MB per backend, a child process to supervise |
| GPU | compile-time features `metal` / `vulkan` / `cuda` | pick a prebuilt server per backend at runtime |
| Store / sandbox | fits MSIX and the Mac App Store sandbox | loopback HTTP + child process widen Store review, and CSP must open `connect-src` to `http://127.0.0.1` |
| Crash isolation | a llama.cpp crash takes the app down | stays in the child; the app restarts it |
| Decision | **default** — keeps the no-network posture and `connect-src 'none'`, same shape as llama.rn on phones | fallback only if CUDA on Windows proves too heavy to link into one binary |

Streaming: `generate(session, messages, opts, on_token: Channel<Delta>)`, abort through a per-session cancellation
token, `stats()` returning tok/s and time-to-first-token like the mobile adapter. TypeScript side: a
`devModel.web.ts`-style adapter that picks the Tauri engine when `window.__TAURI_INTERNALS__` exists, else
`NullLM` / wllama.

### 2. GPU backends
- macOS: Metal (`llama-cpp-2` feature `metal`), Apple Silicon only; Apple Foundation Models later as a P4 Swift sidecar.
- Windows: Vulkan as the universal path (AMD, Intel, NVIDIA, Windows-on-ARM), CUDA as an optional second build for
  NVIDIA; detect the adapter at startup and choose the backend, AVX2 CPU fallback. Chrome-on-ARM WebGPU gaps do not
  matter here because inference is native.

### 3. Models on disk
`app_data_dir()/models/` — macOS `~/Library/Application Support/com.inbornapp.desktop/models/`, Windows
`%APPDATA%\com.inbornapp.desktop\models\`. Same GGUF catalog and sha256 manifest as mobile. Files arrive through
the catalog downloader (Cloudflare R2, spec §4.5) or "Import GGUF…" (file dialog / drag-and-drop). Downloading is
the only network use, runs in Rust behind an explicit user action; the webview keeps `connect-src 'none'`.

### 4. Packaging and distribution
- Windows: MSIX for the Microsoft Store (tauri-windows-bundle, or the bundler's `msix` target once it lands;
  otherwise the NSIS `.exe` as a Store EXE listing); Azure Trusted Signing (≈$10/month) for the direct download.
  Partner Center account ≈$19 one-time (spec §14.6, Moshe's call).
- macOS: `dmg` target, Developer ID + notarization (`APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_TEAM_ID` from the CI
  keychain), hardened runtime; Mac App Store later (sandbox + Store receipt for Pro).
- Updater only once signing exists (the Tauri updater requires a signed manifest); Store builds update through the Store.
- CI: `tauri-action` matrix (macos-14 arm64, windows x64 + arm64), unsigned artifacts on PRs, signed on tags.

### 5. Order of work
1. Engine crate behind `LocalLM` (Metal first, measured on this Mac), TypeScript adapter switch.
2. File and SQLite adapters (Tauri fs + SQLCipher through Rust), "Import GGUF…".
3. Vulkan / CUDA Windows builds and GPU detection.
4. Signing, notarization, DMG; MSIX + Partner Center listing.
5. Tray with the seal state, keyboard shortcuts, drag-and-drop, updater.
