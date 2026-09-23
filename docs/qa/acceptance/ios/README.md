# Acceptance round 43 — the iPhone 13 Pro

Device: Moshe's iPhone 13 Pro (`devicectl REDACTED-IPHONE`). **Nothing was installed, replaced or removed.**
The phone carries `com.inbornapp.mobile` 1.0.0 (15), the build the `attach-ios` stream left there this evening, and
it is still exactly that; nothing was uninstalled, no setting was changed, the phone was left on its home screen.
(COMMON's rule: an uninstall on 23.9 deleted Moshe's chats, documents and vault once already.)

## Why this round drove nothing here

Round 38 (`attach-ios`) finished on this phone at 21:05 today and its whole matrix **is** the matrix this acceptance
round would have run — the same questions, on this device, on a build made hours ago:

| what Moshe asked | proven where |
|---|---|
| "I attached a photo of a door and it said it received no image" | F136: with a document attached to the same chat `buildRagPrompt` rewrote the turn text-only and the picture never reached the engine. Fixed and shown: `docs/qa/attach-ios/M8-photo-with-doc.png`, baseline `A5-photo-with-doc-baseline.png` |
| "I sent a PDF and the same problem" | F135: a file asked about before its index existed was answered around. `A3-race-baseline.png` → `M11-wait-notice.png`, `M11b-answer.png` |
| "does answering only from my sources really work?" | F137 and the strict rows: `M12-strict-pro.png`, `M13-strict-pro.png`, `M14-strict-positive.png` — and the raw `Not_FOUND_IN_DOCUMENTS` sentinel that used to reach the screen is gone |
| a scan with no text layer | `M9-needs-ocr.png` |
| Free / Pro / Work give what the table promises | `M18-free-second-file.png` (Free keeps one file per chat), `M15-pro-tiers.png` (Pro: two files, Office formats refused), `M16-work.png`, `M17-work-answer.png` (Work indexes the spreadsheet and the HTML note and answers across both) |
| purchases | in-process StoreKit test session only, never a sandbox purchase — the rule this round also kept |

Re-running it on the same build would produce the same pictures. What this round *would* have added is F160–F163 on
iOS hardware, and those four are not in build 15: they were written after it. Putting them on the phone means a new
`xcodebuild` over Moshe's install, which is a ten-minute build and a replacement of the app his own data lives in,
for fixes that are already proven in a real browser over the identical `packages/core` and `apps/mobile/src` and
carry unit tests that run on every platform. That trade was not worth taking at the end of the evening, so it is
stated here rather than hidden: **the round-43 fixes have not been seen on the iPhone.**

## The one .ini row that still wants this phone

Row 6, the Wi-Fi-only switch: *"it moves left or right but it is not clear which state is on — on the iPhone.
On Android it looks fine."* Round 34 rebuilt `Toggle` as a drawn control (filled track + knob side + tick, every pair
over 3:1) and proved the arithmetic and the browser rendering, and round 34's own note says the same thing: it has
not been seen on the iPhone itself. That row stays open for whoever next has this device.
