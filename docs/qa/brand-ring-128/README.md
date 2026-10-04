# Round 128 · the ring in the app is the app icon

Moshe 4.10.2026: the onboarding ring did not match the icon's shape or colour; the closing motion stays. Evidence from the web export at 390 × 844 @3× (`shots.mjs`; iOS dev build not rebuilt), `before-*` = main 33a5c374, `after-*` = this branch. `*-mark.png` are clips around the seal, `icon-vs-ring.png` the sheet.

## Measured on the icon (`design/icon/inborn-icon.svg`, 1024 box; the PNGs were sampled and agree)

- Ring: mid radius 294, stroke 92 → stroke = 0.135 of the outer diameter (680); green `#3ECF8E` (62,207,142).
- Clasp: arc 316° → 344° (28° body, centred on 2 o'clock), stroke 92 with round caps, amber `#F0B35B` (240,179,91). With caps it spans 307°–353°.
- Highlight: the same arc, stroke 30 (0.33 of the ring stroke), round caps, `#FFD9A3` (255,217,163), centred on the mid radius.
- Glow: radial disc centred on the clasp (766.6, 365), r 280 (0.95 of the mid radius), amber at 0.28 → 0.10 at 45 % → 0; on the raster it lifts the graphite next to the ring by about (+49, +37, +18).
- Background: graphite gradient `#1B2129` → `#0D1115`; the splash, favicons and store rasters are all sliced from this master by `design/icon/build.mjs`.

## What the Seal component now uses (`packages/ui/src/sealMark.ts`, read back by `sealMark.test.ts`)

- stroke = 92/680 of `size`, rounded to half a pixel: 72 px → 9.5, 28 px → 4, 20 px → 2.5, 96 px → 13. Measured on the shots: 0.130 at 72 px (28/216 device px), 0.143 at 28 px.
- clasp 316°–344° in `#F0B35B` with round caps; highlight 30/92 of the stroke in `#FFD9A3`, drawn when it is at least 2 device pixels (3.9 px in the 28 px header on a 3× phone; a 1× desktop browser gets the plain amber arc).
- glow disc r = 0.952 × mid radius with the master's stops, behind the ring, canvas bleeds past the box so it is not clipped; measured next to the clasp on the dark shot (+45, +32, +15).
- ring colour `theme.sealed` (`#3ECF8E` dark, `#0B7A4C` light, as the site's header mark); clasp, highlight and glow are the icon's own colours in both themes.
- open: the same thick green ring with a 20 % opening centred on 2 o'clock; sealing: the spring closes it clockwise, then the clasp and glow set under the green bloom (haptic and reduced-motion paths unchanged); generating breathes; unsealed/lan keep their colours and the thick stroke, no clasp.

Gates on the branch: `pnpm typecheck` 0, `pnpm lint` 0, `pnpm test` 0 (ui 23, i18n 24, core 1262, mobile 1282). Sabotaging the master's clasp angle turned `sealMark.test.ts` red before it was restored.
