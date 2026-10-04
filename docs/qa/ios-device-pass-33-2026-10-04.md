# iPhone 13 Pro device pass on build 1.0.0 (33): round 128 on the phone, Moshe's route — 4.10.2026

Build 33 carries round 128 to Moshe's iPhone (`docs/qa/ios-build-33-2026-10-04.md`). After build 32 Moshe asked for
proof before he tests: this pass walks **his** route (a picture that already lives in the document library, tapped from
the [+] sheet's list, then asked about) on the `.qa` twin built from the same commit, 79fc57e7, on the real free tier of
a fresh install (no `setTier` anywhere). Then the twin was removed and the store app updated (J6). Evidence is in
`docs/qa/ios-device-pass-33/`:

- `screens/` holds every screenshot at full size, and `sm-*` are 500 px copies.
- `raw/` holds each run's `result-*.json`, driver log and `devrun-*.json` (model, timings, `info.imageMaxTokens`), the
  gates, the archive checks, the install record, the twin's checks and `NOTES.txt`.
- `scripts/` holds the bridge scripts and `make-scripts.py`. Fixtures: the café is
  `docs/qa/v1-basics-baseline/fixtures/photos/sized/menu-of-the-garden-caf-2023-05-21.jpg` (CC0), pushed as
  `בית קפה הגינה תפריט.jpg`; the receipt is `docs/qa/ios-device-pass-28/photos/photo-receipt.png`, pushed as
  `קבלה מהסופר.png`; the document is `docs/qa/ios-device-pass-31/fixtures/office-hours.txt`.

**No store upload.** Nothing went to TestFlight, App Store Connect or Play.

## How "a picture in the library" was made

The dev `attach: <name>` door files a file with `library.importFile`, as a picked or shared file does. It ran in a
throwaway chat (where round 128 turns the attachment into a composer photo); the document stays in the library. Every
journey then opened a **new** chat, pressed [+], and pressed the picture's row (`attach-<document id>`, the id read from
the sheet's dump, never guessed). The row reads `בית קפה הגינה תפריט.jpg` / *"Scanned. Run OCR on this phone?"*.

## The rows

| row | result | what the phone showed | evidence |
|---|---|---|---|
| J0 brand ring | **pass** 30/30, native ring **matches** the icon | Welcome: thick green open ring, gap at 2 o'clock. Sealed: thick green ring, amber clasp at 2 o'clock with the pale highlight and the amber glow, as `assets/icon.png`. Chat header 28 px: the same mark, highlight visible. Empty state 72 px: the same | `J0-01`, `J0-04`, `J0-06`, close-ups `J0-07`, `J0-08` |
| J0 closing animation | **not captured** | A screenshot takes about 3 s; the close lasts about 1 s. Both "closing" shots are pixel-identical to the final one | `J0-02`, `J0-03` |
| J0 lock screen / privacy cover | **not reached** | Both need a passcode turned on, which is a setting. The onboarding lock step has no ring | `J0-05` |
| J1 field while the model loads | **pass** on the tree (35/36) | Fast chosen from the model sheet; while *"Loading"* was on screen the field took *"hello while loading"* and kept it; once Fast was ready the same text was sent: *"Hello! I'm ready to help you anytime. What would you like to do?"* The screenshot itself took 15 s and shows the field after the load finished | `J1b-01` to `J1b-03`, `result-j1b-switch-loading.json` |
| J1 keyboard up, then dismissed | **not proven on the phone** | The bridge types through `onChangeText` and cannot raise the system keyboard. The accessibility inspector route (no setting changed) only reaches the 13 elements of the closed attach sheet and never the composer. No press-to-keyboard time was measured | `raw/NOTES.txt` 18:23:42 |
| **J2 Moshe's route on Instant** | **pass** 35/35 | Row tapped: **thumbnail chip** with *"Free: one photo per message"*, **no paperclip**. *"What do you see in the photo?"* → *"This is a cafe signboard at WulltheCAPE/CAPECAFEHONEY COUR with a chalk-written menu listing items like "Brisbane Avocado on toast" and "Sushi Tuna & Wagyu"."* No *"cannot see"*, *"text-based"*, *"Your documents don't mention"*; no *"Nothing in your documents matched"* banner. `imageMaxTokens` 512 | `J2-01` list, `J2-02` chip, `J2-03` question, `J2-04` answer + banner area |
| J3 same route on Fast, no pack | **pass** 43/43 | Send showed *"FAST needs its photo pack to see photos"* / *"One 668 MB download, then this photo sends by itself."* / **Download 668 MB**, no answer under it. Pack ready about 60 s after Download, then: *"The image shows a large chalkboard menu board mounted on an exterior brick wall, listing items like avocado toast and various dishes along with opening hours for "Friends of Staines Well Gardeners." It also features information about a website and membership details."* `imageMaxTokens` **1024**, prompt 910 tokens in **5,990 ms** | `J3-02` chip, `J3-03` card, `J3-04` answer |
| J4 receipt through the same route on Fast | **pass** 28/28 | *"The total on this receipt is 15.09."* No banner. **No source chip**: the picture was never OCR'd (*"Scanned. Run OCR on this phone?"*), so it was answered from the image alone | `J4-01` list, `J4-02` chip, `J4-03` answer |
| J5a Spanish on Fast | **pass** 22/22 | *"No tengo acceso a la información de partidos que hayan ocurrido ayer, ya que soy una inteligencia artificial y no puedo verificar noticias en tiempo real."* | `J5a-real-madrid` |
| J5b code on Fast | **pass** 18/18 | A fenced `def is_palindrome(word: str) -> bool:` with a docstring and an example | `J5b-palindrome` |
| J5c document on Fast | **pass** 33/33 | Index card, Download pressed; *"The office phone number is 555-0134, as stated in the provided document [1]."* with **SOURCES** `[1] office-hours.txt · part 1`, no label line in the answer | `J5c-01`, `J5c-02` |
| J6 store app **1.0.0 (33)** | **pass** | Twin uninstalled first; 9/9 non-model files byte-identical across the update, listing identical; About reads `1.0.0 (33) · 79fc57e764fa`; left on Chats | `S01-store-about-33`, `S99-left-on-chats`, `raw/install33.txt` |

## What did not match the brief

1. **The keyboard half of J1 is unproven on the phone.** The field accepts text while the model loads (proven), but no
   journey could put the system keyboard up with one real press, so "keyboard up while loading", "keyboard gone after
   send" and the press-to-keyboard time are not measured. The only touch path on this phone is the XCUITest runner,
   which belongs to another session.
2. **The accessibility inspector sees the closed attach sheet.** On the chat screen its walk lists *Close, Attach
   documents, Templates, PHOTOS, Photo, Camera, Add a file…, … Manage documents* and loops, never reaching the header
   or the composer, although the sheet is not on screen. VoiceOver may be trapped the same way; this pass did not turn
   VoiceOver on (a setting) to confirm.
3. **The closing animation was not captured** (screenshot latency about 3 s against a 1 s close), and the lock screen
   and privacy cover need a passcode setting.
4. **Instant's café description is partly invented** (*"Brisbane Avocado"*, *"Sushi Tuna & Wagyu"* are not on the
   board); Fast's description is right. Both describe the picture, which is what round 128 fixes.
5. **The store container changed after build 32.** Moshe's data was reset at 17:26; `licence.bin` is absent, so build
   32's six-file check refused and was widened to the nine non-model files.
6. **A StoreKit alert on the store app's first launch**: *"There is no information available for In-App Purchases. Try
   again later. 21102 [Environment: Sandbox]"*, over About and still up on Chats. Build 32's launch did not show it.
7. **Harness faults, mine:** J1 first ran when the model had already loaded (it loads at launch; the loading window was
   then made with a model switch); a rerun under an old run id read stale results; J5c's first script waited for the
   index card to leave without pressing Download, and after a driver relaunch the screenshots were black. Each was
   rerun under a new id; the bad runs are kept and labelled in `raw/`.

## End state

- The phone keeps `com.inbornapp.mobile` **1.0.0 (33)**, opened on About and then on Chats, with the StoreKit alert up.
- `com.inbornapp.mobile.qa` was uninstalled at 18:56:31, rc 0; `devicectl device info apps` then lists only the store
  app and the other session's `com.inbornapp.mobile.uitests.xctrunner`, which was not touched.
- The phone was unlocked at every check and was never locked or unlocked by this pass; no setting was changed. No
  simulator, no XCUITest runner, port 8787 not touched. Every driver this pass started has exited or was stopped by PID.
