# F375: the screen stays awake while a model downloads. Proven on the simulator, 24.9.2026

Since round 87 (F370) the iPhone downloads in the app's own URLSession and parks the transfer when the app leaves
the screen. Auto-lock backgrounds the app after 30 s to 2 min, so a user who started Fast (1.28 GB) and put the phone
down came back to a paused download.

Setup: iPhone 15 Pro simulator (iOS 17.0), **Release** `Inborndev.app` (`APP_VARIANT=development EXPO_PUBLIC_QA=1`,
bundle `com.inbornapp.mobile.qa`) built from this branch, reinstalled clean before each script, driven with
`node scripts/ios-qa.mjs <script> --simulator --bundle com.inbornapp.mobile.qa --launch`. The new bridge op
`idleTimer` reads `UIApplication.isIdleTimerDisabled` through expo-keep-awake's native `isActivated`.

**Why Release.** In a Debug build Expo's dev tools hold keep-awake under their own tag for the whole session, so the
idle timer read `disabled: true` before any download and after Cancel (first Debug run, not kept). The Release build
has no such hold, so every read below is the app's own.

## Idle timer: `scripts/keep-awake-fast.json` (`result-keep-awake-fast.json`, `A01`–`A03`)

| moment | `isIdleTimerDisabled` |
|---|---|
| vault open, nothing downloading | false |
| Fast downloading (card shows the keep-open line) | **true** |
| after Cancel | false |
| Fast downloading again | **true** |
| Fast installed and verified | false |

Step 0 of this run (`waitFor composer-input`) failed because a fresh install opens on onboarding, and the rest of the
run did not depend on it. The later scripts use a sleep there.

## Resumed after a parked leg: `scripts/resume-after-background.json` (`result-resume-after-background.json`, `B01`)

Fast started. 18 s later Contacts was brought to the front (`simctl launch com.apple.MobileAddressBook`), and 15 s
after that the app came back. The status row read **"Resumed · 15% · 192 MB of 1.3 GB"**, so the download
continued from where it parked and did not restart. The idle timer was disabled again while bytes moved. When
Fast was installed it was enabled again. 20 of 20 steps passed.

Bringing Settings to the front instead makes the simulator show "Sign in to iCloud" on return. That alert keeps the
app `inactive`, so the parked leg waits until it is dismissed, as round 87 noted. After the alert was dismissed the
download continued (14% to 43%).

## The card copy at phone size (`C01-keep-open-en.png`, `C01-keep-open-ja.png`)

"Keep Inborn open: the download pauses when you leave" is shown under the progress row while Fast downloads. The
Japanese copy was captured with the UI language set in Settings › Language (`scripts/card-copy-ja.json`). The app
ships no right-to-left locale (en, de, es, fr, ja, ko, pt-BR, zh-Hant), so Japanese stands in as the second script.

## Still to prove on the phone

Both phones were off USB. On the iPhone: start Fast, leave the phone untouched past its auto-lock time, and check
that the screen stays on and the download finishes. Then check that auto-lock works again after it finishes.
