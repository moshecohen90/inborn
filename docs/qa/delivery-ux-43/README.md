# delivery-ux-43: no model download without a tap (Android), Send queues while the model loads (both)

Branch `delivery-ux-43` from main 8a9b90cd. Nothing was uploaded and no store version was bumped.

## Android (emulator, Play Core local testing)

A walk-only release AAB was built from this branch (versionCode left at the default, never uploaded, deleted after the
walk) and installed with `bundletool build-apks --local-testing` + `install-apks` on a new API 33 AVD (8 GB), which
was deleted afterwards. The phones were not touched.

| proof | result | evidence |
|---|---|---|
| Delivery type in the AAB | `inborn_model`, `inborn_model_vision` and every other pack: `dist:on-demand`, no `fast-follow` | `android/bundletool-delivery.txt` |
| Fresh install fetches nothing | no `startDownload` from launch until the tap on Download | `android/w1-logcat.txt` |
| Model step | Instant preselected though Fast is recommended; "738 MB including photo reading", Fast "1.28 GB", Wi-Fi hint, one button "Download Instant · 738 MB" | `android/w1-02-model-step.png` |
| Download Instant | one tap starts `inborn_model_vision` and `inborn_model` together; card shows progress and "Stop the download" | `android/w1-03-downloading.png`, `android/w1-logcat.txt` |
| Choose Fast on a fresh install | only `startDownload([inborn_model_fast])` | `android/w2-01-fast-picked.png`, `android/w2-02-fast-delivered.png`, `android/w2-logcat.txt` |
| Then Instant | its projector comes along; the chosen model stays selected and the button reads "Start chatting" | `android/w2-03-instant-after-fast.png` |
| Cold start: type while loading, tap Send | Send enabled; composer reads "Loading INSTANT… your message goes as soon as it is ready."; the message left once the model loaded and was answered | `android/w3-01-queued-while-loading.png`, `android/w3-02-answered.png` |

`w1-04-after-stop.png` is from the first build: after Instant landed the step moved on to "Download Fast". Fixed in
this branch (the downloaded model stays selected, and its size no longer shrinks when the projector lands first); the
rebuilt app is the one in `w2-*`.

**Not proven on the emulator:** Stop in mid-transfer. Local testing delivers a pack instantly, so the Fake service was
already COMPLETED when Stop was tapped. Stop cancelling both Play fetches is covered by `src/vault/store.test.ts`
("Cancel on Instant cancels both Play fetches"). Play's mobile-data dialog cannot be shown by local testing either.

## iOS (simulator, Release QA build)

`com.inbornapp.mobile.qa` built from this branch, installed on a new iPhone 17 Pro / iOS 26.2 simulator, deleted
afterwards. Script `ios/scripts/c46-composer-queue.json` via `scripts/ios-qa.mjs --simulator`: **35 passed, 0 failed**
(`ios/result-c43.json`). "Hi" typed and Send pressed while the composer read "Loading INSTANT…"; it then read
"…your message goes as soon as it is ready." (`ios/sim-c46-05-queued.png`), and the answer was "Hello! How can I help
you today?" (`ios/sim-c46-06-answered.png`). The iOS model step is unchanged (Instant bundled).
