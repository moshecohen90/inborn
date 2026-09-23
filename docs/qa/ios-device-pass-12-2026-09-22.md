# iOS device pass — TestFlight build 1.0.0 (12) — 22.9.2026

Functional pass of the build 12 archive on Moshe's iPhone 13 Pro (iOS 26.6.1, udid `<iphone-udid>`, on USB)
immediately after the upload. Every launch below is the `.app` from
`/Users/moshecohen/dev/inborn-wt/ios-build-12/apps/mobile/ios/build/Inborn.xcarchive`, the same archive whose IPA went to
TestFlight — `CFBundleVersion` 12, `CFBundleShortVersionString` 1.0.0, signed `Apple Development: Moshe Cohen`, team
NGCHN95667, archive commit `9da93a296bbe` = `origin/main`. The phone's own About screen confirms it:
**`1.0.0 (12)` · `9da93a296bbe`**. Build and upload: `docs/qa/ios-build-12-2026-09-22.md`.

**Bottom line: build 12 is healthy on the real phone, and the round-21 shell work did not touch the phone shell.** It
installs **in place over 1.0.0 (11) without losing the 1.2 GB Fast model**, launches, draws all eleven deep-linked
screens in the phone layout with no sidebar and no command palette, loads a model in the chat without a redbox, opens
the hands-free screen and holds it for 75 s, survives a background/foreground round trip without restarting, holds its
memory flat, prints no error line in any of the 16 device launches, and produced zero crash reports. **28 PASS, 0 FAIL, 0 NOT RUN of 28 rows** across the four result tables — the first iOS pass with nothing left open.

**Moshe granted the UI-Automation sheet once at 14:42, so the tap rows are not open this time.** The XCUITest driver
then drove the shipped build hands-free in two sessions: it opened **two model Details sheets** (row 13c, the one row
pass 11 had to leave NOT RUN), scrolled the vault past the fold to **Sharp** (row U5, also open since pass 11), and ran
**a real chat turn on the 1.2 GB Fast model** downloaded from the CDN — `The capital of France is Paris.` at 13.2 tok/s.
Both open rows from pass 11 are now closed.

**One thing is different from pass 11, and it is a real defect — filed as F43, not as inherited state.** The app shows
an amber **"Ran out of memory · Switched to Instant · SWITCH BACK"** line at launch on every screen. The app had not run
out of memory: its own footprint was 223 MB and the engine never opened the Fast file on any of the 16 device launches, so the
switch happened before any load was attempted. The device log shows why — a **system-wide** critical memory-pressure
event, which the iOS guard forwards as if it were this app's own. One tap on SWITCH BACK loads Fast and it answers
normally. Root cause, evidence and the exact reproduction: **F43** in `docs/qa/qa-run-2026-09-11.md`; the short version
is in "The memory banner" below.

Screenshots in `docs/qa/ios-device-pass-12/` are 231×500 copies; the 1170×2532 originals and all logs stay in the
session scratch dir and are not committed.

## The update install, and what happened to the 1.2 GB model

The lead's question was explicit, so here is the direct answer. **The Fast model survived, untouched.** The archive's
`.app` was installed over the existing `com.inbornapp.mobile` with `xcrun devicectl device install app` — same bundle
id, same signing identity, so iOS treats it as an update and keeps the data container.

`Documents/models/vault.json` was copied off the phone before and after the install and the two files are
**byte-identical** (`diff` clean). Both record Fast as `Qwen3.5-2B-Q4_K_M.gguf`, **1,280,835,840 B**, sha256
`aaf42c8b…99223`, `via: "https"`, `installedAt` 1790072631540 — the download `docs/qa/cdn-iphone-2026-09-22.md`
recorded from `models.inbornapp.com` earlier the same day. The phone's own Privacy & storage screen agrees: **Models
1.19 GB**, Chats 483 KB encrypted (SQLCipher). Nothing was re-downloaded and the phone never reached the network in
this pass.

`Documents/prefs.json` survived too, which is why this pass needed no onboarding write and no tap: `onboarded` true,
`lock.enabled` false, `meter` 0/0. Everything from row 1 down was captured on that inherited state.

## Results

| # | check | result | evidence |
|---|---|---|---|
| 0 | the archive is build 12 and complete | **PASS** — CFBundleVersion 12 / 1.0.0 on the app and on `PlugIns/AskInborn.appex`; `instant.gguf` 532,517,120 B; `tessdata` holds `eng` + `heb`; App Group in both signed entitlements; `ExpoBattery` ×3 in the binary; `extra.commit` 9da93a296bbe | build doc, `archive-verify.txt` |
| 1 | install the archive's `.app` over 1.0.0 (11) | **PASS** — "App installed", bundle `com.inbornapp.mobile`, 14:16:59 → 14:17:16 (**17 s** over USB, the same as builds 10 and 11) | `install.json`, `install.log`, `install-times.txt` |
| 1b | the vault survives the update | **PASS** — `vault.json` **byte-identical** before and after; Fast 1,280,835,840 B `via:"https"` still recorded, Instant still `via:"bundled"`; Privacy & storage reads Models **1.19 GB** | `vault-before.json`, `vault-after.json`, `r-15-settings-storage.png` |
| 2 | launch, process alive | **PASS** — every one of the 16 device launches in this pass came up and was still listed in `devicectl device info processes` when it was sampled; the idle launch held pid **10373** across five and a half minutes | `routes.txt`, `idle-run.txt` |
| 3 | bundled Instant still adopted | **PASS** — `vault.json` `instant`: `via:"bundled"`, `Qwen3.5-0.8B-Q4_K_M.gguf`, 532,517,120 B, sha256 `bd258782…dc517`, identical to `packages/core/src/catalog/manifest.json` | `vault-after.json` |
| 4 | deep link to every main screen | **PASS** — 11 routes, each launched with its own URL, held 11 s, screenshotted and sampled alive (pids 10360–10370). Every screenshot shows its own screen. Route table below | `r-10…r-20-*.png`, `routes.txt` |
| 4b | the chat draws, chips included | **PASS** — `inborn:///` on the onboarded install draws the chat: header `Chats · SEALED · INSTANT`, the sealed ring over "Nothing leaves this phone.", and **all three** suggestion chips — Summarize text, Translate, Draft a message. Message box with the `+` attach button, mic and send below | `r-10-root.png` |
| 4c | the chat settles after the model loads | **PASS** — settled at t+11 s, and the t+11 s and t+32 s frames are **identical below the status bar** (content sha `71a04d2fe18b9887` both), the only pixels that moved in the whole 1170×2532 frame being the clock digits (difference bbox `(137, 59, 245, 97)`). The log holds **0** error lines and llama.cpp logs the real load: `llama_model_loader: loaded meta data with 46 key-value pairs and 320 tensors from …/Inborn.app/instant.gguf`, `CPU_Mapped model buffer size = 198.93 MiB`, `MTL0_Mapped model buffer size = 497.39 MiB` (53 `llama_model_loader:` lines, log 45,833 bytes against build 11's 45,703) | `r-22a-chat-t11.png`, `r-22-chat-loaded.png`, `log-chat-loaded.txt` |
| 5 | nothing new in the console | **PASS** — a grep for error / exception / fatal / redbox over **every** log from **all 16 device launches** (11 routes, the chat-settle run, the hands-free run, the idle launch, the final About check and the F43 relaunch) returns **0 matches**. llama.cpp's load logging appears only in the launches that loaded a model | `log-*.txt` |
| 6 | the phone shell is unchanged by F42 | **PASS** — all eleven screens drew the phone layout: no sidebar, no `ChatsPane`, no command palette, no side panel. This is by construction (`layoutModeFor` returns `"phone"` below 760 pt; the phone is 390 pt and portrait-locked) and it is what the screenshots show. Compared screen by screen against pass 11: same sections, same controls, same order, same copy, same prices. Section "Layout against pass 11" has the two honest pixel differences | `r-10…r-20-*.png`, pass-11 shots |
| 7 | background → foreground round trip | **PASS** — app backgrounded by activating SpringBoard with `--no-kill-existing` (nothing killed): home screen drawn with the Inborn icon on it, pid **10373** still alive. Re-activated and the tool reported the **same pid** 10373, back on the screen it left. Resumed, not restarted | `29-before-background.png`, `30-backgrounded.png`, `31-foregrounded.png`, `idle-run.txt` |
| 7b | memory after idle, model resident | **PASS** — same pid 10373 at all three samples, the app sitting in the chat with the Instant model loaded. Phys footprint rose **+0.67 %** across the interval that spans the background/foreground round trip and **+0.06 %** over the next two and a half minutes; the anonymous peak **did not move at all** (delta exactly 0 B). Table below | `idle-run.txt`, `sysmon-*.json`, `32-after-idle-3min.png` |
| 8 | hands-free screen opens and stays alive ≥ 60 s | **PASS** — `inborn:///voice` draws the dark hands-free screen, pid **10386** alive at t+12 s and still at t+75 s, **0** error lines, and the frame is **identical below the status bar** across those 63 s (content sha `a2e24bd6bc327863`), only the clock moving. **No microphone was started and no permission sheet appeared**: with Whisper not installed, the screen stops at "Whisper (142 MB) turns your voice into text entirely on this phone. Install it once from the vault." over "Open the vault" and "End". Nothing was pressed | `r-24-voice-t12.png`, `r-25-voice-t75.png`, `log-voice.txt` |
| 9 | Proof screen: nothing leaves the phone | **PASS** — `SEALED · ON-DEVICE`, **`OUT 0 B · IN 0 B`**, `CONNECTIONS 0 this session`, permissions all off ("Network: none (not in the manifest)"), allowlist limited to `huggingface.co` / `*.hf.co` | `r-18-proof.png` |
| 9b | paywall prices come from the App Store | **PASS** — PRO **₪59.90** and PRO FOR WORK **₪199.90**, one-time, plus Restore purchases — shekels from StoreKit, not the USD `fallbackPrice` constants. Same card as builds 8–11, including the "Family Sharing is not enabled for this product yet." footer. No purchase was attempted and no sandbox sheet was raised | `r-17-paywall.png` |
| 10 | crash-log sweep | **PASS** — `pymobiledevice3 crash ls` holds 54 files and **not one** names `Inborn` or `com.inbornapp` | `crashlogs.txt` |
| 11 | phone left as asked | **PASS** — Inborn **1.0.0 (12) left installed**, phone on the home screen. No setting changed, no passcode entered, no lock or unlock, no permission prompt, no system process killed, and the only bundle installed was `com.inbornapp.mobile` | `30-backgrounded.png` |

## Round-21 code in the binary this phone ran

| # | check | result | evidence |
|---|---|---|---|
| 12 | the F42 shell is in the Hermes bundle | **PASS** — the six new `desktop.*` locale values (`Command Palette`, `Toggle Sidebar`, `Model Picker`, `Search chats and screens`, `SCREENS`, `CHATS`) and the three new shortcut ids (`toggle-sidebar`, `new-incognito`, `model-picker`) are each present exactly once in `main.jsbundle`. `main.jsbundle` grew 6,011,608 → **6,030,365 B**, and the +18,757 B is this work | `f42-check.txt`, build doc |
| 12b | the CDN host is in the binary | **PASS** — `models.inbornapp.com` ×1 in `main.jsbundle`, and the phone's own vault card shows `Install · 1.2 GB from models.inbornapp.com` on an uninstalled model | `f42-check.txt`, `r-12-vault.png` |
| 13 | round 20 (F39) is still in this binary | **PASS** — all four regex sources from `packages/core/src/chat/length.ts` present in `main.jsbundle`, each exactly once, compared byte-for-byte against the source: `EXPLAIN_STARTS` (219 chars), `EXPLAIN_NOT` (204), `EXPLAIN_MARKS` (834) as UTF-16LE, `CHOICE_MARK` (23) as UTF-8 — the identical counts build 11 recorded | `f39-regex-check.txt` |
| 13b | round 19 (F38) is still in this binary | **PASS** — all five round-19 length-instruction strings present once each: `Answer in one to three sentences…`, `Answer in one or two short spoken sentences and stop`, `Keep the answer as short as the question allows, a paragraph at most`, `Give the whole answer the task needs, then stop`, `The user asked for about ` | `f42-check.txt` |

## The memory banner — F43

Every screen carries an amber line at launch: **"Ran out of memory · Switched to Instant"** with a **SWITCH BACK**
action. The full write-up is **F43** in `docs/qa/qa-run-2026-09-11.md`. The short version, with what this pass measured:

**The app had not run out of memory.** Its phys footprint was **223 MB** across the whole pass, and a `grep` over every
one of the **16** device launch logs finds `instant.gguf` (4 loads) and **never** `Qwen3.5-2B-Q4_K_M.gguf`. The engine never attempted the
Fast model, so this is the guard switching **ahead of** a load, not a load that failed.

**Fast runs on this phone.** In the live session the driver tapped SWITCH BACK. Fifty seconds later the banner was
**absent from the accessibility dump**, the header read **`FAST`**, and the next question was answered by Fast at
**13.2 tok/s** with the ledger naming it. The CDN run had already shown the same thing on build 11 at 13:48.

**The trigger is a system-wide signal.** A controlled cold relaunch at 14:57 with the device syslog running caught it:
`14:57:51.333 duetexpertd ATXMemoryPressureMonitor: received memory pressure warning of type: critical`, then
`14:57:55.344 SpringBoard Sending launch request … com.inbornapp.mobile` — the pressure event is about the **phone**
and it landed **4.0 s before Inborn started**. `DeviceGuardModule.swift` subscribes to exactly that system-wide source
and forwards it as this app's `memoryPressure`.

**The line staying up is by design, not a second bug.** After `MEMORY_RECOVERY_MS` (30 s) the status becomes
`memoryBack`, which `policy.ts` deliberately renders with the same headline until the user acts. The controlled
relaunch confirms it: banner at t+6 s, still there at t+90 s.

**Two cosmetic knock-ons.** On the hands-free screen the banner clips its own headline, which renders as "Voice input
needs the" with the rest of the sentence cut (`r-24-voice-t12.png`). On the paywall it takes the slot holding "No
subscription. No account. Yours forever." (`r-17-paywall.png`).

Nothing here blocks the build: the app falls back safely, never crashed, and recovers on one tap.
Evidence: `f43-banner-t06.png`, `f43-banner-t90.png`, `live-v11-after-switchback.png`, `live-v14-ledger.png`.

## Live rows (Moshe pressed the automation sheet once, 22.9 14:42)

The rows below needed taps, and taps need the phone's **"Enter iPhone Passcode for 'XCTest' · Enable UI Automation"**
sheet, which only Moshe can accept and whose grant does not persist. He accepted it at 14:42 and the XCUITest driver
then drove the **installed 1.0.0 (12) archive** hands-free in two sessions. The runner was **rebuilt from
`apps/mobile/ios-tests` for this pass** (`xcodebuild build-for-testing`, exit 0, 0 errors, 2 min 40 s), so it carries
the `swipeup` / `swipedown` / `scrollto` steps that pass 11 could only note as missing. Driver:
`ios-tests/VoiceDeviceUITests.swift`, one `VOICE_STEPS` list per session.

### The trap that cost two sessions, worth recording

The first run of each session drove the **wrong binary**. A `build-for-testing` `.xctestrun` lists
`__TESTROOT__/Debug-iphoneos/Inborn.app` in `DependentProductPaths`, and XCUITest **installs every dependent product**
— so it replaced the shipped Release app on the phone with the Debug one, which has no embedded JS bundle and came up
on a redbox: *"No script URL provided. Make sure the packager is running or you have embedded a JS bundle in your
application bundle."* Setting `UITargetAppPath` to the archive is **not** enough on its own.

The fix is one line in the `.xctestrun` patcher: drop `Debug-iphoneos/Inborn.app` and `Debug-iphoneos/AskInborn.appex`
from `DependentProductPaths` so only the runner is installed and the shipped archive stays. The Release `.app` was then
reinstalled and `vault.json` was re-read to prove the detour cost nothing: **Fast's record is byte-identical** through
it — same 1,280,835,840 B, same sha256, same `installedAt` — the only field that moved in the whole file being
Instant's `lastLoadedAt`, because this pass loaded Instant.

### Session A, 14:47:57 → 14:48:55 — the vault rows

| # | check | result | evidence |
|---|---|---|---|
| 14 | **a model's Details sheet** — NOT RUN since build 7 | **PASS, closed** — the FAST card's Details button opened the sheet on the real phone: `Fast · Qwen3.5 2B`, `1.2 GB · qwen35`, PARAMETERS `2B`, QUANTIZATION `Q4_K_M`, MAX CONTEXT `262,144 tokens`, PHOTOS `No`, TOOLS `Yes`, the full twelve-language list, LICENSE `Apache-2.0`, SOURCE **`models.inbornapp.com`**, SHA-256 `aaf42c8b…99223`, LOCATION the real container path `…/Documents/models/Qwen3.5-2B-Q4_K_M.gguf`, BENCHMARK "Not measured yet. 512 prompt tokens, then 128 generated. Nothing leaves this device.", `Set as default`, and the footer **"In use · cannot delete while loaded"**. The sheet's SHA-256 and SOURCE match the signed catalog and the CDN run's own record exactly | `live-v02-details-fast.png`, driver log |
| 14b | the Details sheet for a model that is **not** installed | **PASS** — `Sharp · Qwen3.5 4B`, `2.6 GB`, 4B / Q4_K_M / 262,144 tokens, PHOTOS `No`, TOOLS `Yes`, Hebrew `(Basic)` where Fast says `(No)`, LICENSE `Apache-2.0`, SHA-256 `49bd3df5…72975`. No LOCATION row and no "in use" footer, as expected for a model with no bytes on the device | `live-v04-details-sharp.png`, driver log |
| 15 | **the vault below the fold** — open since pass 11 | **PASS, closed** — the new `scrollto` step reached `model-card-sharp` **after one swipe**, where pass 11 could only tap a fit map and gave up. The FAST card's full prose was on the frame above it: "Weak at: No photos; code, math, Hebrew; German prose and Korean translation; questions across many long documents." | `live-v01-vault-top.png`, `live-v03-vault-sharp.png`, driver log |
| 15b | the vault header reads the real device | **PASS** — `1.2 GB in the vault · 79 GB free · RUNS ON: IOS-MID · 6 GB`, and FAST carries `RECOMMENDED ON THIS PHONE · CHAT IN ENGLISH`, `Loaded`, `In use` | driver log dump |

### Session B, 14:49:23 → 14:52:10 — a chat turn on Fast

| # | check | result | evidence |
|---|---|---|---|
| 16 | **SWITCH BACK recovers the chosen model** | **PASS** — before the tap the dump holds `Ran out of memory · Switched to Instant` and the header reads `INSTANT`. Fifty seconds after the tap the banner is **absent from the dump** and the header reads **`FAST`**. The 1.2 GB model loaded on demand with no redbox and no crash | `live-v10-chat-before.png`, `live-v11-after-switchback.png`, driver log |
| 17 | **a real chat turn on the CDN-downloaded Fast model** | **PASS** — `What is the capital of France?` typed into the composer and sent, answered **`FAST · ON-DEVICE AI · The capital of France is Paris.`** One sentence, 6 completion tokens — the short budget F38 asks for on a factual question, now measured on Fast rather than Instant | `live-v12-typed.png`, `live-v13-answer.png`, driver log |
| 17b | the ledger on that message | **PASS** — MODEL **`FAST`**, QUANT `Q4_K`, CONTEXT `144 / 2048`, MS/TOKEN `76 ms`, TOK/S **`13.2`**, FIRST TOKEN `683 ms`, TOKENS IN + OUT `138 + 6`, GENERATION `1.1 s` | `live-v14-ledger.png`, driver log |

### Fast, measured against its own card

| | Fast, this run | Instant, pass 11 | Fast's vault card |
|---|---|---|---|
| tok/s | **13.2** | 24.3 | **~15-24 tok/s on your phone** |
| first token | 683 ms | 775 ms | — |
| whole answer | 1.1 s | 1.0 s | — |
| completion tokens | 6 | 6 | — |

**Fast measured 13.2 tok/s where its card promises "~15-24 tok/s on your phone".** That is below the bottom of the
stated range, on a single six-token sample, taken while the guard had just been overridden — so it establishes
direction, not magnitude, exactly as the Android vc15 run said of its own numbers. It is the same class of gap F37
fixed on Android, where Sharp's card claimed "~3-4 tok/s" and the phone did 0.5. Worth one more sample before anyone
changes the card.

### One product observation from the Details sheets

Sharp's Details sheet on the **iPhone** lists SOURCE as `play-asset-pack, play-asset-pack, https`. Two of those three
are Google Play delivery mechanisms and mean nothing on iOS; the honest line for an iPhone is the https one. Not a
build defect and nothing is broken by it, but it is user-visible text in a screen whose whole job is provenance.

## Layout against pass 11

Every screen was compared with its pass-11 original at 1170×2532. **Structurally they are the same screen**: same
sections in the same order, same controls, same copy, same prices. The full-frame diff is non-empty on all of them, and
there are exactly two reasons, neither of which is code:

1. **The phone is in Dark appearance now and was in Light during pass 11.** `prefs.themeMode` is `"system"` on this
   phone and this pass did not touch it, as instructed. Pass 11's settings and paywall shots are white; this pass's are
   black. Same layout, inverted palette.
2. **The memory banner** occupies a line on every screen, as described above.

No third difference was found. In particular nothing moved that would indicate the F42 shell reaching the phone: no
sidebar, no palette, no side panel, no changed margins on any of the eleven screens.

## What each route drew

| route | screenshot shows | shot |
|---|---|---|
| `inborn:///` | the chat (this install is already onboarded): `Chats · SEALED · INSTANT`, the sealed ring over "Nothing leaves this phone.", all three suggestion chips, the composer with `+`, mic and send | `r-10-root.png` |
| `/chats` | "Chats", search, New chat / Incognito, three RECENT chats left by pass 11 and the CDN run, the INSTANT / Personas / Memory / Folders row with the PRO pill, bottom bar `INSTANT · OUT 0 B`, Settings and Proof | `r-11-chats.png` |
| `/vault` | "Model vault", the Best for / in English pickers, **FAST Qwen3.5 2B first** with `RECOMMENDED ON THIS PHONE · CHAT IN ENGLISH`, its GOOD AT / LANGUAGES / Weak-at blocks, `1.2 GB · Q4_K_M · Battery: Medium`, `~15-24 tok/s on your phone`, `Loaded`, `In use` and Details; INSTANT Qwen3.5 0.8B below it | `r-12-vault.png` |
| `/documents` | "Documents", "No documents · 0 B on this device", the "Answer only from my documents" toggle, the 262 MB document-index-model offer, "Select documents to ask", footer `INDEXED ON THIS DEVICE · sqlcipher` | `r-13-documents.png` |
| `/settings` | Appearance (System/Dark/Light, seven text sizes), Security (passcode off, hide-in-switcher on, screenshot protection off, wipe-after-failed-unlock, auto-delete) | `r-14-settings.png` |
| `/settings/storage` | "Privacy & storage": Chats **483 KB** encrypted (SQLCipher), **Models 1.19 GB**, Documents/Memory/Reports 0 B, Export and Transfer greyed behind Pro, Delete all chats / Delete everything | `r-15-settings-storage.png` |
| `/settings/about` | **`1.0.0 (12)` and commit `9da93a296bbe`** — the phone confirming which build ran; licences, "We collect nothing. There is nothing to opt out of.", Report a problem, "Made without a server." | `r-16-settings-about.png` |
| `/paywall` | "Pay once. Own it.", both tiers on one screen, ₪59.90 and ₪199.90 one-time, Restore purchases | `r-17-paywall.png` |
| `/proof` | `SEALED · ON-DEVICE`, `OUT 0 B · IN 0 B`, `CONNECTIONS 0 this session` | `r-18-proof.png` |
| `/legal/privacy` | the privacy policy, "LAST EDITED 5 September 2026" | `r-19-legal-privacy.png` |
| `/onboarding` | the welcome step | `r-20-onboarding.png` |

## Memory (check 7b)

`pymobiledevice3 developer dvt sysmon process single --userspace`, values in bytes, one launch held across all three
samples, app sitting in the chat with the Instant model loaded. The background/foreground round trip falls between the
first and second sample.

| when | pid | resident | phys footprint | anon | anon peak |
|---|---|---|---|---|---|
| t+20 s | 10373 | 858,243,072 | 221,971,976 | 220,676,096 | 230,850,560 |
| t+3 min | 10373 | 771,096,576 | 223,462,920 | 222,167,040 | 230,850,560 |
| t+5.5 min | 10373 | 742,932,480 | 223,593,992 | 222,298,112 | 230,850,560 |

Phys footprint **+1,490,944 B (+0.67 %)** over the first interval, which spans the background/foreground round trip,
then **+131,072 B (+0.06 %)** over the second. The anonymous peak is **identical at all three samples** — delta exactly
0 B — and resident size actually **fell** by 115 MB as the OS reclaimed mapped pages. The first interval is larger than
build 11's (+0.04 %) and build 10's (−0.47 %), but the sign has flipped between every one of the last four builds and
the absolute figure is 1.4 MB on a 223 MB footprint, which is what a flat footprint looks like when it is sampled
around a background transition. Nothing leaks while the app sits with a model loaded. Thermal state is still
unmeasured: `sysmon process` does not expose it.

## What still needs a tap

The archive is a store-configuration Release build, so every headless hook is dead (`EXPO_PUBLIC_AUTOPROMPT`,
`AUTOINDEX`, `AUTOASK`, `AUTOVOICE` are inlined empty by Metro; the `__DEV__`-gated ones never fire). XCUITest — and
Moshe's passcode, once, while a runner starts — remains the only way in.

| # | what | state after this pass |
|---|---|---|
| U2 | **a model's Details sheet** | **CLOSED 22.9 14:48** — two sheets opened on the real phone, Fast and Sharp (rows 14, 14b). This was the last row pass 11 left NOT RUN |
| U5 | **the vault below the fold** | **CLOSED 22.9 14:48** — `scrollto` reached the Sharp card after one swipe (row 15). The rebuilt runner carries the scroll steps pass 11 lacked |
| U10 | **a chat turn on the CDN-downloaded Fast model** | **CLOSED 22.9 14:51** — Fast loaded on demand and answered, with the ledger naming it (rows 16, 17, 17b) |
| U3 | share sheet / share extension | **open** — tap-driven by definition (Safari → Share → Inborn); the `.appex` is confirmed inside the installed bundle |
| U6 | hands-free with Whisper installed | **open** — this build again proved the screen and its no-model state; installing the 142 MB Whisper model is a tap in the vault |
| U7 | thermal state under load | **open** — not exposed by `sysmon process` |
| U11 | a second Fast throughput sample | **open** — 13.2 tok/s against a card that says ~15-24 is one sample; see "Fast, measured against its own card" |

## Process audit

On the Mac: one `xcodebuild archive`, two `-exportArchive` (the first killed by a full disk), two `altool` calls, one
`xcodebuild build-for-testing`, and six `xcodebuild test-without-building` runs — three that failed on the
UI-Automation sheet or the Debug-app trap, and the two that carry the evidence, plus one aborted on a stale result
bundle. Every PID this pass started was killed by PID, never by name. No simulator was booted, and at the end of the
run no `.p8` exists anywhere and `~/.appstoreconnect/private_keys` is empty.

On the phone: **Inborn 1.0.0 (12) is left installed**, from the shipped archive, reinstalled after the Debug detour.
The test runner XCUITest installs and manages itself is also present, as it was before this pass began. No setting was
changed, no permission sheet was accepted beyond the one UI-Automation grant Moshe entered himself, nothing was locked
or unlocked by this run, no system process was killed, and no other app was opened. The app's own data — the vault with
Fast in it, the chats — is what earlier runs and this driver created.

Screenshots in `docs/qa/ios-device-pass-12/` are 231×500 copies; the 1170×2532 originals, the xcodebuild logs and the
`.xcresult` bundles stay in the session scratch dir and are not committed.
