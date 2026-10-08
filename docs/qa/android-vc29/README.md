# Android vc29: 1.0.0 (29) from main 828aa8de, legal texts name Cohen Apps (Israel)

Built 2026-10-08 from main 828aa8de ("legal: the publisher is named by its trading name only").
vc29 is vc28 plus the bundled legal texts. The other commits since vc28 (990cdb75) touch the site and store scripts only.
`EXPO_PUBLIC_LAUNCH_AT=2026-10-09T00:00:00Z` was exported for the whole build, `INBORN_PACKS` was unset and `INBORN_VERSION_CODE=29`.
Uploaded to Play internal only; nothing was promoted.

The first two `bundleRelease` runs failed in `:app:signReleaseBundle` with `java.lang.OutOfMemoryError: Java heap space` (the Mac was under heavy load).
The third run passed with `-Dorg.gradle.jvmargs="-Xmx8g -XX:MaxMetaspaceSize=1g"` on the command line. No file was changed for it.

## Build and upload

| Check | Result | Evidence |
|---|---|---|
| Store env gate | "store env clean" | check-vc29.txt |
| AAB sha256 | be2ffadb5a2c5f8d7690204f81e69a8f30a0cdd6bcc338a451d4b5142a1f1596 | check-vc29.txt |
| AAB size | 5,326,583,620 B, 7 asset packs | check-vc29.txt |
| Manifest | versionCode 29, versionName 1.0.0, minSdk 26, targetSdk 36 | check-vc29.txt |
| Launch window in the JS | `grep -ao` → 1, `strings -a <file>` → 1 | check-vc29.txt |
| Legal text in the JS | "Moshe Cohen" 0; "Cohen Apps (Israel)" 3 (Hermes stores these strings as UTF-16LE, so both encodings were counted) | check-vc29.txt |
| Commit in bundle | 828aa8de2d3d | check-vc29.txt, v29-01-about.png |
| validate, permissions (no INTERNET), check-android-bundle, check-qa-bridge, shipping gate | PASS | check-vc29.txt, perms.txt, shipping-bundles-gate.txt |
| Play internal "1.0.0 (29)" | edit 07828473914702365595 committed 16:51:32; read-back: release completed, versionCode 29, sha matches | upload-vc29.txt, readback-vc29.txt |

## Emulator smoke (fresh API 33 AVD, universal APK)

The universal APK was built with `bundletool build-apks --mode=universal` from the AAB above and installed on a new AVD.
Onboarding was left at the model step (no model on the emulator), and About was opened with the `inborn://settings/about` link.

| Item | Verdict | Evidence |
|---|---|---|
| About "1.0.0 (29)", commit 828aa8de2d3d | PASS | v29-01-about.png |
| Privacy: "Publisher and data controller: Cohen Apps (Israel)" | PASS | v29-02-privacy.png |
| Terms: "Licensor: Cohen Apps (Israel) ("we", "us")" | PASS (read from the screen's UI tree) | v29-03-terms.png |

The emulator was stopped and the AVD deleted after the smoke.
