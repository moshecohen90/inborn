# iOS device pass — TestFlight build 1.0.0 (12) — 22.9.2026

Functional pass of the build 12 archive on Moshe's iPhone 13 Pro (iOS 26.6.1, udid `REDACTED-IPHONE`, on USB)
immediately after the upload. Every launch below is the `.app` from
`/Users/moshecohen/dev/inborn-wt/ios-build-12/apps/mobile/ios/build/Inborn.xcarchive`, the same archive whose IPA went to
TestFlight — `CFBundleVersion` 12, `CFBundleShortVersionString` 1.0.0, signed `Apple Development: Moshe Cohen`, team
NGCHN95667, archive commit `9da93a296bbe` = `origin/main`. The phone's own About screen confirms it:
**`1.0.0 (12)` · `9da93a296bbe`**. Build and upload: `docs/qa/ios-build-12-2026-09-22.md`.

**Bottom line: build 12 is healthy on the real phone, and the round-21 shell work did not touch the phone shell.** It
installs **in place over 1.0.0 (11) without losing the 1.2 GB Fast model**, launches, draws all eleven deep-linked
screens in the phone layout with no sidebar and no command palette, loads a model in the chat without a redbox, opens
the hands-free screen and holds it for 75 s, survives a background/foreground round trip without restarting, holds its
memory flat, prints no error line in any of the 14 launches, and produced zero crash reports.

**One thing is different from pass 11 and it is not a build-12 regression:** the app shows an amber
**"Ran out of memory · Switched to Instant · SWITCH BACK"** line on every screen. Pass 11 ran before the CDN run
installed Fast; the CDN run left **Fast selected** on this 6 GB phone, and build 12 inherited that state. Section
"The memory banner" below has the evidence and what it means.

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
| 2 | launch, process alive | **PASS** — every one of the 14 launches in this pass came up and was still listed in `devicectl device info processes` when it was sampled; the idle launch held pid **10373** across five and a half minutes | `routes.txt`, `idle-run.txt` |
| 3 | bundled Instant still adopted | **PASS** — `vault.json` `instant`: `via:"bundled"`, `Qwen3.5-0.8B-Q4_K_M.gguf`, 532,517,120 B, sha256 `bd258782…dc517`, identical to `packages/core/src/catalog/manifest.json` | `vault-after.json` |
| 4 | deep link to every main screen | **PASS** — 11 routes, each launched with its own URL, held 11 s, screenshotted and sampled alive (pids 10360–10370). Every screenshot shows its own screen. Route table below | `r-10…r-20-*.png`, `routes.txt` |
| 4b | the chat draws, chips included | **PASS** — `inborn:///` on the onboarded install draws the chat: header `Chats · SEALED · INSTANT`, the sealed ring over "Nothing leaves this phone.", and **all three** suggestion chips — Summarize text, Translate, Draft a message. Message box with the `+` attach button, mic and send below | `r-10-root.png` |
| 4c | the chat settles after the model loads | **PASS** — settled at t+11 s, and the t+11 s and t+32 s frames are **identical below the status bar** (content sha `71a04d2fe18b9887` both), the only pixels that moved in the whole 1170×2532 frame being the clock digits (difference bbox `(137, 59, 245, 97)`). The log holds **0** error lines and llama.cpp logs the real load: `llama_model_loader: loaded meta data with 46 key-value pairs and 320 tensors from …/Inborn.app/instant.gguf`, `CPU_Mapped model buffer size = 198.93 MiB`, `MTL0_Mapped model buffer size = 497.39 MiB` (53 `llama_model_loader:` lines, log 45,833 bytes against build 11's 45,703) | `r-22a-chat-t11.png`, `r-22-chat-loaded.png`, `log-chat-loaded.txt` |
| 5 | nothing new in the console | **PASS** — a grep for error / exception / fatal / redbox over **every** log from **all 14 launches** (11 routes, the chat-settle run and the hands-free run, plus the idle launch) returns **0 matches**. llama.cpp's load logging appears only in the launches that loaded a model | `log-*.txt` |
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

## The memory banner

Every screen in this pass carries an amber line: **"Ran out of memory · Switched to Instant"** with a **SWITCH BACK**
action. It is worth being precise about what it is, because it looks alarming and is not a build-12 defect.

**It is the device guard working, not a fault in this build.** `packages/core/src/device/policy.ts` raises the
`memory` status only while `signals.memoryPressure` is `"warning"` or `"critical"`, and on iOS that value comes from a
real memory signal, not from a stored flag — there is nothing about it in `prefs.json`, which this pass read off the
phone in full. When it fires, the guard drops the active model to Instant (`tierBelow` sends a phone straight to
Instant) and leaves the line up with a way back. The app then behaved correctly the whole pass: it loaded
`instant.gguf` out of the app bundle, answered, and never crashed.

**Pass 11 did not show it because pass 11 ran before Fast existed on this phone.** The CDN run
(`docs/qa/cdn-iphone-2026-09-22.md`) installed Fast, 1.2 GB, later the same day on build 11 and left it **selected and
loaded**. Build 12 inherited that selection. A 2B model at 1.2 GB resident on a 6 GB iPhone 13 Pro is exactly the case
the §6.5 memory row was written for. The vault still shows FAST as `Loaded · In use` while the chat header shows
`INSTANT`, which is the guard's fallback being honest about the selection and the resident model separately.

**Two cosmetic consequences, both worth a look by whoever owns the banner.** On the hands-free screen the banner sits
under a headline it clips: the title renders as "Voice input needs the" with the rest of the sentence cut
(`r-24-voice-t12.png`). On the paywall the banner takes the slot where "No subscription. No account. Yours forever."
sits in pass 11, so that promise is not on screen while the banner is up (`r-17-paywall.png`). Neither blocks anything.

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
