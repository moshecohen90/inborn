# iPhone 13 Pro device pass on build 1.0.0 (38): rounds 132C and 133 on the phone — 6.10.2026

Build 38 (`docs/qa/ios-build-38-2026-10-06.md`) carries rounds 132C, 133A, 133B and 133C, which were proven on simulators
only, mostly on Instant. This pass walks them on Fast (the founder's model) on `<device>`, with the `.qa` twin built from
the same commit, 3569b0cc, on the free tier of a fresh install. At the start `Documents/models` held only `vault.json`
(`raw/twin-models-at-start.txt`); Fast, the index model and Fast's photo pack were downloaded from
`models.inbornapp.com` during the pass (`raw/twin-models-at-end.txt`). The store app was not touched. Evidence is in
`docs/qa/ios-device-pass-38/`:

- `screens/` holds every committed screenshot at full size, and `sm-*` are 500 px copies.
- `raw/` holds each run's `result-*.json`, driver log and `devrun-*.json` (the engine's numbers for the run's last
  turn), the gates, the archive and twin checks, the memory samples, an app syslog extract
  (`syslog-app-1621-1638.txt`), the `Documents/models` listings and `NOTES.txt` (the run log).
- `scripts/` holds the bridge scripts and `make-scripts.py`. Scripts with `DOCID` / `CHATID` were filled in by the shell.
- `private/` is in `.gitignore`. It holds every screenshot, result, log, memory sample and answer of the founder's
  9-page file, the superseded runs, and the isolation runs on his file. None of it is committed.

Fixtures: `docs/qa/r132-doc-summary/fixtures/constitution-9pages.pdf`, `docs/qa/r132-picture-budget/fixtures/sign-scan.pdf`
and the café `docs/qa/v1-basics-baseline/fixtures/photos/sized/menu-of-the-garden-caf-2023-05-21.jpg` pushed as
`בית קפה הגינה תפריט.jpg`. The founder's 9-page file was pushed as `קובץ.pdf` and is called "the founder's 9-page
file" below. Files go in through the dev `attach: <name>` door (`library.importFile`). The system file picker was not
driven.

**No store upload.** Nothing went to TestFlight, App Store Connect or Play.

## The phone was hot for the whole pass

The phone came to the pass warm (the founder had been using the store app). From the first Fast summary (15:49) to the
last run (16:37) the app showed *"Slowing down to keep the phone cool"* in every screen dump taken, on a phone on its
charger. **Every timing below is a throttled timing.** Fast generated at 6.6 to 10.6 tokens/s (build 36 cool: 15 to
19) and prefilled at 53 to 143 tokens/s.

## Numbers

Send → end is the bridge's steps from `send` to `stop` gone. "Engine" is `ttftMs` / `elapsedMs` from `dev-run.json`.
Memory is the app's `physFootprint`, sampled every 1 to 3 s from the Mac (first → peak → last).

| turn | Send → end | parts | engine ttft / total | memory |
|---|---|---|---|---|
| **J2** Fast, the founder's 9-page file, "Summarize it", run 1 | **73.7 s** | reading 37.1 s, first token 5.05 s, writing 28.9 s | 5.05 s / 73.4 s | 268 → 311 → 305 MB |
| J2 the same file, run 2 (a new chat, right after a third summary the app replayed, see note 1) | 189.4 s | reading 139.5 s, first token 12.5 s, writing 31.5 s | 12.6 s / 189.1 s | 238 → 328 → 315 MB |
| **J2** Fast, `constitution-9pages.pdf`, "Summarize it" (tracked) | 208.7 s | reading 129.9 s, first token 11.0 s, writing 61.4 s | 10.9 s / 208.6 s | |
| **J3 "And now"** after the summary, the founder's file | ≈ 11 s | | 8.39 s / **10.9 s** (445 prompt tokens, 15 out) | |
| J3 "And now", constitution | ≈ 11 s | | 7.43 s / **11.0 s** (677 prompt tokens, 27 out) | |
| J3 "Thanks" / "thank you" / "shorter" | under 5.2 s each | | 0.30 to 0.76 s / 2.6 to 4.0 s | |
| J3 "What does it say about treason?" → Download on the 468 MB card | ≈ 96 s | download 24.7 s, reading the file ≈ 36 s, answer ≈ 34 s | 18.3 s / 33.2 s (1,500 prompt tokens) | |
| **J4** Documents → Ask, constitution, "Summarize it" (free) | 178.6 s | | | |
| J4 the same ask on Pro (for the stats line) | | `read 147956 ms · 9 of 9 pages · answer 55551 ms · 6.9 tok/s · prompt 928 tokens` | | |
| J4 "Who can veto a bill?" in the sheet | 11.7 s (free) | `search 2249 ms · 4 passages · answer 15076 ms` (Pro) | | |
| **J5** Instant, `sign-scan.pdf` | first token on screen 9.2 s | | 3.15 s / 11.7 s, imageMaxTokens **1024** | 509 → 555 → 505 MB |
| J5 Instant, the café photo | first token on screen 10.4 s | | 8.17 s / 10.1 s, imageMaxTokens **1024** | 501 → 517 → 509 MB |
| **J5** Fast, the café photo, photo pack held | pack 668 MB in 28.6 s, first token 29.1 s after the card closed | | 21.7 s / 46.2 s | 505 → **1,018** → 962 MB |

## The rows

| row | result | what the phone showed | evidence |
|---|---|---|---|
| J1 new user, Instant: onboarding | **pass** 22/22 | Welcome, the model step with `models.inbornapp.com` in the source line, *Start now with Instant*, chip INSTANT | `J1-00-welcome`, `J1-01-model-step`, `J1-02-chat-instant` |
| J2 setup: Install Fast from the vault | **pass** 15/15 | *"34% · 438 MB of 1.28 GB"* after 15 s, *Installed* about 50 s from the tap | `J2-00a-vault-fast`, `J2-00b-fast-downloading`, `J2-00c-fast-installed` |
| **J2 132A + 133A + 133C, the founder's 9-page file on Fast** | **pass** 51/51 (run 1), 49/51 (run 2, the two fails are the model sheet's "use" button absent because the chat was already on Fast) | "Summarize it": **"Reading pages 1–2 of 9…"** at once, **no index card**, a six-bullet summary of the file, **"Summary of all 9 pages."**, SOURCES **`p.1–2` `p.3–4` `p.5–7` `p.8–9`** (run 2: the first three), and the chips and LEDGER **in view above the attached-file row** | `private/` only |
| **J2 the same journey, `constitution-9pages.pdf` (tracked)** | **pass** 44/44 | "Reading pages 1–2 of 9…", the summary, "Summary of all 9 pages.", SOURCES **`[1] p.1–2` `[2] p.3–4` `[3] p.5–6` `[4] p.7–9`**, chips and LEDGER above the file row. Ledger *MODEL FAST · CONTEXT 1320 / 4096 · 140 ms* | `J2-01-attached`, `J2-02-reading`, `J2-02-summary`, `J2-02-ledger` |
| **J3 133B, the founder's file** | **pass** 12/12 × 3, card 13/13 | Same chat: **"And now"**, **"Thanks"**, **"shorter"** each got a plain one- or two-sentence reply followed by **LEDGER only: no card, no "none matched" line, no SOURCES, no advice card** (`private/P3-chat-end`). Then **"What does it say about data retention?"** got the **468 MB card** (*"The attached file needs the document index model (468 MB)…"*); **Cancel** closed it | `private/` only |
| **J3 the same on the constitution (tracked)** | **pass** 12/12 × 4, card 13/13 | "And now" → *"Now we can turn this summary into a helpful study guide or a quick reference chart! How would you like to use it for your learning?"*; "Thanks", "thank you", "shorter" → short replies; each with LEDGER only. "What does it say about treason?" → the 468 MB card; Cancel | `J3a-and-now`, `J3b-thanks`, `J3c-thank-you`, `J3d-shorter`, `J3e-card`, `J3e-cancelled` |
| **J3 Download → single-page chips, 133C with the Redact row (tracked)** | **pass** 31/31 | Treason again, **Download · 468 MB**: *"Downloading the document index model… 14%. Your message is sent when it's ready."*, the card gone after 24.7 s, the held message went out, an answer quoting the treason clause, SOURCES **`[1] p.7` `[2] p.7`** (single pages), chips and LEDGER above the file row; a draft with a name and phone number adds the **Redact** row and the chips and LEDGER stay above both rows | `J3f-downloading`, `J3f-answer`, `J3f-redact-row` |
| **J3 Download → answer, the founder's file** | **route pass, answer fail** 31/31 | With the index model in, "What does it say about data retention?" went out with no card, but came back **"Your documents don't mention this."** with the notice **"Nothing in your documents matched this question. Answered without them."** and no chips. The same for "What does it say about deleting my information?", also in a new chat. See finding 2 | `private/` only; `raw/syslog-app-1621-1638.txt` |
| **J4 132C, Documents → Ask on Fast (tracked)** | **pass** on free (30/34: the 4 fails are the stats line, which is Pro-only, see note 3); **pass** 30/30 on Pro | Select the constitution only → *Ask about 1 document* → "Summarize it": **"Reading pages 1–2 of 9…"** in the sheet, then the summary ending **"Summary of all 9 pages."**, no none-matched or not-found line. On Pro the stats read **`read 147956 ms · 9 of 9 pages`**. "Who can veto a bill?" stays a search: **`search 2249 ms · 4 passages`**, SOURCES p.4, p.3 | `J4-01-sheet`, `J4-02-reading`, `J4-03-summary`, `J4-04-question`, `J4-05r-summary-stats`, `J4-06r-question-stats` |
| **J5 the scan on Instant** | **pass** 52/53 (the fail is a harmless `model-sheet-close` with no sheet open) | The page picture, *"…a weathered sign mounted on a yellow wall… "КАРАСАЕВ" (Karasiev) and "кочесу"…"* (it also invents "Kyiv, Ukraine" and a bakery), then **"FAST sees pictures better than INSTANT." · Switch to FAST · Not now**. `imageMaxTokens` 1024 | `J5-01-composer-chip`, `J5-02-sent-bubble`, `J5-02-answer`, `J5-02-ledger` |
| J5 the café photo on Instant | **pass** 51/51 | *"A chalkboard menu on a brick wall displays various breakfast items…"*, the advice card. `imageMaxTokens` 1024 | `J5-03-*` |
| **J5 the café photo on Fast** | **pass** 59/59 | *"FAST needs its photo pack to see photos · Download 668 MB…"*, Download, the held photo went out, *"…an outdoor chalkboard menu attached to a red brick wall, likely belonging to "The Garden Cafe Hove"…"*, chip still FAST. **No "Ran out of memory" switch** this time (build 37 saw it once in two tries); peak 1,018 MB, the same process before and after | `J5-04-pack-card`, `J5-05-sent-bubble`, `J5-05-answer`, `J5-05-ledger`, `raw/mem-j5c.txt` |
| J6 settings, vault, Stop | **pass** 39/39 | Settings opens; the vault opens with Best for *Chat*; a long story on Fast stopped after about 4 s: the text so far, *"Stopped · Continue"*; the next turn *"The capital of France is Paris."* (it then adds wrong facts: "eastern part of the country", the Arc de Triomphe as a Roman ruin) | `J6-01-settings`, `J6-02-vault`, `J6-03-stopped`, `J6-04-after-stop` |

## Findings

1. **A silent empty answer on Fast, seen once, not reproduced.** After about 30 minutes and some 20 runs in one process,
   the Ask sheet's answer step and then every chat turn on Fast returned nothing: `prompt_n 1`, `predicted_n 0`,
   `reply ""`, "loaded model FAST … in 40 ms", no error in the app log. The user sees an empty assistant bubble with no
   message (`J4-05-summary-stats`, `J4-06-question-stats`, `J4-07-veto-*`, `J4-08-chat-sanity`,
   `raw/devrun-sanity-chat*.json`). It started in the sheet run right after the twin was switched to Pro, and stayed
   after switching back. A relaunch of the twin fixed it, and the same Pro sheet run then worked (`J4-05r`, `J4-06r`,
   `raw/result-sanity-chat-r4.json`). The trigger is not known. The app has no guard that turns an empty generation
   into an error line.
2. **The chat's search finds nothing in the founder's 9-page file for plain questions the Ask sheet answers.** His file
   is indexed (41 passages). In the sheet, "What does it say about deleting my information?" used 6 passages
   (cosines 0.817 to 0.835, all KEPT) and answered correctly; in the chat, the same question in his chat and in a new
   chat had `hits=6 used=0`, cosines 0.79 to 0.80, all dropped by the relevance doors, so the reply was "Your documents
   don't mention this." with the none-matched notice (`raw/syslog-app-1621-1638.txt`, his file is `muwoc8hc…`). The
   constitution's treason question in the chat did find passages (J3f). This is retrieval, not rounds 132–133, and
   was not run on build 37.
3. **"shorter" is answered as small talk, never as "make that shorter".** After the summary, "shorter" got *"You're
   welcome! Feel free to reach out anytime…"* on both files: round 133B's line tells the model not to mention the files,
   so the user cannot get a shorter summary with that word. "And now" also gets an invented follow-up (*"turn this
   summary into a study guide"*), not a continuation.
4. Two chips can carry the same label: the treason answer's SOURCES were `[1] p.7` and `[2] p.7` (two passages on one
   page).
5. Opening LEDGER on the last answer with a file attached does not scroll its body into view: the toggle sits above the
   file row and the opened rows stay under the composer (`J2-02-ledger`). 133C pins the end when the composer changes,
   not when the ledger opens.

## What did not match the brief, or is not proven

1. **Harness, the founder's file.** At the first "And now" the driver's push to the bridge inbox failed once, and its
   fallback relaunched the app (`--terminate-existing`): those four turns ran in a fresh chat with no file on a black
   screen and are discarded (`private/superseded`). Rerunning the summary under the same run id made the app replay the
   old script (a third summary, 15:54 to 15:57) before the new one, which is why run 2 is slow. `run.sh` now pushes a
   preflight file with retries and gives each rerun its own id. In run 2 the model sheet stayed open over the chat
   (the chat was already on Fast, so the sheet had no "use" button): the bridge acted on the chat underneath, and the
   J3 pictures were retaken after closing it (`close-sheet`, `f3d-retention-card-r3`).
2. **The 468 MB card on the founder's file was cancelled, not downloaded there.** The index model was downloaded from
   the constitution's card (J3f), so that the tracked run shows the download; the founder's chat then asked with the
   model in. The fixture shows the single-page chips; the founder's file got none (finding 2).
3. **The Ask sheet's stats line is Pro-only** (`can("detailedStats")`), so the free tier never shows "read … · 9 of 9
   pages". It was proven with the bridge's `setTier pro`. The dev-only `pretendTier(null)` does not restore the real
   tier (the last pretended tier stays in its state), so the twin stayed Pro until a relaunch: the first J5 Instant runs
   ran on Pro and are discarded; J5 was rerun on the free tier after a relaunch (*"More detail · PRO"* in its ledger).
4. **Every time is throttled.** A cool phone should be faster; not measured.
5. **Memory is sampled, not traced**, every 1 to 3 s.
6. **Not walked:** the system file picker and keyboard (the bridge types through `onChangeText`), the keyboard up with a
   file attached, Hebrew asks, Stop in the Ask sheet, a file over about 20 pages (the "cut" scope line), and Android.

## End state

- `com.inbornapp.mobile.qa` was uninstalled at 16:38:12, rc 0. `devicectl device info apps` then lists the store app
  **1.0.0 (37)**, untouched by this pass, and the other session's `com.inbornapp.mobile.uitests.xctrunner`, not touched.
- The phone was unlocked at every check and was never locked or unlocked by this pass. No setting was changed, no
  account touched. No simulator, no XCUITest runner, port 8787 not touched. Every driver, build, memory sampler and
  syslog capture this pass started has exited.
