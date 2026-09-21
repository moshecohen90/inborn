# iOS device pass — TestFlight build 1.0.0 (10) — 22.9.2026

Functional pass of the build 10 archive on Moshe's iPhone 13 Pro (iOS 26.6.1, udid `REDACTED-IPHONE`, on USB)
immediately after the upload. Every launch below is the `.app` from
`/Users/moshecohen/dev/inborn-wt/ios-build-10/apps/mobile/ios/build/Inborn.xcarchive`, the same archive whose IPA went to
TestFlight — `CFBundleVersion` 10, `CFBundleShortVersionString` 1.0.0, signed `Apple Development: Moshe Cohen`, team
NGCHN95667, archive commit `b6e2ee1`. The phone's own About screen confirms it: **`1.0.0 (10)` · `b6e2ee1621d2`**. Build
and upload: `docs/qa/ios-build-10-2026-09-22.md`.

**Bottom line: build 10 is healthy on the real phone.** It installs, launches, adopts the bundled Instant model, draws
all eleven deep-linked screens, loads the model in the chat without a redbox, opens the hands-free screen and holds it
for 75 s, survives a background/foreground round trip without restarting, holds its memory **flat or falling with the
533 MB model resident**, prints no error line in any of the 18 launches, and produced zero crash reports. Round 19's
F38 length policy is confirmed in the shipped bundle this phone ran. Three rows are open, all for the same reason: the
phone's UI-Automation passcode gate means nothing on this phone can be tapped or scrolled, so a real chat turn and
anything that lives behind a tap could not be exercised.

Screenshots in `docs/qa/ios-device-pass-10/` are 231×500 copies; the 1170×2532 originals and all logs stay in the session
scratch dir `…/scratchpad/ios-build-10/` and are not committed.

## Results

| # | check | result | evidence |
|---|---|---|---|
| 0 | the archive is build 10 and complete | **PASS** — CFBundleVersion 10 / 1.0.0 on the app and on `PlugIns/AskInborn.appex`; `instant.gguf` 532,517,120 B; `tessdata` holds `eng` + `heb`; App Group in both signed entitlements; `ExpoBattery` ×3 in the binary; `extra.commit` b6e2ee1621d2 = worktree HEAD | build doc, `archive-verify.txt` |
| 1 | install the archive's `.app` | **PASS** — "App installed", bundle `com.inbornapp.mobile`, 02:03:12 → 02:03:28 (**16 s** over USB) | `install.json`, `install.log`, `install-times.txt` |
| 2 | launch, process alive at 60 s | **PASS** — launched 02:03:37, pid **9687** still listed at 02:04:44 (t+64 s) | `launch-times.txt`, `alive-60s.txt` |
| 2b | first screen content | **PASS** — welcome reads "Nothing leaves this phone." over "AI that runs on your device. No account. No cloud. No trace.", chip `RUNS ON: A15 BIONIC · 6 GB`, Continue filled and enabled, footer "This is AI. It can be wrong. Check important facts." The later capture is **pixel-identical below the status bar**, and its content sha `9660eb61908df5ba` is the **same hash build 9 recorded** — the welcome screen is byte-for-byte what build 9 drew. The only pixels that moved in the whole 1170×2532 frame are the clock digits at (200,58)–(285,98). No spinner, no redbox, nothing moved | `01-first-launch.png`, `01b-at-60s.png` |
| 3 | bundled Instant adopted | **PASS** — `Documents/models/vault.json`: `via:"bundled"`, `Qwen3.5-0.8B-Q4_K_M.gguf`, 532,517,120 B, sha256 `bd258782…dc517`, identical to `packages/core/src/catalog/manifest.json`; `verifiedAt` **265 ms** after `installedAt`; `downloads`, `imports` and `hf` all empty | `vault.json` |
| 4 | deep link to every main screen | **PASS** — 11 routes, each launched with its own URL, held 11 s, screenshotted and sampled alive (pids 9689–9707). Every screenshot shows its own screen. Route table below | `r-10…r-20-*.png`, `routes.txt` |
| 4b | the empty chat draws, chips included | **PASS** — `inborn:///` on an onboarded install draws the chat: header `Chats · SEALED · INSTANT`, the sealed ring over "Nothing leaves this phone.", and **all three** suggestion chips — Summarize text, Translate, Draft a message. Message box with the `+` attach button, mic and send below | `r-21-chat-empty.png` |
| 4c | the chat settles after the model loads | **PASS** — **faster than build 9**: already at t+11 s the "Loading INSTANT…" banner is gone and the dismissible "This is AI running on your phone. It can be wrong. Check important facts." stands in its place; at t+32 s the frame is unchanged. The log holds 0 error lines and llama.cpp logs the real load: `llama_model_loader: loaded meta data with 46 key-value pairs and 320 tensors from …/Inborn.app/instant.gguf`, `CPU_Mapped model buffer size = 198.93 MiB`, `MTL0_Mapped model buffer size = 497.39 MiB` (53 llama.cpp lines) | `r-21-chat-empty.png`, `r-22-chat-loaded.png`, `log-chat-loaded.txt` |
| 4d | documents screen past onboarding | **PASS** — identical to the pre-onboarding render: "Documents", "No documents · 0 B on this device", the "Answer only from my documents" toggle, the 262 MB document-index-model offer, "Select documents to ask", footer `INDEXED ON THIS DEVICE · sqlcipher`. 0 error lines | `r-23-documents-onboarded.png`, `log-documents-onboarded.txt` |
| 5 | nothing new in the console | **PASS** — across the **18** launches the app's own vocabulary is the same six known lines as builds 8 and 9: the two `UIBackgroundModes` Info.plist warnings (18 each), `_setUpFeatureFlags called with release level 2` (18), glog's `Logging before InitGoogleLogging()`, `ReactInstance: evaluateJavaScript() with JS bundle`, and the `UIManagerBinding` dropped-event line. llama.cpp's load logging appears in the three launches that loaded the model. A grep for error / exception / fatal / redbox over **every** log returns **0 matches** | `console-analysis.txt`, `log-<route>.txt` ×16, `console-launch1.txt`, `idle-launch.log` |
| 5b | deep links are really routed, not ignored | **PASS** — the redirecting launch logs the split (`inborn:///` 2) and the directly-mounted routes log 0, except `/onboarding` and `/legal/privacy` at 1 each. That is the same timing line builds 6, 8 and 9 logged on a rotating pair of routes; which routes catch it moves between runs. A URL that never reached the router could not produce the split at all, and every screen drew correctly | `console-analysis.txt`, `log-*.txt` |
| 6 | a real chat *turn* on the device | **NOT RUN** — the XCUITest driver is blocked by the phone's "Enter iPhone Passcode for 'XCTest' · Enable UI Automation" sheet, which does not persist a grant and only Moshe can accept. As in builds 7–9 this run did not attempt it, so no sheet was raised and no system process was killed. The screen itself is proven to draw and the model is proven to load in it (rows 4b, 4c) | build 6 pass, `reference-ios-xcuitest-device-voice-driving` |
| 7 | background → foreground round trip | **PASS** — app backgrounded by activating SpringBoard with `--no-kill-existing` (nothing killed): home screen drawn with the Inborn icon on it, pid **9717** still alive. Re-activated and the tool reported `Process launched with pid 9717` — the **same pid**, back on the chat screen it left. Resumed, not restarted | `29-before-background.png`, `30-backgrounded.png`, `31-foregrounded.png`, `idle-run.txt` |
| 7b | memory after idle, model resident | **PASS** — same pid 9717 at all three samples, the app sitting in the chat with the 533 MB Instant model **loaded**. The footprint **fell 0.47%** across the three minutes that span the background/foreground round trip, then rose **0.04%** over the next two and a half minutes, and the anonymous peak did not move once. Directly comparable with build 9's onboarded run, and slightly better. Table below | `idle-run.txt`, `sysmon-t20.json`, `sysmon-idle3m.json`, `sysmon-idle5m.json`, `32-after-idle-3min.png` |
| 8 | hands-free screen opens and stays alive ≥ 60 s | **PASS** — `inborn:///voice` draws the dark hands-free screen, pid **9716** alive at t+12 s and still at t+75 s, 0 error lines, and the frame is **pixel-identical below the status bar** across those 63 s, content sha `d4961144b9d9aa3e` — again the **same hash build 9 recorded**. **No microphone was started and no permission sheet appeared**: with Whisper not installed, `useHandsFree` stops at "Voice input needs the transcription model — Whisper (142 MB) turns your voice into text entirely on this phone. Install it once from the vault." over "Open the vault" and "End". Nothing was pressed | `r-24-voice-t12.png`, `r-25-voice-t75.png`, `voice-alive.txt`, `log-voice.txt` |
| 9 | Proof screen: nothing leaves the phone | **PASS** — `SEALED · ON-DEVICE`, **`OUT 0 B · IN 0 B`**, `CONNECTIONS 0 this session`, `since install · 0 days`, last delivery "Instant ships inside the app · nothing downloaded", permissions all off ("Network: none (not in the manifest)"), allowlist limited to `huggingface.co` / `*.hf.co` | `r-18-proof.png` |
| 9b | paywall prices come from the App Store | **PASS** — PRO **₪59.90** and PRO FOR WORK **₪199.90**, one-time, plus Restore purchases — shekels from StoreKit, not the USD `fallbackPrice` constants. Same card as builds 8 and 9, including the "Family Sharing is not enabled for this product yet." footer. No purchase was attempted and no sandbox sheet was raised | `r-17-paywall.png` |
| 10 | uninstall, 0 Inborn apps | **PASS** — `com.inbornapp.mobile` uninstalled 02:16:43 ("App uninstalled."); the app list has **0** rows matching `inborn` and is the **same 9-bundle set** as before the run began, added and removed both empty | `uninstall.txt`, `apps-final.json`, `apps-compare.txt` |
| 10b | home screen after uninstall | **PASS** — no Inborn icon, no test-runner icon, no dialog standing | `99-home-after-uninstall.png` |
| 11 | crash-log sweep | **PASS** — `pymobiledevice3 crash ls` holds 50 files and **not one** names `Inborn` or `com.inbornapp`. The store is `SiriSearchFeedback`, `spotlightknowledged.cpu_resource`, `*.diskwrites_resource` and `LowBatteryLog` entries only | `crashlogs.txt` |
| 11b | crash sweep repeated after the whole run | **PASS** — re-listed after the uninstall: still 50 files, **byte-identical listing** (`diff -q` clean), still 0 Inborn reports | `crashlogs-final.txt` |
| 12 | phone left as found | **PASS, no intervention needed** — no setting changed, no passcode entered, no lock or unlock, no permission prompt, no system process killed, and the only bundle installed or removed was `com.inbornapp.mobile` | `99-home-after-uninstall.png`, `apps-final.json` |

## Round 19: the F38 length policy in this binary (new row)

| # | check | result | evidence |
|---|---|---|---|
| 14 | the F38 length-policy strings are in the Hermes bundle this phone ran | **PASS** — `strings main.jsbundle` inside `Inborn.xcarchive` finds each of the five distinctive strings from `packages/core/src/chat/length.ts` exactly once: `Answer in one to three sentences: give the answer first, then stop`, `Answer in one or two short spoken sentences and stop`, `Keep the answer as short as the question allows, a paragraph at most`, `Give the whole answer the task needs, then stop`, and the explicit-count template `The user asked for about `. Unlike round 18, whose fix was an Android-only pnpm patch, F38 is shared TypeScript and does reach this binary | `bundle-strings.txt`, build doc |
| 14b | the policy *changing an answer* on the phone | **NOT RUN** — that needs a real chat turn, which is row 6's tap barrier. F38's before/after numbers were measured on the Android emulator and once on the iPhone 15 Pro simulator; see the round-19 README section | — |

## Catalog v4 on the phone

| # | check | result | evidence |
|---|---|---|---|
| 13 | the Instant card says it can look at a photo | **PASS** — the vault's INSTANT card reads "Quick answers, rewrites, summaries. **The only model here that can look at a photo.** Lightest on battery.", which is `models.copy.instant.goodFor` from catalog v4. At default text size this build also renders Instant's whole GOOD AT / LANGUAGES / Weak-at block on one frame | `r-12-vault.png` |
| 13b | the Fast and Sharp cards say "No photos" | **NOT RUN on the phone** — a card's `weakAt` prose line still sits below the fold and the list cannot be scrolled without the UI-Automation grant. The 90% text-size render reaches **one block further than build 9's**: the FAST card's header, RECOMMENDED pill, `goodFor` and its full GOOD AT block including the `Weak · Code, Math & reasoning` line, but the prose `weakAt` line below it is still off-frame. What ships is verified in the archive instead: `strings main.jsbundle` finds `No photos; code, math, Hebrew; …` (Fast), `No photos; slower and warmer than Fast; …` (Sharp) and `Reasoning, math and code. No photos.` (Sharp-Phi) in the Hermes bytecode this build installed | `r-26-vault-small.png`, `bundle-strings.txt` |
| 13c | a model's Details sheet | **NOT RUN** — `ModelDetails` is an in-screen sheet reached by tapping `details-<model id>`, not a route; the vault screenshot shows the Details button present and enabled next to "In use" | `r-12-vault.png` |
| 13d | the attach sheet with Instant resident | **NOT RUN** — the sheet opens from the composer's `+` button and there is no deep link or Release-build hook for it. The `+` button is drawn and the model is resident in the same screenshot | `r-21-chat-empty.png`, `r-22-chat-loaded.png` |

Build 9 tried and ruled out the accessibility-audit daemon as a way past the tap barrier (`deviceInspectorEnable:` answered
`capabilities` but published no focus events at all). That route was **not retried** this build, so nothing on the phone
was touched by it.

## What each route drew

| route | screenshot shows | shot |
|---|---|---|
| `inborn:///` | the onboarding welcome — the redirect | `r-10-root.png` |
| `/chats` | "Chats", search, New chat / Incognito, "No chats yet · Start one above. Everything stays on this phone.", the INSTANT / Personas / Memory / Folders row with the PRO pill, bottom bar `INSTANT · OUT 0 B`, Settings and Proof | `r-11-chats.png` |
| `/vault` | "Model vault", `1 KB in the vault · 81 GB free · RUNS ON: IOS-MID · 6 GB`, the Best for / in English pickers, INSTANT Qwen3.5 0.8B with the catalog-v4 copy, its GOOD AT / LANGUAGES / Weak-at blocks, `508 MB · Q4_K_M · Battery: Low`, `~25-36 tok/s`, "Included with the app", "In use" and Details; FAST Qwen3.5 2B below it | `r-12-vault.png` |
| `/documents` | "Documents", "No documents · 0 B on this device", the "Answer only from my documents" toggle, the 262 MB document-index-model offer, "Select documents to ask", footer `INDEXED ON THIS DEVICE · sqlcipher` | `r-13-documents.png` |
| `/settings` | Appearance (System/Dark/Light, seven text sizes), Security (passcode off, hide-in-switcher on, screenshot protection off, wipe-after-failed-unlock, auto-delete) | `r-14-settings.png` |
| `/settings/storage` | "Privacy & storage": Chats 205 KB encrypted (SQLCipher), Documents/Models/Memory/Reports 0 B, Export and Transfer greyed behind Pro, Delete all chats / Delete everything | `r-15-settings-storage.png` |
| `/settings/about` | **`1.0.0 (10)` and commit `b6e2ee1621d2`** — the phone confirming which build ran; licences, "We collect nothing. There is nothing to opt out of.", Report a problem, "Made without a server." | `r-16-settings-about.png` |
| `/paywall` | "Pay once. Own it.", both tiers on one screen, ₪59.90 and ₪199.90 one-time, Restore purchases | `r-17-paywall.png` |
| `/proof` | `SEALED · ON-DEVICE`, `OUT 0 B · IN 0 B`, `CONNECTIONS 0 this session` | `r-18-proof.png` |
| `/legal/privacy` | the privacy policy, "LAST EDITED 5 September 2026" | `r-19-legal-privacy.png` |
| `/onboarding` | the welcome step | `r-20-onboarding.png` |

## Reaching the chat screen (rows 4b–4d, 7b)

`src/app/index.tsx` renders `<Chat>` but redirects to `/onboarding` while `prefs.onboarded` is false. As in passes 8 and
9 this run got past it without a tap and without touching the phone's settings, by writing the app's own prefs file into
its own data container:

```
echo '{"onboarded":true}' > prefs.json
xcrun devicectl device copy to --device <udid> --domain-type appDataContainer \
  --domain-identifier com.inbornapp.mobile --source prefs.json --destination Documents/prefs.json
```

`mergePrefs` fills every other field from `defaultPrefs`, so the app came up with the lock **disabled** — no passcode was
set on the app and none was asked for. Row 13b used the same file with `"textScale":0.9` (the smallest of the seven
sizes the Settings screen offers) to fit more of the vault on one frame. The file lived only inside
`com.inbornapp.mobile`'s container and went with it at the uninstall. Everything above row 4b was captured **before**
this write, on a genuinely fresh install, so the eleven-route table is directly comparable with pass 9.

## Memory (check 7b)

`pymobiledevice3 developer dvt sysmon process single --userspace`, values in bytes, one launch held across all three
samples, app sitting in the chat with the Instant model loaded. The background/foreground round trip falls between the
first and second sample.

| when | pid | resident | phys footprint | anon | anon peak |
|---|---|---|---|---|---|
| t+20 s | 9717 | 857,063,424 | 223,348,232 | 222,052,352 | 230,424,576 |
| t+3 min | 9717 | 858,636,288 | 222,299,656 | 221,003,776 | 230,424,576 |
| t+5.5 min | 9717 | 858,718,208 | 222,381,576 | 221,085,696 | 230,424,576 |

Phys footprint **−1,048,576 B (−0.47%)** over the first interval — it fell across the background/foreground round trip,
where build 9 rose 0.19% — then +81,920 B (+0.04%) over the second, the same figure build 9 recorded. The anonymous peak
is identical at all three samples. Resident size is large because the 533 MB GGUF is memory-mapped (llama.cpp reports
198.93 MiB CPU-mapped plus 497.39 MiB Metal-mapped); the phys footprint is the figure that counts and it does not grow.
Nothing leaks while the app sits with a model loaded. Thermal state is still unmeasured: `sysmon process` does not
expose it. The release checklist's soak target (RSS growth under 10% between minute 20 and minute 120 under load) is a
different, longer test and is covered on Android by soak run 3.

## What still needs a tap

The archive is a store-configuration Release build, so every headless hook is dead (`EXPO_PUBLIC_AUTOPROMPT`, `AUTOINDEX`,
`AUTOASK`, `AUTOVOICE` are inlined empty by Metro; the `__DEV__`-gated ones never fire). The accessibility-daemon route
out of this was tried in build 9 and does not work, so XCUITest — and Moshe's passcode, once, while a runner starts —
remains the only way in.

| # | what | state after this pass |
|---|---|---|
| U1 | a real chat *turn* | **open** — not attempted this round; the UI-Automation grant does not persist. Build 6 left a ready `chat.xctestrun` recipe. The screen draws and the model loads in it (rows 4b, 4c), so what is left is the send-and-generate path |
| U2 | model details sheet | **open** — an in-screen sheet, not a route (`screens/vault/ModelDetails.tsx`); from the vault, tap `details-<model id>` |
| U3 | share sheet / share extension | **open** — tap-driven by definition (Safari → Share → Inborn); the `.appex` is confirmed inside the installed bundle |
| U4 | attach sheet, photo row, no-vision warning | **open** — the composer's `+` sheet has no deep link; the strings ship in the bundle but the rendered sheet was not seen on the phone |
| U5 | the vault below the fold (Fast / Sharp prose weak-at) | **open** — needs one scroll gesture; this build reached one block closer than build 9 |
| U6 | hands-free with Whisper installed | **open** — this build again proved the screen and its no-model state; installing the 142 MB Whisper model is a tap in the vault |
| U7 | thermal state under load | **open** — not exposed by `sysmon process` |
| U8 | **F38 shortening a real answer on this phone** | **open, new** — the policy is proven present in the bundle (row 14); seeing it change an answer needs U1 |

**What Moshe must do himself:** accept the "Enter iPhone Passcode for 'XCTest' · Enable UI Automation" sheet once, while
an XCUITest runner is starting, to unblock U1, U2, U4, U5, U6 and U8. Nothing else on the phone needs him.

Closed since build 3: first screen, the eleven routes, About, Proof, both paywall cards, the background/foreground round
trip and memory, the empty chat with its chips, the model finishing its load in the chat, the documents screen past
onboarding, the hands-free screen surviving 75 s with no microphone prompt, and the Instant card's catalog-v4 copy.
Closed this build: round 19's length policy present in the shipped binary, and memory falling rather than rising across
the round trip with the model resident.

## Process audit

On the Mac: `xcrun devicectl` and `pymobiledevice3` invocations plus the archive / export / altool runs of the build doc,
and one `node poll10.mjs` that polled ASC until build 10 read VALID and then exited on its own. Every
`devicectl … --console` child was killed by pid at the end of its own step; every other process exited on its own,
except one `/usr/bin/log stream` that `altool` spawns for its own network tracing and orphans to launchd — it was found
by `pgrep` and killed by pid (56571, started with the upload), exactly as in passes 7–9.
`pgrep -f "devicectl|xcodebuild|pymobiledevice3|altool|log stream|node poll"` is empty at the end of the run. No XCUITest
was started, so no `testmanagerd` was touched. No browser, simulator, emulator, dev server or tmux session was started
(`xcrun simctl list devices booted` lists none; the CoreSimulator daemons still resident on this Mac were started on
2 and 5 September, weeks before this stream), and no adb ran — the OnePlus 6T was not touched. No gradle build was
running at any point. The `.p8` copies written for the upload (scratch dir and `~/.appstoreconnect/private_keys`) were
deleted; both directories are empty of keys.

On the phone: the Inborn app (18 launches, each terminated with SIGTERM — `App terminated due to signal 15` is
devicectl's own kill, not a crash), three `com.apple.springboard` activations with `--no-kill-existing`, which is the
home-button equivalent and kills nothing, and two writes of the app's own prefs file into its own data container (see
rows 4b–4d, 13b). No purchase was attempted, no Apple sandbox sheet was raised, no microphone or other permission prompt
was triggered, no passcode was entered, the phone was never locked or unlocked, no setting was changed, and the app was
uninstalled at the end.

The generated `ios/` tree in this worktree gained a `build/` tree; that path is gitignored, so no tracked file changed.
