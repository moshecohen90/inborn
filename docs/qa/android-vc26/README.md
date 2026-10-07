# Android release candidate: versionCode 26 from main 5854a6a4

Built 2026-10-07 from main 5854a6a4 (134Q photo-pack fix, 134P echo-net fix, store text) with
`EXPO_PUBLIC_LAUNCH_AT=2026-10-09T00:00:00Z`. Uploaded to Play internal only. Nothing was promoted.

versionCode is 26, not 25: Play already held 25 from the earlier vc25 upload.

## Build and upload

| Check | Result | Evidence |
|---|---|---|
| AAB sha256 | dd6d1a8f61ea525a52221c3b46cd855cac5ccb7d72eaaa05d90b7b72bafeab19 | check-vc26.txt |
| AAB size | 5,326,583,474 B, 7 asset packs | check-vc26.txt |
| LAUNCH_AT in bundle JS | 1 occurrence of 2026-10-09T00:00:00Z | check-vc26.txt |
| Commit in bundle | buildInfo 5854a6a4440a | check-vc26.txt |
| check-android-permissions.sh | PASS | perms.txt |
| check-android-bundle.sh, shipping-bundles gate | PASS | check-vc26.txt, shipping-bundles-gate.txt |
| Play internal upload + read-back | PASS, sha matches | upload-vc26.txt, readback-vc26.txt |
| 6T in-place Play update 25 → 26 | PASS, firstInstallTime unchanged | update26.txt |

## Walk on the OnePlus 6T (Android 11, pt-BR)

| Item | Result | Evidence |
|---|---|---|
| About shows 1.0.0 (26) | PASS | rc-01-about.png |
| Attach a photo with Fast: the switch to Instant is offered, no 668 MB download | FAIL: F463 still open | rc-03-attach-sheet-fast.png |
| Summary → shorter → 3 bullets, no trailing "Note: Live scores…" | PASS (134P), on Instant | rc-06-summary.png, rc-07-shorter.png, rc-08-bullets.png |
| "who made you?" → identity card | PASS (F461): `[chat] identity kind=identity` | rc-04-who-made-you.png |
| 17×23 | PASS: "17×23 = 391.", no rule sentence (F460 not seen) | rc-05-17x23.png |
| Proof OUT 0 B, before and after the walk | PASS | rc-02-proof.png, rc-09-proof-after.png |
| FGS dataSync screenrecord | Skipped: every Play-delivered pack is already installed. The only uninstalled models (Sharp Phi-4-mini, Fast/Sharp photo packs) are import-only | (none) |

## Defects

- **F463 High, still open on vc26.**
  - With Fast selected, the attach sheet shows Photo disabled with the hint "FAST vê fotos com o próprio pacote de fotos: um único download de 668 MB." and the only action is "Baixar o pacote de fotos · 668 MB". That pack is HTTPS-only and the Vault says "Não é oferecido pelo Google Play".
  - 134Q made `photoPlanHere` check `canDeliver`, but the sheet never reaches it. `modelHasVision` (apps/mobile/src/images/vision.native.ts:38) still returns true for Fast. So in Chat.tsx:1522 `modelSees` is true, `seer` is null, and Chat.tsx:2211 offers `onInstallVision` for `ownPack`.
  - Smallest fix: make `modelHasVision` on native also require that the model's own pack is installed or `getVault().canDeliver(pack.id)`. Then the sheet takes the existing `seer` path and offers Instant.
  - The model sheet also lists "Fotos" under Fast's "Bom em" on this phone.
- **F460 Medium.** Not reproduced on the 6T (1 run, Instant).
- **F461 Medium.** Fixed: identity card.
- **F462 Low.** No crash during the walk. The 134Q try/catch is in the build.
- **F466 Medium, still open.** After "Now as 3 bullets." on the summary, the strip says "Nada nos seus documentos corresponde a esta pergunta. A resposta foi dada sem eles." even though the bullets restate the document (`[rag] hits=6 used=0`).
- **Answer quality (Instant).** The summary and bullets carry factual errors, for example "Senate for impeachment" and "President … taxation rights". The app shows its own warning that Fast summarizes better.

## Device state after the walk

- Model restored to Instant.
- `com.inbornapp.mobile.uitest` and `.test` uninstalled.
- No constitution PDF on /sdcard.
- The phone was left on the launcher.
