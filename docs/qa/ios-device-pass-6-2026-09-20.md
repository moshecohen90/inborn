# iOS device pass — TestFlight build 1.0.0 (6) — 20.9.2026

Functional pass of the build 6 archive on Moshe's iPhone 13 Pro (iOS 26.6.1, udid `REDACTED-IPHONE`, on USB) immediately
after the upload. Every launch below is the `.app` from
`/Users/moshecohen/dev/inborn-wt/ios-build-6/apps/mobile/ios/build/Inborn.xcarchive`, the same archive whose IPA went to TestFlight —
`CFBundleVersion` 6, `CFBundleShortVersionString` 1.0.0, signed `Apple Development: Moshe Cohen`, team NGCHN95667, archive commit
`5481b13`. The phone's own About screen confirms it: **`1.0.0 (6)` · `5481b13ad7b9`**. Build and upload: `docs/qa/ios-build-6-2026-09-20.md`.

**Bottom line: build 6 is healthy on the real phone.** It installs, launches, adopts the bundled Instant model, draws all eleven
deep-linked screens, holds memory flat over five minutes idle, prints nothing new in the console, and produced zero crash reports. One
row is open — a real chat turn — blocked by the phone's UI-Automation passcode gate, not by the app, exactly as in build 5.

Screenshots in `docs/qa/ios-device-pass-6/` are 500 px-wide copies; the 1170×2532 originals and all logs stay in the session scratch dir
`…/scratchpad/ios-build-6/` and are not committed.

## Results

| # | check | result | evidence |
|---|---|---|---|
| 0 | the archive is build 6 and complete | **PASS** — CFBundleVersion 6 / 1.0.0 on the app and on `PlugIns/AskInborn.appex`; `instant.gguf` 532,517,120 B; `tessdata` holds `eng` + `heb`; App Group in both signed entitlements | build doc, `archive-verify.txt` |
| 1 | install the archive's `.app` | **PASS** — "App installed", bundle `com.inbornapp.mobile`, 21:42:12 → 21:42:30 (18 s over USB) | `install.json` |
| 2 | launch, process alive at 60 s | **PASS** — launched 21:42:47, pid **8689** still listed at 21:43:45 (t+58 s) | `launch-times.txt`, `alive-60s.txt` |
| 2b | first screen content | **PASS** — welcome reads "Nothing leaves this phone." over "AI that runs on your device. No account. No cloud. No trace.", chip `RUNS ON: A15 BIONIC · 6 GB`, Continue filled and enabled, footer "This is AI. It can be wrong. Check important facts." The 60 s capture is **byte-identical** to the first (sha256 `6d0c00a79aab…`): no spinner, no redbox, nothing moved | `01-first-launch.png` |
| 3 | bundled Instant adopted | **PASS** — `Documents/models/vault.json`: `via:"bundled"`, `Qwen3.5-0.8B-Q4_K_M.gguf`, 532,517,120 B, sha256 `bd258782…dc517`, identical to `packages/core/src/catalog/manifest.json:19`; `verifiedAt` **484 ms** after `installedAt`; `downloads` and `imports` empty | `vault.json` |
| 4 | deep link to every main screen | **PASS** — 11 routes, each launched with its own URL, held 11 s, screenshotted and sampled alive. Every screenshot shows its own screen. Route table below | `r-10…r-20-*.png`, `routes.txt` |
| 5 | nothing new in the console | **PASS** — across the 12 launches the whole vocabulary is the six known lines: the two `UIBackgroundModes` Info.plist warnings, `_setUpFeatureFlags called with release level 2`, glog's `Logging before InitGoogleLogging()`, `ReactInstance: evaluateJavaScript() with JS bundle`, and the `UIManagerBinding` dropped-event line. No error, no redbox, no native warning from any new round | `log-<route>.txt` ×12 |
| 5b | deep links are really routed, not ignored | **PASS** — the build-5 signature reproduces: the redirecting launches log `UIManagerBinding … will be dropped` (root 2, `/legal/privacy` 1, `/settings/storage` 1) and the directly-mounted routes log **0**. A URL that never reached the router could not produce that split | `log-*.txt` |
| 6 | a real chat turn on the device | **UNVERIFIED — attempted once, blocked by the phone.** The runner never reached step 1: `Timed out while enabling automation mode`. See the chat-turn section | `chat-test.log`, `probe-during-test.png` |
| 7 | memory at 60 s and after 5 minutes idle | **PASS** — same pid 8709 at both samples, physical footprint +147 KB (0.19%) over five minutes. Table below | `idle-clean.txt`, `sysmon-raw-clean60.json`, `sysmon-raw-clean5m.json` |
| 7b | the app is resumed, not restarted, across an idle | **PASS** — pid **8702** at t+20 s and the same pid 8702 after five untouched minutes on an earlier run; pid **8709** likewise across the clean run | `idle-run.txt`, `idle-clean.txt` |
| 8 | crash-log sweep | **PASS** — `systemCrashLogs` holds 49 files and **not one** names `Inborn` or `com.inbornapp`. The store is `SiriSearchFeedback`, `spotlightknowledged.cpu_resource`, `*.diskwrites_resource` and `LowBatteryLog` entries only | `crashlogs.txt` |
| 8b | crash sweep repeated after the whole run | **PASS** — re-listed 22:03, still 49 files, still **0** Inborn reports. The failed XCUITest run left no crash report either | `crashlogs-final.txt` |
| 9 | Proof screen: nothing leaves the phone | **PASS** — `SEALED · ON-DEVICE`, **`OUT 0 B · IN 0 B`**, `CONNECTIONS 0 this session`, last delivery "Instant ships inside the app · nothing downloaded", permissions all off, network allowlist limited to `huggingface.co` / `*.hf.co` | `r-18-proof.png` |
| 9b | paywall prices come from the App Store | **PASS** — PRO **₪59.90** and PRO FOR WORK **₪199.90**, one-time, plus Restore purchases — shekels from StoreKit, not the USD `fallbackPrice` constants. No purchase was attempted and no sandbox sheet was raised | `r-17-paywall.png` |
| 10 | uninstall, 0 Inborn apps | **PASS** — `com.inbornapp.mobile` and `com.inbornapp.mobile.uitests.xctrunner` both uninstalled 22:03:27 ("App uninstalled." ×2); the app list has **0** rows matching `inborn`; the nine remaining apps are Moshe's own and none was installed, removed or launched by this run | `uninstall.txt`, `apps-final.json` |
| 10b | home screen after uninstall | **PASS** — no Inborn icon, no test-runner icon, no dialog standing | `99-home-after-uninstall.png` |
| 11 | phone left as found | **PASS, with one disclosed intervention** — no setting changed, no passcode entered, no lock or unlock, and the only bundles installed or removed were `com.inbornapp.mobile` and its test runner. The exception: `testmanagerd` (pid 8710) was killed to clear the stuck XCTest passcode sheet, the documented method, verified by screenshot. `PasswordProtected` reads false after the run, as before it | `probe-after-kill.png`, `uninstall.txt` |

### What each route drew

| route | screenshot shows | shot |
|---|---|---|
| `inborn:///` | the onboarding welcome — the redirect | `r-10-root.png` |
| `/chats` | "Chats", search, New chat / Incognito, "No chats yet · Start one above. Everything stays on this phone.", the INSTANT / Personas / Memory / Folders row with the PRO pill, bottom bar `INSTANT · OUT 0 B` | `r-11-chats.png` |
| `/vault` | "Model vault", `1 KB in the vault · 81 GB free · RUNS ON: IOS-MID · 6 GB`, the new **Best for / in English** pickers, INSTANT Qwen3.5 0.8B with the catalog-v3 copy (good at / weak at / languages, `508 MB · Q4_K_M · Battery: Low`, `~25-36 tok/s`), "Included with the app", "In use"; FAST 2B below it | `r-12-vault.png` |
| `/documents` | "Documents", "No documents · 0 B on this device", the "Answer only from my documents" toggle, the 262 MB document-index-model offer, footer `INDEXED ON THIS DEVICE · sqlcipher` | `r-13-documents.png` |
| `/settings` | Appearance (System/Dark/Light, seven text sizes), Security (passcode off, hide-in-switcher on, screenshot protection off, wipe-after-failed-unlock, auto-delete) | `r-14-settings.png` |
| `/settings/storage` | "Privacy & storage": Chats 205 KB encrypted (SQLCipher), Documents/Models/Memory/Reports 0 B, Export and Transfer greyed behind Pro, Delete all / Delete everything | `r-15-settings-storage.png` |
| `/settings/about` | **`1.0.0 (6)` and commit `5481b13ad7b9`** — the phone confirming which build ran; licences, "We collect nothing. There is nothing to opt out of.", Report a problem, "Made without a server." | `r-16-settings-about.png` |
| `/paywall` | both tiers on one screen, ₪59.90 and ₪199.90 one-time, Restore purchases | `r-17-paywall.png` |
| `/proof` | `SEALED · ON-DEVICE`, `OUT 0 B · IN 0 B`, `CONNECTIONS 0 this session` | `r-18-proof.png` |
| `/legal/privacy` | the privacy policy, "LAST EDITED 5 September 2026" | `r-19-legal-privacy.png` |
| `/onboarding` | the welcome step | `r-20-onboarding.png` |

`inborn:///voice` was **deliberately skipped**: `HandsFreeScreen` calls `useHandsFree` on mount, so opening it on a fresh install
would start the microphone and leave a permission alert standing on Moshe's phone.

### Memory (check 7)

One launch, `pymobiledevice3 developer dvt sysmon process single --userspace`, values in bytes, app sitting on onboarding with the
model not yet loaded (a floor, not a chat-session figure).

| when | pid | resident | phys footprint | anon | anon peak |
|---|---|---|---|---|---|
| t+60 s | 8709 | 113,786,880 | 76,317,568 | 60,276,736 | 61,112,320 |
| t+5 min idle | 8709 | 113,934,336 | 76,465,024 | 60,424,192 | 61,112,320 |

Footprint moved 147 KB in five minutes and the anonymous peak did not move at all. Nothing leaks while the app sits. An earlier
launch in the same session gave the same picture (footprint 76,333,928 at 68 s, 76,202,904 after five minutes idle, pid 8702 both
times). Thermal state is still unmeasured: `sysmon process` does not expose it. The release checklist's soak target (RSS growth under
10% between minute 20 and minute 120 under load) is a different, longer test.

## The chat turn: one XCUITest attempt, blocked by the phone (check 6)

Attempted once, as authorised, and it failed at the known gate rather than on anything to do with the app.

Setup, identical in shape to build 5: `ruby scripts/ios-add-storekit-tests.rb ios/Inborn.xcodeproj Inborn` added the `InbornUITests`
target to this build's prebuilt project (`apps/mobile/ios` is gitignored, so no tracked file changed), then `xcodebuild
build-for-testing … -configuration Release` → `** TEST BUILD SUCCEEDED **`. The generated `Inborn_iphoneos26.2-arm64.xctestrun` was
copied to `chat.xctestrun` beside it and patched so `InbornUITests.UITargetAppPath` points at the **archive's** `Inborn.app`, not the
freshly built one — the driver would have tapped through the shipped build 6. `VOICE_STEPS` held onboarding plus the turn in one
session: `onboarding-continue` → `start-chatting` → `airplane-skip` → `sealed-start` → `lock-start` → `composer-input` →
type "What is 2 plus 2?" → `send`, with a `shot` and a `dump` at each stage.

What happened: the runner launched at 21:59:53 (`InbornUITests-Runner[8711] Running tests…`), the phone put up **"Enter iPhone
Passcode for 'XCTest' · Enable UI Automation"**, and it stayed up. The prompt was not touched. At 22:00:53 the runner died with
`Failed to initialize for UI testing … Timed out while enabling automation mode` and `** TEST EXECUTE FAILED **`. Not one driver step
ran, so nothing about the app was learned either way. This is the behaviour recorded in `docs/qa/purchases-run-2026-09-11.md`, in
build 5's pass, and in the memory note `reference-ios-xcuitest-device-voice-driving`: the UI-Automation grant does not persist and
only Moshe can enter the passcode.

**The sheet was still standing after xcodebuild exited** (`probe-during-test.png`, unchanged two minutes later), so it was cleared the
documented way — `pymobiledevice3 developer dvt kill 8710` (testmanagerd) — and the result verified by screenshot: the sheet is gone
and the phone is back on its home screen (`probe-after-kill.png`). **No passcode was entered and no setting was changed.**

To close this row: Moshe enters the passcode once while a runner is starting, then the same `chat.xctestrun` runs hands-free. It needs
no rebuild — the test bundle is already built at
`/Users/moshecohen/dev/inborn-wt/ios-build-6/apps/mobile/ios/build/dd/Build/Products/`.

## What still needs a tap

The archive is a store-configuration Release build, so every headless hook is dead (`EXPO_PUBLIC_AUTOPROMPT`, `AUTOINDEX`, `AUTOASK`,
`AUTOVOICE` are inlined empty by Metro; the `__DEV__`-gated ones never fire), and a fresh install is not onboarded, so the chat screen
is not reachable by URL: `src/app/index.tsx` redirects to `/onboarding` until `prefs.onboarded` is true.

| # | what | state after this pass |
|---|---|---|
| U1 | a real chat turn | **open** — one attempt spent on the automation gate; needs Moshe's passcode once (above) |
| U2 | model details sheet | **open** — an in-screen sheet, not a route (`screens/vault/ModelDetails.tsx`); from the vault, tap `details-<model id>`. The vault screenshot shows the Details button present |
| U3 | share sheet / share extension | **open** — tap-driven by definition (Safari → Share → Inborn); the `.appex` is confirmed inside the installed bundle |
| U4 | voice mode | **open by choice** — `inborn:///voice` starts the microphone on mount; skipped |
| U5 | thermal state under load | **open** — not exposed by `sysmon process` |

Everything else that was open on the phone at build 3 is closed: first screen, the eleven routes, About, Proof, both paywall cards and
memory all have on-device screenshots in this pass.

## Process audit

On the Mac: `xcrun devicectl` and `pymobiledevice3` invocations, one `xcodebuild build-for-testing` and one
`xcodebuild test-without-building`, plus the archive/export/altool runs of the build doc. Every `devicectl … --console` child was
killed by pid at the end of its own step; both xcodebuild runs exited on their own; `pgrep -f "devicectl|xcodebuild|pymobiledevice3"`
is empty at the end of the run. No browser, emulator, simulator, dev server or tmux session was started, and no gradle ran in this
stream. The `.p8` copies written for the upload (scratch dir and `~/.appstoreconnect/private_keys`) were deleted; that directory is
empty again.

On the phone: the Inborn app (14 launches, each terminated with SIGTERM — `App terminated due to signal 15` is devicectl's own kill,
not a crash) and, once, the `InbornUITests-Runner`. No purchase was attempted, no Apple sandbox sheet was raised, no microphone or
other permission prompt was triggered, no passcode was entered, the phone was never locked or unlocked, no setting was changed, and
both Inborn bundles were uninstalled at the end. One system process was killed and it is disclosed in row 11: `testmanagerd`, to clear
the stuck XCTest passcode sheet.

The generated `ios/` tree in this worktree gained the `InbornUITests` target and a `build/` tree; that path is gitignored, so no
tracked file changed.
