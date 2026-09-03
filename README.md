# Autark

Private, offline, on-device AI chat. One codebase: iOS + Android + web (Expo) and Windows + macOS (Tauri v2).
Spec and demo: `docs/autark-spec.html`, `docs/autark-demo.html` (Hebrew, RTL).

## Layout
- `apps/mobile` — Expo app (iOS, Android, web). `App.tsx` boots i18n and a single Chat screen streaming from the engine.
- `apps/desktop` — Tauri v2 shell (stub until Rust ≥ 1.77 is installed; see its README).
- `packages/core` — pure TypeScript, no network: the `LocalLM` interface (spec §5.2), `NullLM` for tests/dev, catalog types.
- `packages/i18n` — i18next + ICU; `locales/en.json` is the single source. Adding a language = one JSON file.
- `packages/ui` — FARADAY tokens (dark + light, default follows the device) and a Tailwind/NativeWind preset.
- `scripts/check-android-permissions.sh` — release gate: fails if the Android build declares INTERNET.

## Run
```
corepack pnpm install
corepack pnpm typecheck && corepack pnpm test && corepack pnpm lint
cd apps/mobile && APP_VARIANT=development npx expo start      # dev needs INTERNET for Metro; release blocks it
npx expo export -p web                                        # web build (also what the desktop shell loads)
```

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
Real inference on device (llama.rn adapter is wired but untested on hardware), Apple FM adapter, SQLCipher schema,
model catalog + downloads, RAG, voice, personas, purchases, NativeWind styling (tokens exist), expo-router navigation.

## Package ids
`app.autark.mobile` (iOS + Android) and `app.autark.desktop` are placeholders until confirmed.
