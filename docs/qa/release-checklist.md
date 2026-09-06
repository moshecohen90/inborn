# Inborn release checklist: the 40 tests

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

### T07 Storage full before / during download and during DB write
- Spec: §10.1 #5, #6, §10.3 #22.
- Procedure: fill the device to < 1 GB free (`adb shell fallocate -l …` in the app's files dir via run-as; simulator: create a large file in the container); attempt a 1.28 GB download; then chat 20 messages.
- Pass: download refused with the "needs X GB, you have Y" message before starting; mid-download ENOSPC pauses with a clear message, no corrupt file; DB writes fail gracefully (WAL), integrity check on next open passes.
- Runs on: E-P6-36 (easy to fill), S-IOS-17.

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

## E. Lifecycle (§14.7 line 5)

### T12 Background mid-generation
- Spec: §10.3 #21, §6.5.
- Procedure: ask for a 600-token answer; press Home at token ~50; wait 20 s; return.
- Pass: iOS finishes up to 15 s then saves partial and shows "Continue"; Android short-lived foreground service with notification finishes or saves partial; no lost text; no background inference beyond the budget (verify with `adb shell dumpsys activity services` that the service stopped).
- Runs on: both floor devices.

### T13 Incoming call and screen lock mid-generation
- Procedure: trigger a call (second phone) during streaming; lock the screen during streaming.
- Pass: same outcome as T12; DB consistent; audio session (if TTS active) yields to the call.
- Runs on: D-AND-FLOOR, D-IOS-FLOOR.

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

### T18 Scanned PDF → OCR; Hebrew/RTL PDF; mixed scripts
- Spec: §10.4 #30, #31.
- Pass: "no text layer" detected and OCR offered with progress and cancel; Hebrew reading order preserved; citation text not reversed.
- Runs on: D-IOS-FLOOR (Vision), D-AND-FLOOR (ML Kit bundled).

### T19 Corrupt, 0-byte, password-protected, 100 MB paste
- Spec: §10.4 #30, #33.
- Pass: specific errors, no crash; encrypted PDF refused with explanation; huge paste truncated with notice.
- Runs on: all.

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

### T27 Reduced motion and light theme
- Spec: §9, D7, §14.7 last line.
- Pass: no seal animation when Reduce Motion is on; light theme readable outdoors (contrast ≥ 4.5:1 on body text, checked with Xcode Accessibility Inspector / Android Accessibility Scanner); theme follows system automatically.
- Runs on: all.

### T28 Hardware keyboard (iPad / tablet): Enter vs Shift+Enter
- Spec: §10.8 #55.
- Runs on: iPad simulator (iOS 26), E-P6-36 with `adb shell input keyevent` or a Bluetooth keyboard.

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

## Sign-off table (copy into the run file)

| Test | Android floor | Android emu | iOS floor | iOS sim | Desktop/Web | Evidence |
|---|---|---|---|---|---|---|
| T01–T40 | | | | | | |

A release ships only when every row is PASS or N/A, and every BLOCKED row is listed in the release notes to Moshe with the device it needs.
