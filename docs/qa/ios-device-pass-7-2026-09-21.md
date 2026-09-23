# iOS device pass — TestFlight build 1.0.0 (7) — 21.9.2026

Functional pass of the build 7 archive on Moshe's iPhone 13 Pro (iOS 26.6.1, udid `<iphone-udid>`, on USB)
immediately after the upload. Every launch below is the `.app` from
`/Users/moshecohen/dev/inborn-wt/ios-build-7/apps/mobile/ios/build/Inborn.xcarchive`, the same archive whose IPA went to
TestFlight — `CFBundleVersion` 7, `CFBundleShortVersionString` 1.0.0, signed `Apple Development: Moshe Cohen`, team
NGCHN95667, archive commit `af03f48`. The phone's own About screen confirms it: **`1.0.0 (7)` · `af03f48a58a7`**. Build and
upload: `docs/qa/ios-build-7-2026-09-21.md`.

**Bottom line: build 7 is healthy on the real phone.** It installs, launches, adopts the bundled Instant model, draws all
eleven deep-linked screens, survives a background/foreground round trip without restarting, holds memory flat over three
minutes idle, prints nothing new in the console, and produced zero crash reports. One row is open — a real chat turn — not
run because the phone's UI-Automation passcode gate blocks it and only Moshe can clear it.

Screenshots in `docs/qa/ios-device-pass-7/` are 500 px-wide copies; the 1170×2532 originals and all logs stay in the
session scratch dir `…/scratchpad/ios-build-7/` and are not committed.

## Results

| # | check | result | evidence |
|---|---|---|---|
| 0 | the archive is build 7 and complete | **PASS** — CFBundleVersion 7 / 1.0.0 on the app and on `PlugIns/AskInborn.appex`; `instant.gguf` 532,517,120 B; `tessdata` holds `eng` + `heb`; App Group in both signed entitlements; `ExpoBattery` ×3 in the binary | build doc, `archive-verify.txt` |
| 1 | install the archive's `.app` | **PASS** — "App installed", bundle `com.inbornapp.mobile`, 01:17:28 → 01:17:44 (16 s over USB) | `install.json`, `install.log` |
| 2 | launch, process alive at 60 s | **PASS** — launched 01:17:52, pid **8793** still listed at 01:18:52 (t+60 s) | `launch-times.txt`, `alive-60s.txt` |
| 2b | first screen content | **PASS** — welcome reads "Nothing leaves this phone." over "AI that runs on your device. No account. No cloud. No trace.", chip `RUNS ON: A15 BIONIC · 6 GB`, Continue filled and enabled, footer "This is AI. It can be wrong. Check important facts." The 60 s capture is **byte-identical** to the first (both sha256 `c06d3595e16a…`): no spinner, no redbox, nothing moved | `01-first-launch.png`, `01b-at-60s.png` |
| 3 | bundled Instant adopted | **PASS** — `Documents/models/vault.json`: `via:"bundled"`, `Qwen3.5-0.8B-Q4_K_M.gguf`, 532,517,120 B, sha256 `bd258782…dc517`, identical to `packages/core/src/catalog/manifest.json`; `verifiedAt` **517 ms** after `installedAt`; `downloads`, `imports` and `hf` all empty | `vault.json` |
| 4 | deep link to every main screen | **PASS** — 11 routes, each launched with its own URL, held 11 s, screenshotted and sampled alive (pids 8800–8814). Every screenshot shows its own screen. Route table below | `r-10…r-20-*.png`, `routes.txt` |
| 5 | nothing new in the console | **PASS** — across the 12 launches the whole vocabulary is the six known lines: the two `UIBackgroundModes` Info.plist warnings, `_setUpFeatureFlags called with release level 2`, glog's `Logging before InitGoogleLogging()`, `ReactInstance: evaluateJavaScript() with JS bundle`, and the `UIManagerBinding` dropped-event line. A grep for error / exception / fatal / redbox over every log returns **nothing** | `log-<route>.txt` ×11, `console-launch1.txt` |
| 5b | deep links are really routed, not ignored | **PASS** — the redirecting launches log `UIManagerBinding … will be dropped` (plain launch 2, `inborn:///` 2) and all ten directly-mounted routes log **0**. A URL that never reached the router could not produce that split. Narrower than build 6, where `/legal/privacy` and `/settings/storage` also logged one each; those two are 0 here, which is timing, not a regression — both screens drew correctly | `log-*.txt` |
| 6 | a real chat turn on the device | **NOT RUN** — the XCUITest driver is blocked by the phone's "Enter iPhone Passcode for 'XCTest' · Enable UI Automation" sheet, which does not persist a grant and only Moshe can accept. Build 6 spent an attempt on it and had to kill `testmanagerd` to clear the standing sheet; this run did not attempt it, so no sheet was raised and no system process was killed | build 6 pass, `reference-ios-xcuitest-device-voice-driving` |
| 7 | background → foreground round trip | **PASS** — app backgrounded by activating SpringBoard with `--no-kill-existing` (nothing killed): home screen drawn with the Inborn icon on it, pid **8815** still alive. Re-launched 01:25:56 and the **same pid 8815** came back on the same screen. Resumed, not restarted | `30-backgrounded.png`, `31-foregrounded.png`, `idle-run.txt` |
| 7b | memory after 3 minutes idle | **PASS** — same pid 8815 at both samples; physical footprint moved **−245,760 B (−0.32%)** over three untouched minutes and the anonymous peak did not move at all. Table below | `idle-run.txt`, `sysmon-t20.json`, `sysmon-idle3m.json`, `32-after-idle-3min.png` |
| 8 | crash-log sweep | **PASS** — `pymobiledevice3 crash ls` holds 49 files and **not one** names `Inborn` or `com.inbornapp`. The store is `SiriSearchFeedback`, `spotlightknowledged.cpu_resource`, `*.diskwrites_resource` and `LowBatteryLog` entries only, newest 18.9 | `crashlogs.txt` |
| 8b | crash sweep repeated after the whole run | **PASS** — re-listed after the uninstall: still 49 files, **byte-identical listing**, still 0 Inborn reports | `crashlogs-final.txt` |
| 9 | Proof screen: nothing leaves the phone | **PASS** — `SEALED · ON-DEVICE`, **`OUT 0 B · IN 0 B`**, `CONNECTIONS 0 this session`, `since install · 0 days`, last delivery "Instant ships inside the app · nothing downloaded", permissions all off ("Network: none (not in the manifest)"), allowlist limited to `huggingface.co` / `*.hf.co` | `r-18-proof.png` |
| 9b | paywall prices come from the App Store | **PASS** — PRO **₪59.90** and PRO FOR WORK **₪199.90**, one-time, plus Restore purchases — shekels from StoreKit, not the USD `fallbackPrice` constants. No purchase was attempted and no sandbox sheet was raised | `r-17-paywall.png` |
| 10 | uninstall, 0 Inborn apps | **PASS** — SIGTERM to pid 8815, then `com.inbornapp.mobile` uninstalled 01:30 ("App uninstalled."); the app list has **0** rows matching `inborn`; the nine remaining apps are Moshe's own and none was installed, removed or launched by this run | `uninstall.txt`, `apps-final.json` |
| 10b | home screen after uninstall | **PASS** — no Inborn icon, no test-runner icon, no dialog standing | `99-home-after-uninstall.png` |
| 11 | phone left as found | **PASS, no intervention needed** — no setting changed, no passcode entered, no lock or unlock, no permission prompt, no system process killed, and the only bundle installed or removed was `com.inbornapp.mobile`. Unlike build 6 there was no stuck XCTest sheet to clear, because no XCUITest was started | `99-home-after-uninstall.png`, `apps-final.json` |

### What each route drew

| route | screenshot shows | shot |
|---|---|---|
| `inborn:///` | the onboarding welcome — the redirect | `r-10-root.png` |
| `/chats` | "Chats", search, New chat / Incognito, "No chats yet · Start one above. Everything stays on this phone.", the INSTANT / Personas / Memory / Folders row with the PRO pill, bottom bar `INSTANT · OUT 0 B`, Settings and Proof | `r-11-chats.png` |
| `/vault` | "Model vault", `1 KB in the vault · 81 GB free · RUNS ON: IOS-MID · 6 GB`, the Best for / in English pickers, INSTANT Qwen3.5 0.8B with the catalog-v3 copy (good at / weak at / languages, `508 MB · Q4_K_M · Battery: Low`, `~25-36 tok/s`), "Included with the app", "In use" and Details; FAST Qwen3.5 2B below it | `r-12-vault.png` |
| `/documents` | "Documents", "No documents · 0 B on this device", the "Answer only from my documents" toggle, the 262 MB document-index-model offer, "Select documents to ask", footer `INDEXED ON THIS DEVICE · sqlcipher` | `r-13-documents.png` |
| `/settings` | Appearance (System/Dark/Light, seven text sizes), Security (passcode off, hide-in-switcher on, screenshot protection off, wipe-after-failed-unlock, auto-delete) | `r-14-settings.png` |
| `/settings/storage` | "Privacy & storage": Chats 205 KB encrypted (SQLCipher), Documents/Models/Memory/Reports 0 B, Export and Transfer greyed behind Pro, Delete all chats / Delete everything | `r-15-settings-storage.png` |
| `/settings/about` | **`1.0.0 (7)` and commit `af03f48a58a7`** — the phone confirming which build ran; licences, "We collect nothing. There is nothing to opt out of.", Report a problem, "Made without a server." | `r-16-settings-about.png` |
| `/paywall` | "Pay once. Own it.", both tiers on one screen, ₪59.90 and ₪199.90 one-time, Restore purchases | `r-17-paywall.png` |
| `/proof` | `SEALED · ON-DEVICE`, `OUT 0 B · IN 0 B`, `CONNECTIONS 0 this session` | `r-18-proof.png` |
| `/legal/privacy` | the privacy policy, "LAST EDITED 5 September 2026" | `r-19-legal-privacy.png` |
| `/onboarding` | the welcome step | `r-20-onboarding.png` |

`inborn:///voice` was **deliberately skipped** for the third build running: `HandsFreeScreen` calls `useHandsFree` on mount,
so opening it on a fresh install would start the microphone and leave a permission alert standing on Moshe's phone.

### Memory (check 7b)

One launch, `pymobiledevice3 developer dvt sysmon process single --userspace`, values in bytes, app sitting on onboarding
with the model not yet loaded (a floor, not a chat-session figure). The three idle minutes span the
background/foreground round trip's aftermath — the app was left in the foreground and untouched.

| when | pid | resident | phys footprint | anon | anon peak |
|---|---|---|---|---|---|
| t+20 s | 8815 | 113,950,720 | 76,514,176 | 60,473,344 | 61,194,240 |
| t+3 min idle | 8815 | 114,638,848 | 76,268,416 | 60,227,584 | 61,194,240 |

Footprint fell 246 KB over three minutes and the anonymous peak did not move. Nothing leaks while the app sits, and the
figures sit within 0.3% of build 6's (76,317,568 → 76,465,024 over five minutes). Thermal state is still unmeasured:
`sysmon process` does not expose it. The release checklist's soak target (RSS growth under 10% between minute 20 and minute
120 under load) is a different, longer test and is covered on Android by soak run 3.

## What still needs a tap

The archive is a store-configuration Release build, so every headless hook is dead (`EXPO_PUBLIC_AUTOPROMPT`, `AUTOINDEX`,
`AUTOASK`, `AUTOVOICE` are inlined empty by Metro; the `__DEV__`-gated ones never fire), and a fresh install is not
onboarded, so the chat screen is not reachable by URL: `src/app/index.tsx` redirects to `/onboarding` until
`prefs.onboarded` is true.

| # | what | state after this pass |
|---|---|---|
| U1 | a real chat turn | **open** — not attempted this round; the UI-Automation grant does not persist and needs Moshe's passcode once while a runner is starting. Build 6 left a ready `chat.xctestrun` recipe |
| U2 | model details sheet | **open** — an in-screen sheet, not a route (`screens/vault/ModelDetails.tsx`); from the vault, tap `details-<model id>`. The vault screenshot shows the Details button present |
| U3 | share sheet / share extension | **open** — tap-driven by definition (Safari → Share → Inborn); the `.appex` is confirmed inside the installed bundle |
| U4 | voice mode | **open by choice** — `inborn:///voice` starts the microphone on mount; skipped |
| U5 | thermal state under load | **open** — not exposed by `sysmon process` |

Everything else that was open on the phone at build 3 is closed: first screen, the eleven routes, About, Proof, both
paywall cards, the background/foreground round trip and memory all have on-device screenshots in this pass.

## Process audit

On the Mac: `xcrun devicectl` and `pymobiledevice3` invocations plus the archive / export / altool runs of the build doc.
Every `devicectl … --console` child was killed by pid at the end of its own step; every other process exited on its own,
except one `/usr/bin/log stream` that `altool` spawns for its own network tracing and orphans to launchd — it was found by
`pgrep` and killed by pid (55218, started 01:14:39 with the upload).
`pgrep -f "devicectl|xcodebuild|pymobiledevice3|altool|log stream"` is empty at the end of the run. No XCUITest was started, so no
`testmanagerd` was touched. No browser, simulator, emulator, dev server or tmux session was started, and no gradle or adb
ran in this stream — the OnePlus 6T soak running in parallel was left alone. The `.p8` copies written for the upload
(scratch dir and `~/.appstoreconnect/private_keys`) were deleted.

On the phone: the Inborn app (14 launches, each terminated with SIGTERM — `App terminated due to signal 15` is devicectl's
own kill, not a crash) and two `com.apple.springboard` activations with `--no-kill-existing`, which is the home-button
equivalent and kills nothing. No purchase was attempted, no Apple sandbox sheet was raised, no microphone or other
permission prompt was triggered, no passcode was entered, the phone was never locked or unlocked, no setting was changed,
and the app was uninstalled at the end.

The generated `ios/` tree in this worktree gained a `build/` tree; that path is gitignored, so no tracked file changed.
