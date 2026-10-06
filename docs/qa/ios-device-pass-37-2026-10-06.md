# iPhone 13 Pro device pass on build 1.0.0 (37): round 132 on the phone, then a brand-new user — 6.10.2026

Build 37 carries round 132 to Moshe's iPhone (`docs/qa/ios-build-37-2026-10-06.md`). Round 132 was proven on simulators
and with `llama-server` only (`docs/qa/r132-doc-summary/NOTES.md`, `docs/qa/r132-picture-budget/NOTES.md`), and both
notes list the phone's numbers as estimates. This pass walks it on the `.qa` twin built from the same commit, 12c769a4,
on the real free tier of a fresh install (no `setTier` anywhere). At the start `Documents/models` held only
`vault.json` (`raw/twin-models-at-start.txt`): no index model and no downloaded model. Every download came from
`models.inbornapp.com`. Then the twin was removed and the store app was reinstalled clean as a new user. Evidence is in
`docs/qa/ios-device-pass-37/`:

- `screens/` holds every committed screenshot at full size, and `sm-*` are 500 px copies.
- `raw/` holds each run's `result-*.json`, driver log and `devrun-*.json` (the engine's numbers for the run's last
  turn), the gates, the archive and twin checks, the `Documents/models` listings, the memory samples (`mem-*.txt`), the
  syslog extracts, the handover record and `NOTES.txt`.
- `scripts/` holds the bridge scripts and `make-scripts.py`.
- `private/` is in `.gitignore`. It holds every screenshot, result, log, memory sample and answer of the founder's two
  files, and the grades with reasons. None of it is committed.

Fixtures: `docs/qa/r132-picture-budget/fixtures/sign-scan.pdf`, `docs/qa/r132-doc-summary/fixtures/constitution-9pages.pdf`,
`docs/qa/acceptance/fixtures/turbine-report-3pages.pdf`, and the café
`docs/qa/v1-basics-baseline/fixtures/photos/sized/menu-of-the-garden-caf-2023-05-21.jpg` pushed as
`בית קפה הגינה תפריט.jpg`. The founder's picture file (one page, the same file as build 36's "Moshe's PDF") was pushed as
`מסמך.pdf` and his 9-page file as `קובץ.pdf`. Files go in through the dev `attach: <name>` door
(`library.importFile`, as *Add a file…* does). The system file picker was not driven.

**No store upload.** Nothing went to TestFlight, App Store Connect or Play.

## Numbers first

Send → first token on screen = the bridge's `send` step plus its `waitFor assistant-text` (the page plan, render and
import, and the image prefill). "Engine" is `ttftMs` and `elapsedMs` from `dev-run.json`. Memory is the app process's
`physFootprint`, read every 1 to 3 s from the Mac with `pymobiledevice3 developer dvt sysmon process single`
(`raw/mem-*.txt`): the first sample of the run, the highest and the last. Short peaks between samples are missed.

**The phone was hot for half the pass.** From 13:55 (J6) on, the app showed *"Slowing down to keep the phone cool"*
(iOS thermal state serious) in every screen dump but one (J5 again, right after a 2.5-minute wait), on a phone on its charger. Every Instant picture number below ran
before that; **every Fast number ran throttled**. Fast's prefill fell to 52 to 138 tokens/s (build 36: about 185) and
its generation to 5 to 13 tokens/s (build 36: 15 to 19).

| turn | Send → first token | Send → end | engine ttft / total | prompt tokens | image tokens | memory first → peak → last |
|---|---|---|---|---|---|---|
| **J2** Instant, `sign-scan.pdf` (image-only) | **5.77 s** | 7.67 s | 3.27 s / 5.87 s | 839 | **1024** | 292 → 554 → 499 MB |
| **J3** Instant, the founder's picture file, sample 1 | **3.90 s** | 7.07 s | **2.20 s** / 4.90 s | **871** | **1024** | 550 → 550 → 511 MB |
| J3 sample 2 (new chat, KV cache hit) | 0.96 s | 3.17 s | 0.13 s / 1.04 s | 16 | 1024 | 554 → 554 → 510 MB |
| *build 36, the same file at 512, sample 1* | *3.63 s* | | *1.92 s* | *653* | *512* | |
| **J7** Instant, the café photo from the composer | **3.65 s** | 6.19 s | 2.51 s / 3.57 s | 928 | **1024** | 31 → 580 → 504 MB |
| *build 36, the café at 512, sample 1* | *2.57 s* | | *1.69 s* | *654* | *512* | |
| **J4** Fast, the founder's 9-page file, "Summarize it" (throttled) | reading line at once | **73.7 s** | last call 7.07 s / whole job **73.4 s** | 715 (final call) | | 563 → 953 → 953 MB |
| J4 Fast, `constitution-9pages.pdf`, "Summarize this file" (throttled) | reading line at once | **152.8 s** | last call 8.01 s / 152.7 s | 904 (final call) | | 637 → 824 → 625 MB |
| J4 Fast, the founder's file, "What is this file about?" after the index model (throttled) | | | 15.6 s / 23.9 s | 1,848 | | |
| **J5** Fast, `sign-scan.pdf`, held for the pack, sent when it landed (throttled) | 28.0 s after the card closed | 73.9 s with the download | 16.3 s / 27.7 s | 839 | **1024** | 661 → 1,379 → 1,277 MB |
| J5 again, new chat (KV cache hit, not throttled) | 5.50 s | 8.99 s | 0.25 s / 6.63 s | 16 | 1024 | 1,319 → 1,319 → 1,271 MB |
| J7 Fast + pack, the café photo (throttled): **"Ran out of memory · Switched to Instant"** | 5.49 s | 8.34 s | Instant, 0 tokens generated | 151 | | 1,272 → 1,272 → 404 MB |
| J7 Fast + pack, the café photo again, new chat (throttled) | 11.65 s (includes loading the pack) | 20.77 s | 6.89 s / 20.59 s | 928 | **1024** | 433 → 1,341 → 1,287 MB |

- **Round 132B on the phone:** `devInfo.imageMaxTokens` read **1024** on every Instant picture turn (the 13 Pro loads a
  4096 context). The founder's picture file costs 871 prompt tokens against 653 at 512 (+218, the harness predicted
  +218), and its engine first token moved from 1.92 s to **2.20 s** (+0.28 s, inside the 1.8 to 2.7 s the notes
  estimated). On screen, the first token came 0.27 s later than build 36's (3.90 s against 3.63 s). The café went from
  1.69 s to 2.51 s engine (928 tokens against 654).
- **Memory at 1024 on Instant:** the process peaked at **554 to 580 MB** on the three Instant picture turns, and the
  app never went down: the same process (one pid) served J2 and both J3 samples. No jetsam of Inborn in the syslog
  (`raw/syslog-jetsam.txt`); iOS did kill background daemons (cloudphotod, maild, passd, appstored and `devicectl`'s own
  `dtfilesandboxd`) while Fast and its pack were loaded.
- **Round 132A on the phone:** the summary ask showed **"Reading pages 1–2 of 9…"** the moment it was sent, with **no
  index-model card** (the index model was not installed yet), and ended with **"Summary of all 9 pages."** The
  founder's file took **73.7 s** from Send to the end on a throttled Fast (reading 45.6 s, first token 6.9 s after
  the reading line went, writing 21.0 s). The round's estimate was 61 s (53 to 74 s).

**`[picture-check]`:** the syslog capture ran 13:48 → 14:09:21, when the connection dropped (*"Connection was terminated
abruptly"*). It covered J2, J3, J7 on Instant, J5 and J5 again: **no `[picture-check]` line**, so no turn needed a second
attempt. The café turns on Fast (14:09 → 14:14) are outside it; a second capture filtered on the app's process from
14:11 shows only the model loads.

### Grades

Rubric of `docs/qa/v1-basics-baseline/README.md` (2 correct, in the user's language, right-sized, nothing invented; 1
usable with a flaw; 0 wrong, invented, wrong language or useless). One grader, not blind.

| turn | grade | why |
|---|---|---|
| J2 Instant, the scan | 2 | Reads both lines of the sign ("КАРАСАЕВ", "кочесу") on a yellow wall; the peeling paint is there |
| J3 Instant, the founder's picture file, sample 1 | 1 | The site and the two faces right; it mistranslates one label and invents that one person is asleep and a message about a match |
| J3 sample 2 | 2 | Short and right, nothing invented |
| J7 Instant, the café | 1 | "A chalkboard menu on a brick wall": right; "prices for different days of the week" is invented |
| J5 Fast + pack, the scan (both) | 2, 2 | Both lines, the second time spelled "көчөсу", the Kyrgyz letters right |
| J7 Fast + pack, the café (second try) | 1 | The board's five sections and several dishes read correctly; the café's name and the right-hand panel are misread |
| J4 Fast, the founder's file, summary | 2 | Four bullets that summarize the content of the file across its pages, with sources p.1, p.3, p.5, p.8; it does not describe the file instead of summarizing it |
| J4 Fast, the founder's file, "What is this file about?" | 2 | One correct paragraph on what the document is and covers |
| J4 Fast, `constitution-9pages.pdf`, summary | 1 | Eight bullets across all nine pages, mostly right; conviction "two-thirds in each house" is wrong (the Senate alone), and two bullets mix up taxes and treason |

Instant at 1024, English: mean **1.50** on the founder's file (n=2; build 36 at 512: 1.00, n=3) and 1.50 over the
four Instant picture answers (the scan, the founder's file twice, the café). Too few samples to call it a gain on the phone. Round 132's harness
measured 0.70 → 1.08.

## The rows

| row | result | what the phone showed | evidence |
|---|---|---|---|
| J1 new user, Instant: onboarding | **pass** 22/22 | Fresh install, Welcome, the model step with the host in the source line, *Start now with Instant*, chip INSTANT | `J1-00-welcome`, `J1-01-model-step`, `J1-02-chat-instant` |
| **J2 image-only PDF on Instant** | **pass** 48/48 + 4/4 | `sign-scan.pdf` attached (paperclip chip). "What do you see?": **the page picture in the sent bubble, no OCR refusal, no 468 MB index card**, *"The image displays a weathered sign mounted on a yellow wall, featuring Cyrillic text: "КАРАСАЕВ" (Karasev) and "кочесу" (Kochesu)…"*, then the card **"FAST sees pictures better than INSTANT." · Install FAST · 1.28 GB · Not now**. Ledger: *MODEL INSTANT · QUANT Q4_K · CONTEXT 272 / 4096 · MS / TOKEN 32 ms*. `devrun`: `imageMaxTokens` **1024** | `J2-01-composer-chip`, `J2-02-sent-bubble`, `J2-02-answer`, `J2-02-ledger`, `raw/devrun-j2-scan-instant.json` |
| **J3 the founder's picture file on Instant at 1024** | **pass** 2 × 51/51 | Two new chats, "What do you see?": no index card, the page picture in the bubble, an answer, the advice card. Timing and grades above. The app was still running after both (same pid in `private/mem-f3-*.txt`) | `private/` only |
| J7 the café photo on Instant | **pass** 53/53 | Thumbnail chip (*"Free: one photo per message"*), *"The image displays a chalkboard menu on a brick wall…"*, the advice card **"FAST sees pictures better than INSTANT."** Ledger *CONTEXT 218 / 4096 · 32 ms* | `J7-01-thumbnail-chip`, `J7-02-sent-bubble`, `J7-02-answer`, `J7-02-ledger` |
| **J6 a 3-page text PDF still held on Instant** | **pass** 22/22 | `turbine-report-3pages.pdf`, the serial question: *"The attached file needs the document index model (468 MB) to be searched by meaning. Without it, only exact words are matched. Download · 468 MB · Send, exact words only · Cancel"*. Not downloaded in this row | `J6-01-index-card` |
| J4 Install Fast from the vault | **pass** 15/15 | *Install · 1.28 GB from models.inbornapp.com*; *"17% · 228 MB of 1.28 GB"* after 15 s, *Installed* 52 s later | `J4-01-vault-fast`, `J4-02-fast-downloading`, `J4-03-fast-installed` |
| **J4 the founder's 9-page file on Fast** | **pass** 70/70 + 12/12 | "Summarize it": **"Reading pages 1–2 of 9…"** at once, **no index card**, then the summary with SOURCES p.1/p.3/p.5/p.8 and **"Summary of all 9 pages."**, 73.7 s in all. Ledger *MODEL FAST · CONTEXT 895 / 4096 · 116 ms*. Then "What is this file about?" in the same chat: the **468 MB index card** (the opening route is not a summary, by design); Download, the card gone after 21.5 s, *"Reading your document before answering…"*, then a one-paragraph answer about the document. Grades above | `private/` only |
| **J4 `constitution-9pages.pdf` on Fast, the tracked example** | **pass** 41/41 | "Summarize this file": *"Reading pages 1–2 of 9…"*, then *"This file is a summary of the provisions from the United States Constitution, specifically covering its structure and key powers."* and eight bullets (Legislative Structure, Revenue Bills, Impeachment Powers, Presidential Approval, Executive Powers, Judicial Authority, Treason Definition, State Relations), SOURCES p.1/p.3/p.5…, *"Summary of all 9 pages."*. 152.8 s, throttled. Full answer in `raw/devrun-j4c-fixture-fast.json` | `J4-04-attached`, `J4-05-reading`, `J4-05-summary`, `J4-05-ledger` |
| **J5 the scan on Fast after its photo pack** | **pass** 54/54 + 48/48 | Fast without the pack: *"FAST needs its photo pack to see photos · One 668 MB download, then this photo sends by itself. · Download 668 MB · Switch to INSTANT · installed · Remove the photo"*. Download: *"Downloading the photo pack: 77 of 668 MB."*, the card gone 29.5 s later and the held message went out with the page picture: *"…a weathered blue and white street sign mounted on a yellow-painted wooden wall; the upper section reads "КАРАСАЕВ"…"*. **No advice card on Fast.** Again in a new chat: *""КАРАСАЕВ" (Karasaev) in white on the blue upper section and "көчөсу" (kəčəsü) in blue on the white lower section…"* | `J5-01-pack-card`, `J5-02-pack-downloading`, `J5-03-sent-with-picture`, `J5-04-fast-answer`, `J5-05-*` |
| **J7 the café photo on Fast** | **fail once, then pass** (47/48, then 37/37) | First try, in a new chat right after J5: the turn went out on Fast and came back as **"Ran out of memory · Switched to Instant · SWITCH BACK"** with Instant's honest line *"I have your picture, but I could not make it out well enough to give a reliable answer."* and *"The system stopped generation"*, then the advice card *"Switch to FAST"*. Memory 1,272 MB just before the switch, 404 MB after. Second try, a new chat with Fast chosen again and the same photo: an answer, no advice card | `J7-03-sent-bubble`, `J7-03-answer`, `J7-03-ledger`; `J7-04-*` |
| J8 settings, vault, Stop | **pass** 38/38 | Settings opens; the vault opens with Best for *Chat*; a long story on Fast stopped after about 4 s: the text so far, *"Stopped · Continue"*; the next turn *"The capital of France is Paris."* (from `devrun`: the bridge's `assistant-text` read the first answer) | `J8-01-settings`, `J8-02-vault`, `J8-03-stopped`, `J8-04-after-stop` |
| **Store app, brand-new user** | **pass** | Twin uninstalled; 10 non-model files copied for the record; store app uninstalled and build 37 installed fresh: **1.0.0 (37)**. After one launch `Documents/models` = `vault.json` only (Instant + its pack, bundled), no documents, pictures or chats. Left on Welcome | `S01-store-first-screen-37`, `raw/handover37.txt`, `raw/store-vault-after-first-launch-37.json` |

## What did not match the brief, or is not proven

1. **The out-of-memory switch on Fast with a photo (J7).** Seen once in two tries, on a hot phone, with Fast and its
   pack resident since J5 (1,272 MB). The app's own guard fired (`state.memorySwitched`: a UIApplication memory warning,
   or `os_proc_available_memory()` at or under 150 MB), not iOS: Inborn was not killed. The syslog capture had dropped
   12 s before, so the trigger is not recorded. Fast already read pictures at 1024 before round 132, so this is not new
   in build 37, but no earlier pass ran a composer photo on Fast with the pack on this phone. Not reproduced, not
   explained.
2. **Every Fast time is a throttled time.** The summary's 73.7 s, the constitution's 152.8 s and the pack turn's 16.3 s
   engine first token ran with *"Slowing down to keep the phone cool"* on screen. A cool phone should be faster; not
   measured in this pass.
3. **Memory is sampled, not traced.** One reading every 1 to 3 s from the Mac; the peak of an image encode can fall
   between two samples. The 31 MB first sample of J7 on Instant is the app being relaunched (below).
4. **J5 again and J3 sample 2 hit the KV cache** (16 prompt tokens): fresh chats and fresh samples, not cold prefills.
5. **"What is this file about?" after the summary was held for the 468 MB index model** on a phone without it. That is
   the designed route (only summary asks skip the card), so the about answer came after the download.
6. **Harness:** before J7 on Instant, `devicectl`'s file daemon (`dtfilesandboxd`) was killed by jetsam during the
   script push, so `ios-qa.mjs` took its "inbox missing" path and relaunched the app (`raw/log-j7a-photo-instant.txt`,
   `raw/syslog-jetsam.txt`). In J8 and the "about" turn the bridge's `value assistant-text` read the first answer of the
   chat; the later answers were read from `dev-run.json` and the dumps. `j2-ledger`, `f4b-about-wait`, `cool`, `cool2`
   and `j7c-photo-fast-again` were added during the pass (`cool` once returned an earlier result because the run id was
   reused; `cool2` reran it). The `j2-scan-instant` script on disk now ends with the ledger steps, which ran separately
   as `j2-ledger`.
7. **Not walked:** the system file picker and the system keyboard (the bridge types through `onChangeText`), real
   Airplane Mode, the Hebrew summary ask, and OCR after a picture turn.

## End state

- The phone has `com.inbornapp.mobile` **1.0.0 (37)**, freshly installed, running on onboarding's first screen
  (Welcome, **Continue**), with no model downloaded and no chats or documents.
- `com.inbornapp.mobile.qa` was uninstalled at 14:15:13, rc 0. `devicectl device info apps` then lists the store app and
  the other session's `com.inbornapp.mobile.uitests.xctrunner`, which was not touched.
- The phone was unlocked at every check and was never locked or unlocked by this pass. No setting was changed, no
  account touched. No simulator, no XCUITest runner, port 8787 not touched. Every driver, build, memory sampler and
  syslog capture this pass started has exited.
