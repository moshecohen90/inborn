# fix-mosheai — round 50 evidence (24.9.2026)

Answers the MosheAI review of 24.9. Findings **F225–F238** in `docs/qa/qa-run-2026-09-11.md`; the round write-up is
`README.md` → "Fixes round 50".

## How these were taken

`apps/web/dist` built from this branch, served by `node scripts/serve-web.mjs` on port **8933**
(`MODELS_DIR=/Users/moshecohen/dev/inborn/.models`), driven headless with playwright-core on
`chrome-headless-shell`, viewport height 900, light scheme. The server was killed by its own PID when the pass ended.

`before/` are **not** my screenshots: they are the review's own evidence, taken from `origin/main` **af40796**, copied
here unchanged so the pair is comparable. Their original names are in brackets.

| file | what it shows |
| --- | --- |
| `before/06-17-chat-empty-*.png` [`05-chat-*`] | F226/F235: three stacked notice lines, and the empty chat pinned to the bottom third |
| `after/06-17-chat-empty-*.png` | one notice line + `Details`, and the empty chat centred (seal y 630 → 414 at 1440) |
| `after/06-chat-strip-open-*.png` | the same strip with the disclosure open: offline state, storage notice, engine switch |
| `before/05-12-paywall-compare-*.png` [`06c-paywall-compare2-*`] | F225/F231: the compare table as the review saw it |
| `after/05-paywall-compare-scrolled-*.png` | F225: scrolled to the end of the 18 rows, `FREE / PRO / WORK` still on screen; F231: the `†` row and its footnote |
| `after/05-paywall-compare-scrolled-nosticky-*.png` | the complement — same session, `position` forced to `static`: the header is gone and the three columns are bare again |
| `before/16-hebrew-answer-1440.png` [`C3-after-hebrew-1440`] | F227/F234: the all-caps banner, and the label and ledger hard left of a right-aligned answer |
| `after/16-07-hebrew-answer-1440.png` | the notice with a Dismiss, and the label and ledger mirrored to the answer's edge |
| `after/07-hebrew-dismissed-1440.png` | F227: dismissed, and gone for this chat |
| `before/17-work-audit-1440.png` / `after/17-work-audit-1440.png` | F235: a card pinned to the top of a 900 px window with a dead `CHOOSE A VAULT` heading → a centred card with no dead heading |
| `site/item19-*`, `site/item20-*`, `site/check-*.txt` | F236/F237 |
| `spec/build.txt`, `spec/after-grep.txt` | F232 |

## Measurements

`walk-1440.log`, `walk-390.log` — the compare header's computed `position` and the viewport y of the header, the
*Client vaults* row and the footnote, before the scroll, after it, and after `position` is forced to `static`.
`hebrew-1440.log` — the answer block's box against the x of `INSTANT · ON-DEVICE AI`, `LEDGER` and the notice, before
and after Dismiss.

## Guards watched failing

`guard-red-r50.txt` — the app fixes reverted with `git checkout --` and the suites re-run: **11 failures**
(`apps/mobile/test/mosheai-r50.test.ts` and the two-store case in `premium-entry.test.ts`), then restored and green.
`guard-red-device-ids.txt` — the iPhone UDID written back into a tracked doc, `no-device-ids.test.ts` red on it.
