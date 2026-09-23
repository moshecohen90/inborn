# iOS device pass — TestFlight build 1.0.0 (15) — 23.9.2026

Short final pass of the build 15 archive on Moshe's iPhone 13 Pro (udid `<iphone-udid>`, on USB),
immediately after the upload. Every launch below is the `.app` from
`/Users/moshecohen/dev/inborn-wt/ios-build-15/apps/mobile/ios/build/Inborn.xcarchive`, the same archive whose IPA
went to TestFlight — `CFBundleVersion` 15, `CFBundleShortVersionString` 1.0.0, team NGCHN95667, archive commit
`e64d7e72340e`. Build and upload: `docs/qa/ios-build-15-2026-09-23.md`.

**This pass is deliberately narrow.** It claims four rows and nothing else. The tap rows (U10 chat answer and the
rest) need the phone's "Enter iPhone Passcode for 'XCTest' · Enable UI Automation" sheet, which needs Moshe holding
the phone; they were **proven on build 12 and are not repeated here**.

**Bottom line: F98 is closed on the device.** The in-app Terms screen now names the licensor, the phone number, the
email and the effective date, read off the phone rather than out of the source tree.

Screenshots in `docs/qa/ios-device-pass-15/` are 231×500 copies; the 1170×2532 originals and all logs stay in the
session scratch dir and are not committed.

## The update install

The archive's `.app` was installed over the existing `com.inbornapp.mobile` with `xcrun devicectl device install
app` — same bundle id, same signing identity, so iOS treats it as an update and keeps the data container.
`devicectl device info apps` read **1.0.0 / 14** before and **1.0.0 / 15** after.

## Results

| # | check | result | evidence |
|---|---|---|---|
| 1 | **About reads 1.0.0 (15) and this build's commit** | **PASS** — the About screen shows VERSION **`1.0.0 (15)`** with **`e64d7e72340e`** beside it, the same string the archive's `EXConstants.bundle/app.config` carries in `extra.commit`, and the tip of branch `ios-build-15` | `r-16-settings-about.png`, `archive-verify.txt` |
| 2 | **F98 / F97: the Terms screen names its licensor** | **PASS, closed** — `inborn:///legal/terms` opens on the identity block, above "1. Licence": **`Effective date: 22 September 2026`**, **`Licensor: Cohen Apps ("we", "us")`**, **`Contact: support@inbornapp.com or +1-440-847-8502. We have no physical reception and offer no in-person service.`** Pass 14 measured `Cohen Apps` 0 and `+1-440-847-8502` 0 on this screen and opened straight onto "1. Licence" | **`r-19b-legal-terms.png`** |
| 2b | the Privacy screen gains the effective date it was also missing | **PASS** — `inborn:///legal/privacy` opens on **`Effective date: 22 September 2026`**, **`Publisher: Cohen Apps (the developer account shown on the store listing)`**, **`Contact: support@inbornapp.com`**, then "1. The short version" with every value filled and no `{{…}}` token | `r-19-legal-privacy.png` |
| 2c | privacy §12 Contact | **PASS on the binary, NOT scrolled to on the phone** — §12 sits well below the fold and reaching it needs a scroll, which needs the UI Automation sheet this pass did not raise. Its content is proved one layer up instead: `Cohen Apps` ×3, `support@inbornapp.com` ×6 and `+1-440-847-8502` ×2 in the shipped Hermes bundle, and §12's own sentence "We have no physical reception and offer no in-person service." ×1 | `f97-bundle-15.txt` |
| 3 | **the vault survives the update** | **PASS** — `Documents/models/vault.json` copied off the phone before and after the install is **byte-identical**, 597 B, sha256 `2d232afb5844cab6…`. Fast still `Qwen3.5-2B-Q4_K_M.gguf`, 1,280,835,840 B, `via:"https"`; Instant still `via:"bundled"`, 532,517,120 B. Privacy & storage agrees: Models **1.19 GB**, Chats **668 KB** encrypted (SQLCipher), Documents / Memory / Reports 0 B. Nothing was re-downloaded and the phone never reached the network | `vault-before.json`, `vault-after.json`, `r-15-settings-storage.png` |
| 4 | **10-minute idle soak, no crash reports** | **PASS** — one launch held **13:06:32 → 13:17:36 (11 min 4 s)** on the same pid **11647** at all three samples, **0** error lines in the soak console, and **0** crash reports naming Inborn (55 crash files on the device, none of them ours). Table below | `soak/soak.txt`, `crashlogs.txt`, `sweeps.txt`, `soak-m0/m5/m10.png` |
| 5 | the screens draw and the process stays alive | **PASS** — all five deep-link launches came up and were still listed in `devicectl device info processes` when sampled, pids **11641–11646** | `routes.txt` |
| 6 | nothing new in the console | **PASS** — a grep for error / exception / fatal / redbox over **every** route log of this pass returns **0** matches | `log-*.txt` |
| 7 | F43 still boots the phone on the model the user chose | **PASS, carried forward** — header reads **FAST**, llama.cpp opens `…/Documents/models/Qwen3.5-2B-Q4_K_M.gguf` (the 1.2 GB CDN model), `n_ctx = 4096`, 53 `llama_model_loader:` lines | `r-10-root.png`, `log-root.txt` |
| — | the tap rows (U10 chat answer and the rest) | **NOT REPEATED** — proven on build 12; they need the UI Automation passcode sheet and so need Moshe holding the phone | `docs/qa/ios-device-pass-12-2026-09-22.md` |

## The chat screen

`inborn:///` on the onboarded install draws the chat: header `Chats · SEALED · **FAST**`, the sealed ring over
"Nothing leaves this phone.", and all three suggestion chips — Summarize text, Translate, Draft a message. Message
box with the `+` attach button, mic and send below. The only line above the fold is the standing "This is AI running
on your phone. It can be wrong. Check important facts." notice with its Dismiss action.

## The 10-minute idle soak

One launch, held in the foreground, sampled at minute 0, 5 and 10. The build number is the only thing that changed
against pass 14's soak, and the shape is the same.

| sample | pid | phys footprint | rss | anon peak |
|---|---|---|---|---|
| min 0 | 11647 | 245,319,800 B | 1,597,341,696 B | 251,969,536 B |
| min 5 | 11647 | 245,762,168 B | 1,597,784,064 B | 251,969,536 B |
| min 10 | 11647 | 90,031,168 B | 209,043,456 B | 251,969,536 B |

**The footprint is flat while the model is resident and then falls off a cliff**: `+0.18 %` over the first five
minutes, then **−1.39 GB of rss** between minute 5 and minute 10. That is the **10-minute idle model unload**, the
same behaviour pass 14's 30-minute soak recorded, landing here exactly at the sample that straddles it. The
**anonymous peak did not move at all** across the whole run — 251,969,536 B at every sample, byte for byte — so
nothing grew and was later reclaimed; the drop is the model being released, not a leak being collected.

**The screen is unchanged by the unload.** `soak-m10.png` still draws the chat with the header reading `Chats ·
SEALED · **FAST**`, the sealed ring, all three chips and the standing notice. The user is not shown that anything
happened, which is the intended behaviour: the model reloads on the next message.

**0 error lines** in the soak console over the whole 11 minutes, and **0 crash reports naming Inborn** — 55 crash
files exist on the phone and not one of them is ours.

## Deep-link routes

| route | URL | drew |
|---|---|---|
| chat root | `inborn:///` | `r-10-root.png` |
| About | `inborn:///settings/about` | `r-16-settings-about.png` |
| Terms of use | `inborn:///legal/terms` | `r-19b-legal-terms.png` |
| Privacy policy | `inborn:///legal/privacy` | `r-19-legal-privacy.png` |
| Privacy & storage | `inborn:///settings/storage` | `r-15-settings-storage.png` |
