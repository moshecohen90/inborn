# Android vc28: 1.0.0 (28) from main cbd1e5d1 (134S), launch window on

Built 2026-10-08 from main cbd1e5d1 (Merge 134S, F468 fix 8dd2ce5f).
`EXPO_PUBLIC_LAUNCH_AT=2026-10-09T00:00:00Z` was exported for the whole build.
Uploaded to Play internal only; nothing was promoted.

## Build and upload

| Check | Result | Evidence |
|---|---|---|
| AAB sha256 | 883755647c46f57420352a44e29deabf5c7e2470aa1c1c1e669d5ca14a301d56 | check-vc28.txt |
| AAB size | 5,326,583,658 B, 7 asset packs | check-vc28.txt |
| Launch window in the JS | `grep -ao` → 1, `strings -a <file>` → 1 | check-vc28.txt |
| Commit in bundle | buildInfo cbd1e5d1370f | check-vc28.txt |
| validate, permissions (no INTERNET), check-android-bundle, check-qa-bridge, shipping gate | PASS | check-vc28.txt, perms.txt, shipping-bundles-gate.txt |
| Play internal "1.0.0 (28)" | edit 15083039458215953470 committed 01:14:55; read-back sha matches | upload-vc28.txt, readback-vc28.txt |
| 6T in-place Play update 27 → 28 | PASS: download 01:23:09, installed 01:35:17, firstInstallTime unchanged | update28.txt |

## FGS dataSync video

The recording starts before the press that began the download (01:22:44) and runs through to the photo hold on Fast (01:43:49). The download part plays at 8×.
- ExtractionForegroundService was in the foreground at 01:38:04.
- The Vault showed "Entregando SHARP" until 5.38 GB at 01:39:09.
- The shade frame at 01:38 shows no notification (v28-fgs-1-shade.png). The vc27 video shows it.
- The video is in the private evidence directory (4.5 MB). The system file-picker seconds are cut out.

## Walk on the OnePlus 6T (Android 11, pt-BR)

| Item | Verdict | Evidence |
|---|---|---|
| About "1.0.0 (28)", commit cbd1e5d1370f | PASS | v28-07-about.png |
| Proof SAI 0 B · ENTRA 0 B | PASS | v28-08-proof.png |
| Model sheet "Bom em" | PASS: Fast has no Fotos; Instant has Fotos | v28-03-model-sheet.png |
| F463: attach sheet with Fast | PASS: "FAST não consegue ver fotos. INSTANT consegue." + "Usar INSTANT para fotos"; no "668 MB" | v28-04-attach-sheet-fast.png |
| Photo as the first message on Fast | PASS: held with "Mudar para INSTANT · instalado" | v28-05-photo-hold-fast.png |
| Instant answers the photo | PASS: "A brown door with two panels, silver hinges on the left side, and a gold doorknob on the right side." | v28-06-photo-answer-instant.png |
| F468: no card offering Fast after Instant's photo answer | PASS | v28-06-photo-answer-instant.png |

## Defects

- **F463: cleared.**
- **F468: cleared.**

## Device state after the walk

- The app is on 28, the model is on Instant, and settings are untouched.
- Deleted the vc28 test chat, the 23 QA chats dated 24 Sept, and the QA documents vc20-northgate.pdf, 00-northgate-big.pdf, vc21-ja-report.txt, vc22-ja-report.txt, vc22-marrowgate.txt and the two "Ignore all previous instructions…" txt.
- Still in the app, outside this brief:
  - QA chats dated 23 Sept and older.
  - The documents inborn-ocr-proof.png, inborn-l2-first.pdf, inborn-l2-second.pdf, northgate.pdf and door.jpg.
- Driver packages uninstalled. The temporary QA photo and the recordings are removed from /sdcard.
