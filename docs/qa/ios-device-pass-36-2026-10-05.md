# iPhone 13 Pro device pass on build 1.0.0 (36): round 131 on the phone, then a brand-new user — 5.10.2026

Build 36 carries round 131 to Moshe's iPhone (`docs/qa/ios-build-36-2026-10-05.md`). Round 131 was proven on simulators
and with `llama-server` only (`docs/qa/r131-picture-answers/NOTES.md`, `docs/qa/r131-best-for-multi/NOTES.md`). This
pass walks it on the `.qa` twin built from the same commit, 107f59b9, on the real free tier of a fresh install (no
`setTier` anywhere). At the start `Documents/models` held only `vault.json` (`raw/twin-models-at-start.txt`): no index
model and no downloaded model. Every download came from `models.inbornapp.com`. Then the twin was removed and the store
app was reinstalled clean as a new user. Evidence is in `docs/qa/ios-device-pass-36/`:

- `screens/` holds every committed screenshot at full size, and `sm-*` are 500 px copies.
- `raw/` holds each run's `result-*.json`, driver log and `devrun-*.json` (the engine's numbers for the run's last
  turn), the gates, the archive and twin checks, the `Documents/models` listings, the `[picture-check]` syslog capture,
  the handover record and `NOTES.txt`.
- `scripts/` holds the bridge scripts and `make-scripts.py`.
- `private/` is in `.gitignore`. It holds every screenshot, result, log and answer of Moshe's own PDF, and its grades
  with reasons. None of it is committed.

Fixtures: `docs/qa/r130-pdf-page-vision/fixtures/visual-page.pdf`, `docs/qa/acceptance/fixtures/turbine-report-3pages.pdf`,
and the café `docs/qa/v1-basics-baseline/fixtures/photos/sized/menu-of-the-garden-caf-2023-05-21.jpg` pushed as
`בית קפה הגינה תפריט.jpg`. Moshe's PDF (one page) was pushed as `מסמך.pdf`. Files go in through the dev `attach: <name>`
door (`library.importFile`, as *Add a file…* does). The system file picker was not driven.

**No store upload.** Nothing went to TestFlight, App Store Connect or Play.

## Numbers first

Grades by the rubric of `docs/qa/v1-basics-baseline/README.md` (2 correct, in the user's language, right-sized, nothing
invented; 1 usable with a flaw; 0 wrong, invented, wrong language or useless). One grader.

| Moshe's PDF | sample 1 | sample 2 | sample 3 | "מה אתה רואה?" |
|---|---|---|---|---|
| Instant, "What do you see?" | 1 | 1 | 1 | 0 |
| Fast + pack, "What do you see?" | 1 | 2 | | |

Instant English mean 1.00 (n=3), Hebrew 0 (n=1); Fast 1.50 (n=2). Round 131's offline grid had Instant 0.63 / 0.25
and Fast 1.38 / 0.75 on this page, so the phone sits where the harness said. No answer was a refusal, a meta leak or
an invented citation.

Send to first token on screen = the bridge's `send` step plus its `waitFor assistant-text` (the page plan, render and
import, and the image prefill). "Engine" is `ttftMs` from `dev-run.json`.

| turn | Send → first token | engine ttft | prompt tokens |
|---|---|---|---|
| Instant, Moshe's PDF, sample 1 | **3.63 s** | 1.92 s | 653 |
| Instant, Moshe's PDF, samples 2 and 3 (new chats, KV cache hit) | 1.23 s, 0.97 s | 0.09 s, 0.10 s | 16, 16 |
| Instant, Moshe's PDF, Hebrew | **2.57 s** | 1.65 s | 666 |
| Instant, `visual-page.pdf` (J1b, J4 door) | **3.10 s**, 3.10 s | 1.57 s, 1.59 s | 660, 660 |
| Instant, café photo (sample 1; sample 2 was a cache hit, 0.70 s) | **2.57 s** | 1.69 s | 654 |
| Instant, café photo again in the same chat | (not measured: the waitFor matched the previous answer) | 3.10 s | 1,182 |
| **Fast** + pack, `visual-page.pdf` | **6.30 s** | 5.05 s | 930 |
| Fast, the held turn after the pack landed (from the card closing) | 7.20 s | 4.99 s | 930 |
| Fast + pack, Moshe's PDF, sample 1 (sample 2 a cache hit, 2.32 s) | **7.90 s** | 5.56 s | 871 |

The same picture with the same words in a new chat replays the cached prefix (16 prompt tokens): those samples are
sampled again at 0.3, so their answers differ, but their timing is not a cold prefill. Instant's cold picture turns
are about 1.0 to 1.7 s slower on screen than build 35's (2.0 to 2.6 s); the engine part is the same (1.5 to 1.9 s), so
the extra is in the app's turn before the prefill. Not investigated in this pass.

**`[picture-check]`:** `pymobiledevice3 syslog live -m picture-check` ran from 20:09 to 20:26 over every picture turn
(`raw/picture-check-syslog.txt`). One line: `20:18:32 [picture-check] foreign-source on attempt 1`, inside `j4b-pack`,
Fast's held turn after the pack landed. The answer shown was the second attempt, clean, with SOURCES
`visual-page.pdf · p.1` (`J4-09-fast-answer`). No fault on any Instant turn, and the honest line never showed.

## The rows

| row | result | what the phone showed | evidence |
|---|---|---|---|
| J1 new user, Instant: onboarding | **pass** 23/23 | Fresh install, Welcome, model step with *"1.28 GB · one download from models.inbornapp.com"*, *Start now with Instant*, chip INSTANT | `J1-00-welcome`, `J1-01-model-step`, `J1-02-chat-instant` |
| **J1 Moshe's PDF on Instant** | **pass** 4 × 48/48 | Three new chats with "What do you see?" and one with "מה אתה רואה?". **No 468 MB index card** in any of them, the page picture in the sent bubble, an answer, then the card **"FAST sees pictures better than INSTANT." · "Install FAST · 1.28 GB" · Not now**. Answers: grades above. The English three describe the site and the two faces, each with an invented detail; the Hebrew one is a garbled sentence | `private/` only |
| **J1b `visual-page.pdf` on Instant** | **pass** 48/48 | No index card, the page in the bubble, *"The image displays a webpage for "NORTHWIND," featuring two main sections: one showing four dogs on gravel ground in a photo, and another section with coffee, cookies, and a glass of dark liquid. There's also a button labeled "Continue to checkout"…"*, the advice card | `J1b-1-composer-chip`, `J1b-1-sent-bubble`, `J1b-1-answer` |
| **J2 café photo, plain photo on Instant** | **pass** 49/49 + 49/49 | Thumbnail chip, no paperclip. Sample 1: *"…a brick wall featuring three blackboard windows labeled "WILL THE CAPES/CAFEPHONE COUR"… text in different languages including English, French, German…"* (invented, 0). Sample 2: *"A brick wall with three blackboards displaying menu items written in chalk."* (2). The advice card after both | `J2-1-*`, `J2-2-*` |
| **J2 "Not now"** | **pass** 37/37 | Not now: the card goes. The café again in that chat, *"What is written on the board?"*: an answer about the three boards, **no card** | `J2-3-not-now`, `J2-4-sent-bubble`, `J2-4-answer` |
| **J3 a 3-page text PDF still held** | **pass** 41/41 | Instant, `turbine-report-3pages.pdf`, the serial question: card *"The attached file needs the document index model (468 MB)… Download · 468 MB · Send, exact words only"*. Download: *"Downloading the document index model… 0%. Your message is sent when it's ready."*, the card gone about 10 s later, *"Reading your document before answering…"*, then *"The serial number of the Rakovsky turbine is RK-4417."* with SOURCES `turbine-report-3pages.pdf · p.1` | `J3-01-index-card` … `J3-04-grounded-answer` |
| **J4 Install FAST from the advice card** | **pass** 64/64 | A new Instant chat with `visual-page.pdf`, the advice card, **Install FAST · 1.28 GB** pressed: the vault opens with Fast in view (*Install · 1.28 GB from models.inbornapp.com*). Install, confirm: *"57% · 737 MB of 1.28 GB"* after 15 s, *Installed* 14 s later | `J4-01-answer`, `J4-02-vault-on-fast`, `J4-03-vault-confirm`, `J4-04-fast-downloading`, `J4-05-fast-installed` |
| **J4 the photo pack through the pack card** | **pass** 60/60 | Fast chosen, `visual-page.pdf`, "What do you see?": *"FAST needs its photo pack to see photos · One 668 MB download, then this photo sends by itself. · Download 668 MB · Switch to INSTANT · installed · Remove the photo"*. Download: *"Downloading the photo pack: 167 of 668 MB."*; the card gone 12.5 s later and the held message went out with the picture: *"I see a webpage for the Northwind store, featuring two images of dogs and a coffee cup with cookies. The text in Hebrew indicates free shipping on orders over 150 NIS."* + SOURCES. **No advice card on Fast** | `J4-06-pack-card`, `J4-07-pack-downloading`, `J4-08-sent-with-picture`, `J4-09-fast-answer` |
| J4 Fast + pack, the synthetic page fresh | **pass** 43/43 | *"…three dogs on gravel… a cup of coffee with heart-shaped cookies on a wooden table next to glasses… "Back" and "Continue to checkout"… free shipping on orders over 150 NIS."* No advice card | `J4-10-sent-bubble`, `J4-10-answer` |
| **J4 Moshe's PDF on Fast + pack** | **pass** 2 × 43/43 | No advice card, the picture in the bubble, grades 1 and 2 | `private/` only |
| **J5 vault Best for on the phone** | **pass** (2 harness fails, below) | Default: chip **Chat**, no divider, Fast *RECOMMENDED ON THIS PHONE · CHAT IN ENGLISH*. The sheet *"What do you want to do?" / "Pick one or more."*, eight checkable rows. Documents ticked: chip **Chat + Documents**; On this device: Fast (*Chat · Best Documents · Good*), then **NOT GOOD AT ALL OF THESE** above Instant (*Chat · Good Documents · Weak*). All eight: chip **Chat +7**, eight checks; On this device the divider sits above Fast and Instant; Fits your phone: Sharp (Qwen3.5 4B) *RECOMMENDED ON THIS PHONE · CHAT +7 IN ENGLISH*, eight tiers, then the divider, then Sharp (Phi). Every use unticked in turn: only **Math & reasoning** stays checked, chip "Math & reasoning". Back: chip **Chat** | `J5-01-vault-chat` … `J5-05-card-*`, `J5-12-sheet-all` … `J5-17-vault-back-to-chat` |
| **J5 does a "Use · Tier" pair break?** | **no break seen** | On all four chat cards with all eight uses (`J5-13-vault-all`, `J5-14-card-*`) and with Chat + Documents (`J5-04`, `J5-05-card-*`), read at full resolution: every pair stays on one line, and the wraps fall between pairs (Fast: *Chat · Best  Writing · Good / Summaries · Good  Translation · Good / Code · Weak  Documents · Good / Voice notes · Best  Math & reasoning · Weak*) | as left |
| J7 plain text turn on Fast | **pass** 24/24 | *"Set a consistent sleep schedule to regulate your body's internal clock, and try avoiding screens one hour before bed…"* | `J7-01-fast-text-turn` |
| J7 text typed while a model loads | **pass** 35/35 | Instant, then Fast from the sheet; during *Loading* the field took and kept *"hello while loading"* (props `value`, before and after the load); sent: *"Hello! I am ready to help you."* on Fast | `J7-02-typed-while-loading`, `J7-03-loading-text-answered` |
| **J7 Erase everything with models** | **pass** 16/16 | `Documents/models` before: Fast 1.19 GB, its pack 637 MB, the index model 446 MB, `vault.json`. After: `vault.json` only | `J7-04-wipe-models-on`, `raw/j7-models-*-wipe.txt` |
| **J6 onboarding door offline** | **pass** (66/67, the fail is a probe of a card that never mounted) | After the wipe: *Download Fast · 1.28 GB*, source *"1.28 GB · one download from models.inbornapp.com"*. Offline (the bridge's switch): *"You are offline…"*; Download tapped: *"Waiting for a connection. It starts by itself."* and the source line **keeps the host**, also at 16 s. Online: *Delivering FAST · 36% of 1.28 GB*, host kept. Offline mid-download (the transfer is dropped): *"FAST is waiting for a connection"*, the offline line, the progress kept, **host kept**. Online again: host kept. Stop the download: host kept | `J6-01-model-step-after-wipe` … `J6-06-back-online` |
| J7 Instant after the wipe | **pass** | *Start now with Instant*, chip INSTANT, *"The capital of France is Paris."*, no *"Could not load"* | `J7-05-instant-after-wipe` |
| **Store app, brand-new user** | **pass** | Twin uninstalled; 6 non-model files copied for the record; store app uninstalled and build 36 installed fresh: **1.0.0 (36)**. After one launch `Documents/models` = `vault.json` only (Instant + its pack, bundled), no documents, pictures or chats. Left on Welcome | `S01-store-first-screen-36`, `raw/handover36.txt`, `raw/store-vault-after-first-launch-36.json` |

The 6 GB phone (*RUNS ON: IOS-MID · 6 GB*) ranks all four chat models. With Chat: On this device Fast (recommended),
Instant; Fits your phone Sharp (Qwen3.5 4B) and Sharp (Phi), both PRO, both *"Runs slowly on 6 GB · short context"*.
With all eight uses only Sharp (Qwen3.5 4B) is good at all of them.

## What did not match the brief, or is not proven

1. **J6 "after a failure":** on the phone a dropped transfer goes back to *waiting for a connection*, not to the failed
   state, so `download-failed` never mounted (the one fail in J6). The host stays in the source line in every state
   the phone reached: before, waiting, downloading, dropped, back online, stopped. The failed state itself is shown on
   the simulator only (round 131B `01c`).
2. **The honest line** (`chat.vision.unsure`) never showed on the phone: no turn failed both attempts. The one fault
   seen was retried unseen (`[picture-check] foreign-source on attempt 1`).
3. **Instant on Moshe's page stays weak** (1.00 English, 0 Hebrew), as round 131 measured: no refusal and no leak any
   more, but each answer invents a detail. The advice card pointed to Fast every time, and Fast scored 1.50.
4. **Samples 2 and 3 of a picture turn hit the KV cache** (16 prompt tokens). They are fresh chats and fresh samples,
   but not cold prefills.
5. **Instant's cold picture turns took 2.6 to 3.6 s to the first token** against build 35's 2.0 to 2.6 s, with the same
   engine time. Not investigated.
6. **Harness:** in `j5-vault` my `deeplink /vault` back to the top remounted the vault, which reset Best for to Chat
   (the selection is not persisted, by design), so its "all eight" showed *Chat +6* and its untick pass left
   Documents. Those shots were deleted; `j5b-vault-all` reran the second half without the deeplink and is the
   evidence. Its one fail is a `scrollTo best-for` (the header is outside the scroll view; nothing needed scrolling).
   One `devicectl` push was interrupted (CoreDevice error 7000) and the run retried. In `j2-not-now` the
   `waitFor assistant-text` matched the previous answer, so that turn has no screen timing. `J5-02-sheet-chat` was
   taken before the sheet slid in; its text was asserted, and `J5-03` shows the sheet.
7. **The system file picker and the system keyboard** were not driven (the bridge types through `onChangeText`).
8. **Real Airplane Mode** was not used (the brief forbids it): offline is the app's simulated switch.

## End state

- The phone has `com.inbornapp.mobile` **1.0.0 (36)**, freshly installed, running on onboarding's first screen
  (Welcome, **Continue**), with no model downloaded and no chats or documents.
- `com.inbornapp.mobile.qa` was uninstalled at 20:26:59, rc 0. `devicectl device info apps` then lists the store app and
  the other session's `com.inbornapp.mobile.uitests.xctrunner`, which was not touched.
- The phone was unlocked at every check and was never locked or unlocked by this pass. No setting was changed, no
  account touched. No simulator, no XCUITest runner, port 8787 not touched. Every driver, build and the syslog capture
  this pass started has exited.
