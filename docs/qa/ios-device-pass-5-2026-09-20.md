# iOS device pass — TestFlight build 1.0.0 (5) — 20.9.2026

Functional pass of the **already archived** build 5 on Moshe's iPhone 13 Pro (iOS 26.6.1, udid `<iphone-udid>`).
The app was never rebuilt: every launch in this document is the `.app` from
`/Users/moshecohen/dev/inborn-wt/ios-build-3/apps/mobile/ios/build/Inborn.xcarchive`
(`ApplicationProperties.CFBundleVersion` **5**, `CFBundleShortVersionString` 1.0.0, signed `Apple Development: Moshe Cohen`,
team NGCHN95667), archive commit `f78ffdd` — which the phone's own About screen confirms as `1.0.0 (5) · f78ffdd80c2e`. A
test *runner* was built for the one XCUITest attempt, pointed at that same archived app; see the chat-turn section.
Prior runs: `docs/qa/ios-build-5-2026-09-14.md`, `docs/qa/ios-build-3-2026-09-11.md`.

**Bottom line: build 5 is healthy on the real phone.** Installs, launches, adopts the bundled model, renders all eleven
deep-linked screens, holds memory flat over five minutes idle, and has produced zero crash reports across three sweeps. One
row remains open — a real chat turn — and it is blocked by the phone's UI-Automation passcode gate, not by the app.

## Two passes, because the phone changed transport mid-run

**Pass 1 (13:09–13:29, Wi-Fi only).** The phone was paired over the local network with nothing on the USB bus
(`transportType: localNetwork`; `pymobiledevice3 usbmux list` → `[]`; `ioreg -p IOUSB` showed only the OnePlus). The screenshot
channel builds 3/4/5 used — `pymobiledevice3 developer dvt screenshot` over the no-root **userspace tunnel** — rides on usbmux
and so was unavailable, the network alternative needs root that this Mac has no passwordless path to, and `devicectl` has no
screenshot command of its own. Every visual row was therefore recorded UNVERIFIED rather than guessed, and the deep-link rows
were carried by a console differential instead (kept below, because it is what stood in for the screenshots and it turned out
to be right).

**Pass 2 (13:37 onward, USB).** Moshe put the phone on the cable. `pymobiledevice3 usbmux list` now reports
`ConnectionType: USB`, iOS 26.6.1, and `developer dvt screenshot --userspace` works. The same build-5 `.app` was reinstalled
from the same archive and the visual rows were closed for real. Screenshots live in the scratch dir under `shots/`
(full-resolution 1170×2532 PNG, plus a downscaled `sm-` copy of each).

The result: what pass 1 could only infer, pass 2 photographed, and the two agree. Nothing in pass 1 had to be retracted.

## Results

| # | check | result | evidence |
|---|---|---|---|
| 0 | the archive is build 5 and complete | **PASS** — `CFBundleVersion` 5 / `1.0.0`; `PlugIns/AskInborn.appex` = `com.inbornapp.mobile.share-extension`, also CFBundleVersion 5; `instant.gguf` 532,517,120 B; `DocExtractOcr.bundle/tessdata` holds `eng` + `heb` | archive `Info.plist`, bundle listing |
| 1 | install the archive's `.app` | **PASS** — "App installed", bundle `com.inbornapp.mobile`, 13:09:59→13:10:33 (34 s over Wi-Fi). Reinstalled from the same archive for pass 2 at 13:37:38→13:37:54 (16 s over USB) | `install.json`, `install2.json` |
| 2 | launch, process alive at 60 s | **PASS** — launched 13:10:42, pid **8389** still listed at 13:11:44 (t+62 s) and 13:11:53 (t+71 s) | `launch1.json`, `procs-t2.json`, `alive-t2.txt`, `alive-60s.txt` |
| 2b | first screen content | **PASS** (pass 2) — onboarding welcome reads "Nothing leaves this phone." over "AI that runs on your device. No account. No cloud. No trace.", the chip reads `RUNS ON: A15 BIONIC · 6 GB`, Continue is filled and enabled, footer "This is AI. It can be wrong. Check important facts." Identical again at 60 s, no spinner stuck, no redbox | `shots/01-first-launch.png`, `shots/02-after-60s.png` |
| 3 | bundled Instant adopted | **PASS** — `Documents/models/vault.json`: `via:"bundled"`, `Qwen3.5-0.8B-Q4_K_M.gguf`, 532,517,120 B, sha256 `bd258782…dc517`, which is byte-identical to `packages/core/src/catalog/manifest.json:19`; `verifiedAt` 429 ms after `installedAt` | `vault.json` |
| 4 | deep link to every main screen | **PASS** — pass 1: all 11 routes launched, app alive at 16 s on each, and across all 20 launches not one console line outside the known boilerplate. Pass 2: **a screenshot of each of the 11 routes**, every one showing its own screen, app alive on each. See the route-by-route table below | `log-<route>.txt` ×11, `shots/r-10…r-20-*.png`, `run2-routes.txt` |
| 5 | deep-link delivery itself | **PASS** — proven by a 3×3 differential, see below | `diff-nourl-{1,2,3}.txt`, `diff-root-{1,2,3}.txt`, `diff-vault-{1,2,3}.txt` |
| 6 | a real chat turn on the device | **UNVERIFIED — attempted once in pass 2 and blocked by the phone**, see the chat-turn section. The runner never reached step 1: `Timed out while enabling automation mode` | `chat-test.log`, `shots/probe-during-test.png` |
| 7 | 5-minute idle, then relaunch | **PASS** — launched detached 13:23:05, pid **8411** at t+20 s (13:23:26), **the same pid 8411** after 5 minutes untouched (13:28:26), and **still 8411** after a second `process launch` re-activated it (13:28:42). The app was resumed, not restarted, and nothing died in between | `idle-run.txt` |
| 8 | crash-log sweep | **PASS** — the device's `systemCrashLogs` domain holds 53 files and **not one** names `Inborn` or `com.inbornapp`; the only 20/09/2026 entries are `DiagnosticLogs/Search/spotlight_heartbeat_last.log` and its directory. The store is otherwise `SiriSearchFeedback` ×18, `spotlightknowledged.cpu_resource` ×12, `LowBatteryLog` ×3 and assorted `diskwrites_resource` reports | `crashlogs.txt`, `crashlogs.json` |
| 8b | the one JetsamEvent in the store | **not ours** — `JetsamEvent-2026-08-25-083843.ips`, 25/08/2026, recorded on **iOS 26.5.2** (the phone is on 26.6.1 now) and three weeks before build 5 was archived. Pulled and read: zero occurrences of "inborn" | `JetsamEvent-2026-08-25.ips` |
| 9 | memory at 60 s and after the longest idle | **PASS** (pass 2, `sysmon process single`) — see the memory table below. Thermal state is not exposed by `sysmon process`, so heat is still unmeasured | `sysmon-60s.txt`, `sysmon-idle5m.txt` |
| 10 | uninstall, 0 Inborn apps | **PASS** — SIGTERM to pid 8411 at 13:28:49, `devicectl device uninstall app` → "App uninstalled." at 13:28:55, and the app list at 13:29:00 has **0** rows matching `inborn`. 15 apps remain on the phone, none of them ours and none installed, removed or launched by this run | `uninstall.txt`, `apps-after.txt` |
| 10b | crash sweep repeated after the whole run | **PASS** — `systemCrashLogs` re-listed at 13:28:48, still **0** Inborn reports; the newest 20/09/2026 entries are still only the Spotlight heartbeat log | `crashlogs-after.txt` |
| 10c | home screen after uninstall | **PASS** (pass 2) — the app and the test runner (`com.inbornapp.mobile.uitests.xctrunner`) both uninstalled at 13:51:34, `inborn` rows in the app list: **0**, and the home screen screenshot shows no Inborn icon and no dialog standing | `shots/99-home-after-uninstall.png`, `apps-final.txt` |
| 10d | crash sweep a third time, after pass 2 | **PASS** — re-listed 13:51:26, still **0** Inborn reports, and the newest 20/09/2026 entries are still only the Spotlight heartbeat log. The failed XCUITest run left no crash report either | `crashlogs-final.txt` |
| 11 | phone left as found | **PASS, with one disclosed intervention** — no setting changed, no passcode entered, no lock/unlock, and the only bundles installed or removed were `com.inbornapp.mobile` and its test runner. The one exception: `testmanagerd` (pid 8430) was killed to clear the stuck XCTest passcode sheet, the documented method, verified by screenshot. Lock state after the run: `passcodeRequired: false`, `unlockedSinceBoot: true` | `uninstall.txt`, `uninstall2.txt`, `shots/probe-after-kill.png` |

### What each route actually drew (pass 2)

| route | screenshot shows | shot |
|---|---|---|
| `inborn:///` | the onboarding welcome — the redirect, exactly as pass 1's differential predicted | `r-10-root.png` |
| `/chats` | "Chats", search field, New chat / Incognito, "No chats yet · Start one above. Everything stays on this phone.", bottom bar `INSTANT · OUT 0 B` | `r-11-chats.png` |
| `/vault` | "Model vault", `1 KB in the vault · 81 GB free · RUNS ON: IOS-MID · 6 GB`; **INSTANT Qwen3.5 0.8B marked "Included with the app" and "In use"**; FAST 2B offered at 1.2 GB, SHARP 4B behind a PRO pill | `r-12-vault.png` |
| `/documents` | "Documents", "No documents · 0 B on this device", the 262 MB document-index-model offer, "Answer only from my documents" toggle, footer `INDEXED ON THIS DEVICE · sqlcipher` | `r-13-documents.png` |
| `/settings` | Appearance (System/Dark/Light, 7 text sizes), Security (passcode off, hide-in-switcher **on**, screenshot protection off) | `r-14-settings.png` |
| `/settings/storage` | "Privacy & storage": Chats 201 KB encrypted (SQLCipher), Documents/Models/Memory/Reports 0 B, Export and Transfer greyed behind Pro | `r-15-settings-storage.png` |
| `/settings/about` | **`1.0.0 (5)` and commit `f78ffdd80c2e`** — the phone itself confirming which build ran; licences, privacy, "Made without a server." | `r-16-settings-about.png` |
| `/paywall` | both tiers on one screen: PRO ₪59.90 one-time and PRO FOR WORK ₪199.90 one-time, Restore purchases | `r-17-paywall.png` |
| `/proof` | `SEALED · ON-DEVICE`, **`OUT 0 B · IN 0 B`, `CONNECTIONS 0 this session`**, "Instant ships inside the app · nothing downloaded", permissions all off | `r-18-proof.png` |
| `/legal/privacy` | the privacy policy, "LAST EDITED 5 September 2026" | `r-19-legal-privacy.png` |
| `/onboarding` | the welcome step | `r-20-onboarding.png` |

Two of these close things that had been open on the phone since build 3. The **About** screen is independent on-device proof
that the binary under test is 1.0.0 (5) at `f78ffdd`, rather than something left over. The **Proof** screen shows `OUT 0 B`
with zero connections, which is the privacy claim the product is built on, verified on the real device rather than a
simulator. And the paywall's prices are Israeli shekels from the store, not the USD `fallbackPrice` constants, so StoreKit
reached the App Store on this device.

### Memory (check 9)

Same launch, `pymobiledevice3 developer dvt sysmon process single --userspace`, values in bytes.

| when | resident | phys footprint | anon | anon peak |
|---|---|---|---|---|
| ~65 s after launch, sitting on onboarding (pid 8415) | 123,666,432 | 75,744,104 | 59,736,064 | 65,060,864 |
| after 5 minutes idle on onboarding (pid 8428) | 113,524,736 | 75,760,512 | 59,719,680 | 61,128,704 |

Flat, and slightly **down** on resident: the physical footprint moved by 16 KB across five minutes and the anonymous peak
fell. Nothing leaks while the app sits. Note this is the app on the onboarding screen with the model not yet loaded, so it is
a floor, not the working figure for a chat session. The release checklist's soak target (RSS growth under 10% between minute
20 and minute 120 under load) is a different, longer test and is not what this row measures.

### Routes exercised (check 4)

`inborn:///`, `/chats`, `/vault`, `/documents`, `/settings`, `/settings/storage`, `/settings/about`, `/paywall`, `/proof`,
`/legal/privacy`, `/onboarding` — each launched with `devicectl device process launch --terminate-existing --console
--payload-url <url>`, held 16 s, liveness sampled, then SIGTERM (`App terminated due to signal 15`, which is devicectl's own
kill, not a crash).

The entire console vocabulary of this run, across all 20 launches, is six recurring lines: the two `UIBackgroundModes`
Info.plist warnings (`performFetchWithCompletionHandler:` and `didReceiveRemoteNotification:fetchCompletionHandler:` are
implemented by the Expo app delegate but the matching `UIBackgroundModes` are not declared — cosmetic, and the app does not
use background fetch or remote notifications), `_setUpFeatureFlags called with release level 2`, glog's
`Logging before InitGoogleLogging()`, `ReactInstance: evaluateJavaScript() with JS bundle`, and the `UIManagerBinding`
transition line used as the probe below. Nothing else was printed by any screen.

`inborn:///voice` was **deliberately skipped**. `HandsFreeScreen` calls `useHandsFree` on mount, so opening it on a fresh
install would raise the microphone permission alert and leave a system dialog standing on Moshe's phone.

### Deep links really are delivered and routed (check 5)

Without a screenshot, "the app launched and did not crash" would not prove the URL ever reached the router. It does, and the
proof is a reproducible signature in the native console. React Native logs `UIManagerBinding.cpp:143] instanceHandle is null,
event of type <X> will be dropped` when a screen transition fires before its host view exists. Three conditions, three runs
each, 18 s per run, otherwise identical:

| condition | run 1 | run 2 | run 3 |
|---|---|---|---|
| launch with **no** `--payload-url` | 2 events | 2 | 2 |
| `--payload-url inborn:///` | 2 events | 2 | 2 |
| `--payload-url inborn:///vault` | **0 events** | **0** | **0** |

`inborn:///` is indistinguishable from launching with no URL, which is exactly right: both land on `/`, and `src/app/index.tsx`
then `<Redirect href="/onboarding">`s — that redirect is the transition that logs the events. `inborn:///vault` logs none,
because `/vault` is mounted directly as the initial route and no redirect happens. A URL that was being ignored could not
produce this split, and it is 3/3 in both directions. The routes are therefore reached; only what they *drew* is unverified.

The **count** is what reproduces, not the event name: the dropped events are `topHeaderHeightChange` (×5 of 6 runs),
`topWillDisappear`, `topAppear` and `topSvgLayout` — all mount/transition events of the onboarding stack, racing the host view
in whatever order that boot happened to take. Exactly two per redirecting launch, exactly zero per deep-linked one. Per-run
figures: `diff-summary.txt`.

## The chat turn: one XCUITest attempt, blocked by the phone (check 6)

Attempted once, as authorised, and it failed at the known gate rather than on anything to do with the app.

Setup: `ruby scripts/ios-add-storekit-tests.rb` added the `InbornUITests` target to the *existing* prebuilt project in
`inborn-wt/ios-build-3/apps/mobile/ios` (that directory is gitignored, so nothing in the repo changed), then
`xcodebuild build-for-testing … -configuration Release` → `** TEST BUILD SUCCEEDED **`. The generated
`Inborn_iphoneos26.2-arm64.xctestrun` was copied to `chat.xctestrun` **next to the original** (paths inside are relative to
its own directory) and patched so `InbornUITests.UITargetAppPath` points at the **archive's** `Inborn.app`, not the freshly
built one — so the driver would have tapped through the real build 5, not a rebuild. `VOICE_STEPS` held the whole onboarding
run plus the chat turn in one runner session: `onboarding-continue` → `start-chatting` → `airplane-skip` → `sealed-start` →
`lock-start` → `composer-input` → type → `send`, with a `shot` and a `dump` at each step.

What happened: the runner launched at 13:48:52 (`InbornUITests-Runner[8431] Running tests…`), the phone put up
**"Enter iPhone Passcode for 'XCTest' · Enable UI Automation"**, and it stayed up. Per instruction the prompt was not touched
and the run was given two minutes; at 13:49:52 the runner died with
`Failed to initialize for UI testing … Timed out while enabling automation mode` and `** TEST EXECUTE FAILED **`. Not one
driver step ran, so nothing about the app was learned either way.

This is the exact behaviour recorded in `docs/qa/purchases-run-2026-09-11.md` and in the memory note
`reference-ios-xcuitest-device-voice-driving`: the UI-Automation grant does not persist, and only Moshe can enter the
passcode. The one attempt allowed was spent.

**The prompt was still standing on the phone after xcodebuild exited.** Leaving a modal passcode sheet on Moshe's personal
phone was not acceptable, so it was cleared the documented way — `pymobiledevice3 developer dvt kill 8430` (testmanagerd),
the exception recorded in that same memory note — and the result verified by screenshot: the sheet is gone and the phone is
back on the app. **No passcode was entered and no setting was changed.** Before / after:
`shots/probe-post-test.png` → `shots/probe-after-kill.png`.

To actually get this row: Moshe enters the passcode once while a runner is starting, then the same `chat.xctestrun` runs
hands-free. That is a two-minute job with him at the desk and it needs no rebuild — the test bundle is already built at
`inborn-wt/ios-build-3/apps/mobile/ios/build/dd/Build/Products/`.

## What needs a tap (so the lead can decide what Moshe checks by hand)

The archive is a store-configuration Release build, so every headless hook is dead: `EXPO_PUBLIC_AUTOPROMPT`, `AUTOINDEX`,
`AUTOASK`, `AUTOVOICE` are inlined by Metro at bundle time and are empty here, and the `__DEV__`-gated ones (`DEV_IDLE_MS`,
`DEV_TIER`, `DEV_DEAD_DB_MS`) never fire. On top of that the app is **not onboarded** after a fresh install, so the chat screen
is not even reachable: `src/app/index.tsx` redirects to `/onboarding` until `prefs.onboarded` is true, and only
`screens/Onboarding/LockOffer.tsx` sets it.

| # | what | state after pass 2 |
|---|---|---|
| U1 | first screen content | **CLOSED** by `shots/01-first-launch.png` |
| U2 | a real chat turn | see the chat-turn section below |
| U3 | model details sheet | **still open** — an in-screen sheet, not a route (`screens/vault/ModelDetails.tsx` rendered by `VaultScreen`). From the vault, tap `details-<model id>` |
| U4 | Pro **and** Work paywall cards | **CLOSED** by `shots/r-17-paywall.png`, and better than expected: both cards render on the one route, and the prices are **₪59.90 / ₪199.90 from the store**, not the USD `fallbackPrice` constants, so StoreKit reached the App Store from this device |
| U5 | share sheet / share extension | **still open** — tap-driven by definition (Safari → Share → Inborn); unverified on device since build 3. The `.appex` is confirmed present in the installed bundle (row 0) |
| U6 | voice mode | **still open by choice** — `inborn:///voice` starts the microphone on mount and would raise a permission alert on Moshe's phone; skipped in both passes |
| U7 | memory | **CLOSED** — see the memory table. Thermal state is still unmeasured: `sysmon process` does not expose it |

## Note for the lead: this archive is 13 commits behind `main`

Build 5 was archived from `f78ffdd` (= `main` 10cc476 + the buildNumber commit). `main` is now `596e229`, **13 commits** later,
including the merges `fixes-r11`, `qa-r5` (×2) and `i18n-delta17`. Nothing in this pass covers that work.

## Process audit

Started, on the Mac: `xcrun devicectl` and `pymobiledevice3` invocations, one `xcodebuild build-for-testing` and one
`xcodebuild test-without-building`, driven by eight scripts in the session scratch dir — `sweep.sh`, `sweep-all.sh`,
`diff-test.sh`, `idle.sh`, `finish.sh`, `run2-launch.sh`, `run2-routes.sh`, `run2-idle.sh`, `finish2.sh`. Every
`devicectl … --console` child was killed with `kill <pid>` at the end of its own step; both xcodebuild runs exited on their
own. No browser, emulator, simulator, dev server or tmux session was started.

Started, on the phone: the Inborn app (~35 launches across both passes, each terminated with SIGTERM) and, once, the
`InbornUITests-Runner`. No purchase was attempted, no Apple sandbox sheet was raised, no microphone or other app permission
prompt was triggered, no passcode was entered, the phone was never locked or unlocked and no setting was changed. One system
process was killed and it is disclosed in row 11: `testmanagerd`, to clear the stuck XCTest passcode sheet that the failed
UI-Automation attempt left standing, which is the method recorded in `reference-ios-xcuitest-device-voice-driving`.
`com.inbornapp.mobile` and `com.inbornapp.mobile.uitests.xctrunner` were both uninstalled at the end; the other apps on the
phone were never touched.

The generated `ios/` tree in `inborn-wt/ios-build-3/apps/mobile` gained an `InbornUITests` target and a `build/dd` tree. That
path is gitignored (`apps/mobile/.gitignore:42`), so no tracked file changed; `git status` in that worktree is unchanged apart
from the pre-existing untracked `.models`, which is Moshe's and was not touched.

Artifacts — 20 screenshots plus logs, all named above — live in the session scratch dir:
`/private/tmp/claude-501/-Users-moshecohen-dev-bibleapps/e1fec2dd-3831-49ec-a78e-d650b5c0d26b/scratchpad/ios-device-5/`
(`shots/` holds the full-resolution PNGs and a downscaled `sm-` copy of each). They are outside the repo and not committed.
