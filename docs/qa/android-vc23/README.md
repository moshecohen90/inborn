# android-vc23 — evidence for Play internal release versionCode 23

Built from `main` **4a6af9b** (rounds 62–78), uploaded to the Play internal track as "1.0.0 (23)" and delivered to the
OnePlus 6T by Google Play as an **update in place over vc22**. First Android release build carrying round 72's
multilingual Document index, round 74's fast-follow photo pack, rounds 75/75b's photo hold, rounds 76/76b and 78.

One device: the **OnePlus 6T** (Android 11, 8 GB, `ANDROID-LEGACY`) on Moshe's own licence (owns Pro). Nothing was
uninstalled or cleared. No phone setting was changed. Purchases were not touched, so there is no purchases-run section.

## Verdicts

| row | verdict |
|---|---|
| build gates | **green**: `check-android-bundle.sh`, `bundletool validate`, `check-qa-bridge.sh`, permissions (no INTERNET), and `INBORN_REQUIRE_BUNDLE=1 check-shipping-bundles.mjs` on the real AAB: Instant and the photo projector are both fast-follow packs with the catalog's bytes and sha256 |
| upload | **committed** on the first commit call, edit `05243559871263450934`; read-back hash equals the local file |
| Play update | first press, 20 min after commit; versionCode 23 after 624 s; `firstInstallTime` unchanged |
| (a) first photo after cold launch | **proven**. The photo pack was removed on vc22 first; Play put it back **13 s after the update, before the app was opened**. A door photo as the first message of a new chat after a cold launch was described, and the app asked Play for no photo pack |
| (b) hold, Download, auto-send | **proven on hardware** for the first time. Send held with the one-sentence card, held again on a second Send, Download fetched the pack from **Google Play** in 14 s, and the held turn went out by itself and was answered |
| (c) Document index | **installed from Google Play** (the Android build never uses models.inbornapp.com for it). Japanese paraphrase cited at cos 0.842 with no shared term; off-topic dropped at cos 0.765 with the strip. Two defects on the way: **F353** |
| (d) one recommendation | **proven**: Model sheet, vault and onboarding all name **Fast** for the 6T |
| (d) Photo pack naming | **proven** on the card, the details sheet, the attach sheet line and the hold card |
| (d) install link lands on X | **FAILED** on the 6T: the vault opened at the top. **F354** |
| (d) Work templates locked row | **proven**: the paywall opens with "Profession packs … come with Pro for Work." |
| crash sweep | 0 crashes, one pid (3509) from the cold launch to the end |

## Files

| file | what it shows |
|---|---|
| `check-vc23.txt`, `shipping-bundles-gate.txt`, `perms.txt` | the bundle gates on the real AAB |
| `upload.txt`, `readback.txt` | the upload (last chunk failed twice, resumed) and Play's fresh-edit read-back |
| `update23.txt` | the Update press and the package state after it |
| `pre-01-vc22-vision-details.png`, `pre-02-vc22-vision-removed.png` | the photo pack removed on vc22 before the update |
| `f352-fast-follow-vision-logcat.txt` | Play extracting `inborn_model_vision` 13 s after the update, the process started only for `AssetPackExtractionService` |
| `a-00-door-in-composer.png`, `a-01-first-photo-door-answer.png`, `a-cold-launch-logcat.txt` | (a): the door in the composer of a fresh chat, the answer, and every `startDownload` the app made (none for the photo pack) |
| `a-02-about-1-0-0-23.png`, `a-03-proof.png` | About `1.0.0 (23)` commit `4a6af9b0aaa0`; Proof `OUT 0 B · IN 0 B` |
| `b-01-photo-pack-removed.png` | (b) the pack removed from the vault on vc23 |
| `b-02-attach-sheet-no-pack.png` | the Photo row disabled with the one sentence and "Download the photo pack · 205 MB" |
| `b-03-send-held-card.png` | Send held: the card, text and photo still in the composer, no row stored |
| `b-04-auto-sent-answered.png`, `b-download-autosend-logcat.txt` | the pack from Google Play and the held turn answered: "The door in the photo is brown." |
| `c-01…c-03` | the Document index card, installed, the Japanese file attached |
| `c-04-ja-paraphrase-cited.png`, `c-06-ja-off-topic-not-cited.png`, `c-ja-rag.txt` | (c) cited and dropped, with the `[rag]` lines |
| `f353-indexed-doc-answered-not-read.png`, `f353-context-busy-toast.png`, `f353-reindex-queue.png` | **F353**: an indexed document answered "has no searchable text yet" while the re-index queue ran, and the toast that says why |
| `d-01`, `d-02` | the companion card and details sheet named "Photo pack", no Use button |
| `d-03`, `d-04` | the Model sheet and the onboarding model step both recommending Fast |
| `d-05-attach-sheet-install-link.png`, `d-06-vault-landed-on-photo-pack.png` | **F354**: the link pressed, the vault at the top |
| `d-09`, `d-10` | the locked Legal templates and the paywall with its reason |
| `sweep.txt` | crash sweep |

Screenshots are 500 px tall. Full-resolution originals, node dumps and full logcats stay in the session scratch dir.
