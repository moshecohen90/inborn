# iOS device pass — TestFlight build 1.0.0 (5) — 20.9.2026

Functional pass of the **already archived** build 5 on Moshe's iPhone 13 Pro (iOS 26.6.1, udid `REDACTED-IPHONE`).
Nothing was rebuilt: the `.app` came from `/Users/moshecohen/dev/inborn-wt/ios-build-3/apps/mobile/ios/build/Inborn.xcarchive`
(`ApplicationProperties.CFBundleVersion` **5**, `CFBundleShortVersionString` 1.0.0, signed `Apple Development: Moshe Cohen`,
team NGCHN95667), archive commit `f78ffdd`. Prior runs: `docs/qa/ios-build-5-2026-09-14.md`, `docs/qa/ios-build-3-2026-09-11.md`.

## The blocker that shapes this whole run: no screenshots

Builds 3/4/5 took their device screenshots with `pymobiledevice3 developer dvt screenshot` over the **no-root userspace tunnel**,
which rides on **usbmux** and therefore needs the phone on **USB**. Today the phone is paired over **Wi-Fi only**:

- `xcrun devicectl device info details` → `transportType: localNetwork`, `tunnelIPAddress fdf8:bce0:465::1`.
- `pymobiledevice3 usbmux list` → `[]`; `pymobiledevice3 lockdown info` → `Device is not connected`.
- `ioreg -p IOUSB` lists only the OnePlus; no Apple Mobile Device on the bus.
- The network path (`pymobiledevice3 remote browse` / `remote tunneld`) refuses without root, and this Mac has no passwordless
  `sudo` (`sudo -n true` → "a password is required") and no `sudo_local` TouchID rule.
- `devicectl` itself has **no screenshot command** (`device info` = appIcon, apps, authListing, ddiServices, details, displays,
  files, lockState, processes).
- XCUITest is the other driving path and is barred without Moshe present (the "Enable UI Automation" passcode prompt recurs —
  `docs/qa/purchases-run-2026-09-11.md`, memory `reference-ios-xcuitest-device-voice-driving`).

So **every visual row below is UNVERIFIED**, and nothing in this document claims a screen was seen. What could be verified was
verified through four non-visual channels: `devicectl` install/launch/process/uninstall, the app's own files in its data
container, the native console stream (`devicectl device process launch --console`), and the device's system crash-log store.

## Results

| # | check | result | evidence |
|---|---|---|---|
| 0 | the archive is build 5 and complete | **PASS** — `CFBundleVersion` 5 / `1.0.0`; `PlugIns/AskInborn.appex` = `com.inbornapp.mobile.share-extension`, also CFBundleVersion 5; `instant.gguf` 532,517,120 B; `DocExtractOcr.bundle/tessdata` holds `eng` + `heb` | archive `Info.plist`, bundle listing |
| 1 | install the archive's `.app` | **PASS** — "App installed", bundle `com.inbornapp.mobile` at `…/Bundle/Application/EF00FFE5-…/Inborn.app`, 13:09:59→13:10:33 (34 s over Wi-Fi) | `install.json` |
| 2 | launch, process alive at 60 s | **PASS** — launched 13:10:42, pid **8389** still listed at 13:11:44 (t+62 s) and 13:11:53 (t+71 s) | `launch1.json`, `procs-t2.json`, `alive-t2.txt`, `alive-60s.txt` |
| 2b | *first screen content* (welcome copy, RUNS ON chip, Continue enabled) | **UNVERIFIED** — no screenshot channel | — |
| 3 | bundled Instant adopted | **PASS** — `Documents/models/vault.json`: `via:"bundled"`, `Qwen3.5-0.8B-Q4_K_M.gguf`, 532,517,120 B, sha256 `bd258782…dc517`, which is byte-identical to `packages/core/src/catalog/manifest.json:19`; `verifiedAt` 429 ms after `installedAt` | `vault.json` |
| 4 | deep link to every main screen | **PARTIAL** — all 11 routes launched, app alive at 16 s on each, **zero** fatal/exception/RCTFatal/redbox lines. Across all 20 launches of this run (11 route logs + 9 differential logs) there is not one console line outside the known boilerplate. *Which screen rendered is UNVERIFIED.* | `log-<route>.txt` ×11, sweep transcript |
| 5 | deep-link delivery itself | **PASS** — proven by a 3×3 differential, see below | `diff-nourl-{1,2,3}.txt`, `diff-root-{1,2,3}.txt`, `diff-vault-{1,2,3}.txt` |
| 6 | a real chat turn on the device | **UNVERIFIED** — no tap-free path exists on this build (see "What needs a tap") | — |
| 7 | 5-minute idle, then relaunch | **PASS** — launched detached 13:23:05, pid **8411** at t+20 s (13:23:26), **the same pid 8411** after 5 minutes untouched (13:28:26), and **still 8411** after a second `process launch` re-activated it (13:28:42). The app was resumed, not restarted, and nothing died in between | `idle-run.txt` |
| 8 | crash-log sweep | **PASS** — the device's `systemCrashLogs` domain holds 53 files and **not one** names `Inborn` or `com.inbornapp`; the only 20/09/2026 entries are `DiagnosticLogs/Search/spotlight_heartbeat_last.log` and its directory. The store is otherwise `SiriSearchFeedback` ×18, `spotlightknowledged.cpu_resource` ×12, `LowBatteryLog` ×3 and assorted `diskwrites_resource` reports | `crashlogs.txt`, `crashlogs.json` |
| 8b | the one JetsamEvent in the store | **not ours** — `JetsamEvent-2026-08-25-083843.ips`, 25/08/2026, recorded on **iOS 26.5.2** (the phone is on 26.6.1 now) and three weeks before build 5 was archived. Pulled and read: zero occurrences of "inborn" | `JetsamEvent-2026-08-25.ips` |
| 9 | memory / thermal (RSS at 60 s and after a chat) | **UNVERIFIED** — `pymobiledevice3 developer dvt sysmon` needs the same tunnel as the screenshots; `devicectl device info processes` returns only `{executable, processIdentifier}` even with `--columns '*'`, so there is no RSS source over the network | `procs-t2.json` |
| 10 | uninstall, 0 Inborn apps | **PASS** — SIGTERM to pid 8411 at 13:28:49, `devicectl device uninstall app` → "App uninstalled." at 13:28:55, and the app list at 13:29:00 has **0** rows matching `inborn`. 15 apps remain on the phone, none of them ours and none installed, removed or launched by this run | `uninstall.txt`, `apps-after.txt` |
| 10b | crash sweep repeated after the whole run | **PASS** — `systemCrashLogs` re-listed at 13:28:48, still **0** Inborn reports; the newest 20/09/2026 entries are still only the Spotlight heartbeat log | `crashlogs-after.txt` |
| 10c | *home-screen screenshot after uninstall* | **UNVERIFIED** — no screenshot channel. The app was terminated and removed, so iOS necessarily returned to the home screen, but that is inference, not evidence | — |
| 11 | phone left as found | **PASS on what was done, not on a before/after diff** — no setting was changed, no passcode entered, no system process killed, and the only app installed or removed was `com.inbornapp.mobile`. Lock state after the run: `passcodeRequired: false`, `unlockedSinceBoot: true`. I did not read the lock state before starting, so this is a statement of what the run did, not a comparison | `uninstall.txt` |

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

## What needs a tap (so the lead can decide what Moshe checks by hand)

The archive is a store-configuration Release build, so every headless hook is dead: `EXPO_PUBLIC_AUTOPROMPT`, `AUTOINDEX`,
`AUTOASK`, `AUTOVOICE` are inlined by Metro at bundle time and are empty here, and the `__DEV__`-gated ones (`DEV_IDLE_MS`,
`DEV_TIER`, `DEV_DEAD_DB_MS`) never fire. On top of that the app is **not onboarded** after a fresh install, so the chat screen
is not even reachable: `src/app/index.tsx` redirects to `/onboarding` until `prefs.onboarded` is true, and only
`screens/Onboarding/LockOffer.tsx` sets it.

| # | what | exact taps needed |
|---|---|---|
| U1 | first screen content | none — a screenshot would do, but the tunnel is missing (plug the phone into USB) |
| U2 | a real chat turn | 5 taps + typing: `onboarding-continue` → `start-chatting` → `airplane-saw-it` (or `airplane-skip`) → `sealed-start` → `lock-start` (or `lock-turn-on`), then type into `composer-input` and press `send` |
| U3 | model details sheet | it is an in-screen sheet, not a route (`screens/vault/ModelDetails.tsx` rendered by `VaultScreen`): from the vault, tap `details-<model id>` |
| U4 | Pro **and** Work paywall cards | no extra tap: `offersFor("free", …)` returns both offers and `PaywallScreen` renders a `tier-<productId>` card for each, so `inborn:///paywall` puts Pro and Work on one screen. What needs an eye is whether the prices came from the store or fell back to the US list price (`fromStore: false`, `fallbackPrice`) — that distinction is only visible on screen |
| U5 | share sheet / share extension | tap-driven by definition (Safari → Share → Inborn); unverified on device since build 3 |
| U6 | voice mode | `inborn:///voice` starts the microphone on mount and would raise a permission alert; needs a person at the phone |
| U7 | RSS / thermal | needs USB for `pymobiledevice3 developer dvt sysmon` |

## Note for the lead: this archive is 13 commits behind `main`

Build 5 was archived from `f78ffdd` (= `main` 10cc476 + the buildNumber commit). `main` is now `596e229`, **13 commits** later,
including the merges `fixes-r11`, `qa-r5` (×2) and `i18n-delta17`. Nothing in this pass covers that work.

## Process audit

Started, on the Mac: `xcrun devicectl` invocations only (install, ~22 launches, process lists, file lists, two `copy from`,
uninstall), driven by five scripts written into the session scratch dir — `sweep.sh`, `sweep-all.sh`, `diff-test.sh`,
`idle.sh`, `finish.sh`. Every `devicectl … --console` child was killed with `kill <pid>` at the end of its own step. No
browser, emulator, simulator, dev server or tmux session was started. Verified empty at the end: `pgrep -f devicectl`.

Started, on the phone: the Inborn app only, ~22 times, each run terminated with SIGTERM (via the console attachment, or
explicitly for the last one). No system process was killed, no setting changed, no passcode entered, no purchase attempted, no
Apple sandbox sheet raised, no microphone or other permission prompt triggered. `com.inbornapp.mobile` was installed at the
start and uninstalled at the end; the other 15 apps on the phone were never touched.

Screenshots: none, for the reason in the first section. Scratch dir with every artifact named above:
`/private/tmp/claude-501/-Users-moshecohen-dev-bibleapps/e1fec2dd-3831-49ec-a78e-d650b5c0d26b/scratchpad/ios-device-5/`.
