# F370: the iPhone photo pack downloaded at 0.09 MB/s. Measured and fixed on the simulator, 24.9.2026

The iPhone 13 Pro took 37 minutes for the 205 MB photo pack (F360, `docs/qa/ios-device-pass-19-2026-09-24.md`).
The simulator reproduces this with the shipped code, at the same rate. The cause is the URLSession type, not the
network, the CDN or the JavaScript side.

Setup: iPhone 15 Pro simulator (iOS 17.0), Debug `Inborndev.app` built from this branch with Instant only in
`INBORN_MODELS_DIR`, so the photo pack is downloadable (the phone pass's build B). Metro was started with
`EXPO_PUBLIC_QA=1` and driven with `scripts/ios-qa.mjs --simulator`. Byte counts come from CFNetwork's
`summary for task` log lines (`response_bytes`, `transaction_duration_ms`), read with `xcrun simctl spawn … log show`.
All transfers are from `https://models.inbornapp.com/v1/`.

## Before: the shipped code, same app and same minute

| transfer | session | bytes | time | MB/s |
|---|---|---|---|---|
| `probeDownload` #1 | background (nsurlsessiond) | 10,111,863 | 120.0 s, cut off | **0.084** |
| `probeDownload` #2 | background | 10,497,311 | 120.0 s, cut off | **0.087** |
| `probeDownload` #1 | foreground (in-process) | 205,219,347 | 4.71 s | **43.5** |
| `probeDownload` #2 | foreground | 205,219,328 | 5.31 s | **38.6** |
| vault Install of the photo pack (shipped path) | background | 84,769,960 after 888 s | stopped at 41% | **0.095** |
| Mac `curl -o /dev/null`, 21:12 and 21:31 | — | 204,987,232 | 4.87 s / 5.08 s | 42.1 / 40.4 |

The vault transfer is steady: the nsurlsessiond temp file grew by 94.9 to 96.7 KB in each 10 s sample
(`before-vault-rate.txt`). That is the phone's rate: 205 MB in 37 minutes is 0.092 MB/s. The app's main thread was
idle during the transfer (`sample`, 99% in `mach_msg`), and nsurlsessiond logged the task as `non-discretionary`,
`QOS(0x19)`, with the app `running-active-Visible`.

**What the standalone harness showed** (`scripts/url-session-harness.swift`). It uses expo-file-system's two session
configurations exactly, in a bare simulator app, and the background session ran at 39.7 MB/s there. nsurlsessiond
logged that app as "a daemon or non-SpringBoard application" and Inborn as "a SpringBoard application". The pacing
applies to installed apps. So a harness is no stand-in for the app, and the real app had to be measured.

**Why a handover would not work.** The first idea was to use the foreground session while the app is on screen and
hand the transfer to the background session when it leaves. Measured in the harness, resume data does not cross
session types. `fg→bg` and `bg→fg` both got HTTP 200 and fetched the whole 205 MB again. The same-type resumes
`fg→fg` and `bg→bg` got 206 and only the remaining bytes.

## The fix

`apps/mobile/src/vault/httpsDelivery.ts` makes three changes on iOS. Android keeps its background session.

- **The in-process session.** iOS asks expo-file-system for `sessionType: "foreground"` (`DOWNLOAD_SESSION`).
- **Parking.** When the app goes to the background, the running leg is paused (`cancelByProducingResumeData`), and its
  resume data is saved in the vault record. When the app comes back, the download continues in the same session
  type, so the server answers 206.
- **No start in the background.** A download does not open a connection while the app is in the background. Pause
  and Cancel end that wait.

## After: the same build, the fix applied

| transfer | session | status | bytes | time | MB/s |
|---|---|---|---|---|---|
| `probeDownload` (forces background) | background | 200 | 5,181,544 | 60.0 s, cut off | 0.086 |
| `probeDownload` | foreground | 200 | 205,217,325 | 6.25 s | 32.8 |
| **vault Install of the photo pack** | foreground | 200 | 205,217,055 | **7.18 s** | **28.6** |
| vault Install of Fast (1.28 GB), leg 1, until the app was backgrounded | foreground | 200 | 272,193,936 | 7.24 s | 37.6 |
| Fast leg 2, after the app came back | foreground | **206** | 1,010,167,524 | 23.23 s | 43.5 |
| Mac `curl`, 21:46 | — | 200 | 204,987,232 | — | 34.5 |

The photo pack went from 0.095 MB/s to 28.6 MB/s. Before the fix, 205 MB took 37 minutes on the phone. After the fix
it took 7 seconds on the simulator. Fast was backgrounded 3 s into its transfer for 15 s (Preferences was brought to
the front, then the same app process). Its second leg fetched only the remaining 1,010 MB. The vault then logged
`fast ready · verified in 769 ms`, so the resumed file passed its sha256 check (`result-after-fast-background.json`,
21/21, and `after-B01`/`after-B02`).

**One limit, seen on the simulator.** The simulator's "Apple ID Verification" alert keeps the app `inactive` when it
returns. UIKit then never posts `didBecomeActive`, so React Native still reports `background` and the parked leg
waits. It continued the moment the alert was dismissed. A system alert shown on return holds the download until it
is dismissed. It does not lose the download.

## Still to prove on the phone (both phones were off USB for this round)

Build a `.qa` app from this branch with Instant only in `INBORN_MODELS_DIR`, as build B was built, then:

1. Run `node scripts/ios-qa.mjs docs/qa/fix-ios-download-speed/scripts/after-probes-vault-fast.json --device <udid>
   --launch --out docs/qa/<pass>/`. The two `probeDownload` rows are the phone's own A/B, in the same minute. Expect
   background ≈ 0.09 MB/s and foreground near the phone's Wi-Fi speed. The vault row is the fix.
2. At the same minute, download the same URL in Safari on the phone (control for the Wi-Fi), and run `curl` from the Mac.
3. While Fast downloads, press Home for about 15 s and then return. The card must continue, not restart from 0%.
   Also lock the screen for 60 s and unlock it.
4. If foreground is still slow, turn off Low Data Mode and Low Power Mode and repeat. That result would point away
   from nsurlsessiond.

**Rollout note.** A user mid-download on 1.0.0 (19) has background-session resume data saved. On the first resume
after updating, the foreground session refetches that model from byte 0 (the cross-session row above). It then
completes at full speed.
