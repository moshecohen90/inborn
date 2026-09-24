# iPhone 13 Pro device pass on build 1.0.0 (19) — 24.9.2026

Build, upload, VALID and the store-app update: `docs/qa/ios-build-19-2026-09-24.md`. Evidence for every row is in
`docs/qa/ios-device-pass-19/`: screenshots, each run's `result-*.json` with every step's verdict and value, the
scripts in `scripts/`, and raw build and container logs in `raw/`.

**No XCUITest, no passcode sheet.** All rows were driven through the round-51 bridge on `com.inbornapp.mobile.qa`,
built from this branch, with `node scripts/ios-qa.mjs`. The store app was only updated and launched. Two `.qa`
builds were used:

- **A** carries Instant **and** the photo projector, exactly as the store archive does. It was used for rows (a), (c),
  (d) and (f).
- **B** carries Instant only. Row (b) needs a phone with no photo pack, and a bundled pack cannot be removed. That
  refusal is F342's own guard, and A's vault card confirms it: no Remove and no Install on the photo pack
  (`A04`, steps 40–41 of `result-a19.json`). B is the honest stand-in for "the pack was deleted".

`.qa` started from a clean state. Only the QA package was uninstalled, then installed fresh. It was removed again at
the end.

## The rows

| row | result | what the phone showed | evidence |
|---|---|---|---|
| store app **1.0.0 (19)** | **pass** | About: `1.0.0 (19) · a75e02df0e2d`. Container byte-identical across the update | `S01`, `S02`, `raw/install19.txt` |
| **(a) F340/F342**: a door as the first message after a cold launch, no download | **pass** | Fresh install, onboarding, then the photo. *"The image displays a brown door with two rectangular panels and a gold doorknob…"* No hold card, no "photo pack" line, no Download. The vault card reads *PHOTO PACK · Included with the app* | `P00`, `A01`–`A04`, `result-a19.json` (43/43) |
| **(b) F343**, both doors hold the send | **pass** | The Photo-button path and the "Add a file…" path each show *"This device has no photo model installed. Download the 205 MB photo pack to ask about pictures."* with **Download · 205 MB**. Nothing is stored, and a second Send is still held | `B01`–`B04`, `result-b19.json` steps 20–49 |
| **(b) F343**, the real download on the phone, and the held turn goes out by itself | **pass, slowly** | Download pressed at 20:09:45, and the card counts up (*"Downloading the photo pack… 1% … 67%. Your message is sent when it's ready."*). `vault.json` records the pack `via: https`, 204,987,232 B, catalog sha256, installed at **20:47:11**. The turn held during the download went out by itself and was answered: *"This is a simple wooden door with a metal handle and lock set in it."* | `B05`, `B06`, `result-b19b.json` (25/25), `raw/qa-vault-after-download.json` |
| **(c) F350**, Send waits for the photo | **pass on 48 MP; the hold is not observable on 12 MP** | See below | `C31`–`C34`, `result-c19d.json` |
| **(c) F349**, forced failing download | **pass, through (f)** | The bridge cannot point the app at a dead host: `EXPO_PUBLIC_DEV_MODEL_HOST` is build-time only. The real 404 in (f) is the same failing download | `F03`, `F04` |
| **(d) Work column** of `COMPARE_ROWS`, injected Work licence | **pass** | See below | `D03`–`D17`, `result-d19.json`, `result-d19c.json` |
| **(d) Pro "images per message"** | **pass** | Free: a second photo is refused, and the paywall opens on *"Free sends one photo per message. Pro sends several."* Pro: three photos in one composer | `D01`, `D02` |
| (e) Enter on a hardware keyboard | **skipped** | Not testable on the phone, as briefed | — |
| **(f) e5 document index** | **CDN 404, so F349 proven on a real failure** | The vault card says **"Something went wrong. Try again."** and offers **Try again**. No `NSURL`, `Error Domain`, `.swift` or `Exception` anywhere on screen. The raw text sits only in Details: `ERROR · HEAD 404 from models.inbornapp.com`. The Japanese paraphrase test needs e5 on the phone, so it did not run | `F01`–`F04`, `result-f19.json` (27/27), `raw/e5-cdn-status.txt` (`curl -I` = 404) |

### (b) The download works on a real iPhone, at 1% of the network's speed

This was the step round 75 could not prove on a simulator. On the phone it works end to end. It took **37 minutes**
for 205 MB, about **0.09 MB/s**. From the Mac, on the same network at the same time, the same URL delivered
**8.9 MB/s** (`curl -r 0-52428799`). The file lands in `Library/Caches/com.apple.nsurlsessiond/Downloads/…`, which
matches `httpsDelivery.ts` asking expo-file-system for `sessionType: "background"`. iOS runs such transfers in
`nsurlsessiond`. The throttling cause is not measured here: a foreground session on the same phone would be the
control (F360).

The first held turn in `b-photo-pack` was lost, and that was the script's doing. Its last step jumped to `/vault`,
and the bridge's `deeplink` is `router.replace`, which unmounts the chat and its composer. `b2-release` then held a
new turn at 67% and left the chat alone, and that turn was released by itself.

### (c) F350: the 12 MP window is shorter than one bridge poll

Three runs with a 12 MP photo never saw *Preparing photo…*: a 357 KB JPEG, a 5.3 MB one with photo-like entropy, and
a 30-second watch for the row. The iPhone 13 Pro scales a 12 MP photo inside the bridge's 250 ms poll. In all three
runs the photo **did** go out with the message, and Instant described the door (`c12mp-run*-…`, `result-c19*.json`).

A 48 MP photo, the largest an iPhone takes, made the window visible (`result-c19d.json`):

- step 9: the preparing row is mounted and reads *"Preparing photo…"*;
- step 10: Send is **disabled**, and the press is refused;
- steps 12–13: the text is still in the composer and no message was stored;
- step 16: the thumbnail arrives, and the next Send carries the photo (`user-images`);
- the answer: *"A simple brown door with two panels and a gold doorknob stands against a neutral wall."*

### (d) The Work column, on the iPhone

Every cell of the compare table was read from its accessibility label (`result-d19.json` steps 40–93). The Work
column is **Included** or **Unlimited** on all 18 rows. The five Work-only rows (vaults, redaction, office, audit,
signed) read *Not included* for Free and Pro. Photos read `1 / Unlimited / Unlimited` (`D03`–`D06`).

| Work promise | on the phone |
|---|---|
| profession templates | Four packs listed. Legal shows its declaration. *Case memo* with four slots filled (`Harlow v. Pemberton Freight`, `England and Wales`, `claimant`, the notes) inserts the full filled prompt into the composer (`D07`–`D10`) |
| architecture statement | *"Inborn 1.0.0 (build a75e02df0e2d) on ios · Licence tier at print time: Pro for Work"* (`D11`) |
| client vault with its own code | Folder `Client Alpha` created, code set to 1234 twice, and the folder then offers **Code / Unvault** (`D12`–`D15`) |
| hash-chained audit log | *"Chain verified · 1 entry"*, entry #1 *Vault created · Client Alpha* (`D16`, `D17`) |

## What went wrong in the harness, and was fixed (F357)

- **CoreDevice wedged.** Every `devicectl` call timed out, while usbmux answered. `ios-qa.mjs` gained
  `--via-usbmux`, which moves push, pull, launch and screenshot to pymobiledevice3. The guard in
  `apps/mobile/test/qaBridgeGate.test.ts` was watched red (`guard-red-f357.txt`). The lead restarted
  CoreDeviceService before the pass, so every run above used devicectl. The usbmux transport is **not yet proven on
  the device**.
- **USB dropped mid-pass (between 20:10 and 20:25).** From then on pymobiledevice3 answered *"Device is not
  connected"*, and devicectl carried on over the network. The driver acknowledged every screenshot it never took, so
  `B07`–`B09`, `B11`–`B13` do not exist even though the log says `shot`. Those rows rest on `result-b19*.json` and the
  pulled `vault.json`. The driver now checks that the file was written and lists the missing ones, also guarded and
  watched red.

## Not done

- The Japanese one-passage document with e5 (f): `multilingual-e5-large-instruct-Q6_K.gguf` is still 404 on
  models.inbornapp.com.
- Hardware-keyboard Enter (e): not testable on the phone.
- The home screen was not photographed at the end, because USB was gone. Both Inborn processes were terminated with
  `devicectl`, and the QA app was uninstalled. The phone keeps `com.inbornapp.mobile` 1.0.0 (19) and an older
  `com.inbornapp.mobile.uitests.xctrunner` from another stream, which was not touched.
