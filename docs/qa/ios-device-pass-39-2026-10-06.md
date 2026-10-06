# iPhone 13 Pro device pass on build 1.0.0 (39): rounds 134A, B, D, E, F on the phone — 6.10.2026

Build 39 (`docs/qa/ios-build-39-2026-10-06.md`) carries rounds 134A (a follow-up is applied to the previous answer),
134B (the phone's embeddings no longer skip the previous text's shared prefix), 134D (the Ask sheet answers a thanks or a
follow-up with one plain line), 134E (memory guard: once per warning, an empty answer says so, the first warning with a
picture projector drops the projector) and 134F (Hebrew file names keep their order). They were proven on simulators.
This pass walks them on `<device>` with the `.qa` twin built from the same commit, 89dc36ce, on the free tier of a fresh
install. Fast, the index model and Fast's photo pack were downloaded from `models.inbornapp.com` during the pass
(`raw/twin-models-at-end.txt`). The store app was not touched. Evidence is in `docs/qa/ios-device-pass-39/`:

- `screens/` holds every committed screenshot at full size, and `sm-*` are 500 px copies.
- `raw/` holds each run's `result-*.json` (dump nodes that named the founder's file are removed), driver log and
  `devrun-*.json` (the engine's numbers for the run's last turn), the gates, the archive and twin checks, the memory
  samples (`mem-1842-1940.txt`, `mem-2315-2333.txt`), the app's React log lines without the founder's file
  (`syslog-app-react.txt`) and `NOTES.txt` (the run log).
- `scripts/` holds the bridge scripts and `make-scripts.py`. Scripts with `DOCID` / `CHATID` / `HISID` / `TURBINEID`
  were filled in by the shell.
- `private/` is in `.gitignore`. It holds every screenshot, result, log, `[rag]` line and answer of the founder's
  9-page file and the full syslog captures. None of it is committed.

Fixtures: `docs/qa/r132-doc-summary/fixtures/constitution-9pages.pdf`, `docs/qa/r132-picture-budget/fixtures/sign-scan.pdf`,
`docs/qa/acceptance/fixtures/turbine-report-3pages.pdf` and the café
`docs/qa/v1-basics-baseline/fixtures/photos/sized/menu-of-the-garden-caf-2023-05-21.jpg` pushed as
`בית קפה הגינה תפריט.jpg`. The founder's 9-page file is called "the founder's 9-page file" below. Files go in through
the dev `attach: <name>` door. The system file picker was not driven.

**No store upload.** Nothing went to TestFlight, App Store Connect or Play.

## Two sessions, hot then cool

- **18:42 → 19:41, hot.** *"Slowing down to keep the phone cool"* was in every dump (J1 to J5). Every timing of that
  session is throttled. At 19:41 the session's network died (an API outage on the agent side); the J5c run had already
  finished on the phone, its result was copied from the twin's container afterwards. Only its last screenshot
  (`J5-09-colours`) was lost.
- **23:15 → 23:33, cool.** The same twin process (pid unchanged, 579 MB at 23:15), no thermal banner in any dump. J6,
  J7 and J9 ran here. Syslog and memory captures were restarted for it.

## Numbers

Send → end is from `send` to the answer's end in the bridge steps. Memory is the app's `physFootprint`, sampled every
2 to 4 s (first → peak → last of the run).

| turn | Send → end | parts | memory |
|---|---|---|---|
| J2 Fast 1.28 GB from the vault | ≈ 55 s from the tap to *Installed* | | |
| **J3** Fast, constitution, "Summarize it" (hot) | ≈ 160 s | reading 145.2 s (`[rag] whole-file … 145167 ms`) | 312 → 350 → 344 MB |
| **J3** Fast, the founder's file, "Summarize it" (hot) | ≈ 125 s | reading 109.5 s | 344 → 1,015 → 683 MB (whole P3 run, index model included) |
| J3 "And now" / "Thanks" / "shorter" / "more" | 3.5 to 11.2 s each | | |
| **J3** founder's file, the held question → Download → answer | ≈ 90 s | card gone ≈ 14 s, both files re-embedded 35.3 s, answer 32.6 s | |
| J3 the same question again in that chat | 28.0 s | | |
| J3 constitution "Who can veto a bill?" ×2 | 22.7 s / 31.3 s | ttft 18.7 s, 1,480 prompt tokens | |
| J3c constitution summary, then "shorter" at once | reading 159.2 s; "shorter" 47.0 s | | |
| **J4** Ask sheet "Summarize it" (hot) | reading 128.7 s | | 625 → 723 → 631 MB (J3b+J4) |
| J4 "thank you" / "And now" in the sheet | under 1 s, no model call | | |
| J4 "Who can veto a bill?" ×2 in the sheet | 14.6 s / 11.9 s | | |
| **J5** Instant `sign-scan.pdf` / café | 11.9 s / 8.4 s | `imageMaxTokens` **1024** both | 674 → 843 → 814 MB |
| **J5** Fast café: pack 668 MB | pack 24.4 s; first token ≈ 29 s after the card closed | answer ttft 1.4 s in devrun (the last turn) | 814 → **1,300** → 1,278 MB |
| **J6** Fast photo turn, then the 600-word story (cool) | photo ≈ 72 s; story **169.9 s**, complete | | 579 → **1,371** → 1,347 MB |
| J6 "Give it a title." / "Make the title shorter." | **61.0 s** / 10.4 s | | |
| J6 the photo again at the end | ≈ 85 s | ttft 62.9 s, 2,818 prompt tokens | |

## The rows

| row | result | what the phone showed | evidence |
|---|---|---|---|
| J1 new user → Instant | **pass** 52/52 | Welcome, the model step naming `models.inbornapp.com`, chip INSTANT; "Hi" → *"Hello! How can I help you today?"*; Chats and back on the same chat; "What can you do?" → *"…answering questions, solving math problems, organizing files…"* (no longer "text-based", but "organizing files" is not a feature) | `J1-00` … `J1-05` |
| J2 Fast from the vault, then a new chat | **pass** 38/38; **note** | *Installed* about 55 s after the tap. The new chat opens on **INSTANT** again (as in build 38). Model sheet: INSTANT "In use"; vault: Fast "Installed": they agree at this moment | `J2-00a…c`, `J2-01-new-chat`, `J8-01-model-sheet`, `J8-02-vault` |
| **J3 134F + 133A, the founder's file** | **pass** | Summary on Fast, "Summary of all 9 pages.", chips **`[1] קובץ.pdf · p.1–2` … `[4] … p.8–9`** with `.pdf` and the page after the name (LRI…PDI in the chip text), file row `קובץ.pdf`, chips and LEDGER above the file row | `private/P3-02-*` |
| **J3 134A, the founder's file** | **FAIL** | "And now" → *"The conversation has reached its conclusion…"*; "Thanks" → *"You're very welcome! Enjoy your day."*; **"shorter" → *"You're welcome! Enjoy your day."***; **"more" → *"You're welcome! Let me know if you'd like to explore anything else."*** No card, no none-matched line on any of them (133B still holds) | `private/P3-03` … `P3-06` |
| **J3 134A, the constitution** | **FAIL** | "And now" → *"The follow-up request is unclear. What would you like next?"*; "Thanks" → *"Thanks for the friendly update!…"*; **"shorter" → *"Okay. What do you need next?"***; **"more" → a menu (*"Here are a few shorter ways to continue: Translate… Rephrase… Expand… Continue…"*)** | `J3-03-and-now` … `J3-06-more`, `raw/devrun-j3-constitution.json` |
| J3c isolation: "shorter" right after the summary | **pass** for that order | A new chat, the summary, then "shorter" at once → a rewritten bullet summary ending *"This summary covers all 9 pages."* So 134A works when "shorter" follows the summary; after a thanks it is applied to the thanks reply. "make it 3 bullet points" is not a plain follow-up: it searched and gave three bullets from p.7 only | `J3c-01-*`, `J3c-02-shorter`, `J3c-03-three-bullets` |
| **J3 134B, the founder's file** | **pass** | "What does it say about deleting my information?" → the **468 MB card** → Download → the held question **answered with passages** (chips p.3, p.3, p.6, p.3). `[rag]`: the held turn's two asks **`hits=6 used=6`, cosines 0.826–0.845, all KEPT, equal to three decimals**; the same question a second time in that chat: the same two lines again; in Documents → Ask: **the same cosines, 6 KEPT**, answered. Details: **"Index model embed-e5"** (no "@2") | `private/P3-07-*`, `P3-08-again`, `P4-01`, `P4-03-details`, `private/syslog-founder-lines.txt` |
| J3 134B, constitution (tracked) | **pass** 44/44 | "Who can veto a bill?" twice in the summary chat: both turns' two asks identical (`#12 cos=0.824 bm25=3.01 KEPT …`, `used=4`), answered with chips p.3 both times. Details "Index model embed-e5" | `J3-07-veto`, `J3-08-veto-again`, `J4-08-details`, `raw/syslog-app-react.txt` |
| **J4 134D, Ask sheet** | **pass** (the 6 fails are `value` on nodes that are correctly absent) | "Summarize it" → "Reading pages 1–2 of 9…", the whole-file summary, chips p.1–2 … p.7–9; **"thank you" → *"You're welcome. Ask another question about these documents."***; **"And now" → *"This sheet answers one question at a time…"***; neither shows SOURCES, not-found or none-matched; "Who can veto a bill?" → a search, chip p.3, twice | `J4-01` … `J4-08` |
| J5 132B, Instant scan and café | **pass** | Scan: *"…"КАРАСАЕВ" (Karasiev)… "КӨЧЕСУ"…"*, `imageMaxTokens` 1024; café: *"A chalkboard menu on a brick wall at The Cards Cafe in London."* (the name and city are invented), 1024 | `J5-01-*`, `J5-04-*` |
| J5 Fast café with the pack | **pass** 53/55 (one harmless close, one screenshot lost to the outage) | Pack card → Download (24.4 s) → *"…likely belonging to "The Garden Cafe Hove"…"*, chip FAST; "and the colours?" answered | `J5-06` … `J5-08` |
| **J6 134E, story right after a photo turn on Fast** | **pass, branch not exercised** | Cool phone: the café photo, then the 600-word story **complete** in 169.9 s (*"…holding on as long as they needed it."*), **no memory warning at all**: no `[device]` line, no banner, chip FAST throughout, peak 1,371 MB. "Give it a title." → *"The Keeper of the First Light"* (61.0 s); "Make the title shorter." answered; Chats, Settings and back with no banner; the photo again → read correctly (projector reloaded, ttft 62.9 s) | `J6-00` … `J6-07`, `raw/mem-2315-2333.txt` |
| J7 settings, vault, Stop | **pass** 61/62 (the fail is `assertText` on the first answer, not the last) | Settings, vault (Best for *Chat*); the story stopped after 4 s: text so far + *"Stopped · Continue"*; "What is the capital of France?" → *"The capital of France is Paris."*; "Why is it the capital?" answered; Chats and back | `J7-01` … `J7-06` |
| J8 text PDF held for the index model | **pass** | Before the index model: "Who can veto a bill?" → the **468 MB card**; Cancel | `J8-03-card`, `J8-03-cancelled` |
| J8 Redact row | **pass** | A draft with a name and phone number adds the Redact row; the last answer's end stays above both rows | `J8-04-tallest`, `private/P3-09-tallest` |
| J8 model sheet vs vault "In use" | **note: agree** | J2: sheet INSTANT "In use", vault Fast "Installed". J9: sheet FAST "In use", vault FAST "Loaded · In use". The build 38 disagreement was not seen | `J8-01`, `J8-02`, `J9-12`, `J9-13` |

## Findings (for build 40)

1. **134A applies a follow-up to the thanks before it, not to the summary.** After "Thanks", "shorter" and "more" are
   applied to *"You're very welcome!"*: on the founder's file the user gets *"You're welcome! Enjoy your day."* twice, on
   the constitution *"Okay. What do you need next?"* and a menu of options. Straight after the summary, "shorter" works
   (J3c). The follow-up should apply to the last answer that was not an acknowledgement reply. "And now" now gets an
   honest *"unclear, what next?"* or *"the conversation has reached its conclusion"*, never a continuation.
2. **Longer follow-ups take the file route.** "make it 3 bullet points" searched and summarized page 7 only; "translate
   it to French" (after "thanks!") answered in French that the documents *"ne contiennent pas de traduction"* (`J9-09`).
3. **The Ask sheet leaks a prompt instruction.** Turbine report, "Who wrote this report?" → *"Your documents don't
   mention this. If you do not know the answer for sure, stop after that sentence."* + the none-matched line
   (`J9-20-sheet-who`). The report really names no author (checked with `pdftotext`), so the not-found itself is right;
   build 38's item 12 is therefore correct behaviour, apart from the leaked sentence.
4. **Hebrew text in chat bubbles is laid out as an LTR paragraph**: the question mark of *"…שתיים בצהריים?"* and of
   *"…לעזור לך?"* lands at the left end of the line (`J9-23`, `J9-24`). The banner "FAST is weak in Hebrew" shows. The
   Tokyo answer is wrong (*"בערך 12:45"*).
5. **"Give it a title." after the story took 61 s** on a cool phone (a 5-word answer); "Make the title shorter." then
   took 10 s. What the screen showed during the 61 s was not captured.
6. Still there from build 38: the "FAST is better at documents" card right after "Not now" on the picture card
   (`J5-02`, `J5-03`); the "Draft a message" chip is an unfinished sentence (the model now says it is cut off) and a
   Redact row appears for it (`J9-10`, `J9-11`); "OUT 1.27 KB" in the Chats footer; the vault's "~15-24 tok/s"; the
   Documents screen's "Free: 1 document of up to 20 pages" over 5 documents, "Add file · PRO", "Run OCR · PRO" on the
   two pictures the chat read; duplicate chip labels (`p.3` three times on the founder's file, `[3] p.3` `[1] p.3` on
   the constitution); invented facts (*"The Cards Cafe in London"*, *"US Constitution (1870)"*).
7. Harness: a script pushed before the twin's first launch creates `Documents/qa/in` through `devicectl`; the bridge
   then cannot create `qa/out` (Err513), writes no `boot.json` and never watches. The first run must launch first.

## Build 38's exploratory list, rechecked

| # | build 38 item | build 39 |
|---|---|---|
| 1 | Hebrew file names bidi-reversed | **gone**: chips, file row, Documents rows, Ask sheet line all read `קובץ.pdf` / `בית קפה הגינה תפריט.jpg` |
| 2 | sticky "Ran out of memory" banner | not reproduced: no memory warning happened in this pass |
| 3 | model sheet vs vault disagree | **not seen** (twice consistent) |
| 4 | Documents screen contradicts the chat | **still there** |
| 5 | attach sheet titled "Attach documents" opens with Templates | not checked (the attach-sheet screenshot shows the chat: the sheet did not open in time) |
| 6 | Redact row for any draft | **still there** (`J9-10`) |
| 7 | "Draft a message" chip unfinished | **still there**; the model now asks to finish the sentence |
| 8 | "FAST is better at documents" card right after "Not now" | **still there** (`J5-02`) |
| 9 | "OUT … KB" in the Chats footer | **still there** |
| 10 | vault promises 15–24 tok/s | **still there** |
| 11 | factual errors | **still there** (café name, "(1870)", Tokyo time) |
| 12 | sheet "Who wrote this report?" none-matched | correct (no author in the file), but now with a leaked instruction (finding 3) |
| 13 | navigation (vault only ×, Documents only through the paperclip) | Documents is still not in the Chats screen's drawer (`drawer-documents` not mounted there) |
| 14 | slow without feedback | the 61 s title turn (finding 5) not checked on screen |

## What did not match the brief, or is not proven

1. **134E's memory branches were not exercised.** The story after a photo turn ran on a cool phone and got no memory
   warning: no projector drop, no "The system stopped generation · Continue", no switch, no banner. In the hot session
   the Fast café turn peaked at 1,300 MB, also without a warning. The guard's once-per-warning and the empty-answer line
   are proven only by round 134E's tests.
2. **134B's one-time re-embedding of old indexes is not proven on the phone.** A fresh install has no old index; the
   two files here were embedded once, after the index model arrived (`[documents] … indexed · 9/9 pages`, 22.7 s and
   17.3 s). The store app has no index model either, so the handover by update will not show it.
3. The J3 constitution journey shows the 468 MB card and Cancel (J8-03) but not the download: the index model was
   downloaded from the founder's chat, as briefed.
4. J1's first three runs got no result (finding 7); the twin was reinstalled fresh at 19:03 and the pass started over.
5. The outage cut the session at 19:41; J6, J7, J9 ran 3.5 h later in the same app process, on a cool phone.
6. Not walked: the system picker and keyboard, the attach sheet (screenshot missed), Stop in the Ask sheet, Android.

## Past the goal

Every journey went 2–3 steps past its goal: J1 "Hi" → Chats and back → "What can you do?"; J3 "And now", "Thanks",
"shorter", "more", the same question twice, the tallest composer, Chats and back; J4 thanks, "And now", the question
twice, the details; J5 "Not now", "and the colours?", "thanks"; J6 the title, a shorter title, Chats/Settings and back,
the photo again; J7 a second question and Chats and back. The bugs found there are findings 1, 2 and 5.

## Exploratory (J9, 23:26 → 23:32, a new user's wander on Fast)

Small talk, "Is coffee bad for you?", the paperclip, the turbine report (*"RK-4417"*, chip p.1), "Who wrote this
report?", "thanks!", "translate it to French", the Draft chip, the model sheet and the vault, Chats, Settings and the
paywall (*"Pay once. Own it."* $19.99 / $69.99), the turbine report in the Ask sheet, the old constitution chat from the
list ("What does it say about impeachment?" answered with chips p.2, p.6, p.1), a Hebrew question and "תודה".
Screens `J9-01` … `J9-24`. What looked wrong: findings 2, 3, 4 and the items still marked "still there" above.

## End state

- `com.inbornapp.mobile.qa` was installed fresh at 18:42, reinstalled fresh at 19:03:38 (finding 7) and uninstalled at
  23:33:13, rc 0. `devicectl device info apps` then lists the store app **1.0.0 (38)**, untouched, and the other
  session's `com.inbornapp.mobile.uitests.xctrunner`, not touched.
- The phone was unlocked at every check and was never locked or unlocked by this pass. No setting was changed, no
  account touched. No simulator, no XCUITest runner, port 8787 not touched. Every driver, build, memory sampler and
  syslog capture this pass started has exited.

## Handover: update (23:37–23:38)

- Before: store app 1.0.0 (38). Its data container held `Documents/models/vault.json` (826 B), the Fast gguf
  (1.19 GB), one document (111 KB), `documents.json`, the prefs files and `SQLite/inborn.db` (4 KB) + wal (1.1 MB) + shm
  (32 KB), the chats. No index model and no photo pack.
- `devicectl device install app` of `Inborn-39.xcarchive/Products/Applications/Inborn.app` (com.inbornapp.mobile,
  CFBundleVersion 39): 23:37:41 → 23:38:03, rc 0. `device info apps` lists com.inbornapp.mobile **1.0.0 (39)**.
- One launch at 23:38:07, no taps.
- After the launch, every file is there with the same size: vault.json 826 B, the Fast gguf 1.19 GB, the document
  111 KB, inborn.db 4 KB + wal 1.1 MB + shm 32 KB. Only the modification times of vault.json, the shm, `licence.bin` and
  `device-prefs.json` moved to 23:38 (the launch).
- The store app has no index model, so round 134B's one-time re-embedding has nothing to rebuild here.
- First screen: a new chat on FAST, "Nothing leaves this phone." with the three starter chips
  (`screens/S01-store-first-screen-39.png`). The app is left running there.
- No setting changed, no lock/unlock, no sign-in, the xctrunner was not touched, and nothing was uploaded.
