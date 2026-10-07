# Android vc26: 1.0.0 (26) from main 5854a6a4, launch window on

Built 2026-10-07 from main 5854a6a4: 134P (echo net, capabilities card) and 134Q (F463 photo plan, F462 meter).
main 5dd55a20 differs from it only in iOS records and ios.buildNumber.
`EXPO_PUBLIC_LAUNCH_AT=2026-10-09T00:00:00Z` was exported for every bundle step.
Uploaded to Play internal only; nothing was promoted.

## Build and upload

| Check | Result | Evidence |
|---|---|---|
| AAB sha256 | dd6d1a8f61ea525a52221c3b46cd855cac5ccb7d72eaaa05d90b7b72bafeab19 | check-vc26.txt |
| AAB size | 5,326,583,474 B, 7 asset packs | check-vc26.txt |
| Launch window in the JS | `unzip -p app-release.aab base/assets/index.android.bundle \| strings \| grep -c 2026-10-09T00:00:00Z` → 1 | check-vc26.txt |
| Commit in bundle | buildInfo 5854a6a4440a | check-vc26.txt |
| bundletool validate | PASS | check-vc26.txt |
| Permissions (no INTERNET) | PASS | perms.txt |
| check-android-bundle.sh | PASS | check-vc26.txt |
| check-qa-bridge.sh | PASS | check-vc26.txt |
| Shipping-bundles gate | PASS | shipping-bundles-gate.txt |
| Play internal "1.0.0 (26)" | edit 02951039156099147169 committed, ~22:28; read-back sha matches | upload-vc26.txt, readback-vc26.txt |
| 6T in-place Play update 25 → 26 | PASS: download 22:39:58, installed 22:50:18, firstInstallTime unchanged | update26.txt |

## Walk on the OnePlus 6T (Android 11, pt-BR)

Fast was used for a–d, then the phone went back to Instant. The answers are in answers-6t.txt.

| Item | Verdict | Evidence |
|---|---|---|
| a. Cold launch (432 ms), About "1.0.0 (26)", Proof OUT 0 B before and after | PASS | v26-a1-cold-launch.png, rc-01-about.png, rc-02-proof.png, rc-09-proof-after.png |
| b. F463, attach sheet with Fast | FAIL: Photo disabled; the sheet still says 668 MB and offers "Baixar o pacote de fotos · 668 MB" | v26-b1-attach-sheet-fast.png |
| b. F463, photo sent as the first message with Fast | PASS: held with "Mudar para INSTANT · instalado"; Instant's projector answered | v26-b2-photo-send-fast.png, v26-b3-photo-answer-instant.png |
| c. 134P "what can you do?" | PASS: capabilities card names Inborn, no Note | v26-c1-capabilities.png |
| c. 134P question with the 9-page PDF | PASS: source chip p. 5, no trailing Note | v26-c2-pdf-answer.png, v26-g1-continue-pdf.png |
| c. 134P summary → shorter → 3 bullets (Instant) | PASS: no "Note: Live scores…" | rc-06-summary.png, rc-07-shorter.png, rc-08-bullets.png |
| c. F466 pancake with the PDF, strict off | PASS: recipe + "answered without them" strip, no FONTES | v26-c3-pancake.png |
| d. F461 "who made you?" | PASS: identity card on Fast and Instant | v26-d1-who-made-you.png |
| d. F460 17 × 23, twice | PASS: 391 both times, no rule sentence | v26-d2-17x23-1.png, v26-d3-17x23-2.png |
| e. "מה בירת צרפת?" | RTL PASS; answer wrong, under the "INSTANT é fraco em hebraico" banner | v26-e1-hebrew.png |
| f. Paywall "VOCÊ TEM O PRO" + Restore | PASS: "Compra restaurada" | v26-f1-paywall-pro.png, v26-f2-restore.png |
| g. Stop / Continue | PASS | v26-g2-stop.png, v26-g1-continue-pdf.png |
| FGS dataSync video | Not recorded | see below |

FGS video: the vc26 update and its pack re-delivery ran 22:39:58–22:50:18. That was before the request to record arrived.
Every Play-delivered pack is installed. No later window can be provoked without another update or an uninstall, so it was not recorded.

## Defects

- **F463 High, open (half fixed).**
  - The send path is fixed: 134Q holds the photo and switches to Instant.
  - The attach sheet is not fixed. `modelHasVision` (apps/mobile/src/images/vision.native.ts:38) ignores `canDeliver`. So for Fast, `modelSees` stays true (Chat.tsx:1522), `seer` is null, and Chat.tsx:2211 offers the HTTPS-only 668 MB pack, with Photo disabled.
  - Fix: on native, `modelHasVision` also requires the pack to be installed or `getVault().canDeliver(pack.id)`.
  - Fast's "Bom em" in the model sheet still lists Fotos.
- **F468 Medium, new.** After a photo is answered via Instant, a banner says "FAST enxerga imagens melhor que INSTANT. Mudar para FAST". That pushes the user back to a model that cannot see photos on this phone. Same root cause as F463.
- **F469 Low, new.** The pancake recipe (Fast) is in Portuguese for an English question and opens with "Seus documentos não mencionam isso.". The text also has wrong words ("pancadas", "1 colher de sopa de sal").
- **F466: cleared.** The no-match answer is a real answer with the correct strip.
- **F461: cleared.**
- **F460:** not seen (3 runs on the 6T).
- **F462:** no crash during the walk.
- **Quality on Instant.** Instant's summary and bullets carry factual errors, and its Hebrew answer is wrong. The app shows its own Fast-is-better and weak-in-Hebrew warnings.

## Device state after the walk

- App, settings, and every other chat and document are untouched. The model is back on Instant.
- Deleted the 15 test chats from the vc25 and vc26 walks, plus the documents inborn-qa-constitution-9pages.pdf and vc21-northgate.pdf.
- Driver packages uninstalled. /sdcard/Pictures/InbornQA removed.
- The older QA documents (vc20/vc21/vc22 txt and pdf, 00-northgate-big.pdf) are still in the library.
