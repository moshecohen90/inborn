# iOS device pass — TestFlight build 1.0.0 (16) — 23.9.2026

Pass of the build 16 archive on Moshe's iPhone 13 Pro (udid `REDACTED-IPHONE`, on USB), immediately after
the upload. Every launch below is the `.app` from
`/Users/moshecohen/dev/inborn-wt/ios-build-16/apps/mobile/ios/build/Inborn.xcarchive`, the same archive whose IPA
went to TestFlight — `CFBundleVersion` 16, `CFBundleShortVersionString` 1.0.0, team NGCHN95667, archive commit
`e8a880472467`. Build and upload: `docs/qa/ios-build-16-2026-09-23.md`.

**Read the limit first: six of the ten rows this pass was asked for were not driven.** The XCUITest driver never
started. Both launches died on `Timed out while enabling automation mode`, because the phone raises
*"Enter iPhone Passcode for 'XCTest' · Enable UI Automation"* and only Moshe can answer it
(`docs/qa/ios-device-pass-16/ui-automation-prompt.png` is that sheet, photographed off the phone at 22:37). The
second sheet stood on the screen from 22:52 to 22:57:57 and expired unaccepted; it was not raised a third time. What
follows is split into what was proven on build 16 and what was not, with no row claimed on trust. **F185 is that
gap**, filed so the next stream with this phone starts by getting the grant.

Screenshots in `docs/qa/ios-device-pass-16/` are 231×500 copies; the 1170×2532 originals and all logs stay in the
session scratch dir and are not committed.

## The update install — nothing of Moshe's was touched

The app was replaced in place with `devicectl device install app`, never uninstalled (F144: an uninstall on 23.9
deleted his chats, documents and vault once already).

| check | before | after |
|---|---|---|
| `com.inbornapp.mobile` | 1.0.0 **15** | 1.0.0 **16** |
| `Documents/models/vault.json` | 338 B, sha `a95e07ee7c91f7f6` | **byte-identical**, same sha |
| `Documents/documents.json` | 6 chats' attachments, `strict: true` | **byte-identical** (`diff` clean) |
| `Documents/documents/` | 6 files | **6 files** |

Install ran 22:32:58 → 22:33:14 (16 s), rc 0.

## Proven on build 16

Each row is one deep-link launch of the shipped archive plus a screenshot; no row here needed a tap.
`scratchpad/ios-build-16/routes.txt` records the launch, the URL and the live pid for each.

| # | row | evidence |
|---|---|---|
| 1 | **About shows 1.0.0 (16)** and the archive's own commit `e8a880472467` | `r-02-about.png` |
| 2 | **Legal screen's "open on inbornapp.com" button (round 42)** — the Terms screen leads with `OFFLINE COPY · EFFECTIVE 22 September 2026`, the button **"Read the current version at inbornapp.com/terms"**, and the note that the website's version is the one that applies | `r-04-legal-terms.png`, and the same block on Privacy | `r-05-legal-privacy.png` |
| 3 | **F97 still closed on the device** — under that button the Terms body opens with `Effective date: 22 September 2026`, `Licensor: Cohen Apps ("we", "us")`, `support@inbornapp.com`, `+1-440-847-8502` | `r-04-legal-terms.png` |
| 4 | **Settings "Inborn Pro" row (round 39)** — an `INBORN PRO` section whose first row is *See what's in Pro · See what Pro adds to the free app · **FREE*** | `r-03-settings.png` |
| 5 | **F160 on iOS hardware (round 43)** — the Documents screen names the scan instead of collapsing it into "Not indexed yet": `door.jpg · IMAGE · 1 page · 57.2 KB` over **"Scanned. Run OCR on this phone?"** with its own `Run OCR · PRO` action, while the four readable files read `Indexed · N passages` | `r-06-documents.png` |
| 6 | **The strict control is locked, and says so** — *Answer only from my documents* carries the `PRO` tag with its switch off, on a phone whose tier is FREE | `r-06-documents.png` |
| 7 | **Toggle states are unambiguous on the iPhone (round 34, the F102 subject)** — in Settings, `Hide in app switcher` is a filled track with a tick and the knob right; `Require a passcode` and `Screenshot protection` are an outlined track with the knob left. The two states do not look alike | `r-03-settings.png` |
| 8 | **The model chip is on the chat header** — `INSTANT` beside the `SEALED` badge, the control round 40 put there | `r-01-root.png` |
| 9 | **The vault ranks the four models with reasons** — `INSTANT · Qwen3.5 0.8B` marked `In use`, `FAST · Qwen3.5 2B` under `FITS YOUR PHONE` tagged `RECOMMENDED ON THIS PHONE · CHAT IN ENGLISH`, each row carrying what it is good at and its language tier (`Hebrew` under `No` for Instant) | `r-07-vault.png` |
| 10 | **The paywall carries real prices** — `Pro · $19.99 one-time`, `Pro for Work · $69.99 one-time`, Restore purchases, Family Sharing | `r-08-paywall.png` |

Row 7 is the closest this pass gets to the `.ini` row 6 that `docs/qa/acceptance/ios/README.md` left open for
"whoever next has this device": the redrawn `Toggle` is now photographed on the iPhone itself, in both states, at the
same moment. It is **not** the Wi-Fi-only switch specifically — that one sits below the fold in the vault and needs a
scroll, which needs the driver. Row 6 of the `.ini` stays open.

## Not proven on build 16, and why

None of these failed. None of them ran.

| row | why not | where it was last proven |
|---|---|---|
| Model sheet lists the four chat models and switches Instant→Fast | the sheet opens from a tap on `model-chip` | round 40's browser shots, `docs/qa/model-switch/after/`; the switch itself has never been driven on hardware (round 40 says so) |
| A photo of a door sent with a document attached is described (F136) | needs the photo picker, a tap | `docs/qa/attach-ios/M8-photo-with-doc.png` (build 15-era dev build, round 38) |
| A text PDF asked before indexing finishes → "Reading your document…" then a cited answer (F126) | needs an attach and a send | `docs/qa/attach-ios/M11-wait-notice.png`, `M11b-answer.png` (round 38) |
| strict OFF + a question the file lacks → no SOURCES + the `documents.noneMatched` notice (F161) | needs an attach and a send | round 43's browser run, `docs/qa/acceptance/` |
| strict ON → localized not-found (F137) | **cannot be shown on this phone at all**: strict is Pro and this phone is FREE (`r-03-settings.png`). Round 38 reached it with an in-process StoreKit test session, which itself needs the driver | `docs/qa/attach-ios/M12-strict-pro.png`, `M14-strict-positive.png` (round 38) |
| Hebrew answered in Hebrew | needs the pasteboard step, a tap | round 40's `chat-hebrew-unchanged.test.ts` and the sheet shots |

The step list that would have proven all six in one session is committed nowhere but kept at
`scratchpad/ios-build-16/stepsF.txt`, ready for the next stream that holds the phone with Moshe beside it.

## The idle soak

One launch of the shipped archive held in the foreground **22:58:28 → 23:07:22 (8 min 54 s)**, sampled at minute 0,
4 and 8 (`soak-m0.png`, `soak-m4.png`, `soak-m8.png`).

| sample | 22:59 | 23:03 | 23:07 |
|---|---|---|---|
| Inborn pid | 12760 | **12760** | **12760** |
| screen | chat root, `SEALED`, `INSTANT` | unchanged | unchanged |

One pid across the whole window: the process never restarted. The launch console carries **0** lines matching
`error|exception|fatal|redbox` (`scratchpad/ios-build-16/soak/soak-console.txt`).

**No crash report for this app exists on the phone at all.** The whole `systemCrashLogs` domain was pulled (55
entries) and **not one filename or payload mentions Inborn**; the newest report of any kind is from 22.9, before this
build existed (`scratchpad/ios-build-16/crash/`).

## Deep-link routes

Eight routes, each a `devicectl device process launch --terminate-existing --payload-url`, each screenshotted after
12 s, each leaving a live pid: `inborn:///`, `/settings`, `/settings/about`, `/legal/terms`, `/legal/privacy`,
`/documents`, `/vault`, `/paywall`. All eight rendered; none crashed, none showed a redbox
(`scratchpad/ios-build-16/routes.txt`).

The phone was left on its home screen with the app closed, nothing uninstalled, no setting changed.
