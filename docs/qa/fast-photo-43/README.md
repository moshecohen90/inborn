# fast-photo-43: Fast's photo pack through Play, and a photo card without the dead end

Founder report, Android 1.0.0 (29) from Google Play: Fast selected, one photo, "What do you see in the photo?". The card read
"FAST needs its photo pack to see photos / One 668 MB download, then this photo sends by itself.", then in red
"Google Play is not available here. Import a model file instead." under Try again, Switch to INSTANT · installed,
Remove the photo, and "Smaller, but less accurate with photos.".

## Cause

| Piece | Where | What it did |
|---|---|---|
| No Play pack for Fast's projector | `packages/core/src/catalog/manifest.json` (vision-qwen35-2b: `https` only), `apps/mobile/app.config.ts` ALL_PACKS (only `inborn_model_vision`) | Play could never deliver the 668 MB file. The release build has no INTERNET permission, so HTTPS was out too |
| `no-delivery` | `apps/mobile/src/vault/store.ts:497` (`delivery.plan()` null) and `:529` (Play bind failure mapped to `no-delivery`) | the tap on Download failed before any byte moved |
| Red line | `apps/mobile/src/vault/failureText.ts:10` | every `no-delivery` on Android reads `vault.state.noDelivery.android`, the vault's "Play is not available, import a file" sentence, whatever the real reason |
| Try again | `apps/mobile/src/extensions/photoCard.ts` (last return: `error ? retry : download`) | a failure that can never succeed still got Try again |

134Q/134R (in vc29) made `photoPlanHere` offer the pack only when `VaultStore.canDeliver` says Play can bring it, and
the vc28 walk on the 6T showed the switch card. Why the founder's vc29 phone still reached the pack card was not
reproduced: reading the code, `PlayDelivery.plan()` is null for a model without a `play-asset-pack` entry. With this
change Fast's pack has a Play entry, so the pack card is now a real offer, and the card no longer ends in Try again on
`no-delivery` in any case.

### Repro of main on the same emulator (lead's question: why did `canDeliver` say yes?)

Checked against main (110229a1 at the time, which carries 134Q/134R like vc29):
- (a) The catalog declares only `https` for vision-qwen35-2b and `app.config.ts` builds no pack for it, so
  `PlayDelivery.plan()` (`apps/mobile/src/vault/playDelivery.ts:17`) is null and `canDeliver` is false.
- (b) `describePlayError` maps only APP_NOT_OWNED, UNRECOGNIZED_INSTALLATION, PLAY_STORE_NOT_FOUND and API_NOT_AVAILABLE to
  `play-unavailable`; a missing pack (PACK_UNAVAILABLE -2) becomes `play-error--2`, a retryable failure. Neither path
  produces the founder's screen: his red line is the `no-delivery` that `install()` sets when `plan()` is null
  (`store.ts:497`), without asking Play.
- Release AAB of main (`INBORN_PACKS=instant,fast,vision`), bundletool `--local-testing`, the same steps: the attach
  sheet says "FAST cannot look at photos. INSTANT can." (`main-01-attach-sheet-fast.png`) and Send shows the switch
  card "FAST can't see photos / Switch to INSTANT · installed / Remove the photo" (`main-02-card.png`). No pack card,
  and no Play call.

So main's code does not produce the founder's card. The screen matches the pre-134Q builds (vc24/vc25: pack card,
then `no-delivery` on the tap). The build and commit on his phone (Settings › About) were not read here.
`test/assetPacks.test.ts` now guards the other direction with the real catalog and the real `ALL_PACKS`: removing the
`visionFast` line from `app.config.ts` turns it red (`red-catalog-vs-packs.txt`).

## Play size limits

Source: Google Play Console Help, "Maximum size limits", https://support.google.com/googleplay/android-developer/answer/9859372
(linked from https://developer.android.com/guide/playcore/asset-delivery):
individual asset packs 1.5 GB; "Cumulative total for asset packs delivered on-demand or fast-follow" 30 GB;
install-time total 4 GB; at most 100 asset packs per bundle.

The store bundle after this change: inborn_model 533 MB + inborn_model_vision 205 MB (fast-follow), inborn_model_fast
1.28 GB, inborn_model_sharp 1.4 GB + _2 1.3 GB, inborn_model_embed 468 MB, inborn_model_speech 148 MB, and the new
inborn_model_vision_fast 668 MB (on-demand): 6.04 GB of the 30 GB, largest pack under 1.5 GB, 8 packs.
`test/assetPacks.test.ts` checks the three numbers against the catalog on every run.

## Change

1. Catalog: vision-qwen35-2b delivers through `play-asset-pack inborn_model_vision_fast` (on-demand), HTTPS kept for iOS
   and desktop. Re-signed with `scripts/sign-catalog.mjs` (catalog version stays 8).
2. `app.config.ts` ALL_PACKS key `visionFast` builds the pack with `plugins/withAssetPacks.js`; `check-android-bundle.sh`
   picks it up from ALL_PACKS, so a store bundle without it fails the gate.
3. Card: a pack that fails as `no-delivery` turns into "FAST can't see photos / On this phone INSTANT reads photos.
   Switching keeps FAST installed." with Switch to INSTANT as the button and Remove the photo; no Try again, no caption.
   The Play line ("Google Play is not available on this phone, so the photo pack cannot be downloaded.") appears only
   when Play itself cannot bind (`PlayDelivery.reachable()`: Play Core missing or a bind failure this run). No import
   advice on the card. Two new keys in en, de, fr, es, pt-BR, ja, ko, zh-Hant (+ pseudo).

## Walk: emulator, Release build of this branch, Play Core local testing

AVD `inborn_fast43` (new, API 33 google_apis arm64, 8 GB RAM, serial emulator-5594). Release AAB from 7cd255e9, debug
keystore, `INBORN_PACKS=instant,fast,vision,visionFast` (the four packs this path touches), arm64 only.
`bundletool build-apks --local-testing` then `install-apks`: Play Core runs its `FakeAssetPackService`, the same
`AssetPackManager` calls as Play.

| Step | Result | Evidence |
|---|---|---|
| Model step: Fast "DELIVERED BY GOOGLE PLAY" | pass | 02-model-step.png |
| Download Fast through the fake Play | pass, "ALREADY ON THIS PHONE" | 03-fast-delivered.png |
| Attach sheet with Fast: "FAST looks at photos with its photo pack: one download of 668 MB" | pass | 04-attach-sheet-fast.png |
| Photo added (Add a file…), "What do you see in the photo?", Send | card: FAST needs its photo pack / One 668 MB download / **Download 668 MB** / Switch to INSTANT · installed / Remove the photo. No red line | 05-card-offers-play-download.png |
| Download | "Downloading the photo pack: 0 of 668 MB." with the bar, then 668 of 668 | 06-card-downloading.png, 07-pack-arrived.png |
| Play request | `startDownload([inborn_model_vision_fast])` 18:29:54, chunk extracted 18:31:07 | logcat-pack-delivery.txt |
| The photo sends by itself and Fast answers | "The image displays three dogs on a gravel surface: a small, scruffy grey-and-white dog in the foreground looking upward; a tan and white bulldog sitting behind it; and a black-and-white poodle-type dog sniffing to the right." (about 15 min of emulated CPU) | 08-fast-answers-photo.png |

Local testing delivers the pack in one chunk, so the bar moved 0 → 668 MB without intermediate values.

Bundle checks on this AAB: `aab-packs.txt` (four packs, inborn_model_vision_fast 668,227,264 B, sha256),
`perms.txt` (no INTERNET), `check-android-bundle.txt` (the new pack OK; embed, speech and sharp reported missing
because this walk build used an `INBORN_PACKS` subset, as the gate is meant to say).

## Tests

`tests.txt`: affected suites 153 passed; apps/mobile 1509 passed; packages/core 1566 passed, 5 skipped; catalog
signature OK. With `photoCard.ts` from main, three card tests fail (undeliverable, Play absent, no way out).
Typecheck and eslint over the changed files clean.

## Not verified here

- The "Play absent" and "no-delivery" card states on a device: covered by unit tests only.
- Real Play delivery of `inborn_model_vision_fast`: needs a Play upload, not done.
- Sharp's projector (vision-qwen35-4b, Pro) is still HTTPS only, so on Android Sharp users get the Instant switch card.
- The exact state on the founder's vc29 phone that produced the pack card.

The emulator was stopped and the AVD deleted after the walk.
