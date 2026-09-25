# Round 99: web layout at 390 and a live Auto theme (F392–F394)

Source: the web full pass, items W2, W8 and W1. Every run is headless Chromium against the deployable build
(`apps/web/dist`), 390 × 844, with a model in OPFS.

| F | Before | After |
|---|---|---|
| F392 (W2) | Pseudo: every one of the 7 smoke screens is 489 px wide in a 390 px window (`before-result.json`, `before-pseudo-settings-390.png`). | 390 px on all 7 (`after-pseudo-*-390.png`). The strip's Details and Get the app wrap under the notice as one group. The Documents empty hint breaks a token longer than the line. |
| F393 (W8) | Pseudo: the footer wraps and PRO sits on a second line (`before-chats-pseudo-390.png`). | One footer row in 8 locales + pseudo, PRO right after Folders (`after-chats-{en,de,fr,ja,pseudo}-390.png`). The three labels ellipsize (never under 44 px) and the model chip and PRO keep their size. |
| F394 (W1) | 12:00, OS dark on load, then OS light live: the page stays dark (`before-theme-12h-2-os-light-live.png`). | Live OS light gives light and OS dark returns to dark (`after-theme-12h-*.png`). At 20:00 a light OS stays dark by the clock rule (`after-theme-20h-2-os-light-live.png`). |

- `red-system-scheme.txt`: the new unit test against the old `theme.ts` (1 of 3 fails). `green-system-scheme.txt`: 3 of 3.
- `drive-r99-check.mjs` is the red/green driver (`REPO`, `PLAYWRIGHT_CORE_DIR`, `CHROMIUM_PATH`, `PROFILE`, `OUT`,
  `TAG`, `PORT_FIXED`). `before-result.json` has 10 failures and `after-result.json` has none.
- The same checks now run in `pn web:smoke`: the pseudo sweep of all 7 screens at 390, the PRO row in 9 locales and
  the theme pass at 12:00 and 20:00 driven by `emulateMedia`.
