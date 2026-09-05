# Inborn desktop (Tauri v2)

Windows and macOS ship together from the same web build of `apps/mobile` (`expo export -p web`), wrapped in a
Tauri v2 window with a native llama.cpp engine in Rust. Decision D9: Windows through the Microsoft Store, macOS as a
notarized DMG from the site; same code.

## What exists (phase 3, spec §14.4 / §4.5 / §5.1 / §5.3 / §8.9)
- **Engine** `src-tauri/src/engine.rs`: `llama-cpp-2` in-process (Metal on macOS; `--features vulkan` / `cuda` on
  Windows; CPU otherwise). One worker thread owns the model + context; commands `lm_load`, `lm_generate` (streams
  `Delta`s over a `tauri::ipc::Channel`), `lm_abort`, `lm_stats`, `lm_unload` implement the `LocalLM` contract.
  The GGUF's own Jinja chat template is rendered with minijinja (`enable_thinking` honoured, so Qwen thinking stays
  off for Instant); llama.cpp's built-in renderer is the fallback. `<think>` blocks stream as `reasoning`.
- **Adapter** `apps/mobile/src/adapters/tauri.ts` (`TauriLM`, id `tauri`), chosen in `adapters/index.ts` when
  `window.__TAURI__` exists and the vault has a GGUF; `prepare.web.ts` lists the vault instead of HEAD-probing.
- **Chats at rest** `src-tauri/src/store.rs`: SQLCipher (rusqlite `bundled-sqlcipher`, CommonCrypto on Apple,
  vendored OpenSSL on Windows). The 256-bit key is generated once and kept in the OS keychain (`keyring`:
  macOS Keychain service `com.inbornapp.desktop`, Windows Credential Manager). `TauriChatRepository` runs the same
  SQL as the phones (`storage/schema.ts`) through `db_run` / `db_all` / `db_batch` (one transaction); the webview
  never sees the key or the path. Incognito rows are refused; `storage/persistent.ts` picks it inside the shell.
- **Model vault** `src-tauri/src/models.rs`: `app_data_dir()/models/<id>.gguf` (macOS
  `~/Library/Application Support/com.inbornapp.desktop/models/`, Windows `%APPDATA%\com.inbornapp.desktop\models\`).
  Import via *File › Import GGUF Model…* (native dialog) or by dropping a `.gguf` on the window; magic-bytes check,
  free-space check (file size + 512 MB margin), copy-then-rename. Other dropped files surface as
  `inborn:documents-dropped` for the documents milestone. Nothing downloads.
- **Shell** `src-tauri/src/shell.rs`: app menu with accelerators (⌘N new chat, ⇧⌘N new incognito, ⇧⌘I toggle
  incognito, ⌘L focus composer, ⌘F search, ⌘. stop, ⇧⌘O import) delivered to the page as `inborn:shortcut`
  events (`onDesktopShortcut()` in `tauri.ts`; focus-composer is handled there, the others wait for the screens);
  Edit menu so copy/paste work in the webview; tray icon with the seal state (`SEALED · 0 B out`), engine backend,
  Open / New chat / *Quit (unloads model)*; window position/size persisted by `tauri-plugin-window-state`.
  Native strings come from `packages/i18n/locales/en.json` (`desktop.*` keys, `include_str!` at build time).
- **Updater** `src-tauri/src/updater.rs`: `tauri-plugin-updater`, endpoint
  `https://updates.inbornapp.com/desktop/{{target}}/{{arch}}/{{current_version}}` (placeholder host), minisign
  public key in `tauri.conf.json`. The check runs only from *File › Check for Updates…* (never at startup), flips the
  seal to `UNSEALED · checking updates.inbornapp.com` for its duration, and installs only after a second explicit
  call. The private key lives in the macOS Keychain (`security find-generic-password -s inborn-tauri-updater`); see
  `scripts/updater-key-env.sh`. Unsigned builds skip updater artefacts (`createUpdaterArtifacts` is enabled only by
  `tauri.release.conf.json`).
- **No network for the page**: CSP `default-src 'self'; connect-src ipc: http://ipc.localhost; …` — `ipc:` and
  `http://ipc.localhost` are Tauri's in-process IPC schemes, not sockets. `scripts/check-csp.mjs` fails CI if any host,
  wildcard, or the updater host ever appears in the webview CSP. The only process that can open a socket is the Rust
  updater, on the user's click.
- **Signing**: `bundle.macOS.signingIdentity: "-"` (ad-hoc) with `hardenedRuntime: true` and an empty
  `entitlements.plist`, so local builds already carry the hardened-runtime flag (`codesign -d --verbose=2` →
  `flags=0x10002(adhoc,runtime)`). Developer ID + notarization happen only in `scripts/release-macos.sh` / CI from
  environment variables; no identity is ever on a dev machine.

## Build and run
```
corepack pnpm install
corepack pnpm desktop:build:app                      # expo export -p web, then tauri build --bundles app (macOS .app)
corepack pnpm desktop:build                          # + dmg (macOS) / nsis (Windows)
corepack pnpm desktop:check                          # CSP gate + Rust unit tests
open apps/desktop/src-tauri/target/release/bundle/macos/Inborn.app
```
Needs Rust ≥ 1.77 and `cmake` (llama.cpp): on this Mac there is none on PATH, the Android SDK's works:
`export CMAKE=$HOME/Library/Android/sdk/cmake/3.22.1/bin/cmake` (or `brew install cmake`). Windows needs the MSVC
toolchain, WebView2, and for `--features vulkan` the LunarG Vulkan SDK (`VULKAN_SDK` set; ships `glslc`).
Dev loop: `corepack pnpm desktop:dev` (Metro on :8081, `APP_VARIANT=development`).

Put a model in the vault by hand for a dev run (same as the phones): copy or hard-link a GGUF to
`~/Library/Application Support/com.inbornapp.desktop/models/instant.gguf`; `instant` is picked first, otherwise the
first `.gguf` in the folder. Without one the page shows the in-memory engine.

Headless measurement: build the web export with `EXPO_PUBLIC_AUTOPROMPT=1` (the Chat screen sends one prompt by
itself), run `Inborn.app/Contents/MacOS/inborn-desktop` from a terminal, and read
`~/Library/Application Support/com.inbornapp.desktop/dev-run.json` (`dev_write_result`); the Rust log on stderr
carries `[inborn] +<ms since launch> …` lines.

## Proven on this Mac (6.9.2026, Apple Silicon, Metal, Qwen3.5-0.8B Q4_K_M, n_ctx 4096, thinking off)
Measured 6.9.2026 on this Mac (Apple Silicon, Metal, Qwen3.5-0.8B Q4_K_M 497 MB, thinking off, n_ctx 4096, 6 threads),
release `Inborn.app`, auto-prompt "Explain in about 150 words why the sky is blue.", `EXPO_PUBLIC_AUTOPROMPT=1`:

| run | backend ready | model load | TTFT | generation | prompt eval |
|---|---|---|---|---|---|
| first launch after install (Metal library compiled from the embedded source) | ~10 s | 537 ms | 614 ms | 188 tokens (rate not captured: perf counters were off in that build) | — |
| warm relaunch | 54 ms | 484 ms (JS sees 488 ms) | **48 ms** | **156.5 tok/s** (170 tokens) | 600 tok/s (27 tokens) |

Sockets: `lsof -a -p <pid> -i` polled every 0.5 s from launch through generation: **0 hits**; the process holds one unix
socket (WebKit XPC). `inborn.db` starts with random bytes, not `SQLite format 3` (SQLCipher); key item
`com.inbornapp.desktop / chat-db-key` in the login Keychain. Screenshot: the header reads `tauri · 156.5 tok/s · TTFT 48 ms`.
RSS after the run ≈125 MB plus the mmap'd model.

Ad-hoc dev builds and the Keychain: each rebuild has a new code hash, so macOS asks for the login password before
the *next* build may read the key the previous one created (`Inborn wants to use your confidential information…`).
Allow it with "Always Allow", or reset the dev state: `security delete-generic-password -s com.inbornapp.desktop -a
chat-db-key` and delete `inborn.db*` (dev chats are gone). Developer ID builds keep a stable designated requirement
and never prompt.

## Packaging and distribution
- **macOS**: `scripts/release-macos.sh` — Developer ID Application signature with hardened runtime, notarytool
  submission + stapling (tauri-bundler does both when `APPLE_ID`/`APPLE_PASSWORD`/`APPLE_TEAM_ID` are set), DMG, and
  the `.app.tar.gz` + `.sig` for the updater. `scripts/verify-macos.sh <app> --notarized` checks the runtime flag,
  empty entitlements, the stapled ticket and Gatekeeper. Ad-hoc dev builds pass the same script without the flag.
- **Windows**: NSIS installer (`currentUser` install mode, per Store guidance for EXE listings). Authenticode via
  Azure Trusted Signing later (`bundle.windows.signCommand`).
- **Microsoft Store** (decision D9): list as a *Win32 app (EXE installer)* in Partner Center — the NSIS `.exe` with
  silent switch `/S`, hosted at a stable HTTPS URL, install-size and `currentUser` mode declared; the Store handles
  updates for that channel, so the Store build ships **without** the updater (`plugins.updater` removed via a
  `--config` overlay) to avoid double update paths. MSIX is the alternative once tauri's bundler ships an `msix`
  target (or via `MSIX Packaging Tool` over the NSIS output); it becomes required only for Store features we do not
  use (app-execution alias, restricted capabilities). Partner Center: one-time ≈$19 (Moshe's call, spec §14.6).
- **CI** `.github/workflows/desktop.yml`: `gate` (typecheck, lint, tests, CSP), then a matrix `macos-14` (arm64,
  Metal; `app,dmg`) + `windows-latest` (x64, `--features vulkan`, NSIS) + `windows-latest` CPU-only fallback, with the
  Rust cache, the LunarG SDK and a SPIRV-Headers install (ggml does `find_package(SPIRV-Headers CONFIG)`, which the
  Windows SDK installer does not provide; it is exposed through `CMAKE_PREFIX_PATH`);
  unsigned artefacts on PRs/`main`, signed + notarized + updater-signed on `v*` tags from repository secrets
  (`APPLE_*`, `TAURI_SIGNING_PRIVATE_KEY`). `workflow_dispatch` with `cuda: true` adds a Windows CUDA build
  (CUDA 12.6 toolkit). Not run yet (no push from this stream); YAML and paths validated locally.

## Not done in this phase
Sidebar/command-palette layout (§8.9 is UI work), GPU auto-detect between Vulkan/CUDA at runtime (one binary per
backend for now), Mac App Store sandbox build, Pro licensing, documents/RAG (drop events are surfaced only), the
screens' handling of `new-chat` / `toggle-incognito` shortcuts (events are delivered; the shell stream wires them).
