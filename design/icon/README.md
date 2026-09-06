# Inborn app icon

Spec §9.8 (approved 3.9.2026): a closed seal ring on graphite with one filament highlight at 2 o'clock. Same object as the in-app `Seal` and the spec header mark.

- `inborn-icon.svg` is the only file to edit. Three layers by id: `base` (graphite gradient), `glow` (filament), `ring` (sealed green + amber highlight).
- `node design/icon/build.mjs` regenerates everything else (mobile, PWA, desktop, store artwork, the Icon Composer bundle and `preview.html`). Never hand-export a PNG.
- `Inborn.icon/` is the Apple Icon Composer bundle (`icon.json` + `Assets/`). `app.config.ts` points `ios.icon` at it; Expo copies it into the Xcode project and sets `ASSETCATALOG_COMPILER_APPICON_NAME`.

## What Xcode 26 needs

- Xcode 26+ on the build machine (also on EAS). Xcode compiles the `.icon` bundle into the Liquid Glass icon and derives the iOS 18 light, dark and tinted fallbacks itself; no `AppIcon.appiconset` PNGs are needed.
- Layers are 1024 pt SVGs. The ring is a glass layer (specular on, neutral shadow 50 %, translucency 35 %); the glow is a plain additive layer hidden in tinted mode; the graphite is the canvas fill so Clear and Tinted modes can replace it.
- To inspect or tweak: open `Inborn.icon` in Icon Composer (ships with Xcode 26). `ictool` (inside Icon Composer.app) renders the six renditions for `preview.html` when the build runs on a Mac with Xcode 26; elsewhere the preview shows the flat fallbacks.
- macOS: Tauri cannot consume `.icon`; `icon.icns` is built from the squircle-masked flat icon (10 % margin) and macOS 26 re-masks it. If the Mac app ever moves to an Xcode target, reuse the same bundle (`supported-platforms.squares = shared`).

## Store follow-ups (not done here)

- App Store Connect takes the icon from the build; `store-1024.png` (no alpha) is the marketing copy.
- Play Console: upload `play-512.png` as the app icon.
