# iPhone 13 Pro device pass on build 1.0.0 (41): rounds 134I, 134J and 134K on the phone — 7.10.2026

Build 41 (`docs/qa/ios-build-41-2026-10-07.md`) carries round 134I (reworks keep the summary's sources, an answer that
used no passage shows no chip), 134J (a memory switch during a photo turn) and 134K (the Ask sheet shows the opener at
once when no passage matched). All three were proven on simulators. This pass walks them on `<device>` with the `.qa`
twin built from the same commit, d827b216, on a fresh install, together with the earlier regressions. Fast, the index
model and Fast's photo pack were downloaded from `models.inbornapp.com` during the pass. The store app was not
touched. Evidence is in `docs/qa/ios-device-pass-41/`:

- `screens/` holds every committed screenshot (`jN-MM.png`, plus 500 px `sm-*` copies), `journeys.md` (what each
  screenshot shows, journey by journey) and `build.txt`. The ready-gate script passes on this folder (7 journeys).
- `raw/` holds each run's `result-*.json`, driver log and `devrun-*.json` (the engine's numbers for the run's last
  turn), the gates, the archive and twin checks, the memory samples (`mem-*.txt`), the app's React log lines without
  the founder's file (`syslog-app-react.txt`), `j5-loop-screenshot-names.txt` and `NOTES.txt` (the run log, Mac time).
  Dump nodes that named the founder's file (the Documents list mounted under the Ask sheet, the Settings screen) were
  removed from the results.
- `scripts/` holds the bridge scripts, `make-scripts.py` and `names.json`. `DOCID`, `CHATF`, `HISCHAT` and `CHAT5`
  were filled in by the shell.
- `private/` is in `.gitignore`. It holds every screenshot, result and log of the founder's 9-page file (`p3-*`,
  `p3i-*`), the Chats/Documents dumps used for ids and the Documents screen (`p7-*`). None of it is committed.

Fixtures: `docs/qa/r132-doc-summary/fixtures/constitution-9pages.pdf`, `docs/qa/r132-picture-budget/fixtures/sign-scan.pdf`,
`docs/qa/acceptance/fixtures/turbine-report-3pages.pdf`, the café photo pushed as `בית קפה הגינה תפריט.jpg`, and five
photos from `docs/qa/v1-basics-baseline/fixtures/photos/sized/` under short names (dogs, mug, street sign, receipt,
nutrition label). The founder's 9-page file was pushed under a neutral name and is called "the founder's file" below.
Files go in through the dev `attach: <name>` door. The system picker was not driven.

**No store upload.** Nothing went to TestFlight, App Store Connect or Play.

## One session, hot from the start

The twin launched at 02:56 (Mac time; the phone's clock reads 10 h ahead in the screenshots, 17:00 = 03:00), and the
app process (pid unchanged) ran every journey until 04:50. *"Slowing down to keep the phone cool"* was on screen from
the first minutes (`j6-01`, 03:00), so every timing is **throttled**. At 04:36 the phone reached *"Stopped to protect
the phone · Continue when cool"* and stayed there for the rest of the pass. One real memory warning came, at
**04:26:44**, during J7 (below). The live syslog capture ran from 02:56 to 04:35 with one automatic restart (03:51)
and again 04:37 to 04:50.

## The rows

| row | result | what the phone showed | evidence |
|---|---|---|---|
| J1 new user → Instant | **pass** | Welcome, the model step naming `models.inbornapp.com`, chip INSTANT; "Hi" → *"Hello! How can I help you today?"*; Chats and back; "What can you do?" answered | `j1-01` … `j1-07` |
| J2 Fast from the vault, then a new chat | **pass**; **note** | Fast installed. The new chat opens on **INSTANT** (as in builds 38–40). Model sheet INSTANT "In use", vault Fast "Installed": they agree. Later in the pass, new chats opened on FAST once Fast had been used (`j6-14`, `j7-01`) | `j2-01` … `j2-06` |
| **J3 134I, the founder's file, Fast** | **pass** | Summary with four chips p.1–2 … p.8–9. "Thanks" → a thanks. **"shorter" → a one-paragraph summary WITH the four chips** (build 40: *"Your documents don't mention this."*). "make it 3 bullet points" → 3 numbered points, four chips. "translate it to French" → French, four chips. Pancakes (the index card came here and was downloaded) → **no chip, the none-matched line**, the answer a half refusal. The real question → chip p.3. The second ask, in the reopened chat, ran on Instant (the chat reopened on INSTANT) → chip p.3 again | `private/p3-03` … `p3-10`, `p3-13` |
| **J3 134I, the founder's file, Instant** | **pass** | New chat: summary with four chips; "shorter" and "3 bullet points" keep the four chips; pancakes → a recipe, no chip, the none-matched line (`[rag] used=3`, the grounding share test dropped them) | `private/p3i-03` … `p3i-06` |
| **J3 134I, the constitution, Fast** | **pass** for the reworks; **FAIL** for pancakes | Reworks: "shorter" chips [2] [3] [4], bullets [1]…[4], French [2] [3] [4], no `[n]` without a chip on screen. **"give me a pancake recipe" → a Constitution answer (Succession, Vice President, Inferior Officers, State of the Union) with chips p.5, p.6 and no none-matched line**. `[rag] strict=false hits=6 used=2`, both kept on `terms=1 bm25=2.93/2.89` with `cos=0.000`: one shared word, "give" ("give their Votes", "give… Information of the State of the Union"). The model wrote about the passages it got, so the chips are honest for that answer, but the user asked for pancakes. Veto twice → chips **p.3, p.3** (duplicate) | `j3-03` … `j3-10` |
| **J3 134I, the constitution, Instant** | **pass** | Four chips on the summary, shorter and bullets; pancakes → a recipe, no chip, the none-matched line (same `used=2` search) | `j3-13` … `j3-16`, probe `j3-17` |
| **J4 134K, Ask sheet, Instant** | **pass** | World Cup, moon, "Who wrote this report?" → *"Your documents don't mention this."* only, `search 92–114 ms · 0 passages`, no `tok/s`, no `ask-answer` node. Veto → answer + chip p.3, `4 passages · answer 5666 ms · 5.8 tok/s`. Strict on (switch `checked: true`) → the same opener, 0 passages (`[rag] strict=true used=0`). "thank you" / "And now" → the plain lines | `j4-01` … `j4-08` |
| **J4 134K, Ask sheet, Fast** | **pass** | The same, `search 93–145 ms · 0 passages`; veto `answer 18984 ms · 7.4 tok/s`, chip p.3 | `j4-09` … `j4-16` |
| **J5 134J, the hot phone** | **not reproduced** (the switch); **partly seen** (warning 1) | 5 rounds over 30 min (03:54–04:24) of story + title + a new photo on Fast with its pack: footprint 1,292–1,389 MB, **no warning** (`raw/mem-j5-0352-0425.txt`). Every new photo was read on Fast (dogs, mug, sign, receipt, label). Then **one real warning at 04:26:44** during J7 on Fast (the sleep-tips turn, a chat with no picture): UIKit *"Received memory warning."*, then `[device] memory warning: releasing the picture projector, keeping the model`, footprint 1,395 → 734 MB, Fast kept, the answer finished, no switch, nothing on screen (none expected: that chat had no picture). Back in the J5 chat at 04:36 the quiet line was not shown (the eased state clears after 30 s of healthy memory), and the new photo turn was stopped by **heat** (*"The system stopped generation · Continue"* under *"Stopped to protect the phone"*). The run's last turn (the follow-up "what colour is the table?", `devrun-j5e/j5f`) shows `model fast`, `imageMaxTokens 1024`, `prompt_n 2551` in 77 s of prompt work: the pictures were in the prompt, so Fast's pack was attached again, and 0 tokens came out. A retry 8 min later was stopped the same way. Warning 2, the switch to Instant, the banner, the absence of the "Switch to FAST" card under it and the model sheet / vault after a switch were **not reached** | `j5-01` … `j5-30`, `raw/syslog-app-react.txt`, `raw/devrun-j5f-retry.json` |
| J6 index card + Cancel | **pass** | The 468 MB card; Cancel keeps the chat and the file and puts the question back in the composer; "thanks" then got *"I'm glad you said goodnight! How about we try another game tonight?"* on Instant | `j6-01` … `j6-03` |
| J6 Stop | **pass** | The story stopped after 4 s: text so far + *"Stopped · Continue"*; the next questions answered | `j6-07` … `j6-09` |
| J6 pictures, Instant | **pass** | Scan: *"A weathered sign… "КАРАСАЕВ"… "КОЧЕСУ""*; café: a chalkboard menu; "and the colours?" answered; the "FAST sees pictures better" card | `j6-10` … `j6-13` |
| J6 pictures, Fast | **pass** | Café: *"…The Garden Cafe Hove…"*; colours answered; the scan (rerun, `j6f`): *"a weathered blue sign… "КАРАСАЕВ" and "КЕЧЕСУ""* | `j6-15` … `j6-17`, `j6-23`, `j6-24` |
| J6 tallest composer | **pass** | File row + Redact row; the last answer stays above both | `j6-04` |
| J6 Hebrew → English | **pass** (layout); **note** (language) | The Hebrew bubble right-aligned with "?" at its left end, the answer RTL, *"בירת צרפת היא פריז."*, the SHARP Hebrew card. "What is the capital of Italy?" in the same chat → answered in **Hebrew** (*"בירת איטליה היא רומא."*), as in build 40 | `j6-18`, `j6-19` |
| J6 model sheet / vault / Settings | **pass** | Sheet: FAST in use; vault: Fast "Loaded · In use"; Settings opens | `j6-20` … `j6-22` |
| J7 exploratory | **done**, findings below | 04:25–04:34 driven (`j7a`, `j7b`, `j7c`) plus the Documents screen (private `p7`) | `j7-01` … `j7-31` |

## Findings (for build 42)

1. **A test on `main` fails** (gates): `apps/mobile/test/fixes-r131-picture.test.ts:64` expects the pre-134J
   `cardAdvice` line; `Chat.tsx:1373` now has `&& !memorySwitched` (commit 44049c67). Only the guard is stale.
2. **An off-topic request in a file chat can be answered from the file, with chips.** Constitution chat on Fast,
   "give me a pancake recipe" → a Constitution answer with chips p.5, p.6 and no none-matched line (`j3-08`). Repro:
   attach `constitution-9pages.pdf`, summarize, then send the pancake request on Fast. Cause: the search kept two
   passages on a single lexical hit (`terms=1`, `cos=0.000`) for "give". The 134I share test then rightly grants the
   chips, because the model wrote from those passages. The weak point is upstream, in the retrieval's lexical keep
   (`packages/core/src/rag`, the `terms`/bm25 path of the `[rag]` log line). The same search on Instant (`used=2`)
   and on the founder's file (`used=3`) gave recipes with no chip.
3. **Fast's bullet list clipped a line** (founder's file, private `p3-06`). Item 1 of "make it 3 bullet points" was cut
   at the right edge mid-word after its second line, with blank space under it. Not seen on the constitution
   (`j3-06`). My reading: a Text measured at one width and drawn at another in `components/chat/Markdown.tsx`'s list
   item (`listBody: { flex: 1 }`, :252). Not proven; seen once.
4. **Reopening a chat from Chats does not restore its model.** The founder's Fast chat and the constitution's Fast
   chat both reopened on INSTANT (the engine's current model): `p3-13`, `j3-17`. Repro: two chats on two models, then
   open the older one from the list.
5. **Answers that echo system lines (probe a): 3 of the 6 general questions in J7a.** *"hey! what is this app?"* →
   *"I cannot identify this specific app… they generally operate in safety guidelines that keep users harmless"*
   (`j7-02`); *"who won the last football World Cup?"* → *"I cannot know the current date or real-time sports
   results"* (`j7-06`); the Draft chip → *"I can't know the specific context…"* (`j7-09`). The weather answer
   (`j7-03`) is a fair use of the same line. The build 40 *"safe for family consumption"* ending did not come back
   (pancake recipe `j7-04` clean). Also: the app does not know it is Inborn (`j7-02`).
6. **Invented facts (probe d)**: *"inspected by the manufacturer"* for the turbine (`j7-18`, the file has no such
   line); "make it a short email to my boss" wrote an email *asking* the boss for the serial number it had just found
   (`j7-20`); Instant's Rome plan: *"free Vatican Museums"*, *"you can afford only 270€"* (`j7-29`); *"mimic the
   sounds of sleeping… ask another trusted adult"* (`j7-07`); Instant's thanks *"…you said goodnight!…"* (`j6-03`).
7. Still there from build 40: the "Draft a message" chip is an unfinished sentence (*"Draft a short, friendly message
   that"*) and adds a Redact row (`j7-08`); the "Summarize text" chip also adds a Redact row with no personal data in
   it (`j7-22`), and so does "What is the serial number of the turbine?" (`j6-02`); "FAST · OUT 1.27 KB" in the Chats
   footer (`j7-12`); "~15-24 tok/s on your phone" in the vault (`j7-11`); duplicate chip labels (p.3, p.3 in `j3-09`);
   **Documents not reachable from Chats** (probe c: the footer has Personas, Memory and Folders; `drawer-documents`
   is not mounted, `j7-13`); the English question after a Hebrew one answered in Hebrew (`j6-19`).
8. **A first-attach failure still leaves a dead row and a misleading line** (build 40 finding 4). The first file of
   the push loop never landed on the phone, although `devicectl` returned 0, in build 40 and again here (the
   constitution, `raw/NOTES.txt` 03:16). The attach then made a library row *"constitution-9pages.pdf · ? · 0 B ·
   Inborn could not find that file where it was saved · Resume"* that is still in Documents, and the chat said
   *"Inborn has not finished reading the file attached to this chat. Open Documents to see where it stopped."*
   (`j3-00`). The harness part is ours; the app should not import a path that does not exist.
9. **(Probe b) no advice card under the memory banner** could not be checked: the banner never appeared (no warning
   2). Under the thermal banner no advice card was shown (`j5-03` … `j5-06`).
10. **(Probe e) no crash, no hang, no empty answer** in the session (one pid from 02:56 to 04:50). The two empty
    turns at the end were the heat stop's, with its own line.
11. The long J5 chat showed *"This chat is getting long. Summarize the beginning to keep going."* (`j5-03`), and one
    Fast answer about the nutrition label left a raw `**Barcode Number` (unclosed bold) on screen (`j5-03`).

## Harness notes

- **The QA tier stayed Pro after J4.** `setTier free` reported ok, but Settings and the paywall then said *"You own
  Pro"* (`j7-14`, `j7-15`) while the model sheet still showed the Pro upsell (`j7-10`). Cause: `LicenceManager.
  pretendTier(null)` (`packages/core/src/licence/manager.ts:350`) clears `pretend` but calls `set({})`, which keeps
  the pretended `entitlement.tier` already written into `_state`. Dev builds only; but J5, J6 (from Stop on) and J7
  ran with a licence state that said Pro. No Pro-only feature was exercised there except what is noted.
- A race in my first script: after the index-card Download, the held answer had not started when the step waited for
  "stop gone", so the founder's file's second ask was typed during the answer and not sent; fixed in
  `make-scripts.py` (wait for the answer to start), and the ask was run again (`p3b`). The same race made `j6-14`
  (Fast scan) a mid-stream shot; `j6f` reran it.
- `value` steps read the first mounted node of a testID, so the `assistant-text` values in the results are the
  chat's first answer; screenshots are the evidence for each turn.
- `j5c-photo-3-4`'s result was pulled by hand after the driver reported no result in 118 s.

## What did not match the brief, or is not proven

1. **J5 / 134J on the phone**: warning 2, the mid-turn switch, the "Ran out of memory · Switched to Instant ·
   SWITCH BACK" banner, the photo answered on INSTANT, the missing "Switch to FAST" card, the model sheet and vault
   after a switch, and the banner's retirement: **not reproduced on the phone tonight**. Warning 1's projector release
   with Fast kept **was** seen (log + footprint). The quiet line was not seen (the only warning came in a chat with no
   picture), and the turns after the new photo carried the pictures with the pack attached but were stopped by heat before any token.
2. The founder's file's second real question ran on Instant, not Fast (finding 4).
3. J3's constitution run on Fast is r2: r1's attach failed (finding 8), `raw/result-j3-constitution-fast-r1.json`.
4. Exploratory driving was about 10 minutes (04:25–04:34 plus the Documents look), not 15.
5. Not walked: the system picker and keyboard, Stop in the Ask sheet, the handover, Android.

## Past the goal

Every journey went 2–3 steps past its goal: J1 Chats and back, "What can you do?"; J2 the new chat, the model sheet,
the vault; J3 after the reworks the pancake request, the real question twice; J4 strict on, thanks, "And now"; J5 a
new photo after every heat round, then the J5 chat after the warning with a new photo and a follow-up; J6 thanks
after Cancel, the tallest composer, Chats and back, two questions after Stop, "and the colours?" after each picture,
English after Hebrew; J7 follow-ups after each answer. Findings 2, 4, 5 and 6 were found there.

## End state

- `com.inbornapp.mobile.qa` 1.0.0 (41) was installed fresh at 02:56:26 and launched before any push. It stayed
  installed through the pass for the lead's comparison and was uninstalled after the handover (below).
- The phone was unlocked at every check and was never locked or unlocked by this pass. No setting was changed, no
  account touched. No simulator, no XCUITest runner, port 8787 not touched. Every driver, build, memory sampler and
  syslog capture this pass started has exited.

## Handover: update (04:47–04:49)

- Before: store app 1.0.0 (40). Its data container held `Documents/models/vault.json` (826 B), the Fast gguf
  (1.19 GB), one document (111 KB), `documents.json` (144 B), the prefs files and `SQLite/inborn.db` (4 KB) + wal
  (1.1 MB) + shm (32 KB), the chats. No index model and no photo pack.
- `devicectl device install app` of `Inborn-41.xcarchive/Products/Applications/Inborn.app` (com.inbornapp.mobile,
  CFBundleVersion 41) over the installed app, no uninstall: 04:48:00 → 04:48:21, rc 0. `device info apps` lists
  com.inbornapp.mobile **1.0.0 (41)**.
- One launch at 04:48:29, no taps.
- After the launch, the same 14 entries with the same sizes: vault.json 826 B, the Fast gguf 1.19 GB, the document
  111 KB, documents.json 144 B, inborn.db 4 KB + wal 1.1 MB + shm 32 KB. Only the modification times of the shm,
  `device-prefs.json`, `licence.bin` and vault.json moved to 04:48 (the launch), as in build 40's handover.
- First screen: a new chat on FAST, "Nothing leaves this phone." with the three starter chips
  (`screens/j8-01.png`; no file name on screen). The app is left running there.
- Then the twin `com.inbornapp.mobile.qa` was uninstalled, 04:49:05 → 04:49:06, rc 0. `device info apps` lists
  `com.inbornapp.mobile` 1.0.0 (41) and the other session's `com.inbornapp.mobile.uitests.xctrunner` (not touched).
- No setting changed, no lock/unlock, no sign-in, and nothing was uploaded.
