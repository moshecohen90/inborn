# iPhone 13 Pro device pass on build 1.0.0 (34): round 129 on the phone, Moshe's route — 5.10.2026

Build 34 carries round 129 to Moshe's iPhone (`docs/qa/ios-build-34-2026-10-05.md`). Round 129 was proven on a
simulator only (`docs/qa/r129-wipe-vault/NOTES.md`). This pass walks **his** two symptoms (a PDF whose index-model card
said "100%" and never moved, and Fast shown "ready" after Erase everything, then "Could not load FAST") on the `.qa`
twin built from the same commit, ee7ccbf8, on the real free tier of a fresh install (no `setTier` anywhere). It also
pushes his real stale `vault.json` into the twin. Then the twin was removed and the store app updated. Evidence is in
`docs/qa/ios-device-pass-34/`:

- `screens/` holds every screenshot at full size, and `sm-*` are 500 px copies.
- `raw/` holds each run's `result-*.json`, driver log and `devrun-*.json`, the gates, the archive checks, the install
  record, the twin's checks, every `vault.json` and `Documents/models` listing taken, and `NOTES.txt`.
- `scripts/` holds the bridge scripts and `make-scripts.py`. Fixtures: the PDF is
  `docs/qa/acceptance/fixtures/turbine-report-3pages.pdf`, pushed as `דוח טורבינה.pdf`; the café is
  `docs/qa/v1-basics-baseline/fixtures/photos/sized/menu-of-the-garden-caf-2023-05-21.jpg` (CC0), pushed as
  `בית קפה הגינה תפריט.jpg`.

The PDF goes in through the dev `attach: <name>` door, which files it with `library.importFile` as the attach sheet's
*Add a file…* does. The system file picker itself was not driven (the bridge has no touch path outside the app).

**No store upload.** Nothing went to TestFlight, App Store Connect or Play.

## The rows

| row | result | what the phone showed | evidence |
|---|---|---|---|
| **J1 Moshe's route: PDF on Instant, no index model** | **pass** 55/55 | Fresh install, *Start now with Instant*, chip INSTANT. `דוח טורבינה.pdf` attached, *"What is the serial number of the Rakovsky turbine?"* sent. Card: *"The attached file needs the document index model (468 MB) to be searched by meaning. Without it, only exact words are matched."* with **Download · 468 MB**, *Send, exact words only*, *Cancel*; no "100%", no "Downloading" before the press, and unchanged 10 s later. Download pressed: *"Downloading the document index model… 2%"*, then 23% (27% in the picture), with *"Keep Inborn open: the download pauses when you leave"*. About 50 s after the press the message went out by itself: *"The Rakovsky turbine serial number is RK-4417."* with **SOURCES** `דוח טורבינה.pdf · p.1`. The twin fetched the index model from `models.inbornapp.com` (production) | `J1-01-card-before`, `J1-01-card-10s-later`, `J1-02-progress-a`, `J1-03-progress-b`, `J1-04-answer-with-source` |
| J5 picture from the library on Instant | **pass** 30/30 + 33/33 | Café filed under its Hebrew name; a new chat; [+] lists `בית קפה הגינה תפריט.jpg` / *"Scanned. Run OCR on this phone?"* (row id read from the dump). Row tapped: thumbnail chip, *"Free: one photo per message"*, no paperclip. *"The photo shows a brick wall with two blackboard windows on it. The left window displays "Opening Hours" …"*. No blind words, no *"Nothing in your documents matched"*. `imageMaxTokens` 512 | `J5-01-library-list`, `J5-02-a-thumbnail-chip`, `J5-03-photo-answer` |
| Fast downloaded | done | Model sheet: *"0% · 0 B of 1.28 GB"* → *"36% · 466 MB of 1.28 GB"* at 60 s; *Use this model*; chip FAST | `F-01-fast-60s`, `F-02-fast-selected` |
| J5 text typed while the model loads | **pass** on the tree (35/35) | Instant, then Fast from the sheet; while *"Loading"* was on screen the field took *"hello while loading"* (field value read back); once Fast was ready the same text was sent: *"Hello! I'm ready to help you anytime. What would you like to know or discuss?"* The screenshot (about 3 s) shows the field after the load finished, as in build 33 | `J5-04-typed-while-loading`, `J5-05-loading-text-answered` |
| J5 plain text turn on Fast | **pass** 23/23 | *"One tip is to keep your bedroom cool, dark, and quiet before bed. Another helpful strategy is to avoid heavy meals or caffeine within two hours of going to sleep."* | `J5-06-fast-text-turn` |
| **J4 Erase everything, models OFF** | **pass** 14/14 + 21/21 + 22/22 + 18/18 | Toggle read back `value: false`. `Documents/models` before and after: Fast (1.19 GB) and the index model, same dates (`raw/j4-models-*.txt`); `vault.json` keeps `fast`, `embed-e5`, default `fast`. Onboarding again: Fast *"READY NOW · 1.28 GB · already on this phone"* (true this time), *Start chatting*, chip FAST. Fast answered (*"The three colours of the rainbow are red, orange, and yellow."*: wrong content, see below), then after a relaunch (a new process, weights loaded from `Documents/models/Qwen3.5-2B-Q4_K_M.gguf`, `devrun`) *"Two plus two equals four."*. No *"Could not load"* | `J4-01-wipe-models-off`, `J4-02-model-step`, `J4-03-chat-after-wipe`, `J4-04-fast-answers`, `J4-05-vault`, `J4-06-fast-after-relaunch` |
| **J2 Erase everything, models ON (Moshe's second symptom)** | **pass** 16/16 + 35/35 + 30/30 | Fast had been used in chats (J5, J4). Toggle on, wipe. Right after: `Documents/models` holds only `vault.json`, which lists `instant` and `vision-qwen35` with default `instant`. Model step: Fast *"1.28 GB · one download from models.inbornapp.com"*, **Download Fast · 1.28 GB** and **Start now with Instant**, not "ready". Instant started; *"The capital of France is Paris."*; no *"Could not load"*. Vault: *"0 B in the vault"*, only Instant on this device, Fast under *Fits your phone*. PDF attached again: the same Download · 468 MB card, no 100%, unchanged 10 s later | `J2-01-wipe-models-on`, `J2-02-model-step`, `J2-03-chat-instant-answers`, `J2-04-vault`, `J2-05-card-before`, `J2-05-card-10s-later`, `raw/vault-j2-after-wipe-on.json` |
| **J3 Moshe's stale vault.json** | **pass** (36/38: the 2 fails are probes, below) | The twin (pid of my own launch) was terminated; Moshe's `vault.json` (`fast`, `embed-e5`, `vision-qwen35-2b` installed, default `fast`) pushed into `Documents/models`, where only `vault.json` was, and read back identical. Launch: chip INSTANT, **no** *"no longer on this phone"* line (the two `value model-missing` probes found no such node: the boot scan dropped the records before any chat asked for Fast). *"Hello there, welcome to my friendly assistant!…"* on Instant; no *"Could not load"*. Vault: *"0 B in the vault"*, Fast with a normal **Install · 1.28 GB from models.inbornapp.com**. `vault.json` after the launch: `fast`, `embed-e5`, `vision-qwen35-2b` gone, **`defaultModelId` still `fast`** | `J3-01-first-screen-after-launch`, `J3-02-chat-instant`, `J3-03-vault`, `raw/vault-j3-pushed-founder.json`, `raw/vault-j3-after-launch.json` |
| Store app **1.0.0 (34)** | **pass** | Twin uninstalled first; 12/12 non-model files byte-identical across the update, listing identical; About reads `1.0.0 (34) · ee7ccbf8d649`; no StoreKit alert; left on Chats (footer INSTANT). His `vault.json` healed on the launch: `fast` and `embed-e5` gone, `vision-qwen35-2b` kept (its file is there), default still `fast` | `S01-store-about-34`, `S99-left-on-chats`, `raw/install34.txt`, `raw/store-vault-before-34.json`, `raw/store-vault-after-launch-34.json` |

## What did not match the brief, or is not proven

1. **`defaultModelId` stays `"fast"` after the boot scan heals a stale record.** It happened on the twin (J3) and on
   Moshe's store app. Nothing on screen shows it: the chat resolves to Instant and no error line appears. The boot
   path drops the missing installs but does not run `keepDefaultInstalled()`, which round 129 calls only from
   `rescan()` (the wipe) and `forgetMissing()`. Unproven consequence: when Fast is downloaded again, the stale default
   probably makes it the active model without a choice. Not a regression, and no fix was made in this pass.
2. **J3 did not show the "no longer on this phone" line**, and the brief allowed for that. The boot scan forgot Fast
   before the chat ever resolved it, so the line had no reason to show. The chat's catch path for a file that vanishes
   *after* the engine resolved it is still unproven on any device, as in round 129's simulator notes.
3. **The system file picker was not driven.** J1 and J2 attach the PDF through the dev `attach:` door, the same
   `library.importFile` as *Add a file…*. The Files app sheet itself was not on screen.
4. **The keyboard half of build 33's J1 is still unproven.** The bridge types through `onChangeText` and cannot raise
   the system keyboard; the J5 loading screenshot lands after the load finished (the tree saw "Loading" while the text
   was typed).
5. **Hebrew file names are shown as `pdf.דוח טורבינה`** in the attachment chip and the SOURCES line (bidi: the
   extension jumps to the left). Cosmetic, and present before round 129.
6. **Fast's rainbow answer was wrong** (*"red, orange, and yellow"* as "the three colours"); the turn was there to
   prove Fast loads after the wipe, which it did.
7. **Harness:** the post-archive test rerun's `check:store` skipped because the twin's `prebuild --clean` had removed
   the in-tree archive first; the same gates ran on the kept archive. The first About screenshot failed (I passed the
   devicectl id to pymobiledevice3, which uses another id); the retry without it worked.

## End state

- The phone keeps `com.inbornapp.mobile` **1.0.0 (34)**, opened on About and then on Chats.
- `com.inbornapp.mobile.qa` was uninstalled at 15:19:54, rc 0; `devicectl device info apps` then lists only the store
  app and the other session's `com.inbornapp.mobile.uitests.xctrunner`, which was not touched.
- The phone was unlocked at every check and was never locked or unlocked by this pass; no setting was changed, no
  account touched. No simulator, no XCUITest runner, port 8787 not touched. Every driver this pass started has exited;
  the only process stopped by pid was the twin's own app (J3).
