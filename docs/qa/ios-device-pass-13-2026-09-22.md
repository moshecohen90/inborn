# iOS device pass — TestFlight build 1.0.0 (13) — 22.9.2026

Functional pass of the build 13 archive on Moshe's iPhone 13 Pro (udid `REDACTED-IPHONE`, on USB) immediately
after the upload. Every launch below is the `.app` from
`/Users/moshecohen/dev/inborn-wt/ios-build-13/apps/mobile/ios/build/Inborn.xcarchive`, the same archive whose IPA went
to TestFlight — `CFBundleVersion` 13, `CFBundleShortVersionString` 1.0.0, signed `Apple Development: Moshe Cohen`, team
NGCHN95667, archive commit `e7e232d621bc`. The phone's own About screen confirms it: **`1.0.0 (13)` ·
`e7e232d621bc`**. Build and upload: `docs/qa/ios-build-13-2026-09-22.md`.

**Bottom line: F43 is fixed on the shipped binary, and that is the whole story of this build.** Build 12 fell back to
Instant on every cold launch with an amber "Ran out of memory · Switched to Instant" line. Build 13, on the same phone
with the same vault and the same prefs, **boots straight into Fast**: the header reads `FAST`, there is no banner of any
kind, and llama.cpp opens `Qwen3.5-2B-Q4_K_M.gguf` with `n_ctx = 4096` where build 12 was capped at 2048. Round 23's
fix was proved on a dev build when it landed; this is the first time it has been proved on the binary that goes to
TestFlight.

The pass also carries **two behaviour changes against pass 12 that are intended fixes, not regressions**, and both are
visible on screen: `inborn:///voice` now redirects to the paywall (**F53**, round 25 — the hands-free deep link used to
skip the Pro gate), and the paywall's "No subscription. No account. Yours forever." is legible again because there is no
banner sitting on it (**F45**, round 23).

Screenshots in `docs/qa/ios-device-pass-13/` are 231×500 copies; the 1170×2532 originals and all logs stay in the
session scratch dir and are not committed.

## The update install, and what happened to the 1.2 GB model

The archive's `.app` was installed over the existing `com.inbornapp.mobile` with `xcrun devicectl device install app` —
same bundle id, same signing identity, so iOS treats it as an update and keeps the data container.

`Documents/models/vault.json` was copied off the phone before and after the install and the two files are
**byte-identical** (`diff` clean). Both record Fast as `Qwen3.5-2B-Q4_K_M.gguf`, **1,280,835,840 B**, sha256
`aaf42c8b…99223`, `via: "https"`, `installedAt` 1790072631540 — the CDN download from `models.inbornapp.com`
(`docs/qa/cdn-iphone-2026-09-22.md`). The phone's own Privacy & storage screen agrees: **Models 1.19 GB**, Chats 668 KB
encrypted (SQLCipher). Nothing was re-downloaded and the phone never reached the network in this pass.

`Documents/prefs.json` survived too, so this pass needed no onboarding write and no tap: `onboarded` true,
`lock.enabled` false, `meter` 0/0, `themeMode` "system".

## Results

| # | check | result | evidence |
|---|---|---|---|
| 0 | the archive is build 13 and complete | **PASS** — CFBundleVersion 13 / 1.0.0 on the app and on `PlugIns/AskInborn.appex`; `instant.gguf` 532,517,120 B; `tessdata` holds `eng` + `heb`; App Group in both signed entitlements; `ExpoBattery` ×3 in the binary; `extra.commit` e7e232d621bc | build doc, `archive-verify.txt` |
| 1 | install the archive's `.app` in place | **PASS** — "App installed", bundle `com.inbornapp.mobile`, 18:54:38 → 18:54:55 (**17 s** over USB, the same as builds 10–12) | `install.json`, `install.log`, `install-times.txt` |
| 1b | the vault survives the update | **PASS** — `vault.json` **byte-identical** before and after; Fast 1,280,835,840 B `via:"https"` still recorded, Instant still `via:"bundled"`; Privacy & storage reads Models **1.19 GB** | `vault-before.json`, `vault-after.json`, `r-15-settings-storage.png` |
| 2 | launch, process alive | **PASS** — every device launch in this pass came up and was still listed in `devicectl device info processes` when it was sampled; the idle launch held pid **10840** across five and a half minutes and the soak launch held pid **10858** across thirty | `routes.txt`, `idle-run.txt`, `soak/soak.txt` |
| 3 | bundled Instant still adopted | **PASS** — `vault.json` `instant`: `via:"bundled"`, `Qwen3.5-0.8B-Q4_K_M.gguf`, 532,517,120 B, sha256 `bd258782…dc517`, identical to the shipped catalog | `vault-after.json` |
| 4 | deep link to every main screen | **PASS** — 11 routes, each launched with its own URL, held 11 s, screenshotted and sampled alive (pids 10826–10837). Every screenshot shows its own screen. Route table below | `r-10…r-20-*.png`, `routes.txt` |
| 4b | the chat draws, chips included | **PASS** — `inborn:///` on the onboarded install draws the chat: header `Chats · SEALED · **FAST**`, the sealed ring over "Nothing leaves this phone.", and **all three** suggestion chips — Summarize text, Translate, Draft a message. Message box with the `+` attach button, mic and send below | `r-10-root.png` |
| 4c | the chat settles after the model loads | **PASS** — settled at t+11 s, and the t+11 s and t+32 s frames are **identical below the status bar** (content sha `ee3e0fc0714a5fde` both), the only pixels that moved in the whole 1170×2532 frame being the clock digits (difference bbox `(217, 59, 246, 97)`). The log holds **0** error lines and 53 `llama_model_loader:` lines | `r-22a-chat-t11.png`, `r-22-chat-loaded.png`, `log-chat-loaded.txt` |
| **4d** | **F43: the phone boots on the model the user chose** | **PASS — the headline result.** No banner on any screen. Header reads `FAST`. llama.cpp opens `…/Documents/models/Qwen3.5-2B-Q4_K_M.gguf` (the 1.2 GB CDN model) on the root launch and `n_ctx = 4096`. Build 12 on this same phone opened `instant.gguf` on every one of its 16 launches and ran at `n_ctx` 2048 | `r-10-root.png`, `log-root.txt`, `log-chat-loaded.txt` |
| 5 | nothing new in the console | **PASS** — a grep for error / exception / fatal / redbox over **every** log from every device launch in this pass returns **0** matches | `log-*.txt` |
| 6 | the phone shell is unchanged | **PASS** — all eleven screens drew the phone layout: no sidebar, no `ChatsPane`, no command palette, no side panel. `layoutModeFor` returns `"phone"` below 760 pt; the phone is 390 pt and portrait-locked | `r-10…r-20-*.png` |
| 7 | background → foreground round trip | **PASS** — app backgrounded by activating SpringBoard with `--no-kill-existing` (nothing killed), pid **10840** still alive; re-activated and the tool reported the **same pid** 10840, back on the screen it left. Resumed, not restarted | `29-before-background.png`, `30-backgrounded.png`, `31-foregrounded.png`, `idle-run.txt` |
| 7b | memory after idle, model resident | **PASS** — same pid 10840 at all three samples with **Fast** loaded. Phys footprint **fell 1.42 %** across the interval that spans the background/foreground round trip, then rose **0.07 %** over the next two and a half minutes; the anonymous peak **did not move at all** (delta exactly 0 B). Table below | `idle-run.txt`, `sysmon-*.json`, `32-after-idle-3min.png` |
| 8 | the hands-free deep link | **PASS, and it is a different result from pass 12 on purpose** — `inborn:///voice` draws the **paywall**, not the hands-free screen, because **F53** (round 25) put `voiceConversation` behind the Pro gate in `src/app/voice.tsx`: *"the chat's mic gated this, the URL did not — a deep link, a desktop menu item or a restored route reached it for free."* This install has no licence, so the redirect is the correct behaviour. Frame identical below the status bar across 63 s (content sha `123721c7d1238618`), **0** error lines, no microphone started and no permission sheet | `r-24-voice-t12.png`, `r-25-voice-t75.png`, `log-voice.txt`, `src/app/voice.tsx` |
| 9 | Proof screen: nothing leaves the phone | **PASS** — `SEALED · ON-DEVICE`, **`OUT 0 B · IN 0 B`**, `CONNECTIONS 0 this session`, permissions all off ("Network: none (not in the manifest)"), allowlist limited to `huggingface.co` / `*.hf.co` | `r-18-proof.png` |
| 9b | paywall prices come from the App Store | **PASS** — PRO **₪59.90** and PRO FOR WORK **₪199.90**, one-time, plus Restore purchases — shekels from StoreKit, not the USD `fallbackPrice` constants. No purchase was attempted and no sandbox sheet was raised | `r-17-paywall.png` |
| **9c** | **F45: the status strip no longer eats the paywall's line** | **PASS** — "No subscription. No account. Yours forever." is legible under the title, where pass 12 had the amber banner in that slot. There is no banner at all on this build, so the spacer is not under load here; what this row proves is that the line is back | `r-17-paywall.png` |
| 10 | crash-log sweep | **PASS** — `pymobiledevice3 crash ls` holds 55 files and **not one** names `Inborn` or `com.inbornapp` | `crashlogs.txt` |
| 11 | phone left as asked | **PASS** — Inborn **1.0.0 (13) left installed**, phone on the home screen. No setting changed, no passcode entered, no lock or unlock, no permission prompt, no system process killed, and the only bundle installed was `com.inbornapp.mobile` and the XCUITest runner | `30-backgrounded.png` |

## Round-23…30 code in the binary this phone ran

Read out of `main.jsbundle` in the archive. Hermes stores any string containing a non-ASCII character as UTF-16LE,
which is why the two `Not enough memory for` keys are found in that encoding and the ASCII ones in UTF-8.

| # | check | result | evidence |
|---|---|---|---|
| 12 | the F43 `"fit"` wording is in the bundle | **PASS** — `Not enough memory for` ×2 as UTF-16LE, one per key: `state.fitSwitched` ("… the model you chose · Started on Instant") and `device.fit.switched` ("… {model} · Started on {to}") | `bundle-check.txt` |
| 12b | the F53 gate key is in the bundle | **PASS** — `voiceConversation` ×1, and the phone shows the redirect (row 8) | `bundle-check.txt`, `r-24-voice-t12.png` |
| 12c | the F42 shell, carried forward | **PASS** — `Command Palette`, `Toggle Sidebar`, `Search chats and screens` each ×1 | `bundle-check.txt` |
| 12d | the CDN host | **PASS** — `models.inbornapp.com` ×1 | `bundle-check.txt` |
| 13 | round 19 (F38) is still in this binary | **PASS** — `Answer in one to three sentences`, `Give the whole answer the task needs, then stop` and `The user asked for about ` each present exactly once | `bundle-check.txt` |
| 13b | the iOS 17 floor reached the binary | **PASS** — ASC reports `minOsVersion` **17.0** for build 13 against **16.4** for build 12; commit 3346f27 (gap #18) | `asc-build13.json`, build doc |

## Memory (check 7b)

`pymobiledevice3 developer dvt sysmon process single --userspace`, values in bytes, one launch held across all three
samples, app sitting in the chat with **Fast** loaded. The background/foreground round trip falls between the first and
second sample.

| when | pid | resident | phys footprint | anon | anon peak |
|---|---|---|---|---|---|
| t+20 s | 10840 | 1,631,354,880 | 254,707,808 | 253,001,728 | 256,081,920 |
| t+3 min | 10840 | 1,633,615,872 | 251,103,328 | 249,397,248 | 256,081,920 |
| t+5.5 min | 10840 | 1,633,796,096 | 251,283,552 | 249,577,472 | 256,081,920 |

Phys footprint **−3,604,480 B (−1.42 %)** over the first interval, then **+180,224 B (+0.07 %)** over the second. The
anonymous peak is **identical at all three samples** — delta exactly 0 B. Nothing leaks while the app sits with a model
loaded.

**The absolute numbers are higher than build 12's and that is the fix working, not a regression.** Build 12 measured a
223 MB footprint and 858 MB resident because it was running the 533 MB Instant model. Build 13 measures ~251 MB
footprint and **1.63 GB resident** because it is running the 1.2 GB Fast model the user chose. Comparing the two
figures directly would be comparing two different models.

## What each route drew

| route | screenshot shows | shot |
|---|---|---|
| `inborn:///` | the chat: `Chats · SEALED · **FAST**`, the sealed ring over "Nothing leaves this phone.", all three suggestion chips, the composer with `+`, mic and send. The only line above the fold is the standing "This is AI running on your phone. It can be wrong. Check important facts." notice with its Dismiss action — **not** the memory banner | `r-10-root.png` |
| `/chats` | "Chats", search, New chat / Incognito, five RECENT chats left by earlier passes, the FAST / Personas / Memory / Folders row with the PRO pill, bottom bar `FAST · OUT 0 B`, Settings and Proof | `r-11-chats.png` |
| `/vault` | "Model vault", `1.2 GB in the vault · 79 GB free · RUNS ON: IOS-MID · 6 GB`, the Best for / in English pickers, **FAST Qwen3.5 2B first** with `RECOMMENDED ON THIS PHONE · CHAT IN ENGLISH`, its GOOD AT / LANGUAGES / Weak-at blocks, `1.2 GB · Q4_K_M · Battery: Medium`, `~15-24 tok/s on your phone`, `Loaded`, `In use` and Details; INSTANT Qwen3.5 0.8B below it | `r-12-vault.png` |
| `/documents` | "Documents", "No documents · 0 B on this device", the "Answer only from my documents" toggle behind PRO, the 262 MB document-index-model offer, "Select documents to ask", footer `INDEXED ON THIS DEVICE · sqlcipher` | `r-13-documents.png` |
| `/settings` | Appearance (System/Dark/Light, seven text sizes), Security (passcode off, hide-in-switcher on, screenshot protection off, wipe-after-failed-unlock, auto-delete) | `r-14-settings.png` |
| `/settings/storage` | "Privacy & storage": Chats **668 KB** encrypted (SQLCipher), **Models 1.19 GB**, Documents/Memory/Reports 0 B, Delete all chats / Delete everything | `r-15-settings-storage.png` |
| `/settings/about` | **`1.0.0 (13)` and commit `e7e232d621bc`** — the phone confirming which build ran; licences, "We collect nothing. There is nothing to opt out of.", Report a problem, "Made without a server." | `r-16-settings-about.png` |
| `/paywall` | "Pay once. Own it.", "No subscription. No account. Yours forever.", both tiers on one screen, ₪59.90 and ₪199.90 one-time, Restore purchases | `r-17-paywall.png` |
| `/proof` | `SEALED · ON-DEVICE`, `OUT 0 B · IN 0 B`, `CONNECTIONS 0 this session` | `r-18-proof.png` |
| `/legal/privacy` | the privacy policy, "LAST EDITED 5 September 2026" | `r-19-legal-privacy.png` |
| `/onboarding` | the welcome step, `RUNS ON: A15 BIONIC · 6 GB` | `r-20-onboarding.png` |
| `/voice` | **the paywall** — the F53 gate, see row 8 | `r-24-voice-t12.png` |

## The 30-minute soak

One launch of the shipped build, held in the foreground from **19:05:44 to 19:37:16** (31 min 32 s), sampled every five
minutes with `sysmon process single --userspace` plus a screenshot and a process listing. The chat was left on screen
with Fast loaded; nothing was typed and nothing was tapped.

| sample | pid | resident | phys footprint | anon | anon peak |
|---|---|---|---|---|---|
| min 0 | 10858 | 1,597,554,688 | 244,090,904 | 242,434,048 | 252,379,136 |
| min 5 | 10858 | 1,598,046,208 | 244,533,272 | 242,876,416 | 252,379,136 |
| min 10 | 10858 | 209,289,216 | 91,276,328 | 90,308,608 | 252,379,136 |
| min 15 | 10858 | 203,390,976 | 80,397,352 | 79,429,632 | 252,379,136 |
| min 20 | 10858 | 203,784,192 | 80,790,568 | 79,822,848 | 252,379,136 |
| min 25 | 10858 | 204,275,712 | 81,282,088 | 80,314,368 | 252,379,136 |
| min 30 | 10858 | 204,718,080 | 81,724,456 | 80,756,736 | 252,379,136 |

**One process for the whole half hour** — pid 10858 at every sample, from both `sysmon` and
`devicectl device info processes`. **Zero** error / exception / fatal / redbox lines in the 46 KB device console.
**Zero** crash reports: `pymobiledevice3 crash ls` holds 55 files before and after and not one names `Inborn`.

**The step between min 5 and min 10 is the idle unload firing, and this is the first time it has been measured on an
iPhone.** `apps/mobile/src/engine.ts` sets `IDLE_UNLOAD_MS = 10 * 60_000`, and the app launched at 19:05:44, so the
unload was due at 19:15:44 — between the min-5 sample (≈19:11:50) and the min-10 sample (≈19:17). Resident memory drops
**1.39 GB** (1,598 MB → 209 MB) and the footprint drops **153 MB**, and the console's tail is llama.cpp tearing the
context down: `detach_threadpool: call`, `~llama_context: … MTL0 compute buffer size is 493.0000 MiB, matches
expectation`, `lm_ggml_metal_free: deallocating`. The screenshot at min 10 and at every sample after it shows the app
still on the chat with the header still reading **FAST** — the user's choice is remembered, only its bytes are
released.

**After the unload the app is flat.** Across the last twenty minutes the footprint moves 80,397,352 → 81,724,456 B,
**+1.33 MB (+1.65 %)** in total and under 500 KB per five-minute interval, and the anonymous peak is **identical at all
seven samples** — delta exactly 0 B over the whole half hour, across the unload included. Nothing leaks, and nothing
grew back after the release.

## What needed a tap, and what Moshe has to do

The archive is a store-configuration Release build, so every headless hook is dead (`EXPO_PUBLIC_AUTOPROMPT`,
`AUTOINDEX`, `AUTOASK`, `AUTOVOICE` are inlined empty by Metro; the `__DEV__`-gated ones never fire). XCUITest — and
Moshe's passcode, once, while a runner starts — remains the only way in.

The runner **was rebuilt and is ready**: `ruby scripts/ios-add-storekit-tests.rb ios/Inborn.xcodeproj Inborn` re-added
the `InbornUITests` target to the regenerated project (the prebuild copies the sources but not the target, so this step
is mandatory after every `--clean` prebuild), `xcodebuild build-for-testing` exited **0** with `** TEST BUILD
SUCCEEDED **`, and both session `.xctestrun` files are patched with the pass-12 workaround — `DependentProductPaths`
stripped of `Debug-iphoneos/Inborn.app` and `AskInborn.appex` so the runner installs without replacing the shipped
Release app, `UITargetAppPath` pointing at the archive. **A second trap, new to this pass**: `__TESTROOT__` resolves
relative to wherever the `.xctestrun` file sits, so a patched copy kept in the session scratch dir fails with
`Missing test product at …/Debug-iphoneos/InbornUITests-Runner.app/PlugIns/InbornUITests.xctest`. The patched file has
to be written **into `ios/build/tdd/Build/Products/`** beside the originals.

The run then stopped exactly where builds 7–11 stopped:

```
Testing failed:
  InbornUITests-Runner (10938) encountered an error (The test runner failed to initialize for UI testing.
  (Underlying Error: Timed out while enabling automation mode.))
```

The phone was showing **"Enter iPhone Passcode for 'XCTest' · Enable UI Automation"**
(`40-uiautomation-prompt.png`), which only Moshe can answer and whose grant does not persist. The driver was stopped
after that one attempt rather than re-raising the sheet on his phone.

> **The one thing Moshe has to do:** press **Enable** on the phone's "Enter iPhone Passcode for 'XCTest'" prompt while
> a runner is starting, then tell this stream (or the next one) to re-run
> `scratchpad/ios-build-13/live.sh A` and `live.sh B`.

The prompt does **not** clear itself: it was still on screen 90 seconds after `xcodebuild` had exited, because
`testmanagerd` holds it. Relaunching `com.inbornapp.mobile` displaces it, which is how the phone was returned to a
clean state here (`43-after-relaunch.png`, then `44-home-final.png`).

| # | what | state after this pass |
|---|---|---|
| U2 | a model's Details sheet | **open again for build 13** — closed on build 12 with Moshe's grant. The row that matters now is **F46**, Sharp's SOURCE reading `models.inbornapp.com` instead of `play-asset-pack, play-asset-pack, https`; round 23 proved it on a dev build, and the shipped binary has not been checked |
| U5 | the vault below the fold | **open again for build 13**, same reason |
| U10 | a chat turn on the CDN Fast model | **open again for build 13** — and it is now easier than it was, because build 13 boots on Fast and needs no SWITCH BACK tap first (`stepsB.txt` is written for that) |
| U11 | a second Fast throughput sample | **open** — build 12 measured 13.2 tok/s against a card that says ~15-24. This build would give the second sample, on the fixed `n_ctx` of 4096 rather than 2048, which is itself a reason the number may differ |
| U3 | share sheet / share extension | **open** — tap-driven by definition; the `.appex` is confirmed inside the installed bundle |
| U6 | hands-free with Whisper installed | **open, and now behind Pro as well** (F53) — reaching the screen at all needs a licence on this install |
| U7 | thermal state under load | **open** — not exposed by `sysmon process` |

## Process audit

On the Mac: one `xcodebuild archive`, two `-exportArchive` (the first killed by a locked keychain, F90), two `altool`
calls plus one repeat (F91), two `xcodebuild build-for-testing`, and two `xcodebuild test-without-building` (one that
could not find the test product, one that reached the phone and was stopped by the automation prompt). Every PID this
pass started was killed by PID, never by name. No simulator was booted, and at the end of the run no `.p8` exists
anywhere and `~/.appstoreconnect/private_keys` is empty.

On the phone: **Inborn 1.0.0 (13) is left installed**, from the shipped archive. The XCUITest runner
(`com.inbornapp.mobile.uitests.xctrunner`) is present, as it was before this pass began. The phone is on the home
screen (`44-home-final.png`). No setting was changed, no passcode was entered, nothing was locked or unlocked by this
run, no system process was killed, and no other app was opened. `vault.json` at the end of the pass differs from the
copy taken before the install in **exactly one field** — Fast's `lastLoadedAt`, 1790082492797 → 1790093145846 — which
is itself the F43 evidence: this pass loaded Fast, where build 12 never did. Every other byte, including Fast's
1,280,835,840 B and its sha256, is unchanged.
