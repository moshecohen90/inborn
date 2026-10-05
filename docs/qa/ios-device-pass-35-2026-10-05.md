# iPhone 13 Pro device pass on build 1.0.0 (35): round 130 on the phone, then a brand-new user — 5.10.2026

Build 35 carries round 130 to Moshe's iPhone (`docs/qa/ios-build-35-2026-10-05.md`). Round 130 was proven on simulators
only (`docs/qa/r130-pdf-page-vision/NOTES.md`, `docs/qa/r130-offline-downloads/NOTES.md`). This pass walks it on the
`.qa` twin built from the same commit, a04f3640, on the real free tier of a fresh install (no `setTier` anywhere).
Every download came from `models.inbornapp.com`. Then the twin was removed, and the store app was reinstalled clean as
a new user. Evidence is in `docs/qa/ios-device-pass-35/`:

- `screens/` holds every committed screenshot at full size, and `sm-*` are 500 px copies.
- `raw/` holds each run's `result-*.json`, driver log and `devrun-*.json` (the engine's numbers for the run's last
  turn), the gates, the archive and twin checks, the `Documents/models` listings, the handover record and `NOTES.txt`.
- `scripts/` holds the bridge scripts and `make-scripts.py`.
- `private/` is in `.gitignore`. It holds every screenshot, result and log of Moshe's own PDF, and the one library list
  that shows its name. None of it is committed.

Fixtures: `docs/qa/r130-pdf-page-vision/fixtures/visual-page.pdf` (synthetic, two CC0 photos),
`docs/qa/acceptance/fixtures/turbine-report-3pages.pdf`, and the café
`docs/qa/v1-basics-baseline/fixtures/photos/sized/menu-of-the-garden-caf-2023-05-21.jpg` pushed as
`בית קפה הגינה תפריט.jpg`. Moshe's PDF was pushed under a Hebrew name. Files go in through the dev `attach: <name>` door
(`library.importFile`, as *Add a file…* does). The system file picker was not driven.

**No store upload.** Nothing went to TestFlight, App Store Connect or Play.

## The rows

| row | result | what the phone showed | evidence |
|---|---|---|---|
| J1 new user, Instant: onboarding | **pass** 21/21 | Fresh install, Welcome, model step, *Start now with Instant*, chip INSTANT | `J1-01-model-step`, `J1-02-chat-instant` |
| **J1 Moshe's PDF, "What do you see?"** | **partial, see finding 1** | **There is a hold first:** a fresh install has no index model, so Send shows *"The attached file needs the document index model (468 MB)…"* before any picture is considered. Through *Send, exact words only*, the sent bubble shows **the page picture**. Sample 1 (the picture prefilled, 2.56 s to the first token) describes the page correctly: **pass**. Sample 2 (the same prompt, served from the KV cache) was a "cannot see images" refusal. Sample 3 (after J3 installed the index model, so no card; 625 prompt tokens) was an off-topic safety refusal. One of three answers was right | `private/` only |
| J1 synthetic `visual-page.pdf` | **pass** 47/47 | The same index card, then *Send, exact words only*. The bubble shows the page render. Instant: *"The image shows a web page from "NORTHWIND" featuring four dogs on gravel and a coffee shop checkout screen with Hebrew text in the background…"* (632 prompt tokens, the picture went in) | `J1-03-composer-chip`, `J1-04-index-card`, `J1-04-sent-bubble`, `J1-04-answer` |
| J1 follow-up about the picture | **pass** 22/22 | *"What is next to the cup?"* → *"To the right of the coffee cup, there are four heart-shaped cookies resting on a saucer. A pair of eyeglasses lies to the left of the cup."* It then misreads the Hebrew line. The page was not sent again: still one `pdfpage-` file for that document | `J1-05-follow-up` |
| J1 synthetic again, index model present | **pass on the route** 41/41, weak answer | No card. The picture went in (797 prompt tokens). Instant: *"The user is asking a question in Hebrew about what they are seeing… several images… dogs on ground and coffee with cookies and glasses…"*: right content, odd framing | `J1-06-sent-bubble`, `J1-06-answer` |
| **J3 text PDF held for the index model** | **pass** 59/59 | Instant, `turbine-report-3pages.pdf`, the serial question: card *Download · 468 MB*. Pressed: *"Downloading the document index model… 3%."* The card was gone after 39 s, then **"Reading your document before answering…"**, then *"The Rakovsky turbine serial number is RK-4417."* with **SOURCES** `turbine-report-3pages.pdf · p.1`. *"What does the report say about the turbine?"* → **"Your documents don't mention this."**, no "The report states…" | `J3-01-index-card` … `J3-05-turbine-question` |
| J5 library picture with a Hebrew name on Instant | **pass** (1 of 2 answers good) 34/34 + 46/46 | [+] list → café row tapped: thumbnail chip, no paperclip. Sample 1: the picture went in (636 tokens), but Instant refused (*"I can't read this image. I'm an AI and don't have eyes…"*). My blind-word list missed that wording. Sample 2: *"This is a chalkboard menu listing dining options at "The Capede's Cafe & Coffee House"…"* | `J5-02-a-thumbnail-chip`, `J5-03-photo-answer`, `J5-02b-…`, `J5-03b-photo-answer` |
| Fast from the vault (twin 1) | done | 10% at 15 s, 40% at 39 s, *Installed* 66 s later. The `network` steps were refused here (see the build doc), so this run has no drop | `raw/result-f1-vault-drop.json` |
| **J2 exit (c) Remove the photo** | **pass** 42/42 | Fast without its pack, a new chat, `visual-page.pdf`, "What do you see?": card *"FAST needs its photo pack to see photos · Download 668 MB · Switch to INSTANT · installed · Remove the photo"*, no answer. Remove, Send: no second hold. *"I can read only the text of this page, not its pictures. The visible text includes a header stating "משלוח חינם בהזמנה מעל 150 ₪" (Free shipping on orders over 150 NIS)…"* | `J2-01-pack-card`, `J2-02-photo-removed`, `J2-03-text-only-answer` |
| **J2 exit (b) Switch to INSTANT** | **pass on the mechanics**, bad answer | Card → Switch: a new chat on INSTANT with the paperclip chip `visual-page.pdf`, the same message sent by itself, and the page picture in the bubble (793 prompt tokens). Instant's answer was a Hebrew echo of the page's passages under an invented *"[2] image-page.pdf · p.2"* | `J2-04-pack-card`, `J2-05-switched-sent`, `J2-06-instant-answer` |
| **J2 exit (a) Download 668 MB** | **pass** 69/69, answer with a leak | Back on Fast, card → Download: *"Downloading the photo pack: 38 of 668 MB."* The card was gone after 55 s, and the held message went out by itself with the page picture (905 prompt tokens). Fast: *"The user is asking me to answer one to three sentences…"* (prompt reasoning leaked), then *"the user is viewing an online shopping page"* with the dogs and a checkout interface | `J2-07-pack-card`, `J2-08-pack-downloading`, `J2-09-sent-with-picture`, `J2-10-fast-answer` |
| Fast with its pack, a fresh PDF turn | **pass** 41/41 | *"The image displays a Northwind website interface with three selected items and an order summary… "היי! איך נוכל לעזור?" (Hello! How can we help?)…"* | `J2-11-sent-bubble`, `J2-11-answer` |
| J5 text typed while the model loads | **pass** 35/35 | Instant, then Fast from the sheet. During *Loading* the field took and kept *"hello while loading"* (props `value`). Sent once Fast was ready: *"Hello! I'm here and ready to help you…"*. The screenshot lands just after the load | `J5-04-typed-while-loading`, `J5-05-loading-text-answered` |
| J5 plain text turn on Fast | **pass** 23/23 | *"You can try keeping a consistent sleep schedule and avoiding screens before bed."* | `J5-06-fast-text-turn` |
| **J5 Erase everything with models** | **pass** 16/16 | Twin 2. `Documents/models` before: Fast 1.19 GB, its pack 637 MB, the index model 446 MB. After: `vault.json` only. Model step: **Download Fast · 1.28 GB** and *Start now with Instant*. After J4's door below: Instant, *"Paris is the capital of France."*, no *"Could not load"* | `J5-07-wipe-models-on`, `J5-08-model-step-after-wipe`, `J5-09-chat-instant-after-wipe`, `raw/j5-models-*-wipe.txt` |
| **J4 onboarding door offline** | **pass** (50/52: the 2 fails are my probe of the wrong testID) | Offline, before the tap: *"You are offline. A download is the one thing that needs internet; it starts by itself once Airplane Mode is off or Wi-Fi is on."* Download Fast tapped: *"You are offline… turn off Airplane Mode or join Wi-Fi."* + *"Waiting for a connection. It starts by itself."*, strip *"FAST is waiting for a connection. It starts by itself."*, 0%, the button **Start now with Instant** (on screen; my `start-now-with` probe missed it) and *Stop the download*. The same at 16 s. Online: **"Delivering FAST · 8% of 1.28 GB"** 10 s later, by itself | `J4-01-model-step-offline` … `J4-04-online-10s` |
| **J4 index card offline** | **pass** 44/44 | Instant, the turbine PDF, the serial question, the card; offline, Download: the offline line + *"Waiting for a connection. It starts by itself."*, unchanged at 16 s. Online: *"Downloading the document index model… 18%."* after 8 s, the card gone 31 s later, and the held message answered *"The Rakovsky turbine serial number is RK-4417."* with SOURCES p.1 | `J4-05` … `J4-08-held-message-answered` |
| **J4 vault, connection drop mid-download** | **pass** 28/28 | Twin 2, Fast from the vault: *"12% · 163 MB of 1.28 GB"*; drop: the offline line + waiting; at 15 s still waiting; online: **"25% · 331 MB"** 12 s later (from 163 MB, not from 0), then *Installed* | `J4-11-vault-confirm` … `J4-16-vault-fast-installed` |
| **Store app, brand-new user** | **pass** | Twin uninstalled; 13 non-model files copied for the record; store app uninstalled and build 35 installed fresh: **1.0.0 (35)**. After one launch, `Documents/models` = `vault.json` only (Instant + its pack, bundled), with no documents, pictures or chats. Left on the first onboarding screen | `S01-store-first-screen-35`, `raw/handover35.txt`, `raw/store-vault-after-first-launch-35.json` |

## Send to first token on the phone, a visual PDF page

Send to first token on screen = the bridge's `send` (or card-button) step plus its `waitFor assistant-text`. It covers
the page plan, the ink and scale-2 render, the import and the image prefill. "Engine" is `ttftMs` from `dev-run.json`.

| turn | Send → first token | engine ttft | prompt tokens |
|---|---|---|---|
| Instant, Moshe's PDF, *Send, exact words only* (sample 1) | **2.56 s** | (not kept: the next run overwrote dev-run.json) | — |
| Instant, Moshe's PDF, index model present | **2.02 s** | 1.53 s | 625 |
| Instant, `visual-page.pdf`, *Send, exact words only* | **2.05 s** | 1.56 s | 632 |
| Instant, `visual-page.pdf`, index model present | **2.03 s** | 1.75 s | 797 |
| **Fast** with its pack, `visual-page.pdf` | **5.24 s** | 4.86 s | 905 |
| Fast, the held turn after the pack landed (from the card closing) | 6.40 s | 5.00 s | 905 |
| for scale: Instant, the café photo | — | 1.55 s | 636 |

Render plus import costs about 0.3 to 0.5 s over the engine's prefill. The rest is the image prefill: Instant about
1.5 s, Fast about 5 s.

## Paywall products

Checked on the fresh store build 35 after the handover, with nothing tapped and no sign-in. At 18:22:27, `devicectl device
process launch --terminate-existing --payload-url inborn:///paywall com.inbornapp.mobile`, then a screenshot 12 s
later (`S02-paywall-products-35`). The link opened the paywall even before onboarding. It showed the App Store's real
prices: **PRO "₪59.90 · one-time purchase" with "Unlock Pro · ₪59.90"**, **PRO FOR WORK "₪199.90 · one-time purchase"
with "Unlock Work · ₪199.90"**, *Restore purchases*, *Have a code?*, and *"Family Sharing is not enabled for this
product"*. There was no placeholder, no error, and **no "21102 [Sandbox]" alert**. One copy slip: Pro's list reads
*"Larger models, Sharp and Sharp (Phi)"*.

At 18:22:52 a plain relaunch with `--terminate-existing` came back on onboarding's Welcome (`S03-store-first-screen-again`).
`Documents/models` still holds only `vault.json`, and `Documents/` has no `documents.json`, `documents/` or `images/`.
The store app is 1.0.0 (35).

## What did not match the brief, or is not proven

1. **J1's "no hold" is not what a brand-new user gets.** On a fresh install the 468 MB index card comes first for any
   attached file, a one-page visual PDF too: `planIndexHold` in `Chat.tsx` `submit()` runs before `planPage`. The
   round-130 simulator proofs had the index model cloned in, so they never met this. The user gets the picture only
   through *Send, exact words only* or after the 468 MB download. Recommendation: skip the index hold when `planPage`
   sends the page as a picture (the turn is about the picture, and a one-page file's passages fit whole). This pass
   made no code change.
2. **Instant's answers about a page are unreliable on the phone,** as round 130's offline grades predicted (Instant 0.83
   of 2 on Moshe's page). On his page 1 of 3 samples was right: one "cannot see" refusal and one off-topic safety
   refusal. The café was 1 of 2. After *Switch to INSTANT* the answer was a passage echo. The picture reached the
   model every time it was supposed to (prompt tokens above). These are model answers, not routing failures. Fast on
   the same page was better but leaked prompt reasoning once (J2 exit a).
3. **Twin 1 could not run the `network` step.** The fix (`EXPO_PUBLIC_DEV_MODEL_HOST=localhost`) is in the build doc.
   J5's wipe and all three J4 doors ran on twin 2: the same commit, one more bundle variable, downloads still from
   production.
4. **Onboarding source line loses its host once a download is queued:** *"1.28 GB · one download from"* with nothing
   after it (offline and online, `model-source-fast`). It reads *"…from models.inbornapp.com"* before the tap.
   `ModelChoice.tsx` passes `host` only when the state has one. Cosmetic, new with round 130B's waiting state or older:
   not checked.
5. **Real Airplane Mode was not used** (the brief forbids it). Offline is the app's simulated switch. The order of events
   between NWPathMonitor and URLSession on a real path loss is still proven only in unit tests.
6. **Harness:** my blind-word check passed two refusals ("cannot physically see", "don't have eyes"). The answers were
   read by hand above, and the list in `make-scripts.py` now also has "cannot physically see" and "see images". The
   driver reused a stale `result.json` when I re-ran a script under the same run id (`p1b-founder-words`, twice). One
   of those runs did execute on the phone, which is why sample 2 hit the KV cache. Later runs got new ids
   (`p1e-…`, `f3-…`, `j5-tap-cafe-s2`). One push failure made the driver relaunch the app mid-chat once. The
   `start-now-with` probe in `j4-onboard-offline` used the wrong testID while a download is queued.
7. **The system file picker and the system keyboard** were not driven (the bridge has no touch path outside the app and
   types through `onChangeText`), as in build 34.
8. **`licence.bin`** existed in the old store container (100 B). It is in the record copy and went with the uninstall.
   The new install wrote its own on the first launch. Store purchases are Apple's and restore from the account. That
   was not exercised.

## End state

- The phone has `com.inbornapp.mobile` **1.0.0 (35)**, freshly installed, running on onboarding's first screen
  (Welcome, **Continue**), with no model downloaded and no chats or documents.
- `com.inbornapp.mobile.qa` was uninstalled at 18:12:17, rc 0. `devicectl device info apps` then lists only the store
  app and the other session's `com.inbornapp.mobile.uitests.xctrunner`, which was not touched.
- The phone was unlocked at every check and was never locked or unlocked by this pass. No setting was changed, no
  account touched. No simulator, no XCUITest runner, port 8787 not touched. Every driver and build this pass started
  has exited.
