# iPhone 13 Pro device pass on build 1.0.0 (40): rounds 134G and 134H on the phone — 7.10.2026

Build 40 (`docs/qa/ios-build-40-2026-10-07.md`) carries round 134G (a follow-up after a thanks reworks the last real
answer, and reworks like "make it 3 bullet points" / "translate it to French" are follow-ups with no card and no
search) and 134H (the Ask sheet never shows its own instruction sentence). Both were proven on simulators. This pass
walks them on `<device>` with the `.qa` twin built from the same commit, a0916eb3, on the free tier of a fresh install,
together with the 134A–F regressions. Fast, the index model and Fast's photo pack were downloaded from
`models.inbornapp.com` during the pass (`raw/twin-models-at-end.txt`). The store app was not touched. Evidence is in
`docs/qa/ios-device-pass-40/`:

- `screens/` holds every committed screenshot at full size, and `sm-*` are 500 px copies.
- `raw/` holds each run's `result-*.json` (dump nodes that named the founder's file are removed; they came from screens
  mounted underneath, such as the Documents list under the Ask sheet), driver log and `devrun-*.json` (the engine's
  numbers for the run's last turn), the gates, the archive and twin checks, the memory samples (`mem-0031-0121.txt`,
  `mem-0121-0152.txt`), the app's React log lines without the founder's file (`syslog-app-react.txt`) and `NOTES.txt`
  (the run log).
- `scripts/` holds the bridge scripts and `make-scripts.py`. `CHATID` / `DOCID` / `TURBINEID` / `HISCHAT` were filled
  in by the shell.
- `private/` is in `.gitignore`. It holds every screenshot, result, log, `[rag]` line and answer of the founder's
  9-page file, the attach-sheet screenshot (it lists the file) and the full syslog captures. None of it is committed.

Fixtures as build 39: `docs/qa/r132-doc-summary/fixtures/constitution-9pages.pdf`,
`docs/qa/r132-picture-budget/fixtures/sign-scan.pdf`, `docs/qa/acceptance/fixtures/turbine-report-3pages.pdf` and the
café `docs/qa/v1-basics-baseline/fixtures/photos/sized/menu-of-the-garden-caf-2023-05-21.jpg` pushed as
`בית קפה הגינה תפריט.jpg`. The founder's 9-page file is called "the founder's 9-page file" below. Files go in through
the dev `attach: <name>` door. The system file picker was not driven.

**No store upload.** Nothing went to TestFlight, App Store Connect or Play.

## One session, cool then hot

00:31 → 01:52 in one app process (pid unchanged). J1, J2 and the constitution J3 ran cool. From the founder's file
(00:52) on, *"Slowing down to keep the phone cool"* was in every dump: those timings are **throttled**. The phone
reported two memory warnings (UIKit *"Received memory warning"*, from the phone's own log archive) at **01:28:26 and
01:30:20**, both inside J6. The live syslog capture died at 01:20:58 (pymobiledevice3: connection terminated); a filtered
restart got no React lines, an unfiltered one from 01:34:45 did. So J5c's end and all of J6 have no app log lines;
J6 is read from the screens, the memory samples and the phone's log archive.

## Numbers

Send → end is from `send` to the answer's end in the bridge steps. Memory is the app's `physFootprint`, sampled every
2 to 4 s.

| turn | Send → end | parts | memory |
|---|---|---|---|
| J2 Fast 1.28 GB from the vault | ≈ 35 s from the tap to *Installed* | | |
| **J3** Fast, constitution, "Summarize it" (cool) | ≈ 165 s | reading 164.5 s (`[rag] whole-file … 164514 ms`) | |
| J3 constitution "Thanks" / "shorter" / "more" / "make it 3 bullet points" / "translate it to French" | 9.6 / 21.4 / 96.7 / 27.7 / 39.5 s | | |
| **J3** Fast, the founder's file, "Summarize it" (hot from here) | ≈ 131 s | reading 130.7 s | |
| J3 founder's file "Thanks" / "shorter" / "more" / bullets / French | 3.3 / 16.4 / under 1 / 5.6 / 8.4 s | | |
| **J3** founder's file, the held question → Download → answer | ≈ 108 s | card gone 14.2 s, three files re-embedded ≈ 45 s | |
| J3 the same question again in that chat | 41.1 s | | |
| J3 constitution "What does it say about treason?" ×2 | 39.7 s / 54.0 s | ttft 29.0 s, 2,242 prompt tokens (the second) | |
| **J5** Instant `sign-scan.pdf` / café | 11.7 s / 9.8 s | `imageMaxTokens` **1024** both | |
| **J5** Fast café: pack 668 MB | pack gone 19.1 s after Download; first token 34 s later; answer done at 67.8 s | | 568 → **1,309** MB |
| **J6** the 600-word story after a photo turn on Fast | 153.5 s | | up to **1,357** MB |
| J6 "Give it a title." / "Make the title shorter." | **70.4 s** / 14.4 s | memory warning 1 at 01:28:26, at the end of the title turn | 1,340 → **676** MB at 01:28:33 |
| J6 the photo again | ≈ 48 s | memory warning 2 at 01:30:20 | 739 → 460 → 714 MB (01:30:27 → 01:30:55) |

Peak of the whole pass: 1,372 MB.

## The rows

| row | result | what the phone showed | evidence |
|---|---|---|---|
| J1 new user → Instant | **pass** 52/52 | Welcome, the model step naming `models.inbornapp.com`, chip INSTANT; "Hi" → *"Hi! I'm here for small talk too. What's on your mind?"*; Chats and back; "What can you do?" → *"I can chat, write code, and help with various tasks…"* | `J1-00` … `J1-05` |
| J2 Fast from the vault, then a new chat | **pass** 38/38; **note** | *Installed* ≈ 35 s after the tap. The new chat opens on **INSTANT** again (as in builds 38 and 39). Model sheet INSTANT "In use", vault Fast "Installed": they agree here | `J2-00a…c`, `J2-01-new-chat`, `J8-01-model-sheet`, `J8-02-vault` |
| **J3 134G, the constitution** | **pass** | Summary on Fast. "Thanks" → *"That's great to hear!…"* (`plain=acknowledgement window=3/3`). **"shorter" → a one-paragraph summary of the Constitution** (`plain=follow-up window=3/5`: the thanks pair dropped). "more" → the bullet summary extended, ending *"Summary extended to include all specific clauses."* (7/7). "make it 3 bullet points" → **3 bullets** (9/9). "translate it to French" → *"Voici une traduction de la liste en trois points…"* with the 3 bullets in French (11/11). No card, no none-matched line, no SOURCES, no `[n]` in the visible parts of the reworks | `J3-02` … `J3-07`, `raw/result-j3-constitution-r2.json` (errors list holds the `[chat]` lines) |
| J3 summary chips (133A) | **note** | The constitution summary's first section reads *"(Pages 1–2)"* without `[1]`, so its chips are `[2] p.3–4`, `[3] p.5–6`, `[4] p.7–9`: no p.1–2 chip. On the founder's file all four chips show, `קובץ.pdf · p.1–2` … `p.8–9` (134F holds) | `J3-02-summary`, `private/P3-02-*` |
| **J3 134G, the founder's file** | **FAIL** (shorter, more); **pass** (bullets, French) | The same five `[chat]` lines as the constitution (3/3, 3/5, 7/7, 9/9, 11/11), so the windows are right. But **"shorter" → *"Your documents don't mention this."*** and **"more" → *"Great! Let's make it even shorter. What do you want to add?"*** "make it 3 bullet points" → 3 bullets of the file's content; "translate it to French" → the 3 bullets in French. No card on any of them | `private/P3-03` … `P3-07` |
| J3 134G watch: stray `[n]` in reworks | **seen once** | J9 on Instant: after "great, thanks", "shorter" reworked the impeachment answer and kept *"…removed from office [4]."* with no SOURCES under it | `J9-23-thanks`, `J9-24-shorter` |
| **J3 134B, the founder's file** | **pass** | "What does it say about deleting my information?" → the **468 MB card** → Download → the held question **answered with passages**. `[rag]`: both asks of the held turn **`hits=6 used=6`**, the same six cosines **0.826–0.845** as build 39; the same question again: the same two lines | `private/P3-08-*`, `P3-09-again` |
| J3 constitution "What does it say about treason?" | **pass** 44/44 | Before the index model: the 468 MB card, Cancel (J8). After: twice in the summary chat, both turns' two asks identical (`hits=6 used=5`, top `cos=0.886`), answered with chips p.2, p.7, p.2, p.3 | `J8-03-card`, `J8-03-cancelled`, `J3-08-treason`, `J3-09-treason-again`, `raw/syslog-app-react.txt` |
| **J4 134H + 134D, Ask sheet, Fast** | **pass** for the instruction leak; **note** for opener-only | Turbine report: "Who wrote this report?", "…about the moon?", "…about chocolate cake?" → *"Your documents don't mention this."* only; "Who won the 2018 World Cup?" → the opener **plus** *"The 2018 FIFA World Cup was won by France."* Constitution: **"Who wrote this report?" → *"I do not have access to the user's files or any reports they may be referring to, so I cannot identify who wrote them. Your documents don't mention this."***; moon → opener; cake → *"Your documents don't mention chocolate cake."*; World Cup → opener plus *"…France won… against Croatia with a score of 4-3 after extra time"* (wrong: 4–2, no extra time). No answer contains *"If you do not know…"*, *"say only the opening"*, *"Start with"* or *"were searched"*. "thank you" → *"You're welcome. Ask another question about these documents."*; "And now" → *"This sheet answers one question at a time…"*; "Who can veto a bill?" → a search, chip `[3] … p.3` | `J4F-t-*`, `J4F-c-*`, `raw/result-j4-sheet-fast.json` |
| **J4 134H + 134D, Ask sheet, Instant** | **pass** for the instruction leak; **note** for opener-only | Seven of eight no-match answers are the opener only. The World Cup on the constitution: opener plus *"The 2018 World Cup was held in Qatar… a match between France and Saudi Arabia."* (invented). Thanks / And now lines as on Fast. Veto → chips p.3, p.4 | `J4I-t-*`, `J4I-c-*` |
| J5 132B, Instant scan and café | **pass** | Scan: the yellow wall and the *"КАРАСАЕВ"* sign, `imageMaxTokens` 1024; café: *"A chalkboard menu on a brick wall displays food options…"* (no invented name this time), 1024; "and the colours?" and "thanks" answered | `J5-01` … `J5-05` |
| J5 Fast café with the pack | **pass** 54/55 (the fail is a harmless close) | Pack card → Download → *"…likely belonging to a cafe or restaurant named "The Garden Cafe Hove"…"*, chip FAST; "and the colours?" answered | `J5-06` … `J5-09` |
| **J6 134E, story right after a photo turn on Fast** | **FAIL: the memory branches ran, not as expected** | Photo, then the story (complete), on a hot phone. **Warning 1 (01:28:26)** at the end of "Give it a title.": *"The Keeper of Cape Hatteras"* shown complete (70.4 s), no stop line, no banner; memory fell by 664 MB (the photo pack); "Make the title shorter." → *"The Keeper"* on FAST: model kept. Chats, Settings and back with no banner. **Warning 2 (01:30:20)**, 114 s later, during the photo sent again: FAST (ledger: FAST, context 1,176) answered **"The image shows a lighthouse keeper standing on the weathered iron railing of a lighthouse at Cape Hatteras…"**, so the picture was not seen and the answer describes the story; then the chip is **INSTANT** with no notice and no "Ran out of memory" line. J6b on Instant: the café photo → **"This device has no photo model installed, so I could not look at the picture. Download the photo pack, then send it again."** with the banner **"Photos need the photo pack · Open the vault"**, although Instant's pack is in the app; the next turn, "What colour is the wall?" → *"…a deep, textured red."* (the picture seen) | `J6-00` … `J6-07`, `J6b-00` … `J6b-02`, `raw/mem-0121-0152.txt` |
| J7 settings, vault, Stop | **pass** 61/62 (the fail is `assertText` on the first answer, not the last) | Settings, vault (Best for *Chat*); the story stopped after 4 s: text so far + *"Stopped · Continue"*; "What is the capital of France?" answered; "Why is it the capital?" answered (with invented history: *"Napoleon… elevated Paris to the capital of France in 1802"*); Chats and back | `J7-01` … `J7-06` |
| J8 text PDF held for the index model | **pass** | Before the index model: "What does it say about treason?" → the **468 MB card**; Cancel | `J8-03-card`, `J8-03-cancelled` |
| J8 Redact row, tallest composer | **pass** | A draft with a name and phone number adds the Redact row; the last answer's end stays above both rows | `J8-04-tallest`, `private/P3-10-tallest` |
| J8 model sheet vs vault "In use" | **agree** in J2; **disagree** in J9 | After the J6 switch: model sheet INSTANT "In use", vault FAST *"Loaded"* with "In use" | `J8-01`, `J8-02`, `J9-12`, `J9-13` |
| J8 Hebrew bubble | **pass** (layout); **note** (answer) | "מה בירת צרפת?" is right-aligned with the "?" at the sentence end (left), the answer and its label RTL; the card *"INSTANT is weak in Hebrew"* shows. The answer is nonsense (*"the capital of France is a small hotel on the Russian coast"*); "תודה" answered in Hebrew; "What is the capital of Italy?" in the same chat is answered in Hebrew, also wrong | `J8-05-hebrew`, `J8-06`, `J8-07-english` |

## Findings (for build 41)

1. **A rework of a file summary is replaced by "Your documents don't mention this."** On the founder's file, "shorter"
   after "Thanks" got exactly that string, and "more" then reworked it (*"Great! Let's make it even shorter. What do you
   want to add?"*). The `[chat]` windows were right (3/5, 7/7). Likely cause, by reading the code: `Chat.tsx:893`
   replaces any reply with no passages behind it that `claimsFileContent` (round 130A: *"the document outlines /
   describes / states…"*) with `documents.opener.nothingRelevant`, and a follow-up rework never has passages. The
   constitution's rework escaped because it opened *"The Constitution establishes…"*. Not proven on the device: a probe
   (`p5`, private) sent "shorter" after a sourced answer in the same chat, the engine's reply had no such phrase and was
   shown as written; the turbine report (`J3d-*`) did not trigger it either (*"This report confirms…"*).
2. **134E on the phone: the second memory warning gives a photo answer without the photo, then a silent switch.**
   Warning 1 dropped the projector and kept Fast (as designed), with nothing on screen. Warning 2, 114 s later, came
   during a new photo turn: Fast described a picture it did not get (the story's lighthouse), and the chat moved to
   Instant with no notice. On Instant the next photo was refused as *"no photo model installed"* with *"Photos need the
   photo pack · Open the vault"* although Instant's pack is bundled; one turn later it saw the picture. The vault kept
   showing Fast as loaded and in use.
3. **134H: no instruction text in 16 sheet answers, but 3 are not opener-only.** Fast prefixed the constitution's "Who
   wrote this report?" with *"I do not have access to the user's files…"* (meta text, not caught: it repeats fewer than
   5 words of the prompt). The World Cup question got the opener plus a general-knowledge answer on Fast (both files)
   and on Instant (constitution), with wrong facts.
4. **A missing first attach says "not finished reading".** The first attach of the constitution (00:35) made a library
   row *"? · 0 B · Inborn could not find that file where it was saved · Resume"* (no copy in `Documents/documents`,
   status failed/missing). The chat's summary then said *"Inborn has not finished reading the file attached to this chat.
   Open Documents to see where it stopped."*, which does not match the row. The source probably was not on disk when
   imported (harness: the push reported rc 0); after a re-push the same attach worked. The dead row stays in Documents.
5. **A made-up source.** In the constitution chat on Instant, "Give me a quick recipe for pancakes." came with the chip
   `[1] constitution-9pages.pdf · p.6` (`J9-25`).
6. **"Give it a title." took 70.4 s** on a hot phone (61 s cool in build 39); memory warning 1 came at its end.
7. Summary chips depend on the model's `[n]`: the constitution summary had no p.1–2 chip (`J3-02`).
8. Still there from build 39: the "FAST is better at documents" card right after "Not now" (`J5-02`); the "Draft a
   message" chip is an unfinished sentence (*"Draft a short, friendly message that"*) and adds a Redact row
   (`J9-10`); "INSTANT · OUT 1.27 KB" in the Chats footer (`J9-14`); the vault's "~15-24 tok/s on your phone"
   (`J9-13`); duplicate chip labels (`p.2` twice in `J3-09`, `p.3` twice on the founder's file); invented facts (*"Senate
   (100 senators)… House (435 representatives)"* in the constitution reworks, Napoleon 1802, the World Cup scores);
   Documents not reachable from Chats (`drawer-documents` not mounted, J9 step 117); the attach sheet titled "Attach
   documents" opens on Templates (`private/J9-04`). On Instant, "translate it to French" after a not-found answer and a
   thanks gave *"C'est l'expression que vous avez utilisée."* (`J9-09`).
9. Harness: the driver died twice on `devicectl` transfer errors (CoreDeviceError 7000, connection interrupted), after
   P3-10 and after J9-16. The runs finished on the phone; P3's last steps were acknowledged by hand (`finish.sh` in the
   run log) and both reports were copied from the container. J9-17 to J9-19 (Settings, paywall) were not taken. The
   live syslog capture also dropped once (see above).

## Build 39's open items, rechecked

| # | build 39 item | build 40 |
|---|---|---|
| 1 | 134A follow-up applied to the thanks | **fixed on the constitution** (all four reworks); on the founder's file "shorter"/"more" fail differently (finding 1) |
| 2 | "make it 3 bullet points" / "translate it to French" take the file route | **fixed**: follow-ups, no card, no search, on both files |
| 3 | Ask sheet leaks *"If you do not know the answer for sure, stop after that sentence."* | **fixed**: 0 of 16; one meta prefix and three extra answers remain (finding 3) |
| 4 | Hebrew bubbles LTR | **correct** (as round 134H said): right-aligned, "?" at the left end |
| 5 | "Give it a title." 61 s | 70.4 s, hot (finding 6) |
| 6a | second advice card after "Not now" | **still there** |
| 6b | "Draft a message" chip unfinished + Redact row | **still there** |
| 6c | "OUT … KB" footer | **still there** |
| 6d | vault "~15-24 tok/s" | **still there** |
| 6e | Documents "Free: 1 document" text | **not checked** (the Documents screen was not opened from J9: no drawer entry) |
| 6f | duplicate chip labels | **still there** |
| 6g | invented facts | **still there** |
| 6h | Documents not reachable from Chats | **still there** |

## What did not match the brief, or is not proven

1. J3 ran twice on the constitution: the first attach failed (finding 4), the second run is the tracked one
   (`result-j3-constitution-r2.json`; the first is `result-j3-constitution.json`).
2. 134E: the brief's expected path (one honest stop with Continue, model kept, no banner, next message answered) was not
   what happened (finding 2). The app's `[device]` lines for J6 are lost (the capture had died); the two warnings and
   their times come from the phone's log archive, the drop of the projector and the switch from the memory samples
   and the screens.
3. Rework texts are read from screenshots: the bridge dump keeps one node per testID, so only the visible part of a
   long rework could be checked for `[n]`.
4. Extra runs not in the brief: `J3d-*` (turbine report reworks, an isolation attempt for finding 1), `p5` (private
   probe), `J6b-*` (the photo after the switch).
5. Not walked: the system picker and keyboard, Stop in the Ask sheet, Settings and the paywall in J9 (lost to the
   harness), Android.

## Past the goal

Every journey went 2–3 steps past its goal: J1 "Hi" → Chats and back → "What can you do?"; J3 the four reworks after a
thanks, the held question with Download, the same question twice, the tallest composer, Chats and back; J4 thanks,
"And now", veto after the four no-match questions on two files and two models; J5 "Not now", "and the colours?",
"thanks"; J6 the title, a shorter title, Chats/Settings and back, the photo again, then J6b on the switched model and a
question about the picture; J7 a second question and Chats and back; J8 thanks and an English question after the
Hebrew one. Findings 1, 2, 3 and 5 were found there.

## Exploratory (J9, 01:38 → 01:50, a new user's wander on Instant after the switch)

Small talk, "Is coffee bad for you?", the paperclip and its sheet, the turbine report (serial number, chip p.1),
"Who wrote this report?" (*"Your documents don't mention this."*), "thanks!", "translate it to French", the Draft chip,
the model sheet and the vault, Chats; then the turbine report in the Ask sheet (opener and the none-matched line only),
the constitution chat from the list ("What does it say about impeachment?" answered with chip p.6), "great, thanks",
"shorter", a pancake recipe, "make it 3 bullet points". Screens `J9-01` … `J9-26`. What looked wrong: findings 2, 5, 8.

## End state

- `com.inbornapp.mobile.qa` was installed fresh at 00:30:59, launched before any push, and uninstalled at 01:51:58,
  rc 0. `devicectl device info apps` then lists the store app **1.0.0 (39)**, untouched, and the other session's
  `com.inbornapp.mobile.uitests.xctrunner`, not touched.
- The phone was unlocked at every check and was never locked or unlocked by this pass. No setting was changed, no
  account touched. No simulator, no XCUITest runner, port 8787 not touched. Every driver, build, memory sampler and
  syslog capture this pass started has exited.

## Handover: update (01:56–01:57)

- Before: store app 1.0.0 (39). Its data container held `Documents/models/vault.json` (826 B), the Fast gguf
  (1.19 GB), one document (111 KB), `documents.json`, the prefs files and `SQLite/inborn.db` (4 KB) + wal (1.1 MB) + shm
  (32 KB), the chats. No index model and no photo pack.
- `devicectl device install app` of `Inborn-40.xcarchive/Products/Applications/Inborn.app` (com.inbornapp.mobile,
  CFBundleVersion 40): 01:56:33 → 01:56:54, rc 0. `device info apps` lists com.inbornapp.mobile **1.0.0 (40)**.
- One launch at 01:56:55, no taps.
- After the launch, every file is there with the same size: vault.json 826 B, the Fast gguf 1.19 GB, the document
  111 KB, inborn.db 4 KB + wal 1.1 MB + shm 32 KB. Only the modification times of vault.json, the shm, `licence.bin` and
  `device-prefs.json` moved to 01:56 (the launch).
- First screen: a new chat on FAST, "Nothing leaves this phone." with the three starter chips
  (`screens/S01-store-first-screen-40.png`). The app is left running there.
- No setting changed, no lock/unlock, no sign-in, the xctrunner was not touched, and nothing was uploaded.
