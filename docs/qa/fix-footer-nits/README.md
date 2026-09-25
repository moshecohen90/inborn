# Round 100: the Chats footer fits the sidebar, Esc from the first frame, the lock seal by keyboard, export confirms (F395–F398)

Source: web full pass 2 (W8 regression, W-KB-ESC-EARLY, F3 lock shots, G16). Every run is headless Chromium against
the deployable build (`apps/web/dist`) with a model in OPFS. `drive-r100-check.mjs` is the red/green driver
(`REPO`, `PLAYWRIGHT_CORE_DIR`, `CHROMIUM_PATH`, `PROFILE`, `OUT`, `TAG`, `PORT_FIXED`, `WIDTHS`, `ONLY`).
`before-result.json` (origin/main 7bbcc14) has 52 failures. `after-result.json` has none.

| F | Before | After |
|---|---|---|
| F395 | At 768–1920 PRO ends at 294 px, past the 280 px sidebar, and Personas / Memory / Folders read "Pe… Me… Fol…" in every locale (`before-footer-en-1440.png`, `before-footer-de-768.png`). Pseudo ellipsizes at 390 too. PRO is its own Tab stop in all 45 cases. | Icon buttons with the name as accessible label and browser tooltip. PRO is a badge inside the Folders button, so it is not a Tab stop. The duplicate model chip is gone because the drawer meter right below names the model. Fits 9 locales × 390/768/1180/1440/1920 (`after-footer-*.png`). |
| F396 | Esc did nothing at 0, 50 and 150 ms after the message-actions sheet showed (11 of 12 trials). | 0 of 12 stuck. Both sheet primitives take Esc from their first frame. |
| F397 | The seal was a Tab stop named "Delete everything" that Enter and Space ignored (`before-lock-Enter.png`). | Enter and Space open the same two-step Delete everything sheet as the 1.2 s hold (`after-lock-Enter.png`, `after-lock-hold.png`). A plain click still does nothing. Native screen readers get an activate action. Nothing is deleted without the confirm. |
| F398 | The sheet already closed when the download started. G16's open sheet came from its driver clicking a missing `export-md` id. What was missing was any confirmation (`before-export-markdown-1440.png`). | "Downloaded <file>" shows for 4 s after a browser download, in 8 locales + pseudo (`after-export-markdown-{1440,390}.png`). Native share sheets are their own confirmation. |

`pn web:smoke` now checks the footer at 390, 768 and 1180 in 9 locales: every button inside the footer box and
uncovered, PRO inside Folders and visible to its last pixel, one row, no ellipsis, and exactly three Tab stops.
