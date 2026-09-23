# CDN download on the real iPhone — models.inbornapp.com — 22.9.2026

The step the simulator cannot do. Inborn 1.0.0 (11) on Moshe's iPhone 13 Pro (iOS 26.6.1, udid
`<iphone-udid>`, on USB, Wi-Fi) downloaded the **Fast** model, 1.2 GB, from the R2 CDN that went live the
same morning, hashed it against the signed catalog, loaded it and answered a chat turn with it. The CDN itself and how
it was built are in `docs/ops/cdn-r2.md`.

**Bottom line: the https delivery tier works on a real phone against the real CDN.** 1,280,835,840 bytes arrived in
**151 s** (8.5 MB/s, 68 Mbit/s), the app's own sha256 check passed, and the vault record the phone wrote back matches
`packages/core/src/catalog/manifest.json` byte for byte and hash for hash. Nothing was installed or uninstalled, no
setting was changed, the phone was never locked or unlocked, and no UI-Automation passcode sheet appeared.

The driver was the existing `VOICE_STEPS` step machine
(`apps/mobile/ios-tests/VoiceDeviceUITests.swift`), run as a 42-step `cdn.xctestrun` built from the ios-live-11 runner
products. `xcodebuild test-without-building` exited **0**.

## Results

| # | check | result | evidence |
|---|---|---|---|
| 1 | the vault starts empty of downloaded models | **PASS** — header `1 KB in the vault · 80 GB free · RUNS ON: IOS-MID · 6 GB`; only the bundled Instant is present | `cdn-00-vault-top.png`, `driver-log.txt` |
| 2 | the Fast card names the CDN before anything is downloaded | **PASS** — the install button's own label is `Install · 1.2 GB from models.inbornapp.com`. The host comes from the signed manifest's `baseUrl`, so the card is reading the live catalog | `driver-log.txt` |
| 3 | the confirmation sheet names the CDN and the reason | **PASS** — "Inborn will download 1.2 GB from **models.inbornapp.com**. This is the only time it talks to the internet, and only because you tapped Install. It will show in your App Privacy Report." | `cdn-02-confirm.png`, `driver-log.txt` |
| 4 | bytes actually flow from the CDN | **PASS** — 15 s after confirming, `8% · 99 MB of 1.2 GB`; 60 s later, `35% · 430 MB of 1.2 GB`. The only https host the build will accept is `models.inbornapp.com` (`ALLOWED_MODEL_HOSTS`), and the vault recorded the install as `via: "https"` | `cdn-03-start.png`, `cdn-04-progress.png`, `vault.json` |
| 5 | the download completes | **PASS** — `installedAt` 1790072631540 against the confirm tap at 1790072480433: **151.1 s** for 1,280,835,840 B = 8.48 MB/s / 67.8 Mbit/s over Wi-Fi | `vault.json`, `driver-log.txt` |
| 6 | the sha256 check passes | **PASS** — `checkAndRecord` (`apps/mobile/src/vault/store.ts`) hashes every shard with `fileSha256` and, on a mismatch, deletes the files and sets `corrupt`. The phone instead wrote an installed record with sha256 `aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223`, identical to the catalog's `fast` entry, and `bytes` 1,280,835,840, identical to the catalog's. A reaching-`ready` record **is** the passing hash | `vault.json`, `manifest.json` |
| 7 | the vault reflects the new model | **PASS** — header moved to `1.2 GB in the vault · 79 GB free`; the FAST card reads `1.2 GB · Q4_K_M · Battery: Medium`, `~15-24 tok/s on your phone`, `Loaded`, `In use`, green ring | `cdn-05-installed.png`, `cdn-09-live-vault.png`, `driver-log.txt` dump |
| 8 | the model loads and answers | **PASS** — a chat turn on Fast: "What is the capital of France? Answer in one sentence." → **`FAST · ON-DEVICE AI · The capital of France is Paris.`** `lastLoadedAt` 1790073783782 confirms the load | `cdn-07-chat.png`, `cdn-08-answer.png`, `vault.json` |
| 9 | the phone left as found | **PASS** — Inborn still installed (not reinstalled, build 11 as it was), phone on the home screen, no setting touched, no lock/unlock, no passcode sheet raised, no purchase, no permission prompt | run log |

## What the run also showed

**The app auto-activates a model the moment it finishes installing.** `waitlabel:model-status-fast:Installed:1200`
timed out after its full 20 minutes even though the download had finished in 2.5, because `statusLine()` renders an
active `ready` model as **`Loaded`**, not `Installed` (`apps/mobile/src/screens/vault/ModelCard.tsx`). For the same
reason the later `tap:use-fast` found no element: with Fast already in use the card shows `In use`, and `use-fast` is
gone. Neither is a defect; both are the step file asking for the wrong label. A future CDN run should wait on
`Loaded|Installed` and skip `use-fast`. The 20 minutes of dead time is the only thing this run wasted.

`scrollto` is not a step the driver knows (`unknown step scrollto:install-fast:16`), so `cdn-00` and `cdn-01` were the
same frame and `cdn-05` and `cdn-06` likewise; the duplicates are not committed.

## Screenshots

231×500 copies in `docs/qa/cdn-iphone-2026-09-22/`. `cdn-00` … `cdn-08` are XCUITest attachments exported from the
result bundle; `cdn-09-live-vault.png` is a `pymobiledevice3 developer dvt screenshot` taken after the run, at full
1170×2532 before the downscale. The result bundle, the 1170×2532 originals and the `xcodebuild` log stay in the session
scratch dir and are not committed.

| shot | shows |
|---|---|
| `cdn-00-vault-top.png` | the vault before anything is downloaded, `1 KB in the vault` |
| `cdn-02-confirm.png` | the confirmation sheet naming models.inbornapp.com |
| `cdn-03-start.png` | `8% · 99 MB of 1.2 GB` |
| `cdn-04-progress.png` | `35% · 430 MB of 1.2 GB` |
| `cdn-05-installed.png` | FAST `Loaded · In use`, vault at `1.2 GB` |
| `cdn-07-chat.png` | the chat with the question sent |
| `cdn-08-answer.png` | `FAST · ON-DEVICE AI · The capital of France is Paris.` |
| `cdn-09-live-vault.png` | the vault minutes after the run, green FAST card `Loaded / In use`, `1.2 GB in the vault · 79 GB free` |

## Process audit

On the Mac: one `xcodebuild test-without-building` (exit 0), `xcrun devicectl device copy from` for `vault.json`, one
`pymobiledevice3 developer dvt screenshot`, and `xcrun xcresulttool export attachments`. Every one exited on its own;
`pgrep -f "xcodebuild|devicectl|pymobiledevice3"` is empty. No simulator, browser, emulator, dev server or tmux session
was started in this step, and the OnePlus 6T was not touched.

On the phone: the runner launched the already-installed `com.inbornapp.mobile` build 11 plus its `UITests-Runner`, and
one 1.2 GB download the run itself asked for. Nothing was installed, nothing uninstalled, no file written into the app
container, no setting changed, no lock or unlock. The downloaded Fast model was **left in place** — it is the proof and
Moshe may want it.
