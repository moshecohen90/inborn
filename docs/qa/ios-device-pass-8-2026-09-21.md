# iOS device pass — TestFlight build 1.0.0 (8) — 21.9.2026

Functional pass of the build 8 archive on Moshe's iPhone 13 Pro (iOS 26.6.1, udid `<iphone-udid>`, on USB)
immediately after the upload. Every launch below is the `.app` from
`/Users/moshecohen/dev/inborn-wt/ios-build-8/apps/mobile/ios/build/Inborn.xcarchive`, the same archive whose IPA went to
TestFlight — `CFBundleVersion` 8, `CFBundleShortVersionString` 1.0.0, signed `Apple Development: Moshe Cohen`, team
NGCHN95667, archive commit `a3127e1`. The phone's own About screen confirms it: **`1.0.0 (8)` · `a3127e1116f4`**. Build and
upload: `docs/qa/ios-build-8-2026-09-21.md`.

**Bottom line: build 8 is healthy on the real phone.** It installs, launches, adopts the bundled Instant model, draws all
eleven deep-linked screens, survives a background/foreground round trip without restarting, settles its memory after the
round trip, prints nothing new in the console, and produced zero crash reports. Rounds 15 and 16 touched shared JS, so this
pass adds two screens the device had never been shown: the empty chat with its suggestion chips, and the documents screen
past onboarding. Both draw correctly. One row is open — a real chat *turn* — not run because the phone's UI-Automation
passcode gate blocks it and only Moshe can clear it.

Screenshots in `docs/qa/ios-device-pass-8/` are 500 px-wide copies; the 1170×2532 originals and all logs stay in the
session scratch dir `…/scratchpad/ios-build-8/` and are not committed.

## Results

| # | check | result | evidence |
|---|---|---|---|
| 0 | the archive is build 8 and complete | **PASS** — CFBundleVersion 8 / 1.0.0 on the app and on `PlugIns/AskInborn.appex`; `instant.gguf` 532,517,120 B; `tessdata` holds `eng` + `heb`; App Group in both signed entitlements; `ExpoBattery` ×3 in the binary; `extra.commit` a3127e1116f4 = worktree HEAD | build doc, `archive-verify.txt` |
| 1 | install the archive's `.app` | **PASS** — "App installed", bundle `com.inbornapp.mobile`, 12:08:12 → 12:08:28 (16 s over USB) | `install.json`, `install.log` |
| 2 | launch, process alive at 60 s | **PASS** — launched 12:08:36, pid **9073** still listed at 12:09:40 (t+60 s) | `launch-times.txt`, `alive-60s.txt` |
| 2b | first screen content | **PASS** — welcome reads "Nothing leaves this phone." over "AI that runs on your device. No account. No cloud. No trace.", chip `RUNS ON: A15 BIONIC · 6 GB`, Continue filled and enabled, footer "This is AI. It can be wrong. Check important facts." The 60 s capture is **pixel-identical below the status bar** (same content sha `591eff97284de411`, difference bounding box `None`); the only pixels that moved in the whole 1170×2532 frame are the clock digits at (216,59)–(245,97). No spinner, no redbox, nothing moved | `01-first-launch.png`, `01b-at-60s.png` |
| 3 | bundled Instant adopted | **PASS** — `Documents/models/vault.json`: `via:"bundled"`, `Qwen3.5-0.8B-Q4_K_M.gguf`, 532,517,120 B, sha256 `bd258782…dc517`, identical to `packages/core/src/catalog/manifest.json`; `verifiedAt` **497 ms** after `installedAt`; `downloads`, `imports` and `hf` all empty | `vault.json` |
| 4 | deep link to every main screen | **PASS** — 11 routes, each launched with its own URL, held 11 s, screenshotted and sampled alive (pids 9074–9084). Every screenshot shows its own screen. Route table below | `r-10…r-20-*.png`, `routes.txt` |
| 4b | the empty chat draws, chips included | **PASS, new this build** — `inborn:///` on an onboarded install draws the chat: header `Chats · SEALED · INSTANT`, the sealed ring over "Nothing leaves this phone.", and **all three** suggestion chips — Summarize text, Translate, Draft a message — which are exactly the three keys `chat.suggest.{summarize,translate,draft}` defined in `packages/i18n/locales/en.json` and rendered by `screens/Chat.tsx`. Message box with mic and send below | `r-21-chat-empty.png` |
| 4c | the chat settles after the model loads | **PASS, new this build** — at t+11 s the header still reads "Loading INSTANT…"; at t+30 s that banner is gone and replaced by the dismissible "This is AI running on your phone. It can be wrong. Check important facts." The chips and composer are unchanged and the log holds 0 error lines. The model loads on the phone without a redbox | `r-22-chat-loaded.png`, `log-chat-loaded.txt` |
| 4d | documents screen past onboarding | **PASS, new this build** — identical to the pre-onboarding render: "Documents", "No documents · 0 B on this device", the "Answer only from my documents" toggle, the 262 MB document-index-model offer, "Select documents to ask", footer `INDEXED ON THIS DEVICE · sqlcipher`. 0 error lines | `r-23-documents-onboarded.png`, `log-documents-onboarded.txt` |
| 5 | nothing new in the console | **PASS** — across the 14 launches the whole vocabulary is the six known lines: the two `UIBackgroundModes` Info.plist warnings, `_setUpFeatureFlags called with release level 2`, glog's `Logging before InitGoogleLogging()`, `ReactInstance: evaluateJavaScript() with JS bundle`, and the `UIManagerBinding` dropped-event line. A grep for error / exception / fatal / redbox over every log returns **0 matches** | `log-<route>.txt` ×13, `console-launch1.txt` |
| 5b | deep links are really routed, not ignored | **PASS** — the redirecting launches log `UIManagerBinding … will be dropped` (plain launch 2, `inborn:///` 2) and the directly-mounted routes log 0, except `/chats` and `/paywall` at 1 each. That split is the same timing line build 6 logged on `/legal/privacy` and `/settings/storage` and build 7 logged nowhere; which two routes catch it moves between runs. A URL that never reached the router could not produce the split at all, and both screens drew correctly | `log-*.txt` |
| 6 | a real chat *turn* on the device | **NOT RUN** — the XCUITest driver is blocked by the phone's "Enter iPhone Passcode for 'XCTest' · Enable UI Automation" sheet, which does not persist a grant and only Moshe can accept. As in build 7 this run did not attempt it, so no sheet was raised and no system process was killed. The screen the turn would run in is now proven to draw (rows 4b, 4c) | build 6 pass, `reference-ios-xcuitest-device-voice-driving` |
| 7 | background → foreground round trip | **PASS** — app backgrounded by activating SpringBoard with `--no-kill-existing` (nothing killed): home screen drawn with the Inborn icon on it, pid **9086** still alive. Re-activated 12:16:40 and the tool reported `Process launched with pid 9086` — the **same pid**, on the same screen. Resumed, not restarted | `30-backgrounded.png`, `31-foregrounded.png`, `idle-run.txt` |
| 7b | memory after idle | **PASS** — same pid 9086 at all three samples. The footprint rose 1.23 MB (+1.63%) across the three minutes that span the background/foreground round trip, then **settled**: only +65,536 B (+0.09%) over the next two and a half minutes. The anonymous peak did not move once. Table below | `idle-run.txt`, `sysmon-t20.json`, `sysmon-idle3m.json`, `sysmon-idle5m.json`, `32-after-idle-3min.png` |
| 8 | crash-log sweep | **PASS** — `pymobiledevice3 crash ls` holds 49 files and **not one** names `Inborn` or `com.inbornapp`. The store is `SiriSearchFeedback`, `spotlightknowledged.cpu_resource`, `*.diskwrites_resource` and `LowBatteryLog` entries only | `crashlogs.txt` |
| 8b | crash sweep repeated after the whole run | **PASS** — re-listed after the uninstall: still 49 files, **byte-identical listing** (`diff -q` clean), still 0 Inborn reports | `crashlogs-final.txt` |
| 9 | Proof screen: nothing leaves the phone | **PASS** — `SEALED · ON-DEVICE`, **`OUT 0 B · IN 0 B`**, `CONNECTIONS 0 this session`, `since install · 0 days`, last delivery "Instant ships inside the app · nothing downloaded", permissions all off ("Network: none (not in the manifest)"), allowlist limited to `huggingface.co` / `*.hf.co` | `r-18-proof.png` |
| 9b | paywall prices come from the App Store | **PASS** — PRO **₪59.90** and PRO FOR WORK **₪199.90**, one-time, plus Restore purchases — shekels from StoreKit, not the USD `fallbackPrice` constants. Pixel-for-pixel the build 7 card, including the "Family Sharing is not enabled for this product yet." footer. No purchase was attempted and no sandbox sheet was raised | `r-17-paywall.png` |
| 10 | uninstall, 0 Inborn apps | **PASS** — `com.inbornapp.mobile` uninstalled 12:25:31 ("App uninstalled."); the app list has **0** rows matching `inborn` and is the **same 9-bundle set** as before the run began, added and removed both empty | `uninstall.txt`, `apps-final.json`, `apps-compare.txt` |
| 10b | home screen after uninstall | **PASS** — no Inborn icon, no test-runner icon, no dialog standing | `99-home-after-uninstall.png` |
| 11 | phone left as found | **PASS, no intervention needed** — no setting changed, no passcode entered, no lock or unlock, no permission prompt, no system process killed, and the only bundle installed or removed was `com.inbornapp.mobile` | `99-home-after-uninstall.png`, `apps-final.json` |

### What each route drew

| route | screenshot shows | shot |
|---|---|---|
| `inborn:///` | the onboarding welcome — the redirect | `r-10-root.png` |
| `/chats` | "Chats", search, New chat / Incognito, "No chats yet · Start one above. Everything stays on this phone.", the INSTANT / Personas / Memory / Folders row with the PRO pill, bottom bar `INSTANT · OUT 0 B`, Settings and Proof | `r-11-chats.png` |
| `/vault` | "Model vault", `1 KB in the vault · 81 GB free · RUNS ON: IOS-MID · 6 GB`, the Best for / in English pickers, INSTANT Qwen3.5 0.8B with the catalog-v3 copy (good at / weak at / languages, `508 MB · Q4_K_M · Battery: Low`, `~25-36 tok/s`), "Included with the app", "In use" and Details; FAST Qwen3.5 2B below it | `r-12-vault.png` |
| `/documents` | "Documents", "No documents · 0 B on this device", the "Answer only from my documents" toggle, the 262 MB document-index-model offer, "Select documents to ask", footer `INDEXED ON THIS DEVICE · sqlcipher` | `r-13-documents.png` |
| `/settings` | Appearance (System/Dark/Light, seven text sizes), Security (passcode off, hide-in-switcher on, screenshot protection off, wipe-after-failed-unlock, auto-delete) | `r-14-settings.png` |
| `/settings/storage` | "Privacy & storage": Chats 205 KB encrypted (SQLCipher), Documents/Models/Memory/Reports 0 B, Export and Transfer greyed behind Pro, Delete all chats / Delete everything | `r-15-settings-storage.png` |
| `/settings/about` | **`1.0.0 (8)` and commit `a3127e1116f4`** — the phone confirming which build ran; licences, "We collect nothing. There is nothing to opt out of.", Report a problem, "Made without a server." | `r-16-settings-about.png` |
| `/paywall` | "Pay once. Own it.", both tiers on one screen, ₪59.90 and ₪199.90 one-time, Restore purchases | `r-17-paywall.png` |
| `/proof` | `SEALED · ON-DEVICE`, `OUT 0 B · IN 0 B`, `CONNECTIONS 0 this session` | `r-18-proof.png` |
| `/legal/privacy` | the privacy policy, "LAST EDITED 5 September 2026" | `r-19-legal-privacy.png` |
| `/onboarding` | the welcome step | `r-20-onboarding.png` |

`inborn:///voice` was **deliberately skipped** for the fourth build running: `HandsFreeScreen` calls `useHandsFree` on mount,
so opening it on a fresh install would start the microphone and leave a permission alert standing on Moshe's phone.

### Reaching the chat screen (rows 4b–4d)

`src/app/index.tsx` renders `<Chat>` but redirects to `/onboarding` while `prefs.onboarded` is false, which is why builds
3–7 never saw the chat screen on the phone: onboarding is a tap flow and taps need the UI-Automation grant. This run got
past it without a tap and without touching the phone's settings, by writing the app's own prefs file into its own data
container:

```
echo '{"onboarded":true}' > prefs.json
xcrun devicectl device copy to --device <udid> --domain-type appDataContainer \
  --domain-identifier com.inbornapp.mobile --source prefs.json --destination Documents/prefs.json
```

`mergePrefs` fills every other field from `defaultPrefs`, so the app came up with the lock **disabled** — no passcode was
set on the app and none was asked for. The file lived only inside `com.inbornapp.mobile`'s container and went with it at
the uninstall. Everything above row 4b was captured **before** this write, on a genuinely fresh install, so the eleven-route
table is directly comparable with pass 7.

### Memory (check 7b)

`pymobiledevice3 developer dvt sysmon process single --userspace`, values in bytes, one launch held across all three
samples, app sitting on onboarding with the model not yet loaded (a floor, not a chat-session figure). The
background/foreground round trip falls between the first and second sample.

| when | pid | resident | phys footprint | anon | anon peak |
|---|---|---|---|---|---|
| t+20 s | 9086 | 113,213,440 | 75,367,272 | 59,342,848 | 60,948,480 |
| t+3 min | 9086 | 114,704,384 | 76,596,072 | 60,571,648 | 60,948,480 |
| t+5.5 min | 9086 | 114,769,920 | 76,661,608 | 60,637,184 | 60,948,480 |

The third sample is the point of the table. Build 7's two samples fell 246 KB and this run's first interval rose 1.23 MB,
which on its own could read either way; the third sample shows the curve flattening to +0.09% once the redraw that the
round trip forced is paid for, and the anonymous peak never moves at all. The end figure, 76,661,608 B, sits within 0.3%
of build 7's 76,268,416 B. Nothing leaks while the app sits. Thermal state is still unmeasured: `sysmon process` does not
expose it. The release checklist's soak target (RSS growth under 10% between minute 20 and minute 120 under load) is a
different, longer test and is covered on Android by soak run 3.

## What still needs a tap

The archive is a store-configuration Release build, so every headless hook is dead (`EXPO_PUBLIC_AUTOPROMPT`, `AUTOINDEX`,
`AUTOASK`, `AUTOVOICE` are inlined empty by Metro; the `__DEV__`-gated ones never fire).

| # | what | state after this pass |
|---|---|---|
| U1 | a real chat *turn* | **open** — not attempted this round; the UI-Automation grant does not persist and needs Moshe's passcode once while a runner is starting. Build 6 left a ready `chat.xctestrun` recipe. The screen itself is now proven on the phone (rows 4b, 4c), so what is left is the send-and-generate path |
| U2 | model details sheet | **open** — an in-screen sheet, not a route (`screens/vault/ModelDetails.tsx`); from the vault, tap `details-<model id>`. The vault screenshot shows the Details button present |
| U3 | share sheet / share extension | **open** — tap-driven by definition (Safari → Share → Inborn); the `.appex` is confirmed inside the installed bundle |
| U4 | voice mode | **open by choice** — `inborn:///voice` starts the microphone on mount; skipped |
| U5 | thermal state under load | **open** — not exposed by `sysmon process` |

Closed since build 3: first screen, the eleven routes, About, Proof, both paywall cards, the background/foreground round
trip and memory. Closed this build: the empty chat with its suggestion chips, the model finishing its load in the chat
screen, and the documents screen past onboarding.

## Process audit

On the Mac: `xcrun devicectl` and `pymobiledevice3` invocations plus the archive / export / altool runs of the build doc.
Every `devicectl … --console` child was killed by pid at the end of its own step; every other process exited on its own,
except one `/usr/bin/log stream` that `altool` spawns for its own network tracing and orphans to launchd — it was found by
`pgrep` and killed by pid (32600, started with the upload), exactly as in pass 7.
`pgrep -f "devicectl|xcodebuild|pymobiledevice3|altool|log stream"` is empty at the end of the run. No XCUITest was started,
so no `testmanagerd` was touched. No browser, simulator, emulator, dev server or tmux session was started, and no adb ran in
this stream — the OnePlus 6T was not touched. The Android stream's gradle build was waited out before the archive rather
than run alongside it. The `.p8` copies written for the upload (scratch dir and `~/.appstoreconnect/private_keys`) were
deleted; both directories are empty.

Two `devicectl device process launch --no-kill-existing` calls failed with `Error: Unknown option '--no-kill-existing'` and
did nothing on the phone — that flag belongs to `pymobiledevice3 developer dvt launch`, which is what pass 7 used and what
this run switched to. Nothing was killed or launched by the failed attempts.

On the phone: the Inborn app (15 launches, each terminated with SIGTERM — `App terminated due to signal 15` is devicectl's
own kill, not a crash), two `com.apple.springboard` activations with `--no-kill-existing`, which is the home-button
equivalent and kills nothing, and one file written into the app's own data container (see rows 4b–4d). No purchase was
attempted, no Apple sandbox sheet was raised, no microphone or other permission prompt was triggered, no passcode was
entered, the phone was never locked or unlocked, no setting was changed, and the app was uninstalled at the end.

The generated `ios/` tree in this worktree gained a `build/` tree; that path is gitignored, so no tracked file changed.
