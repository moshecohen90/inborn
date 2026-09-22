# Inborn release checklist: the 57 tests (40 + voice, photos, Work, real-store purchases, and the retest list of 7.9.2026)

Spec basis: §14.7 (categories), §10 (every row is a test), §5.9, §11.5. This is the "full version that lives in the repo". Because Inborn has no telemetry, this list *is* the monitoring: every test runs before every store release, on every platform being released. Results go in a dated copy under `docs/qa/runs/<version>-<platform>.md` (one line per test: id, device, pass/fail, evidence path).

## Devices and tools we actually have (5 September 2026)

| Id | What | Role | Notes |
|---|---|---|---|
| D-AND-FLOOR | OnePlus 6T (`adb -s REDACTED-6T`), Snapdragon 845, Android 11, 8 GB | Android floor device | Shared with other streams; CPU only, no NPU, arm64 with dotprod |
| D-IOS-FLOOR | iPhone 13 Pro, A15, 6 GB, iOS 26.5 | iOS floor (6 GB tier) | Shared; no Apple Intelligence (needs 15 Pro) |
| E-P6-36 | Emulator `Pixel_6_API_36` (arm64, google_apis, 1.5 GB RAM) | API 36 target, 16 KB check, low-RAM | Check page size with `adb shell getconf PAGE_SIZE`; if it prints 4096 install the 16 KB image: `sdkmanager "system-images;android-36;google_apis_ps16k;arm64-v8a"` (name varies by SDK; search `sdkmanager --list \| grep 16k`) |
| E-P6-33, E-P4-33, E-P3a-33 | Emulators API 33 | Android 13 behaviour, notifications permission | |
| E-P2-30, E-26, E-24 | Emulators API 30 / 26 / 24 | minSdk floor (26), old WebView | |
| S-IOS-17 … S-IOS-26 | iOS simulators 16.0, 16.2, 17.0–17.5, 18.0, 18.1, 26.1–26.3 (Xcode 26.2) | iOS floor 17, iOS 18 fallback UI, iOS 26 Liquid Glass, Apple FM via simulator | Apple FM works in the iOS 26 simulator only when the host Mac runs macOS 26 with Apple Intelligence enabled |
| M-MAC | This Mac (Apple silicon, macOS 26) | Desktop build, web smoke, Instruments, mitmproxy host | |
| Missing | Pixel 8 / Galaxy S23 / iPhone 15 Pro / iPhone 14 / cheap tablet | Flagship + 8 GB tier + Apple FM on device | Per spec §14.6 purchase list; tests that need them say so |

Tools: `aapt2` at `~/Library/Android/sdk/build-tools/36.0.0/aapt2` (not on PATH); `bundletool` (download jar from GitHub, or `brew install bundletool`); `mitmproxy` (`brew install mitmproxy`, not installed yet); Xcode Instruments; `adb`, `xcrun simctl`, `xcrun devicectl`, `pymobiledevice3`.

Result vocabulary: **PASS**, **FAIL** (blocks release), **N/A** (platform not in this release), **BLOCKED: needs <device>** (recorded, not a pass).

---

## A. Installation (§14.7 line 1)

### T01 Clean install on the floor device, Android
- Spec: §10.1 #1, §6.3, §14.2 M8.
- Procedure: `adb -s REDACTED-6T uninstall com.inbornapp.mobile`; install the **release** AAB via bundletool (`bundletool build-apks --bundle app-release.aab --output out.apks --local-testing && bundletool install-apks --apks out.apks --device-id REDACTED-6T`); launch; complete onboarding without Wi-Fi off yet; send one message.
- Pass: first answer streams within 30 s of first launch on a fresh install (Instant delivered by the fast-follow pack); no crash; onboarding never blocks on network.
- Runs on: D-AND-FLOOR. Flagship half (Pixel 8): BLOCKED: needs Pixel 8.

### T02 Clean install on the floor device, iOS
- Spec: §10.1 #1, §6.3.
- Procedure: delete app; install Release build via `xcrun devicectl device install app`; launch; onboarding; one message in Airplane Mode.
- Pass: as T01; bundle contains `instant.gguf`; first-launch Metal compile shown as progress, not a blank screen.
- Runs on: D-IOS-FLOOR. Flagship half: BLOCKED: needs iPhone 15 Pro (Apple FM) — partially covered by S-IOS-26 simulator on macOS 26.

### T03 Store-delivery path (Play Internal testing / TestFlight)
- Spec: §14.1 "not yet done".
- Procedure: install from Play Internal testing track on D-AND-FLOOR; confirm fast-follow pack arrives from the real store (`adb shell dumpsys package com.inbornapp.mobile | grep -i asset` and the in-app Downloads screen); install from TestFlight on D-IOS-FLOOR.
- Pass: model pack present without the app opening a socket (see T32); TestFlight build launches offline.
- Runs on: both floor devices, after Moshe creates the store records.

## B. Model download (§14.7 line 2)

### T04 Download start, progress, completion with hash check
- Spec: §5.4, §10.1 #2, #5.
- Procedure (iOS 17–25 path and desktop): Vault → Fast → Download; watch byte counter; after completion compare `sha256` in Settings › Vault › Details with the manifest. Android: on-demand pack via Play (local-testing mode with bundletool until the store record exists).
- Pass: size shown before start equals HEAD Content-Length; hash matches; model loads.
- Runs on: S-IOS-17 (CDN path), M-MAC, D-AND-FLOOR (PAD path).

### T05 Download interrupted: app closed, network cut, device locked, then resumed
- Spec: §10.1 #2.
- Procedure: start a download; (a) swipe-kill the app, (b) toggle Airplane Mode for 60 s, (c) lock the device for 5 min; relaunch/unlock each time.
- Pass: download resumes from the last byte range (byte counter does not restart at 0); no duplicate file; Downloads screen survives restart.
- Runs on: S-IOS-17 / D-IOS-FLOOR, M-MAC; Android: Play handles resume — verify the in-app state mirrors Play's.

### T06 Download cancelled
- Pass: partial file removed, space reclaimed (check Vault storage numbers), no orphan in the app container (`xcrun devicectl device copy from` the container listing, or `adb shell run-as … ls files/`).
- Result 13.9.2026, E-P6-36 + S-IOS (iPhone 15 Pro sim), dev builds (`qa-run-2026-09-11.md` § Round 4): **PASS**. Emulator: Fast cancelled at 41 % and 47 % → `.gguf.part` gone within 1 s, `df` used −236 MB, `vault.json` `downloads: {}` (`shots/14-fast-cancelled.png`); simulator: cancelled at 12 % → "1 KB in the vault", `Documents/models/` = `vault.json` only (`ios-shots/a13-t06-cancelled.png`). D-AND-FLOOR: WAIVER (no install/uninstall on the founder's phone).

### T07 Storage full before / during download and during DB write
- Spec: §10.1 #5, #6, §10.3 #22.
- Procedure: fill the device to < 1 GB free (`adb shell fallocate -l …` in the app's files dir via run-as; simulator: create a large file in the container); attempt a 1.28 GB download; then chat 20 messages.
- Pass: download refused with the "needs X GB, you have Y" message before starting; mid-download ENOSPC pauses with a clear message, no corrupt file; DB writes fail gracefully (WAL), integrity check on next open passes.
- Runs on: E-P6-36 (easy to fill), S-IOS-17.
- Result 13.9.2026, E-P6-36, dev build (`qa-run-2026-09-11.md` § Round 4, F13/F14): **FAIL**. Before: 1.0 GB free → "Free up 2.1 GB" + "Try again", no request sent (PASS half, `shots/16-t07-needs-space.png`). During: ENOSPC mid-download shows the raw native error, header free-space stale; resume after freeing is byte-exact (`Range: bytes=264294400-`, `shots/18-t07-enospc-2.png`, `27-t07-resumed.png`). DB write on a full disk: assistant row renders "cannot rollback - no transaction is active", `writePrefsRaw` throws ENOSPC uncaught every 5 s (`prefsStore.native.ts:25`), 3 exchanges lost silently after recovery, `state.storageFull` banner never appears (`shots/21-t07-send-full-disk-15s.png`, `22-crop.png`, `25-t07-chat-reopened.png`). Fix F13 before release. S-IOS-17: WAIVER (simulator reports the host's free space).

### T08 Wrong hash / corrupt / truncated / wrong-format model
- Spec: §10.1 #8, §10.9 #61.
- Procedure: import (a) a GGUF truncated with `head -c 100000000`, (b) a random file renamed `.gguf`, (c) a safetensors file, (d) a valid GGUF with one byte flipped (`printf '\x00' | dd of=f.gguf bs=1 seek=1000 conv=notrunc`).
- Pass: each rejected before "Load" with a specific message (magic/header/tensor count/checksum); the app never crashes; a model that crashed the loader is quarantined and not auto-loaded on next launch.
- Runs on: all.

## C. Apple Foundation Models (§14.7 line 3)

### T09 Apple FM available
- Procedure: S-IOS-26 on macOS 26 with Apple Intelligence on; Settings → Models shows "Apple on-device"; first answer in English uses it (chip "APPLE · ON-DEVICE").
- Pass: works; Hebrew locale falls back to GGUF automatically (§10.3 #27).
- Runs on: S-IOS-26 if the host has Apple Intelligence enabled; else BLOCKED: needs iPhone 15 Pro.

### T10 Apple FM off / device not eligible / unsupported region / model downloading
- Procedure: Apple Intelligence off in Settings; simulator region set to China; `modelNotReady` state right after enabling.
- Pass: no UI depends on FM; GGUF answers; no error dialog, only the model chip changes.
- Runs on: S-IOS-26 (off/region), D-IOS-FLOOR (not eligible).

## D. Long session (§14.7 line 4)

### T11 Two-hour continuous chat: memory, heat, battery
- Spec: §5.8, §6.4–§6.5, §10.2 #18, #19.
- Procedure: `EXPO_PUBLIC_AUTOPROMPT=1`-style loop or a script that sends a prompt every 40 s for 120 min on the floor device, Fast model, screen on. Record every 10 min: `adb shell dumpsys meminfo com.inbornapp.mobile | grep TOTAL`, `adb shell dumpsys battery`, `adb shell dumpsys thermalservice`; iOS: Instruments › Activity Monitor + Energy Log, `pymobiledevice3 developer dvt sysmon`.
- Pass: zero crashes; RSS growth < 10% between minute 20 and minute 120; thermal "serious" produces the "Slowing down" line and never a kill; battery drain ≤ 0.5%/1,000 tokens; jetsam does not occur (iOS: no `JetsamEvent` in `pymobiledevice3 syslog`).
- Runs on: D-AND-FLOOR, D-IOS-FLOOR. "Sharp on 8 GB: no jetsam" half: BLOCKED: needs iPhone 15 Pro / Pixel 8.
- Result 11.9.2026, D-AND-FLOOR, Play versionCode 4, Instant (`soak-run-2026-09-11.md`): **PASS** for crashes (0 crash / ANR / kill, one pid 17:37–20:31, 58 prompts, 12 chats, 3 background returns, Vault + Proof round trips) and memory (PSS max 1,122 MB, minute 20 → 120: PSS −31 %, native heap +5.4 %); skin max 43.3 °C, never a kill; "Slowing down" line not exercised (OxygenOS thermal status quirk); battery drain not measurable (USB-tethered, 100 %). D-IOS-FLOOR: not run.

## E. Lifecycle (§14.7 line 5)

### T12 Background mid-generation
- Spec: §10.3 #21, §6.5.
- Procedure: ask for a 600-token answer; press Home at token ~50; wait 20 s; return.
- Pass, iOS: the answer keeps streaming off-screen for up to 15 s, then saves the partial and shows "Continue". The app holds one UIApplication background task while it does (`modules/background-task`, round 27) and gives it back the moment the answer ends or the app returns — a hold that outlives its answer is a failure even when the text is right.
- Pass, Android: the same outcome with **no service of ours at any point**. Android does not suspend the process, so the grace rides on the token stream (`engine.ts` `setPauseCheck`) and round 27 decided against a foreground service; `adb shell dumpsys activity services com.inbornapp.mobile` listing one is the failure, not the absence.
- Pass, both: no lost text; no inference past the budget.
- Runs on: both floor devices.

### T13 Incoming call and screen lock mid-generation
- Procedure: trigger a call (second phone) during streaming; lock the screen during streaming.
- Pass: same outcome as T12; DB consistent; audio session (if TTS active) yields to the call.
- Runs on: D-AND-FLOOR, D-IOS-FLOOR.
- Result 13.9.2026, E-P6-36 + S-IOS (iPhone 15 Pro sim), dev builds (`qa-run-2026-09-11.md` § Round 4): **PASS**. Emulator: `adb emu gsm call/accept/cancel` during streaming → heads-up call, streaming continued (~1 tok/s while the call was active), full speed after hang-up (`shots/t13-call-sheet.png`); `KEYCODE_SLEEP` 25 s → "Paused while Inborn was in the background. The partial answer is kept." + CONTINUE, row "The system stopped generation · Continue", CONTINUE resumed, partial kept in the DB (`shots/35-t13-paused-banner.png`, `36-t13-continued.png`). Simulator: Home 30 s → same strip and row; row Continue resumes but leaves the strip up (F17 Low, `ios-shots/d02-row-continue-8s.png`). TTS-yields half not exercised. D-AND-FLOOR / D-IOS-FLOOR: WAIVER (never lock the founder's phones).

## F. Lock and wipe (§14.7 line 6)

### T14 App lock with biometrics, failed biometrics, passcode fallback
- Spec: §5.7, §10.6 #45.
- Procedure: enable lock; background; reopen; fail Face ID/fingerprint 3×; use passcode; check the app switcher thumbnail is blurred/hidden.
- Pass: no chat content visible before unlock (switcher included); fallback works; Shortcuts respect the lock (#25).
- Runs on: both floor devices (simulator: `xcrun simctl … biometric` matching/non-matching for the flows).

### T15 Emergency wipe
- Procedure: create 3 chats + 1 document; Settings → Emergency wipe → confirm twice; also test "wipe after N failed attempts".
- Pass: DB, key, documents gone (container listing); models kept or removed per the choice; app returns to first-run; no recovery possible.
- Runs on: all.

## G. Incognito (§14.7 line 7)

### T16 Incognito never touches disk
- Spec: §5.3, §5.7, §10.6 #45.
- Procedure (iOS): Instruments › File Activity template on D-IOS-FLOOR/simulator; run a 10-message incognito chat with a document attached; filter writes to the app container. Android: `adb shell strace` is unavailable on production builds; instead snapshot `files/` + `databases/` checksums before and after (`run-as com.inbornapp.mobile sh -c 'find . -type f -exec md5sum {} +'`) and confirm no file changed except logs-free settings.
- Pass: zero writes to the DB, search index, export set or backups; after closing, memory scrubbed (KV cache reset visible in stats); incognito chats absent from search and Shortcuts.
- Runs on: S-IOS-17/26 (Instruments works on simulator), D-AND-FLOOR.

## H. Documents (§14.7 line 8)

### T17 200-page PDF with progress; answer cites a page
- Spec: §5.5, §10.4 #30.
- Pass: progressive indexing with visible progress; questions answerable on the indexed part; citation opens the passage; no crash on a 200-page file on the floor device.
- Runs on: both floor devices.
- Result 13.9.2026, E-P6-36 (Pro flag) + S-IOS (iPhone 15 Pro sim), dev builds (`qa-run-2026-09-11.md` § Round 4): **PASS**. `manual-200.pdf` (200 pages): emulator "Indexing 2 % · page 4 of 200" → "Indexed · 400 passages" with Cancel throughout (11 min, `shots/43-t17-indexing-*.png`, `44-t17-indexed.png`); ask "code word for page 150" → "umber150" with SOURCES p.150 first, chip opens the p.150 passage (`shots/53-t17-answer.png`, `54-t17-passage.png`). Simulator: 261 s, 400 chunks, same answer, search 305 ms · 46.5 tok/s (`ios-shots/e01-docs-indexing.png`, `e03-after-ask.png`, `dev-run.json`). No crash. F18 Low: Ask sheet prints `**` literally. D-AND-FLOOR: WAIVER (embedder not installed on the phone; installing = 262 MB Play download on the founder's device).

### T18 Scanned PDF → OCR; Hebrew/RTL PDF; mixed scripts
- Spec: §10.4 #30, #31.
- Pass: "no text layer" detected and OCR offered with progress and cancel; Hebrew reading order preserved; citation text not reversed.
- Runs on: D-IOS-FLOOR (Vision), D-AND-FLOOR (ML Kit bundled).
- Result 13.9.2026, E-P6-36 + S-IOS (iPhone 15 Pro sim), dev builds (`qa-run-2026-09-11.md` § Round 4): **PASS**. Emulator: scans detected as "Scanned. Run OCR on this phone?", OCR → "Indexed · 1 passage", Tesseract `eng+heb` (`shots/55-t18-scan-en-row.png`, `58-t18-ocr-done.png`); Hebrew scan answers "The deposit amount is 9,000 shekels.", passage in logical order and RTL-rendered (`shots/62-t18-he-answer.png`, `63-t18-he-passage.png`); `lease-hebrew.pdf` 4 passages, mixed-script page correct (`shots/66/67-t18-lease-passage*.png`). Simulator: Vision (en, conf 1.0) + Tesseract (he, conf 0.92), text exact (`dev-run.json`, `ios-shots/f02-docs-bottom.png`). OCR progress/cancel not observable on 1-page scans (< 2 s). D-AND-FLOOR: WAIVER (as T17).

### T19 Corrupt, 0-byte, password-protected, 100 MB paste
- Spec: §10.4 #30, #33.
- Pass: specific errors, no crash; encrypted PDF refused with explanation; huge paste truncated with notice.
- Runs on: all.
- Result 13.9.2026, E-P6-36 + S-IOS (iPhone 15 Pro sim), dev builds (`qa-run-2026-09-11.md` § Round 4): **PASS**. Both platforms: 0 B → "No text in this file", corrupt/truncated → "The file is damaged or not what its name says.", RC4-locked → "Password-protected files cannot be read.", no crash (`shots/70-t19-rows.png`, `ios-shots/f01-docs-top.png`). 20 KB shared text → "Long text, so only the first 5995 characters are used" (`shots/72-t19-share-paste20.png`); 100 MB paste rests on the code caps (6,000 chars quick actions with notice, 50,000 share import without notice) since `am start` rejects a 200 KB extra. F19 Low: 0-byte message is the generic one, not `documents.error.empty`. D-AND-FLOOR: WAIVER (keys-only picker cannot reach Downloads).

## I. Purchases (§14.7 line 9)

### T20 Purchase in sandbox, both stores
- Spec: §12.4, §10.7 #48, #52.
- Procedure: StoreKit configuration file in Xcode for simulator + sandbox tester on device; Play licence tester on D-AND-FLOOR. Include "Ask to Buy"/pending.
- Pass: Pro unlocks; pending state shown and completed on next launch; Play acknowledge within the session.
- Runs on: S-IOS-26 (StoreKit config), D-IOS-FLOOR (sandbox), D-AND-FLOOR (licence tester, needs the Play record).

### T21 Restore purchases and Family Sharing
- Procedure: reinstall, Restore; second sandbox family member (Family Sharing sandbox group in ASC).
- Pass: entitlement restored offline from the cached JWS after one sync; family member sees Pro; Play paywall states that Family Library excludes IAP.
- Runs on: D-IOS-FLOOR; Family Sharing needs an ASC sandbox family (Moshe's account).

### T22 Refund / revocation
- Procedure: refund the sandbox transaction in ASC (or Play voided purchase); relaunch.
- Pass: Pro features lock; **no data deleted**; message explains.
- Runs on: D-IOS-FLOOR, D-AND-FLOOR.

### T23 Purchase and entitlement in Airplane Mode
- Pass: entitlement honoured offline; purchase attempt offline gives a clear "needs the store" message and no stuck spinner; 30-day grace visible in Settings › Pro.
- Runs on: both floor devices.

## J. Accessibility, RTL, text size (§14.7 line 10)

### T24 RTL on every screen (Hebrew and Arabic locale)
- Spec: §5.10, §10.8 #54.
- Procedure: device language Hebrew, then Arabic; walk S01–S60 per the demo list; LTR code blocks inside RTL messages.
- Pass: mirrored layout, logical start/end, no clipped text, code stays LTR; screenshots saved.
- Runs on: simulators + emulators (locale switch is fastest there), spot-check on both floor devices.

### T25 Text at 200% (Dynamic Type largest accessibility size / Android font scale 2.0)
- Procedure: iOS Settings › Accessibility › Larger Text max; Android `adb shell settings put system font_scale 2.0`.
- Pass: no overlapping or truncated controls; tables and code scroll horizontally; composer still usable.
- Runs on: all.

### T26 VoiceOver / TalkBack during streaming
- Spec: §10.8 #53.
- Procedure: enable the screen reader; send a prompt producing ~1,000 tokens; navigate away and back.
- Pass: announcements per sentence in a polite queue; no focus theft; "read latest answer" action works; streaming region marked live/updatesFrequently.
- Runs on: D-IOS-FLOOR (VoiceOver), D-AND-FLOOR (TalkBack).
- Result 13.9.2026, E-P6-36 with TalkBack, dev build (`qa-run-2026-09-11.md` § Round 4, F15): **FAIL**. During a ~1,000-token answer TalkBack logged only `windowContentChanged`, no speech; the assistant row's description is "INSTANT · ON-DEVICE AI" only; away-and-back gives no announcement; code has no live region / `announceForAccessibility` / read-latest action (`shots/80-t26-talkback-on.png`, `81-t26-streaming.png`, `83-t26-back.png`). Not a release blocker. TalkBack disabled and settings restored. iOS: WAIVER (no VoiceOver in the simulator; no settings changes on the founder's iPhone), same code evidence.

### T27 Reduced motion and light theme
- Spec: §9, D7, §14.7 last line.
- Pass: no seal animation when Reduce Motion is on; light theme readable outdoors (contrast ≥ 4.5:1 on body text, checked with Xcode Accessibility Inspector / Android Accessibility Scanner); theme follows system automatically.
- Runs on: all.

### T28 Hardware keyboard (iPad / tablet): Enter vs Shift+Enter
- Spec: §10.8 #55.
- Runs on: iPad simulator (iOS 26), E-P6-36 with `adb shell input keyevent` or a Bluetooth keyboard.
- Result 13.9.2026, E-P6-36 (`hw.keyboard=yes`) + S-IOS (iPhone 15 Pro sim, `typeKey`), dev builds (`qa-run-2026-09-11.md` § Round 4, F16): **FAIL**. Android: Enter → newline, Shift+Enter → newline, nothing sends (`shots/73-t28-enter.png`, `74-t28-shift-enter.png`); iOS: Return and Shift+Return neither insert a newline nor send (`ios-shots/a05-t28-return.png`, `a06-t28-shift-return.png`); no Settings › Chat option, Composer has no `onKeyPress` / `submitBehavior`. Not a release blocker (keyboard extension is cut for 1.0, this row is not).

## K. Zero-network proof (§14.7 lines 11–12)

### T29 Exodus scan: zero trackers
- Procedure: `pipx install exodus-standalone`; `exodus-standalone app-release.apk` (or `exodus-standalone -t <api-token>`; offline mode uses the bundled tracker list).
- Pass: 0 trackers; output archived under `docs/qa/runs/`.
- Runs on: M-MAC.

### T30 Android merged manifest: no network permission
- Spec: §5.1, §10.9 #60. Gate already scripted: `scripts/check-android-permissions.sh`.
- Procedure: `~/Library/Android/sdk/build-tools/36.0.0/aapt2 dump permissions app-release.apk` and the same on every split from `bundletool build-apks`; also `aapt2 dump badging | grep uses-permission`.
- Pass: no `android.permission.INTERNET`, no `ACCESS_NETWORK_STATE`; only the list in `docs/legal/app-privacy-details.md` §4.2.
- Runs on: M-MAC (CI).

### T31 iOS App Privacy Report and simulator network capture: zero domains by default
- Procedure: on D-IOS-FLOOR, Settings › Privacy › App Privacy Report on for 7 days of use (or 24 h minimum); iOS simulator: `xcrun simctl` + `rvictl`/Proxyman on the host, run all scenarios.
- Pass: Inborn row empty except `models.{{DOMAIN}}` during a user-started download and `huggingface.co` after an explicit HF import.
- Runs on: D-IOS-FLOOR, S-IOS-26.

### T32 Egress meter: OUT 0 B, confirmed by mitmproxy
- Spec: §5.1, §14.2 M4.
- Procedure: `brew install mitmproxy`; `mitmdump -w run.flows --set block_global=false` on M-MAC; point the device at the Mac proxy (Wi-Fi proxy settings; Android emulator `-http-proxy`); install the mitm CA (dev build only; release pins nothing but the CA is needed to see TLS). Run every scenario in this list (install, chat, documents, purchase restore, lock, wipe, export) for a full session; then `mitmproxy -r run.flows` and count flows by host.
- Pass: flows contain only the store's own traffic (Play/App Store hosts, attributable to the store apps, not our process; Android emulator: check with `adb shell ss -tp` that no socket belongs to our uid) and the user-started model download; the in-app proof screen shows **OUT 0 B** cumulative after the run; IN equals the downloads only.
- Runs on: E-P6-36 (proxy flag), S-IOS-26, both floor devices.

## L. Platform requirements (§14.7 line 13)

### T33 16 KB page size
- Spec: §10.2 #15, §11.2.
- Procedure: boot E-P6-36; `adb shell getconf PAGE_SIZE` must print 16384 (else install the 16 KB image, see table); install the release APK; load a model; chat; also `~/Library/Android/sdk/build-tools/36.0.0/aapt2` is irrelevant here — use `scripts/check-elf-alignment.sh` from the Android NDK (`$NDK/scripts/check_elf_alignment.sh app-release.apk`).
- Pass: every `.so` reports ALIGNED (2**14); no SIGBUS on load; llama.rn works.
- Runs on: E-P6-36.

### T34 Target API 36 behaviours
- Procedure: on E-P6-36 exercise the foreground service (T12), notifications permission prompt at first download, predictive back, edge-to-edge insets.
- Pass: no policy warnings in Play Console pre-launch report; UI not hidden under system bars.
- Runs on: E-P6-36.
- Result 13.9.2026, E-P6-36, dev build (`qa-run-2026-09-11.md` § Round 4): **PASS** with notes. Merged manifest targetSdk 36 / minSdk 26; `enableOnBackInvokedCallback="false"` so predictive back is opted out (legacy arrow, `startBackNavigation`/`finishBackNavigation`, `shots/84-t34-back-mid.png`, `85-t34-back-done.png`); no `POST_NOTIFICATIONS`, so no permission prompt and no notification at first download; edge-to-edge insets correct on chat, drawer, vault, documents and the composer above the keyboard (`shots/06-chat-root.png`, `09-vault.png`, `19-t07-chat-full-disk.png`). Play pre-launch report half not run (no upload this round).

### T35 iOS 26 Liquid Glass and iOS 17/18 fallback; privacy manifest report
- Procedure: run on S-IOS-26.3 and S-IOS-17.0 and S-IOS-18.0; in Xcode, Product › Archive › Generate Privacy Report.
- Pass: UI correct on all three; Privacy Report lists only the four API categories in `docs/legal/app-privacy-details.md` §2 and no tracking domains.
- Runs on: simulators, M-MAC.

### T36 Minimum OS floor: Android 8 (API 26) and iOS 17 on a 3–4 GB profile
- Spec: §6.3, §10.2 #13–#14.
- Procedure: E-26 (arm64) and E-P6-33 with RAM set to 4 GB in the AVD (`hw.ramSize=4096`); S-IOS-17.
- Pass: installs; only Instant offered; context 2K; "basic device" notice shown; no crash.
- Runs on: emulators/simulators.

## M. Model output and safety (§10.5)

### T37 Report flow offline; disclosure lines; "can be wrong"
- Spec: §10.5 #36, #38, §11.5, AI Act notes.
- Procedure: Airplane Mode; long-press an answer → Report → Save; Settings › Reports shows it; Email report opens the mail composer with the file; check S01 disclosure line and persona headers in all 6 languages.
- Pass: works offline; nothing sent automatically; disclosure texts present.
- Runs on: all.

### T38 Loop, language, and crisis detection
- Spec: §10.5 #37, #39, #40.
- Procedure: prompt designed to loop ("repeat the word hello forever"); Hebrew question to Instant; a crisis phrase in each launch language.
- Pass: n-gram loop detector stops and offers regenerate; reply language matches the question (or the app says the model is weak in that language); crisis card appears with the locale hotline, does not block, not written to history in incognito.
- Runs on: both floor devices.

## N. Data lifecycle (§10.6)

### T39 Backup exclusion, export/import, new-device restore
- Spec: §10.6 #42–#43, §5.3.
- Procedure: iOS: `xcrun devicectl` container listing shows models under a directory with `isExcludedFromBackup`; run an encrypted iCloud backup on D-IOS-FLOOR, restore to the same device (wipe), confirm chats return and models are offered for download. Android: `adb backup` is disabled for modern apps; verify `dataExtractionRules` XML excludes the models dir and that `bmgr` full backup size excludes GB files. Export `.sealed` with passphrase; import on the simulator.
- Pass: models never in backup; chats restored; export/import round-trips with personas and settings; wrong passphrase fails cleanly.
- Runs on: D-IOS-FLOOR, D-AND-FLOOR, simulators.

### T40 Update path: engine/model versioning and manifest signature
- Spec: §10.3 #26, §10.10 #68, §5.4.
- Procedure: install previous release, create chats, download Fast; install the new build over it; tamper one byte of the catalogue manifest in a dev build and open the Vault.
- Pass: migrations atomic, integrity check on open passes, models re-validated once, nothing deleted silently, release notes shown; tampered manifest rejected with the signature error, catalogue falls back to the last good copy.
- Runs on: all.

---

## O. Voice (§5.6, §7.4, §8.2, S44) — added 7.9.2026 for main ≥ 660c909

Fixtures: `say -v Samantha "…" -o en.aiff && afconvert -f WAVE -d LEI16@16000 -c 1 en.aiff en.wav`, same with `-v Carmit` for `he.wav` (11 s each). Emulators and simulators have no host microphone (`coreaudio: Could not initialize record`, `localspeechrecognition … invalidated`), so every live-mic case needs a phone; dev bundles can replay the WAVs with `EXPO_PUBLIC_AUTOVOICE=en.wav,he.wav` (writes `Documents/dev-run.json` `voice`).

### T41 Free dictation: the system recogniser, on-device only
- Procedure: Free tier, Airplane Mode on. Tap the mic once. Android 13+: with the language pack absent, expect the sheet offering the system pack download or Whisper (PRO); download the pack in Settings › System › Languages › Speech, retry. iOS: Settings › General › Keyboard › Enable Dictation with the on-device language installed. Speak one English sentence, stop, send.
- Pass: permission prompt only on the first tap; live partial text in the draft, field pulses amber, mic becomes a stop square, "Listening… / Transcribing…" line; the final text is the spoken sentence; `requiresOnDeviceRecognition` is honoured: Airplane Mode never breaks it and the proof screen stays `OUT 0 B`; Android ≤ 12 and the web show the Whisper-only reason, never a network recogniser.
- Runs on: D-AND-FLOOR (Android 11 → Whisper-only path), a 13+ phone for the system path (BLOCKED: needs Pixel 8 until one arrives), D-IOS-FLOOR.
- 11.9.2026 iPhone 13 Pro, zero hands (`docs/qa/voice-run-2026-09-11.md`): permission alert answered by the runner; iOS refused with "Assets are not installed, Siri or Dictation is disabled" (on-device English dictation is off on that phone), the offline-missing sheet + Whisper·PRO shown as specified; the first-ever tap after Allow ended in `interrupted`; fixed on `voice-r2` (one silent retry within 500 ms of start), phone re-check owed. Real spoken words through the system engine still need the phone's dictation setting on.

### T42 Whisper dictation (Pro)
- Procedure: Pro tier (dev: `EXPO_PUBLIC_PRO=1`); `speech-whisper-base` installed (Play pack `inborn_model_speech` / HTTPS / dev `Documents/whisper.bin`). Long-press the mic → choose Whisper. Speak the EN clip text, then the HE clip text.
- Pass: whisper loads (< 1 s warm), listening → transcribing → draft; EN transcript has 0 content-word errors on the fixture sentence; HE is accepted as "usable for commands" (report the WER, do not fail on it); no audio file is written anywhere in the container (`find … -newer marker -name '*.wav' -o -name '*.pcm'` empty); Free tier sees Whisper tagged PRO and the paywall on tap.
- Runs on: D-AND-FLOOR, D-IOS-FLOOR; emulator/simulator only through the AUTOVOICE replay (dev bundle).
- 11.9.2026 iPhone 13 Pro: Free tier → PRO tag → paywall proven; Pro (StoreKit harness) → whisper UI listening/stop/transcribing proven; whisper base Metal load 19.0 s cold, 11.2 s clip in 649 ms; transcript empty because the Mac's speaker at 45 % was too faint for the phone's mic (not a pipeline failure: same clips 0 WER on the emulator). WER on the phone still open.

### T43 Hands-free voice mode (S44, Pro)
- Procedure: open `/voice`; say a short question; do not touch; after the answer say a second question; then tap once during the spoken answer; then stay silent for five rounds; also press Home mid-answer.
- Pass: listen → transcribe → think → speak → listen with the seal + level wave; the answer is spoken sentence by sentence through the system voice (never a network voice: check `pickVoice` result in the ledger/dev log and the proof meter); tap interrupts; five silent rounds end the session; Home pauses it and it resumes only on return; turns are saved to the chat and never in incognito; whisper is unloaded on exit (`[inborn]` log / memory drop).
- Runs on: D-AND-FLOOR, D-IOS-FLOOR.
- 11.9.2026 iPhone 13 Pro: the loop ran on the phone with the real mic and speaker (LISTENING → TRANSCRIBING → THINKING → SPEAKING → LISTENING, End → ENDED; answer 1.8 s, speech 106 ms after the text) but on a hallucinated transcript (faint input); interrupt / five silent rounds / Home / incognito / unload not driven yet (`steps-C`, driver has `home` + `activate`).

### T44 Read aloud

- Procedure: long-press an answer with three sentences and a code block → "Read aloud"; tap "Stop reading" mid-way; enable VoiceOver/TalkBack and repeat.
- Pass: spoken one sentence per utterance, code is skipped or read as "code block", Stop stops within a sentence, the action is announced by the screen reader, no audio focus is kept after Stop.
- Runs on: both floor devices.
- 11.9.2026 iPhone 13 Pro: PASS for the mechanics: Read aloud → first audio 334 ms (`readAloud.ttsStartMs`), row reads "Stop reading" while speaking; code block / VoiceOver halves not driven.

## P. Photos (§7.1, §7.2) — added 7.9.2026

Fixture: a 4032×3024 JPEG with GPS + camera EXIF (`exiftool -GPSLatitude=32.08 -GPSLongitude=34.78 -Make=Test in.jpg`), a HEIC from the phone's camera, a 20 MB PNG.

### T45 Attach a photo / take a photo, EXIF stripped
- Procedure: attach sheet → Photo (pick the fixture) and → Camera (take one). Pull the stored copy from `Documents/images/` (`adb shell run-as` on a dev build, `devicectl copy from` on iOS) and run `exiftool` on it.
- Pass: chip above the composer and thumbnail in the bubble; the stored file is JPEG ≤ 1024 px on the long side with **no** GPS/Make/Model/DateTimeOriginal tags; the HEIC is converted; the 20 MB PNG is accepted or refused with a size message, never a crash; `expo-image-picker` is called with `exif: false` (code) and the original is never copied whole.
- Runs on: both floor devices; simulator/emulator with a pushed fixture (Photos app import) for the EXIF check.

### T46 Vision answer
- Procedure: Instant or Fast with the `vision-qwen35` projector installed; attach the geometric-house fixture; ask "What is in this picture?"; then attach the same photo to a Phi (no vision) chat.
- Pass: projector attached with `initMultimodal` (log line), answer describes the picture (house, roof colour) — record prefill and decode tok/s; with Phi the Photo/Camera rows are disabled with the reason; without the projector the rows are disabled with "install the photo companion"; OUT 0 B throughout.
- Runs on: D-IOS-FLOOR (Metal), D-AND-FLOOR (CPU: expect minutes of prefill, note the number), simulators with `use_gpu` off.

### T47 Photo limits and tiering
- Pass: Free attaches one photo per message and the second pick opens the value moment (paywall); Pro attaches several; an incognito chat's photo never lands in `documents.json` or the DB (`ram:` key) and is gone after the chat closes; a photo attached to an unsent draft is moved to the real chat id on the first send.
- Runs on: emulator/simulator (dev `EXPO_PUBLIC_PRO=1` for the Pro half).

## Q. Pro for Work (§7.5–§7.9, §8.7, §11.3, §12.1–§12.3) — added 7.9.2026

Dev pretence: `EXPO_PUBLIC_TIER=work` (dev bundles only). Fixtures under `docs/qa/fixtures/` when they land, else the work-docs stream's `lease.docx`, `budget.xlsx`, `policy.html` (the HTML carries a `<div hidden>` "refund window is 90 days" injection; the visible text says 21 days).

### T48 Client vault: lock, relock, wrong code
- Procedure: make folder "Client A" a vault (code set twice); move a chat in; lock from the VAULT badge; open the drawer; enter a wrong code, then the right one; relaunch the app; wait 30 min (or set the clock forward) with the vault open; enable the app lock and lock the app.
- Pass: badge shows VAULT then LOCKED; locked chats are hidden and the header reads "N chats · locked"; wrong code refused with a message and no unlock; right code unlocks; a relaunch relocks; the 30-minute session closes the vault; engaging the app lock closes every open vault; the code is never stored (Keystore/Keychain holds only the per-vault salt + hash: inspect `SecureStore.xml` / `security find-generic-password` on a dev build); search never returns a locked chat.
- Runs on: emulator/simulator; spot-check on D-AND-FLOOR.

### T49 Audit log: chain verify
- Procedure: after T48, open Settings › Pro for Work › Audit log. Then, on a dev build, pull `Documents/work/<vault>.audit`, edit one entry, remove one, reorder two, truncate the file; push each variant back and reopen the screen.
- Pass: "Chain verified · N entries" with the events created / moved in / locked / unlocked / signed export and never any message content; every tampered variant shows the chain broken with the first bad index; entries are sealed with a key unrelated to the entitlement cache (`sealJson` domain label: a file sealed under one label does not open under the other).
- Runs on: emulator/simulator.

### T50 Signed record export: VALID, tampered INVALID
- Procedure: Export sheet → "Signed record" on a vault chat; save the `.json` and the `.md`; run the verification one-liner from the record's instructions on the Mac; flip one character in the JSON body and rerun; verify the `.md` states the AI marking (Art. 50).
- Pass: `VALID` for the untouched file (Ed25519 over the canonical JSON, public key inside the file), `INVALID` for the tampered copy; the readable `.md` carries the "ON-DEVICE AI" marking and no "HIPAA-compliant / privileged / certified / guarantee" wording; the export is logged in the audit chain.
- Runs on: emulator/simulator, M-MAC for the verifier.

### T51 Templates insert
- Procedure: Attach sheet → Templates → Legal pack → declaration → a template with two `{{placeholders}}`; fill one blank, leave one; insert.
- Pass: the declaration is shown before the template and its "verify before use" disclaimer is fixed (not editable); the inserted text lands in the composer with the filled blank replaced and the empty one still marked; Free/Pro see the value moment with the WORK tag and one price line, no popup; Work personas carry the pack disclaimer in their header.
- Runs on: emulator/simulator.

### T52 Architecture statement share
- Procedure: Settings › Pro for Work › Architecture statement → share to Files/Mail.
- Pass: dated, names the platform, lists the vaults and the signing key fingerprint, states the explicit non-claims (no "HIPAA-compliant", no "privileged"); the share sheet opens with a Markdown file; nothing is sent by the app (proof meter unchanged).
- Runs on: emulator/simulator.

### T53 Excel / HTML intake with a cited answer, hidden-HTML injection ignored
- Procedure: Work tier; import `budget.xlsx` and `policy.html` through "Add a file…"; ask "What was the cloud hosting cost in March?" and "Within how many days must a refund request be filed?"; then as Pro (not Work) pick `budget.xlsx` in the library.
- Pass: chips read `budget.xlsx · sheet 1` and `policy.html · §3`; answers `2,275` and `21 days` with those citations; the hidden `<div hidden>` text never appears in a passage (search the index for "90 days"); Pro sees the Excel/HTML value-moment card and nothing is imported; a `.txt` starting with `<!doctype html` is routed to the HTML extractor; a Word file remains importable on Free.
- Runs on: emulator/simulator (indexing times noted), D-AND-FLOOR spot-check.

### T54 Redaction: placeholders, reveal, persistence
- Procedure: Work tier. Paste (or type) a message with a name, an Israeli ID, a mobile number, an email, a Luhn-valid card and an IL IBAN; open Redact; add the name to the names list; "Replace n items"; send; toggle "Show originals"; restart the app; open the chat; export it; inspect `documents.json`, the DB (dev build) and the export.
- Pass: the sheet counts one of each kind; the composer holds `[NAME-1] [ID-1] [PHONE-1] [EMAIL-1] [CARD-1] [IBAN-1]`; the model's reply uses the placeholders ("Dear [NAME-1]"); Show originals renders the real values in both bubbles, Hide restores placeholders; after the restart the chat title and every message contain placeholders only (the RAM session is gone: originals cannot be revealed any more); `documents.json` holds only the names list and the dates switch; the export and the DB contain no original value; a paste longer than 300 characters shows the amber "Pasted text · redact before sending?" chip; Free/Pro see the locked card with `$69.99 · one-time purchase`; a bare 7-digit number is not flagged as a phone; `ולשרה לוי` becomes `ול[NAME-1]`.
- Runs on: emulator/simulator (typed input), a phone for the paste chip.

## R. Real-store purchases (§12.4, §10.7) — added 7.9.2026; replaces the "needs the Play record" halves of T20–T23

### T55 Play: test card → Pro unlocked → Restore
- Procedure: Play internal testing build (versionCode ≥ 2 with the licence-key fix from `purchases-verify`), tester account in the licence-tester list, on D-AND-FLOOR. Paywall → Unlock Pro → Google test card "always approves"; then "always declines"; then "slow test card, approves after a few minutes" (pending); uninstall, reinstall, Restore purchases; Airplane Mode on, relaunch.
- Pass: approved purchase is acknowledged in the session (Play Console shows no un-acknowledged order; `BillingClient` log `acknowledgePurchase` ok) and Pro gates open immediately (4th persona, 2nd document, Sharp install); decline leaves Free with a message and no stuck spinner; pending shows the pending state and completes on the next launch; Restore returns Pro offline from the cached signed proof after one sync; the Play licence signature is verified locally (`packages/core/src/licence/play.ts`) — a proof signed with another key is rejected (unit test) and the entitlement cache opened with the wrong domain label fails; the paywall states that Family Library excludes IAP.
- Runs on: D-AND-FLOOR only (Play Store required).

### T56 iOS: StoreKit configuration on the iPhone, then sandbox
- Procedure: dev build with `withStoreKitTesting` (`apps/mobile/storekit/Inborn.storekit`) on D-IOS-FLOOR from Xcode with the StoreKit configuration selected; buy Pro; Ask to Buy on; refund via the transaction manager; then the TestFlight build with a sandbox Apple ID: buy, Restore after reinstall, offline relaunch. `apps/mobile/ios-tests/PaywallUITests.swift` runs the same flow headless on a simulator (SKTestSession).
- Pass: JWS verified on device (`packages/core/src/licence/apple.ts`: the StoreKit-test JWS is self-signed and must be accepted only under the test configuration, the sandbox/production JWS must chain to the Apple root); Pro unlocks; Ask to Buy shows pending and completes; refund locks Pro with a message and **deletes nothing**; Restore works offline after one sync; the paywall shows the Family Sharing wording; `PaywallUITests` green.
- Runs on: D-IOS-FLOOR, S-IOS-26 (UI test only).

### T57 Pro owner sees the Work upgrade; Work owner sees no paywall
- Pass: with Pro owned the paywall shows "You own Pro" and the $49.99 Upgrade to Work card only; with Work owned every Work gate is open and no PRO/WORK tag remains; a Free user sees Pro first and "For professionals · Pro for Work" below with the five Work bullets; `sellable()` hides a tier whose bullet list is empty (unit test).
- Runs on: emulator/simulator with `EXPO_PUBLIC_TIER`, D-AND-FLOOR with the real purchases from T55.

## S. Retest list for the 6.9.2026 blockers (`qa-run-2026-09-06.md`) — run after fixes-r4a, sheets-keyboard and design-r2 merge, on the lead's "GO retest"

Build the release APK + AAB from the merge commit exactly as in "Play internal testing" (`INBORN_PACKS` as the release will ship it). One emulator or simulator at a time.

| Id | Blocker | Exact pass criterion | How | Result 11.9.2026 (`qa-run-2026-09-11.md`) |
|---|---|---|---|---|
| R-B1 | 16 KB page size (T33) | Every `.so` in `base-arm64_v8a.apk` and the APK has all `LOAD` segments aligned ≥ 0x4000 (0 lines `UNALIGNED`); on `qa_ps16k` (API 36.1, `getconf PAGE_SIZE` = 16384) the app launches with **no** "Android App Compatibility" dialog, loads Instant and answers; `zipalign -c -P 16 -v 4` passes | `llvm-readelf -lW` loop from the run (`t33-alignment.txt` method), boot `qa_ps16k -memory 4096`, `uiautomator dump` must contain no `alertTitle` | PASS static (45/45 `.so` aligned, zipalign OK); `qa_ps16k` launch half not run |
| R-B2 | Manifest permissions (T30) | `aapt2 dump permissions` on the APK and on `universal.apk` from the AAB lists exactly the §4.2 set of `docs/legal/app-privacy-details.md` (now including `RECORD_AUDIO`, `CAMERA` from M5b) and none of `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE`, `WAKE_LOCK`, `RECEIVE_BOOT_COMPLETED`, `BIND_GET_INSTALL_REFERRER_SERVICE`; the manifest-merger report shows them blocked or the sources removed; `check-android-permissions.sh` OK | `scripts/check-android-permissions.sh`, `aapt2 dump badging`, `manifest-merger-release-report.txt` | PASS (exact §4.2 set, 9 declared, WAKE_LOCK rejected in merger report) |
| R-B3 | Backup (T39) | Merged manifest has `android:allowBackup="false"` **or** `android:dataExtractionRules` + `android:fullBackupContent` whose XML excludes `files/models`, `files/assetpacks`, `files/SQLite`, `files/work`, `files/images` and the databases; `adb shell bmgr backupnow com.inbornapp.mobile` on a dev build reports 0 bytes for those paths (or the app opts out entirely) | merged `AndroidManifest.xml`, `res/xml/*rules*.xml`, `bmgr` | PASS (`allowBackup="false"`) |
| R-B5 | AAB pack limits | `bundletool build-apks` lists no asset slice > 1.5 GB (Sharp split into one pack per shard or excluded from the internal bundle); `bundletool validate` OK; the fast-follow + on-demand total is within Play's cumulative cap; Play Console accepts the upload (edit committed) | `unzip -l out.apks | grep asset-slices`, `scripts/play-upload.mjs` | PASS (slices 533 MB + 1.28 GB, validate OK) |
| R-B7 | Passcode survives wipe (T15) | After Delete everything → onboarding, Settings shows "Set a passcode"; `SecureStore.xml` (Android) / Keychain (iOS) hold no `inborn.lock.passcode` and no work signing seed or vault items (`SECURE_ITEMS` list); a fresh db key only; enabling the lock asks for a new code | run T15 on emulator + simulator; inspect `shared_prefs/SecureStore.xml` as root | PASS emulator + simulator (passcode + db key deleted, fresh key; "Choose a passcode" after) — **new F2**: models dir deleted with the switch off — pass 3 (13.9): F2 PASS, models kept with the switch off |
| R-B8 | No Continue after background stop (T12) | 600-word essay, Home after 6 s, back after 22 s: the partial is kept, the §8.8 strip reads "Paused while Inborn was in the background · CONTINUE", the inline "The system stopped generation · Continue" is present, tapping CONTINUE resumes and the ledger shows a second run; the same on the OnePlus 6T through `KEYCODE_TAB`/`DPAD_CENTER` | emulator + D-AND-FLOOR | PASS 6T + emulator (strip + inline Continue, second ledger run) |
| R-B9…B13, B17 | fixes-r4b | B9: with SecureStore failing (unsigned simulator build) the sheet shows `passcode.saveFailed` with the OS error; B10: iOS 26.3 chat shows the three chips above the glass composer (`ios26-03` retake); B11: `contrastRatio()` test green and light `text3` on bg ≥ 4.5:1; B12: Settings › Reports lists the saved report with reason/date/size, detail sheet has Email report + Delete; B13: `ui.py a11y` reports 0 unlabelled on the model step and lock offer, composer label is "Message…" once; B17: a stray `.gguf` in `Documents/models` is listed as `FILE · <name>`, counted, removable, never loaded | one simulator, one emulator | B12 PASS emu; B13 PASS emu + sim; B17 PASS emu; B9 not reproducible (signed Debug sim build writes the Keychain); B10 not run (no iOS 26.3 sim booted); B11 not re-run (unit test in `pn test`) |
| R-keys | sheets-keyboard | A bottom sheet with a text field (passcode, vault code, folder rename, redact names) lifts above the Android keyboard: the focused field's bounds from `uiautomator dump` stay above the IME window bounds (`dumpsys input_method` `mInputShown=true`) | Pixel_6_API_33 | PASS emulator (passcode, report, folder, vault code, ask) + 6T (chat settings, rename, folder) + simulator (passcode, folder, vault code, ask, template slot, redact names) |
| R-F (fixes-r9, pass 3 13.9.2026) | F1–F16 + N1 of `qa-run-2026-09-11.md` | Every F item PASS with the same steps and evidence as the original finding; N1 chat pinned to the end after a stream with the keyboard up | Emulator Pixel_4_API_33 (F1–F10, F12–F16, N1), iPhone 15 Pro simulator (F11) | PASS F1–F16 (pass 3 section: F1–F10, F12–F16 emulator; F11 simulator, container move `DFAB3F58…` → `3CC7FFE9…`); N1 PARTIAL FAIL (stream with keyboard up not pinned); new F17 (Unvault bypasses a locked vault's code), F18 (native SIGABRT in libexpo-sqlite when the handle closes under a statement, 1 of 8) |

Sign-off rule for the retest: every R-row PASS on its listed devices, then the full T01–T57 sign-off table is re-run only for the rows a merge touched (list them in the run file).

---

## Sign-off table (copy into the run file)

| Test | Android floor | Android emu | iOS floor | iOS sim | Desktop/Web | Evidence |
|---|---|---|---|---|---|---|
| T01–T57 | | | | | | |
| R-B1…R-keys (retest) | | | | | | |

A release ships only when every row is PASS or N/A, and every BLOCKED row is listed in the release notes to Moshe with the device it needs.
