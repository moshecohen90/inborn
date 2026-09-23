# Round 42 evidence · the legal texts come from the site (branch `legal-from-site`, 23.9.2026)

| File | What it shows |
|---|---|
| `app-legal-accessibility-390.png` / `-1440.png` | The new Accessibility screen in the app: `OFFLINE COPY · EFFECTIVE 23 September 2026`, the primary "Read the current version at inbornapp.com/accessibility" button, the note that the website version is the one that applies, then the document's own identity block and body. |
| `app-legal-privacy-390.png` / `-1440.png`, `app-legal-terms-390.png` | The same block on the two screens that already existed, so all three legal screens are one shape. |
| `app-licenses-390.png` / `-1440.png` | The licences screen, labelled `OFFLINE COPY · INVENTORY 2026-09-05` from `NOTICE.json`, with the button to `inbornapp.com/licenses`. |
| `site-accessibility-1440-dark.png`, `site-accessibility-1440-light.png`, `site-accessibility-390-dark.png` | The statement published at `/accessibility`, both schemes and both widths. |
| `site-licenses-1440-dark-BEFORE-contrast.png` / `-AFTER-contrast.png` | F156. The same page with `--text-3` at the drifted `#667380` and at the app's `#7A8794`. The computed `th` colour was read out of the browser for each: `rgb(102, 115, 128)` then `rgb(122, 135, 148)`, both on `rgb(10, 13, 17)`. |
| `guards-fail.md` | Each new guard sabotaged once and watched fail, then restored green. |

How the app screenshots were taken, since the web export is a single-page app with no per-route file: a static server
with an SPA fallback in front of `apps/web/dist` on a private port, driven by `playwright-core` with
`localStorage["inborn.prefs"] = {"onboarded": true}` set before the first paint, waiting on the screen's `testID`.
The site was served from `apps/site/dist` on its own private port. Both servers were stopped afterwards.

`--force-prefers-color-scheme` is ignored by `chrome-headless-shell`; the dark scheme needs Playwright's
`colorScheme: "dark"` on the browser context, which is why the first pair of before/after shots came out identical.
