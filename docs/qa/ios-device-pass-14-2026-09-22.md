# iOS device pass — TestFlight build 1.0.0 (14) — 23.9.2026

Functional pass of the build 14 archive on Moshe's iPhone 13 Pro (udid `REDACTED-IPHONE`, on USB) immediately
after the upload. Every launch below is the `.app` from
`/Users/moshecohen/dev/inborn-wt/ios-build-14/apps/mobile/ios/build/Inborn.xcarchive`, the same archive whose IPA went
to TestFlight — `CFBundleVersion` 14, `CFBundleShortVersionString` 1.0.0, team NGCHN95667, archive commit
`2190e6038170`. The phone's own About screen confirms it: **`1.0.0 (14)` · `2190e6038170`**. Build and upload:
`docs/qa/ios-build-14-2026-09-22.md`.

**Bottom line: F92 is fixed on the shipped binary, and that is the whole reason this build exists.** Build 13's Legal
screens showed raw `{{DOMAIN}}`, `{{SUPPORT_EMAIL}}` and ten more placeholders to anyone who opened them in TestFlight.
On build 14 the privacy policy opens at "1. The short version" with every value filled, and a sweep of the shipped
Hermes bundle finds **zero** of the twelve tokens and zero draft notices.

**And the pass found one thing round 31 could not see: F98.** The in-app **Terms** screen names no licensor and gives
no phone number, because `legalBody()` drops everything above the first `## ` heading and `terms.md` carries its
identity block only there. The privacy policy survives the same cut because it repeats the identity in a numbered
section. Round 31's guard asserts those values on the **file**; the reader gets the **screen**. Filed as **F98** in
`docs/qa/qa-run-2026-09-11.md` with the failing complement.

Screenshots in `docs/qa/ios-device-pass-14/` are 231×500 copies; the 1170×2532 originals and all logs stay in the
session scratch dir and are not committed.

## The update install, and the 1.2 GB model

The archive's `.app` was installed over the existing `com.inbornapp.mobile` with `xcrun devicectl device install app` —
same bundle id, same signing identity, so iOS treats it as an update and keeps the data container. `devicectl device
info apps` read `1.0.0 / 13` before and `1.0.0 / 14` after.

`Documents/models/vault.json` was copied off the phone before and after the install and the two files are
**byte-identical** (`diff` clean). Both record Fast as `Qwen3.5-2B-Q4_K_M.gguf`, **1,280,835,840 B**, sha256
`aaf42c8b…99223`, `via: "https"` — the CDN download from `models.inbornapp.com` — and Instant as `via: "bundled"`,
532,517,120 B, sha256 `bd258782…dc517`, identical to the shipped catalog. The phone's own Privacy & storage screen
agrees: **Models 1.19 GB**, Chats **668 KB** encrypted (SQLCipher), Documents / Memory / Reports 0 B. Nothing was
re-downloaded and the phone never reached the network in this pass.

`Documents/prefs.json` survived too, so this pass needed no onboarding write and no tap: `onboarded` true,
`lock.enabled` false, `hideInSwitcher` true, `themeMode` "system", `textScale` 1.

## Results

| # | check | result | evidence |
|---|---|---|---|
| 0 | the archive is build 14 and complete | **PASS** — CFBundleVersion 14 / 1.0.0 on the app and on `PlugIns/AskInborn.appex`; `MinimumOSVersion` 17.0; `instant.gguf` 532,517,120 B; `tessdata` holds `eng` + `heb`; App Group `group.com.inbornapp.mobile` in **both** signed entitlements; `ExpoBattery` ×3 in the binary; `extra.commit` 2190e6038170 | `archive-verify.txt`, build doc |
| 1 | install the archive's `.app` in place | **PASS** — "App installed", bundle `com.inbornapp.mobile`, 09:19:05 → 09:19:22 (**17 s** over USB, the same as builds 10–13) | `install14.json`, `install14.txt` |
| 1b | the vault survives the update | **PASS** — `vault.json` **byte-identical** before and after; Fast 1,280,835,840 B `via:"https"` still recorded, Instant still `via:"bundled"`; Privacy & storage reads Models **1.19 GB** | `vault-b14-before.json`, `vault-b14-after.json`, `r-15-settings-storage.png` |
| 2 | launch, process alive | **PASS** — every device launch in this pass came up and was still listed in `devicectl device info processes` when it was sampled: thirteen route launches held pids **11401–11413**, the idle launch held pid **11415** across five and a half minutes, the soak launch held one pid across thirty | `routes.txt`, `idle-run.txt`, `soak/soak.txt` |
| 3 | bundled Instant still adopted | **PASS** — `vault.json` `instant`: `via:"bundled"`, `Qwen3.5-0.8B-Q4_K_M.gguf`, 532,517,120 B, sha256 `bd258782…dc517` | `vault-b14-after.json` |
| 4 | deep link to every main screen | **PASS** — **13 routes**, each launched with its own URL, held 11 s, screenshotted and sampled alive. Every screenshot shows its own screen. Route table below | `r-10…r-24-*.png`, `routes.txt` |
| 4b | the chat draws, chips included | **PASS** — `inborn:///` on the onboarded install draws the chat: header `Chats · SEALED · **FAST**`, the sealed ring over "Nothing leaves this phone.", and **all three** suggestion chips — Summarize text, Translate, Draft a message. Message box with the `+` attach button, mic and send below. The only line above the fold is the standing "This is AI running on your phone. It can be wrong. Check important facts." notice with its Dismiss action — **no** memory banner | `r-10-root.png` |
| 4c | the chat settles after the model loads | **PASS, and tighter than pass 13** — the t+11 s and t+32 s frames of one launch are identical below the status bar (content sha `ee3e0fc0714a5fde` both, the same value pass 13 measured) and this time the **full-frame difference bbox is `None`**: not one pixel of the 1170×2532 frame moved, the clock digits included. The log holds **0** error lines and 53 `llama_model_loader:` lines | `r-22a-chat-t11.png`, `r-22-chat-loaded.png`, `chat-settle.txt`, `log-chat-loaded.txt` |
| **4d** | **F43: the phone boots on the model the user chose** | **PASS** — no banner on any screen, header reads `FAST`, llama.cpp opens `…/Documents/models/Qwen3.5-2B-Q4_K_M.gguf` (the 1.2 GB CDN model) and `n_ctx = 4096`. Carried forward from build 13 and unchanged | `r-10-root.png`, `log-chat-loaded.txt` |
| 5 | nothing new in the console | **PASS** — a grep for error / exception / fatal / redbox over **every** log from every device launch in this pass returns **0** matches | `log-*.txt`, `sweeps.txt` |
| 6 | the phone shell is unchanged | **PASS** — all thirteen screens drew the phone layout: no sidebar, no `ChatsPane`, no command palette, no side panel | `r-10…r-24-*.png` |
| 7 | background → foreground round trip | **PASS** — app backgrounded by activating SpringBoard with `--no-kill-existing` (nothing killed), pid **11415** still alive; re-activated and the tool reported the **same pid** 11415, back on the screen it left. Resumed, not restarted | `29-before-background.png`, `30-backgrounded.png`, `31-foregrounded.png`, `idle-run.txt` |
| 7b | memory after idle, model resident | **PASS** — same pid **11415** at all three samples with **Fast** loaded. Phys footprint **fell 0.09 %** across the interval that spans the background/foreground round trip, then rose **0.07 %** over the next two and a half minutes; the anonymous peak **did not move at all** (delta exactly 0 B). Table below | `idle-run.txt`, `sysmon-*.json`, `32-after-idle-3min.png` |
| 8 | the hands-free deep link | **PASS** — `inborn:///voice` draws the **paywall**, not the hands-free screen: **F53** (round 25) put `voiceConversation` behind the Pro gate and this install has no licence, so the redirect is the correct behaviour. No microphone started and no permission sheet | `r-24-voice-t12.png`, `log-voice.txt` |
| 9 | Proof screen: nothing leaves the phone | **PASS** — `SEALED · ON-DEVICE`, **`OUT 0 B · IN 0 B`**, `CONNECTIONS 0 this session`, `since install · 0 days`; permissions all off, "Network: none (not in the manifest)"; allowlist limited to `huggingface.co` / `*.hf.co` | `r-18-proof.png` |
| 9b | paywall prices come from the App Store | **PASS** — PRO **₪59.90** and PRO FOR WORK **₪199.90**, one-time, plus Restore purchases — shekels from StoreKit, not the USD `fallbackPrice` constants. No purchase was attempted and no sandbox sheet was raised | `r-17-paywall.png` |
| 9c | F45: the status strip does not eat the paywall's line | **PASS** — "No subscription. No account. Yours forever." is legible under the title. There is no banner at all on this build | `r-17-paywall.png` |
| 10 | crash-log sweep | **PASS** — `pymobiledevice3 crash ls` holds **55** files and **not one** names `Inborn` or `com.inbornapp`; the same count as pass 13, so this pass added none | `crashlogs.txt`, `sweeps.txt` |
| 11 | phone left as asked | **PASS** — Inborn **1.0.0 (14) left installed**, phone on the home screen. No setting changed, no passcode entered by this run, no lock or unlock, no permission prompt, no system process killed, and the only bundles installed were `com.inbornapp.mobile` and the XCUITest runner | `99-home-final.png` |

## The three rows this build was cut for

| # | check | result | evidence |
|---|---|---|---|
| **L1** | **F92: the Legal screens carry no placeholder and the real identity** | **PASS on the privacy policy, and it is the headline.** The screen opens under `Privacy policy` with `LAST EDITED 22 September 2026`, first section "1. The short version", and no `{{` anywhere. The body the screen renders is 11,481 characters over 90 lines and was checked in full, not by eye: **0** `{{…}}` tokens, **0** `Status: DRAFT`, **0** `Not yet published`, `Cohen Apps` ×1, `support@inbornapp.com` ×2, `+1-440-847-8502` ×1, `Secure Enclave` **0**, `hardware-backed` **0**, `published open-source core` **0**. **The scrolled screenshots of the lower sections are NOT RUN** — scrolling needs XCUITest and the phone's automation prompt was never answered (below); the full rendered body stands in for them, and it is the same string the screen is given | `r-19-legal-privacy.png`, `L1-rendered-body.txt`, `bundle-check-14.txt` |
| **L1b** | **F93 visible on the phone** | **PASS** — the Terms screen reads "Inborn is not open source: its source code is not public, and anything we do publish from it comes under our source-available licence, which grants the right to read and verify the code and nothing more." Build 13's texts promised "a published open-source core" | `r-19b-legal-terms.png` |
| **F98** | **the Terms screen's own identity block** | **FAIL — new finding, filed as F98.** The screen opens at "1. Licence" with nothing above it but the header and `LAST EDITED 22 September 2026`. `legalBody()` returns the document from its first `## ` heading, and `terms.md` carries `Licensor: Cohen Apps ("we", "us")`, `Effective date: 22 September 2026`, the `+1-440-847-8502` contact line and the scope paragraph **only** above that heading. Counted on the rendered body: `Cohen Apps` terms file 1 / **screen 0**, `+1-440-847-8502` terms file 1 / **screen 0**, against privacy 2 / 1 and 1 / 1. Not fixed here — this is the release stream | `r-19b-legal-terms.png`, `F98-terms-identity.txt` |
| **L2** | **the second attached file meets the Pro message** | **PARTIAL.** What is proved: the message ships (`Free keeps one file at a time. Remove it to add another, or get Pro for a library.` ×1 in the shipped Hermes bundle, `Add file · PRO` ×1); the rule is `paywallFor(tier, {kind:"document", existing})` against `limits("free").filesPerChat = 1`, and `packages/core/test/licence-intake.test.ts` (8 tests, all green) covers it from both doors — "Free gets exactly one attachment, in any of the formats row 1 names" asserts `{kind:"paywall", moment:"document"}` for **every** Free kind at `existing = 1`, and "a second shared file is refused on Free, which is the cap the share target used to walk past" does the same through the share-in door. `apps/mobile/test/gates-wired.test.ts` then asserts **every** import door calls `fileIntake` first, which is the F72 fix; and on the phone the Documents screen with an empty library shows the door **unlocked**, headed plain `Add file` with no PRO pill, which is the `existing = 0` branch of that same expression. **What is NOT proved on the device: the second file.** Every door into the library is the iOS document picker, and the app declares neither `UIFileSharingEnabled` nor `LSSupportsOpeningDocumentsInPlace`, so there is no folder this run could seed with a PDF. Driving the picker instead would have browsed Moshe's own documents on his personal phone, which this pass will not do. **The way to close this row is already in the tree and is not a tap**: `EXPO_PUBLIC_AUTOINDEX` takes comma-separated file names under the app document directory and imports them on mount (`src/documents/devFlags.ts`), and `devicectl device copy to` can put two PDFs there — but it is inlined empty by Metro in a store configuration (`AUTOPROMPT` and `EXPO_PUBLIC_AUTOPROMPT` are literally **0** occurrences in this bundle, the branch dead-code-eliminated), so it closes L2 on a **dev** build, not on the binary that ships | `r-13-documents.png`, `bundle-carry-14.txt`, `licence-intake.test.ts`, `gates-wired.test.ts`, `devFlags.ts` |
| **H1** | **three Hebrew answers on Fast** | **NOT RUN.** It needs typing into the composer, so it needs XCUITest, and the automation prompt was never answered. The step file is written and patched (`stepsC.txt`: three new chats, `ענה בעברית: מה פירוש המילה שלום?` pasted each time), and this branch carries the `paste` driver step it depends on — Hebrew has no HID mapping on the phone's active keyboard layout, so `typeText` drops it and the pasteboard is the only way in that changes no keyboard setting. Worth recording before it runs: the vault's own Fast card on this phone lists Hebrew under **Weak at** and marks it `No · Hebrew` under LANGUAGES, so the honest expectation is a poor answer, and whether it comes back **in Hebrew at all** is the thing the row measures | `r-12-vault.png`, `stepsC.txt` |

## Round-23…31 code in the binary this phone ran

Read out of `main.jsbundle` in the archive. Hermes stores any string containing a non-ASCII character as UTF-16LE,
which is why several of these are found in that encoding.

| # | check | result | evidence |
|---|---|---|---|
| 12 | **F92**: no placeholder, and the real identity | **PASS** — `{{DOMAIN}}` `{{SUPPORT_EMAIL}}` `{{DEVELOPER_LEGAL_NAME}}` `{{POSTAL_ADDRESS}}` `{{EFFECTIVE_DATE}}` `{{GOVERNING_LAW}}` all **0** (build 13: 6/5/1/1/1/1); `Status: DRAFT` and `Not yet published` **0**; `Cohen Apps` ×3, `support@inbornapp.com` ×6, `+1-440-847-8502` ×2 | `bundle-check-14.txt`, `bundle-check-build13-control.txt` |
| 12b | **F93**: one honest source claim | **PASS** — `Inborn Source-Available Licence 1.0` ×1, `Inborn is not open source` ×1, `published open-source core` **0** | `bundle-check-14.txt` |
| 12c | **F94**: the real key store | **PASS** — `Secure Enclave` **0**, `hardware-backed` **0**; the true wording present: the iOS Keychain with `WhenUnlockedThisDeviceOnly` ×1, the Android Keystore ×2, Windows Credential Manager ×2 | `bundle-check-14.txt` |
| 12d | every remaining `{{…}}` in the whole bundle is deliberate | **PASS** — a regex sweep of the entire 6,172,387-byte bundle returns **41 distinct** tokens, 39 UTF-8 and 4 UTF-16LE. One is `{{COPYRIGHT}}`, which `licenceText()` fills when it renders a model licence; the **other 40 are all work-pack prompt templates** (`{{client_name}}`, `{{patient_ref}}`, `{{tax_year}}`, `{{jurisdiction}}` …) filled at runtime from the user's own input. `grep -o '{{[^}]*}}' docs/legal/` returns `{{COPYRIGHT}}` twice and nothing else | build doc |
| 13 | F43 / F53 / F42 / F38 / the CDN host, carried forward | **PASS** — `Not enough memory for` ×2 (UTF-16LE), `voiceConversation` ×1, `Command Palette` / `Toggle Sidebar` / `Search chats and screens` ×1 each, `models.inbornapp.com` ×6, and all three `length.ts` strings ×1 each | `bundle-carry-14.txt` |
| 13b | the iOS 17 floor | **PASS** — the archive's `MinimumOSVersion` is 17.0 and ASC reports `minOsVersion` **17.0** for build 14 | `archive-verify.txt`, `asc-build14.json` |

## Memory (check 7b)

`pymobiledevice3 developer dvt sysmon process single --userspace`, values in bytes, one launch held across all three
samples, app sitting in the chat with **Fast** loaded. The background/foreground round trip falls between the first and
second sample.

| when | pid | resident | phys footprint | anon | anon peak |
|---|---|---|---|---|---|
| t+20 s | 11415 | 1,596,784,640 | 245,696,512 | 244,056,064 | 251,936,768 |
| t+3 min | 11415 | 1,597,161,472 | 245,467,136 | 243,826,688 | 251,936,768 |
| t+5.5 min | 11415 | 1,597,325,312 | 245,630,976 | 243,990,528 | 251,936,768 |

Phys footprint **−229,376 B (−0.09 %)** over the first interval, then **+163,840 B (+0.07 %)** over the second — a net
**−65,536 B** across five and a half minutes that include a full background/foreground round trip. The anonymous peak
is **identical at all three samples**, delta exactly 0 B. Resident sits at **1.60 GB** because the 1.2 GB Fast model is
the one loaded, which is F43 working rather than a regression: build 12, before that fix, measured 858 MB because it
had fallen back to the 533 MB Instant.

## What each route drew

| route | screenshot shows | shot |
|---|---|---|
| `inborn:///` | the chat: `Chats · SEALED · **FAST**`, the sealed ring over "Nothing leaves this phone.", all three suggestion chips, the composer with `+`, mic and send | `r-10-root.png` |
| `/chats` | "Chats", search, New chat / Incognito, the RECENT chats left by earlier passes, the FAST / Personas / Memory / Folders row with the PRO pill | `r-11-chats.png` |
| `/vault` | "Model vault", `1.2 GB in the vault · 79 GB free · RUNS ON: IOS-MID · 6 GB`, the Best for / in English pickers, **FAST Qwen3.5 2B first** with `RECOMMENDED ON THIS PHONE · CHAT IN ENGLISH`, its GOOD AT / LANGUAGES / Weak-at blocks, `1.2 GB · Q4_K_M · Battery: Medium`, `~15-24 tok/s on your phone`, `Loaded`, `In use` and Details; INSTANT Qwen3.5 0.8B below it | `r-12-vault.png` |
| `/documents` | "Documents", `No documents · 0 B on this device`, "No documents yet.", the "Answer only from my documents" toggle behind PRO, the 262 MB document-index-model offer, "Select documents to ask", footer `INDEXED ON THIS DEVICE · sqlcipher`. The header button reads plain **"Add file"** — the unlocked `existing = 0` branch of the L2 gate | `r-13-documents.png` |
| `/settings` | Appearance (System/Dark/Light, seven text sizes), Security (passcode off, hide-in-switcher on, screenshot protection off, wipe-after-failed-unlock, auto-delete) | `r-14-settings.png` |
| `/settings/storage` | "Privacy & storage": Chats **668 KB** encrypted (SQLCipher), **Models 1.19 GB** not backed up, Documents / Memory / Reports 0 B, Delete all chats / Delete everything | `r-15-settings-storage.png` |
| `/settings/about` | **`1.0.0 (14)` and commit `2190e6038170`** — the phone confirming which build ran; Model licenses, Open-source licenses, "We collect nothing. There is nothing to opt out of.", Privacy policy, Terms of use, Report a problem, "Made without a server." | `r-16-settings-about.png` |
| `/paywall` | "Pay once. Own it.", "No subscription. No account. Yours forever.", both tiers on one screen, ₪59.90 and ₪199.90 one-time, Restore purchases, "Family Sharing is not enabled for this product yet." | `r-17-paywall.png` |
| `/proof` | `SEALED · ON-DEVICE`, `OUT 0 B · IN 0 B`, `CONNECTIONS 0 this session`, the allowlist and every permission off | `r-18-proof.png` |
| `/legal/privacy` | the privacy policy, `LAST EDITED 22 September 2026`, opening at "1. The short version" — **no placeholder anywhere** (L1) | `r-19-legal-privacy.png` |
| `/legal/terms` | the terms, `LAST EDITED 22 September 2026`, opening at "1. Licence" with the source-available paragraph (F93) — and **no licensor block above it** (F98) | `r-19b-legal-terms.png` |
| `/onboarding` | the welcome step, `RUNS ON: A15 BIONIC · 6 GB` | `r-20-onboarding.png` |
| `/voice` | **the paywall** — the F53 gate | `r-24-voice-t12.png` |

## The 30-minute soak

One launch of the shipped build, held in the foreground from **09:38:48 to 10:10:05** (31 min 17 s), sampled every five
minutes with `sysmon process single --userspace` plus a screenshot and a process listing. The chat was left on screen
with Fast loaded; nothing was typed and nothing was tapped.

| sample | pid | resident | phys footprint | anon | anon peak |
|---|---|---|---|---|---|
| min 0 | 11421 | 1,597,259,776 | 243,943,520 | 242,237,440 | 251,985,920 |
| min 5 | 11421 | 1,597,784,064 | 244,418,656 | 242,712,576 | 251,985,920 |
| min 10 | 11421 | 217,006,080 | 107,824,168 | 106,856,448 | 251,985,920 |
| min 15 | 11421 | 203,161,600 | 80,151,592 | 79,183,872 | 251,985,920 |
| min 20 | 11421 | 203,571,200 | 80,561,192 | 79,593,472 | 251,985,920 |
| min 25 | 11421 | 204,062,720 | 81,036,328 | 80,068,608 | 251,985,920 |
| min 30 | 11421 | 204,455,936 | 81,429,544 | 80,461,824 | 251,985,920 |

**One process for the whole half hour** — pid 11421 at every sample, from both `sysmon` and `devicectl device info
processes`. **Zero** error / exception / fatal / redbox lines in the soak console **and in all fourteen device logs of
this pass**, counted file by file. **Zero** crash reports: `pymobiledevice3 crash ls` holds **55** files and **not one**
names `Inborn` or `com.inbornapp`.

**The idle unload fired again, on schedule, and this is the second iPhone measurement of it.**
`apps/mobile/src/engine.ts` sets `IDLE_UNLOAD_MS = 10 * 60_000` and the app launched at 09:38:48, so the unload was due
at 09:48:48 — between the min-5 sample (≈09:44) and the min-10 sample (≈09:49). Resident drops **1.38 GB**
(1,598 MB → 217 MB) and the footprint **136.6 MB**, and the console's tail is llama.cpp tearing the context down:
`detach_threadpool` ×1, `~llama_context` ×3, `lm_ggml_metal_free` ×1. **The screenshot at min 10 still shows the header
reading `FAST`** with the sealed ring and all three chips — the user's choice is remembered, only its bytes are
released.

**After the unload the app is flat.** Across the last twenty minutes the footprint moves 80,151,592 → 81,429,544 B,
**+1,277,952 B (+1.59 %)** in total and under 500 KB per five-minute interval, and the anonymous peak is **identical at
all seven samples** — delta exactly **0 B** over the whole half hour, the unload included. Nothing leaks, and nothing
grew back after the release.

**It reproduces build 13 almost exactly**, on a different binary and a fresh set of launches: pass 13 measured a
post-unload footprint of 80,397,352 B at min 15 against this pass's 80,151,592 B, and a last-twenty-minute drift of
+1.33 MB against +1.28 MB. Two independent runs agreeing to within 0.3 % is what makes the number trustworthy rather
than a single reading.

## What needed a tap, and the one thing Moshe has to do

The archive is a store-configuration Release build, so every headless hook is dead (`EXPO_PUBLIC_AUTOPROMPT`,
`AUTOINDEX`, `AUTOASK`, `AUTOVOICE` are inlined empty by Metro; the `__DEV__`-gated ones never fire). XCUITest — and
Moshe's passcode, once, while a runner is starting — remains the only way in.

The runner was rebuilt for this branch and is ready: `xcodebuild build-for-testing` exited **0** with `** TEST BUILD
SUCCEEDED **` at 09:22:23, and `liveA.xctestrun` is written into `ios/build/tdd/Build/Products/` with both pass-12
workarounds — `DependentProductPaths` stripped of `Debug-iphoneos/Inborn.app` and `AskInborn.appex` so the runner does
not install the Debug app over the shipped Release one, and `UITargetAppPath` pointing at the archive. (`__TESTROOT__`
resolves relative to wherever the `.xctestrun` sits, which is why it must live beside the originals and not in the
scratch dir.)

**Three driver attempts were made — 09:23:01, 09:29:43 and 10:11:52 — and all three stopped at the same wall**, as
builds 7–13 did:

```
Testing failed:
  InbornUITests-Runner (11503) encountered an error (The test runner failed to initialize for UI testing.
  (Underlying Error: Timed out while enabling automation mode.))
```

The phone was showing **"Enter iPhone Passcode for 'XCTest' · Enable UI Automation"** (`40-uiautomation-prompt.png`) —
a **passcode keypad**, not an "Enable" button, which is worth naming precisely because the ask has been relayed as a
button before.

**This pass adds one fact about that sheet that earlier passes did not have.** Pass 13 recorded that the sheet "does
not clear itself: it was still on screen 90 seconds after `xcodebuild` had exited". That is true over 90 seconds and
false over six minutes. Here the sheet was watched with a screenshot every two minutes and the keypad area hashed to
rule out the clock: identical at 09:27:29, and by **09:29:31 it was gone on its own**, the phone back on its home
screen with **no grant given** (`42-prompt-expired-on-its-own.png`). The second attempt, started twelve seconds later,
failed identically, and so did a third after the soak.

So the sheet is not merely unanswerable by this run — **it expires**, and a passcode typed into a sheet that no runner
is waiting on achieves nothing. That is most likely why every window offered since build 7 has closed empty.

> **The one thing Moshe has to do:** while a runner is starting, type the iPhone passcode into the
> "Enter iPhone Passcode for 'XCTest' · Enable UI Automation" keypad. It is a keypad, not a button, and it lapses after
> a few minutes. The practical form: say when he is holding the phone, and the sheet can be put back on it within
> seconds. One answered sheet takes about six minutes of driving and closes every row below.

| # | what | state after this pass |
|---|---|---|
| U10 | a live chat answer with tok/s on the shipped binary | **open** — `stepsB.txt` written; build 14 boots on Fast so it needs no SWITCH BACK tap first |
| H1 | the three Hebrew answers | **open** — `stepsC.txt` written, and this branch carries the `paste` step it needs |
| L1 (scroll) | the privacy policy's lower sections on screen | **open** — the rendered body is verified in full instead; `stepsA.txt` has the twelve scroll shots |
| U2 / U5 | a model's Details sheet (incl. **F46**'s SOURCE row) and the vault below the fold | **open** — `stepsA.txt` |
| L2 | the second attached file | **open, and it needs more than a tap** — see the L2 row: there is no folder on the phone this run may seed with a PDF |
| U11 | a second Fast throughput sample | **open** — follows U10 |
| U3 | share sheet / share extension | **open** — tap-driven by definition; the `.appex` is confirmed inside the installed bundle |
| U6 | hands-free with Whisper installed | **open, and behind Pro as well** (F53) |
| U7 | thermal state under load | **open** — not exposed by `sysmon process` |

## Process audit

On the Mac: one `-exportArchive`, one `altool --upload-app`, one `xcodebuild build-for-testing`, three `xcodebuild
test-without-building` (all three stopped by the automation prompt), and the `devicectl` / `pymobiledevice3` calls of
the pass. `altool` leaves an orphaned `log stream` helper behind; it was killed by PID when the upload finished. Every PID this pass started was killed by PID, never by name. No simulator was booted.
`scratchpad/ios-build-14/xcodebuild.running` was held across the export and both runner runs, and
`scratchpad/*/gradle.running` was checked and empty before each.

**`scripts/asc-key-env.sh --cleanup` was never called** — that is F91, and calling it would have taken any other
stream's staged key. The one file this run staged was removed by name at the end.

On the phone: **Inborn 1.0.0 (14) is left installed**, from the shipped archive. The XCUITest runner
(`com.inbornapp.mobile.uitests.xctrunner`) is present, as it was before this pass began. The phone is on the home
screen. No setting was changed, no passcode was entered by this run, nothing was locked or unlocked, no system process
was killed, and no other app was opened.
