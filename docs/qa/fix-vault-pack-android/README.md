# fix-vault-pack-android — evidence for round 90 (F373, F374)

One device: the **OnePlus 6T** (Android 11, 8 GB). Moshe's Play install `com.inbornapp.mobile` 1.0.0 (23) was only
driven, never replaced: no uninstall, no clear, no setting changed. The fixed code ran as the side-by-side QA package
`com.inbornapp.mobile.qa` (round 37's path), which was uninstalled at the end. Taps are ignored on this phone. The Play
build was driven with keys (`TAB`, `DPAD_*`, `uiautomator dump`), and the QA build through the in-app QA bridge over
`run-as` (`qa-android.py`, the Android twin of `scripts/ios-qa.mjs`). The accessibility driver APK was not needed.

## Which path each proof used

| proof | build | how the photo pack arrives |
|---|---|---|
| F374 before | Play 1.0.0 (23), the store app | **Google Play**, real fast-follow pack |
| F373 before / after | QA debug APK; JS from `main` 7af9330, then this branch | HTTPS from `scripts/serve-models.mjs` over `adb reverse`; `EXPO_PUBLIC_AUTOINSTALL=vision-qwen35` starts the download as the vault mounts, which is what `requestKnownPacks` did on the Play build |
| F374 after | QA debug **AAB** with only `inborn_model_vision` (fast-follow), `bundletool build-apks --local-testing` | **Play Core local testing** (`FakeAssetPackService`), the same `AssetPackManager` calls as Play |

The Play path after the fix needs a Play upload, which waits for Moshe's approval. That row is not proven on Play yet.

## F373 (was F354): "Download the photo pack" lands on the card

| | file | what it shows |
|---|---|---|
| before | `f373-before-01-attach-sheet-link.png` | the attach sheet, Photo disabled, "Download the photo pack · 205 MB" |
| before | `f373-before-02-vault-at-top.png` | `main`: the vault at the top. The pack moved into ON THIS DEVICE as its download started, and the card sits cut off at the bottom edge. Same as round 79's `d-06` on the Play build |
| control | `f373-control-main-nothing-moving.png` | `main` with nothing changing state: it lands. That is why web and iOS passed |
| after | `f373-after-02-vault-centred-marked.png` | this branch, same conditions: the card centred with the accent border, downloading |
| after | `f373-after-03-mark-gone.png` | 3 s later: the same place, the border gone |

`f373-*-result.json` hold the bridge's reads (`accessibilityState.selected` on the card). `red-f373.txt`: the scroll
target test fails when the header offset and centring are reverted.

## F374 (was F355): the photo pack is part of the app on Android

| | file | what it shows |
|---|---|---|
| before | `f374-before-01-vc23-details-remove.png` | vc23: the details sheet, Source Google Play, **Remove** |
| before | `f374-before-vc23-play-logcat.txt` | `removePack(inborn_model_vision)` at 21:38:10, then the app's own `startDownload([inborn_model_vision])` 18 s later when the vault mounted, and Play's `Starting download of module inborn_model_vision` (four chunks, 156 MB compressed), complete 9 s later |
| before | `f374-before-02-vc23-redelivered.png` | the card "Installed" again, nobody asked |
| after | `f374-after-01-vault-card-included.png` | the card reads "Included with the app", no Remove |
| after | `f374-after-02-details-no-remove.png` | the details sheet: Source Google Play, "Included with the app", Close. No Remove |
| after | `f374-after-03-attach-photo-enabled.png` | the Photo row enabled in the attach sheet |
| after | `f374-after-local-play-logcat.txt` | one `startDownload` at first launch (Play Core's fast-follow delivery), then three vault opens with no `startDownload` and no `removePack` |

`red-f374.txt`: the store test fails on the pre-fix `remove()` guard. Gates: `gates.txt`.
