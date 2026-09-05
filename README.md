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

## The no-INTERNET rule (decision D3)
`apps/mobile/app.config.ts` blocks `android.permission.INTERNET` unless `APP_VARIANT=development`.
Every release APK/AAB must pass `scripts/check-android-permissions.sh <file>` (aapt2). Models arrive through
Play Asset Delivery (Instant as fast-follow, larger tiers on-demand); purchases through Play Billing.

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
