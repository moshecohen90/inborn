# Android vc27: 1.0.0 (27) from main 3b557a17 (134R), launch window on

Built 2026-10-07 from main 3b557a17, which is bbfba062 (Merge 134R, F463 fix eccf42a8) plus the vc26 records.
`EXPO_PUBLIC_LAUNCH_AT=2026-10-09T00:00:00Z` was exported for the whole build.
Uploaded to Play internal only; nothing was promoted.

## Build and upload

| Check | Result | Evidence |
|---|---|---|
| AAB sha256 | 7e96517ee5720713a3da5b4b949882a70976dac75c15b38aa8cc933fbfa73b06 | check-vc27.txt |
| AAB size | 5,326,583,170 B, 7 asset packs | check-vc27.txt |
| Launch window in the JS | `grep -ao` → 1, `strings -a <file>` → 1 | check-vc27.txt |
| Commit in bundle | buildInfo 3b557a179e4c | check-vc27.txt |
| bundletool validate | PASS | check-vc27.txt |
| Permissions (no INTERNET) | PASS | perms.txt |
| check-android-bundle.sh | PASS | check-vc27.txt |
| check-qa-bridge.sh | PASS | check-vc27.txt |
| Shipping-bundles gate | PASS | shipping-bundles-gate.txt |
| Play internal "1.0.0 (27)" | edit 05068314070865045067 committed 00:10:30; read-back sha matches | upload-vc27.txt, readback-vc27.txt |
| 6T in-place Play update 26 → 27 | PASS: download 00:32:20, installed 00:41:10, firstInstallTime unchanged | update27.txt |

Note on the launch-window count: macOS `/usr/bin/strings` reads nothing from a pipe, so `unzip -p … | strings | grep -c` always prints 0 there. Count with `grep -ao`, or run `strings -a` on an extracted file.

Note on the update: Play showed "Atualizar" at 00:11, under a minute after the commit, but pressing it did nothing until 00:32. Play's log at 00:31 read "AssetModuleException: Request to PGS failed because app is unavailable", meaning the packs for 27 were not served yet.

## FGS dataSync video

The recording runs from the download start (00:32:25) through the pack re-delivery to a chat answer (00:47:35). The download part plays at 8×.
- At 00:41:5x, after the update, `ExtractionForegroundService` was in the foreground. Its notification, "Arquivo adicional para o app Inborn" on the playcore asset-pack channel, is visible in the shade.
- The Vault showed "Entregando FAST · 98% de 1.28 GB" until every pack was back at 00:44:45.
- The video sits in the private evidence directory (5.2 MB) and is not in this repo.
- Frames are in v27-fgs-1-shade.png and v27-fgs-2-vault.png; the timeline is in update27.txt.

## Walk on the OnePlus 6T (Android 11, pt-BR)

| Item | Verdict | Evidence |
|---|---|---|
| About "1.0.0 (27)", commit 3b557a179e4c | PASS | v27-06-about.png |
| Proof SAI 0 B · ENTRA 0 B | PASS | v27-07-proof.png |
| F463: attach sheet with Fast | PASS: "FAST não consegue ver fotos. INSTANT consegue." + "Usar INSTANT para fotos"; no "668 MB" anywhere | v27-01-attach-sheet-fast.png |
| F463: take the offer | PASS: model becomes Instant; Photo and Câmera rows enabled | v27-02-attach-sheet-instant.png |
| F463: photo answered | PASS: "A brown door with two panels, hinges on the left side, and a gold doorknob on the right side." | v27-03-photo-answer.png |
| Model sheet "Bom em" | PASS: Fast's line has no Fotos; Instant's has Fotos | v27-04-model-sheet.png |
| 17 × 23 on Fast | PASS: "The result of 17 multiplied by 23 is 391." | v27-05-17x23-fast.png |

## Defects

- **F463: cleared.**
- **F468 Medium, still open.** After Instant answers a photo, the banner "FAST enxerga imagens melhor que INSTANT. [Mudar para FAST]" still appears (v27-03-photo-answer.png). It pushes the user to a model that cannot see photos on this phone.
- **F469 Low, open.** Not retested in this short walk.

## Device state after the walk

- The app is on 27, the model is back on Instant, and settings are untouched.
- Deleted the two vc27 test chats. The vc25/vc26 test chats and the two QA documents were already removed at the end of the vc26 walk.
- Driver packages uninstalled. /sdcard/Pictures/InbornQA and the temporary QA photo in Downloads are removed, and the recordings are deleted from /sdcard.
