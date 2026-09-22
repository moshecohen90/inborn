# Purchases run 2026-09-11 — iPhone StoreKit configuration proof, Play versionCode 3 to 16

Branch `purchases-verify` (merged with `main` at 0e4dba0). Continues `purchases-run-2026-09-06.md` (Play purchase proven on the OnePlus 11, ASC products READY_TO_SUBMIT).
Evidence: session scratch `/private/tmp/claude-501/-Users-moshecohen-dev-bibleapps/e1fec2dd-3831-49ec-a78e-d650b5c0d26b/scratchpad/purchases-r2/` (file names below; copy before the session directory is cleaned).

## Status at a glance

| Task | Result |
|---|---|
| A. StoreKit configuration on the iPhone 13 Pro (T56, T57, T21, T22) | DONE: Pro purchase, Work upgrade from Pro, Work direct, Restore (empty and after an external purchase), refund → Free; every state on screen |
| B. Play internal release versionCode 3 | DONE: AAB 1,870,499,229 bytes, all gates OK, uploaded and committed as "1.0.0 (3) internal" |
| C. Fresh Play install, Instant pack without WAKE_LOCK, first answer, Proof, Restore | DONE on the OnePlus 6T as the substitute (Task E, 14:19–14:28): Play install of 1.0.0 (3), fast-follow pack extracted without WAKE_LOCK, onboarding flipped to "Instant · built in" by itself, first answer OUT 0 B, Proof sealed, YOU OWN PRO + "Purchase restored". OnePlus 11 absent; nothing remains OnePlus-11-only |
| E. Play internal release versionCode 4 (main 90a82f9: share target + "Ask Inborn") | DONE: AAB 2,091,988,850 bytes, 9 permissions, no INTERNET, uploaded as "1.0.0 (4) internal" (edit 08048933420369955521) |
| F. Both new Android surfaces on the real Play build (6T updated to (4) by Play) | DONE: share text from the system share sheet → Inborn quick-actions sheet → Fix grammar; select text in Google Docs → ⋮ → **Ask Inborn** → Fix grammar → **Replace** → the corrected text is back in Docs' field |
| G. Play internal release versionCode 5 (main 07bc402, fixes-r9) + launch check on the 6T | DONE: AAB 1,870,567,596 bytes, 9 permissions, no INTERNET, "1.0.0 (5) internal"; the Play update on the 6T opens straight to the chat screen, no onboarding (F12 on the real device) |
| H. vc5 sanity on the 6T (13.9, MosheAI ask after fixes-r9 touched storage) | DONE: chat + follow-up survive `am force-stop`, Vault / Settings / Proof (OUT 0 B) open, logcat has no `[storage]`, `[prefs]`, ANR or crash line |
| I. Play internal release versionCode 6 (main 70e1cfa, fixes-r10 incl. hardware-keys) + 6T sanity (14.9) | DONE: AAB 2,092,019,571 bytes, 9 permissions, no INTERNET, "1.0.0 (6) internal"; on the 6T: Instant answer, assistant row a11y label carries the answer, soft Enter newlines + Send, Fast pack delivered by Play (25 chunks, FAST loaded), YOU OWN PRO + "Purchase restored" |
| J. Play internal release versionCode 7 (main ff39f94, fixes-r13) + 6T sanity (20.9) | DONE: AAB 1,870,640,031 bytes, 9 permissions, no INTERNET, all nine native modules in the dex, "1.0.0 (7) internal" (edit 08066290382974104798); on the 6T, updated by Play with both model packs intact: Instant and Fast both answer, YOU OWN PRO without a Restore, Proof OUT 0 B. Delivered through Play rather than bundletool because the app uses Play app signing (see J) |
| K. Play internal release versionCode 8 (main 543a5af, fixes-r14 incl. the F33 fix) + 6T sanity (21.9) | DONE: AAB 2,092,078,443 bytes, 9 permissions, no INTERNET, all nine native modules in the dex, "1.0.0 (8) internal" (edit 09760590197853827663); About on the 6T reads 1.0.0 (8) / 543a5af3671b. Play withheld the install for ~30 min while it published the asset packs ("all packs are unavailable"). Instant and Fast both answer, YOU OWN PRO without a Restore, Proof OUT 0 B. **Fast is reported as not installed after the update and has to be re-requested**, though the bytes are still on the device. Soak run 4 that follows: 48 F33 pop cycles, 48 OK, one process 5 h 39 min, no dropbox entry for v8 |
| O. Play internal release versionCode 12 — the production pack set (21.9) | DONE: AAB **5,117,797,242 bytes** built with `INBORN_PACKS` unset, **all seven asset packs**, uploaded as "1.0.0 (12) internal" (edit 06260306700914179612). On the 6T through Play: **Sharp** installs from two packs and answers, **speech** and **vision** install, and a photo is described correctly. Two findings for Moshe: the shipped vision projector fits **Instant only** (Fast and Sharp cannot load it), and hands-free dictation crashes in `react-native-live-audio-stream`, so Whisper was never exercised. Sections L–O below have no rows of their own |
| P. Play internal release versionCode 13 — the round-18 fixes, from a fresh Play install (21.9–22.9) | DONE: AAB **5,117,801,881 bytes** from `main` 9e1157f with `INBORN_PACKS` unset, all seven packs, uploaded as "1.0.0 (13)" (edit 13404118910722444753, **second attempt** — the first lost its edit to expiry on the last chunk). Round-18 APK uninstalled and Play **installed from scratch**; all seven packs delivered, 4.8 GB in the vault. F37 Sharp reads "Too slow to use on this phone" and RECOMMENDED sits on Fast; F36 the attach sheet's honest row switches to Instant, which then describes the fixture through the Play vision pack; F35 hands-free survives five microphone cycles on the release build (whisper decoding speech still NOT RUN); F27 passes; OCR of a scan answers with a citation. Soak 6: 14 F33 cycles, 14 OK, one process 1 h 12 min, 0 crashes, 0 ANRs, no dropbox entry for v13 |
| S. Play internal release versionCode 16 — the Android submission candidate (22.9) | DONE: AAB **5,117,817,952 bytes** from `main` 9da93a2 with `INBORN_PACKS` unset, all seven packs, no INTERNET, `bundletool validate` rc 0, uploaded as "1.0.0 (16)" (edit 01823738192199699579); Play updated the 6T in place vc15 → vc16 in 665 s with **every pack intact and zero install- nodes in the vault**; About 1.0.0 (16) / 9da93a296bbe, Proof OUT 0 B; **real Play billing: YOU OWN PRO, Work upgrade ₪149.90, Restore → "Purchase restored"**; one hour of continuous use in soak run 9 |
| D. Real sandbox purchase on the iPhone | REACHED the real Apple sandbox sheet (Inborn Pro, ₪69.90, account tester1@example.com) with UI Automation enabled by Moshe; the runner's Purchase tap works hands-free and the sandbox then asks for the account password; purchase deliberately NOT completed per Moshe (14:20) |

## A. iPhone StoreKit configuration run (checklist T56 / T57 / T21 / T22, "StoreKit config" halves)

Device: Moshe's iPhone 13 Pro, iOS 26.6.1, connected over USB, no settings changed, no UI Automation, phone left on the home screen, proof build uninstalled at the end (`devicectl device info apps` lists no `com.inbornapp.mobile`).

### Method (no UI automation on the phone)
- Release device build (`Inborndev`, `APP_VARIANT=development`, team NGCHN95667) with the store bundle-time switches in `ios/.xcode.env.local`: `EXPO_PUBLIC_DEV_MODEL_HOST=127.0.0.1` (dev build), `EXPO_PUBLIC_ALLOW_TEST_PURCHASES=1`, `EXPO_PUBLIC_AUTOBUY=<sku|restore>`. One xcodebuild per AUTOBUY value (incremental, about 2 min each): `inborn.pro`, `inborn.work.upgrade`, `inborn.work`, `restore`.
- `apps/mobile/ios-dev/StoreKitTestHarness.swift` (added to the app target by `apps/mobile/scripts/ios-add-storekit-harness.rb` after prebuild; dev-only, `ios/` is gitignored, no store build ever runs the script): when the process is launched with `INBORN_SKTEST=<ops>` it dlopens StoreKitTest.framework from the developer disk image (`/System/Developer/Library/Frameworks`, iOS 17+ cryptex mount) and opens `SKTestSession(Inborn.storekit)` with dialogs disabled, then runs `clear` / `buy:<sku>` / `refund:<index>`. The session redirects the app's own StoreKit 2 calls to the local configuration, so the paywall's dev auto-purchase completes without a sheet. Outcome files: `Documents/sktest.json` (harness) and `Documents/licence-run.json` (paywall), pulled with `devicectl device copy from`.
- Launch: `xcrun devicectl device process launch --terminate-existing --environment-variables '{"INBORN_SKTEST":"…","DYLD_FRAMEWORK_PATH":"/System/Developer/Library/Frameworks:/System/Developer/Library/PrivateFrameworks"}' --payload-url inborn://paywall com.inbornapp.mobile`. The DYLD path is required: StoreKitTest links `@rpath/XCTest.framework/XCTest`, which only the DDI provides.
- Screenshots: `pymobiledevice3 developer dvt screenshot` (userspace tunnel, no root).
- Two fixes on the branch for this: the harness used `NSObject.alloc()` (unavailable in Swift; the 7.9 build failed on it) and reported only the last dlopen error; the paywall's dev auto-buy hook (`PaywallScreen.tsx`, dev bundles only) now also buys a product a Pro owner is offered (the Work upgrade SKU), not only from Free.

### Runs (all on the local StoreKit configuration, `environment: "xcode"`, JWS verified by `packages/core/src/licence/apple.ts` under the test-environment rule)

| # | ops / bundle | result on screen | licence-run.json | file |
|---|---|---|---|---|
| 01 | `clear`, AUTOBUY `inborn.pro` | **YOU OWN PRO · Unlocked on every device that uses this App Store account**, status "You own Pro", the Work card became **PRO OWNERS · Upgrade to Work · $49.99** | `tier: pro, purchase: done inborn.pro, transactionId 0, environment xcode` | `01-pro-buy.png` |
| 02 | `noop` (relaunch, fresh pid) | YOU OWN PRO, upgrade card, no in-session status line | `step before: tier pro, storeReachable true, fromCache false`, prices USD from the .storekit storefront ($19.99 / $14.99 / $69.99 / $49.99) | `02-pro-relaunch.png` |
| 03 | `noop`, AUTOBUY `inborn.work.upgrade` | **YOU OWN PRO FOR WORK**, no tier cards left (T57) | `tier: work, purchase: done inborn.work.upgrade, transactionId 1` | `03-work-upgrade.png` |
| 04 | `clear`, AUTOBUY `inborn.work` | YOU OWN PRO FOR WORK (bought directly from Free) | `tier: work, purchase: done inborn.work, transactionId 0` | `04-work-direct.png` |
| 05 | `clear`, AUTOBUY `restore` | Free paywall (PRO $19.99 first, FOR PROFESSIONALS · PRO FOR WORK $69.99 below), status **"No purchases on this account"** | `tier: free, restore: done found 0` | `05-free-restore-empty.png` |
| 06 | `clear;buy:inborn.pro` (external purchase in the session), AUTOBUY `restore` | YOU OWN PRO, upgrade card | `tier: pro, purchase: done inborn.pro` (transaction listener), `restore: done found 1` (T21) | `06-restore-pro.png` |
| 07 | `refund:0` (refund the Pro transaction), AUTOBUY `restore` | Free paywall, "No purchases on this account" (T22: Pro locks after a refund) | `tier: free, restore: done found 0` | `07-refund.png` |

Harness proof of the session: `sktest.json` lists `loaded /System/Developer/Library/Frameworks/StoreKitTest.framework/StoreKitTest`, `session ready, disableDialogs=true`, then `cleared` / `buy inborn.pro: ok` / `refund 0: ok`, and the transaction list (`inborn.pro`, state 1 = purchased) persisting across launches.

### Finding: the phone has a sandbox Apple Account, and a dev build without the session goes to Apple's sandbox
The first launch ran before the harness loaded (the alloc fix was in, the DYLD path was not): the app fetched the real App Store Connect products in the Israel storefront (`₪69.90` Pro, `₪249.90` Work, `₪179.90` upgrade, `₪49.90` launch price, `fromStore: true`) and the auto-buy opened Apple's **"Sandbox" payment sheet** for `Inborn Pro ₪69.90`, "For testing purposes only. You will not be charged", **Account: tester1@example.com** (`02-after-kill.png`, the sheet still up over the home screen after the app was killed). I did not confirm it (needs a tap on the phone). The sheet outlives the app process; it is hosted by `PassbookUIService`, and `devicectl device process signal --signal SIGKILL` on that pid dismissed it (killing `AppStore` did not). Home screen verified clean after (`05-after-passbook-kill.png`, `08-home-after-uninstall.png`).
Consequence: the sandbox half of T56 (real sandbox purchase, Restore after reinstall, offline relaunch) is one tap away on this phone with the account already signed in; it needs Moshe's finger, not a new sandbox tester.

Not covered here: Ask to Buy (the harness sets `askToBuyEnabled = false`; a pending-purchase run needs a second build with it on), Family Sharing (sandbox family, Moshe), the T22 "nothing deleted" check (no chats existed on the proof build).

## B. Play internal release versionCode 3

Built from the merged tree (`main` 0e4dba0 + this branch) in the `purchases-verify` worktree, after xcodebuild had exited, with `scripts/check-store-env.sh` → "store env clean: no EXPO_PUBLIC_* dev switch set".

```
INBORN_MODELS_DIR=/Users/moshecohen/dev/inborn/.models INBORN_PACKS=instant,fast INBORN_VERSION_CODE=3 npx expo prebuild -p android --no-install
eval "$(scripts/play-signing-env.sh)"; GRADLE_USER_HOME=~/.gradle-pr2 ./gradlew bundleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a   # BUILD SUCCESSFUL in 3m 39s
```

| check | result |
|---|---|
| AAB | `app/build/outputs/bundle/release/app-release.aab`, 1,870,499,229 bytes |
| sha256 | `7d50252ac6e1c86bd4a5f3e0f9117fa0fa641cc54dcdf51186722f3b7b001ab8` |
| `bundletool validate` | OK (base + `inborn_model` fast-follow + `inborn_model_fast` on-demand) |
| manifest | versionCode 3, versionName 1.0.0, minSdk 26, targetSdk 36, allowBackup false |
| signer | `CN=Inborn Upload Key, O=Inborn, C=IL`, SHA-256 `E7:02:C9:A9:…:ED:CD` (the upload key; Play App Signing re-signs) |
| `scripts/check-android-permissions.sh` (bundletool universal APK) | "OK: no INTERNET permission; every declared permission is in the allowlist (9 declared)." |
| upload (`scripts/play-upload.mjs`, service account from the Keychain) | edit `06710485541603230280`, bundle versionCode 3 (sha256 matches), track `internal` release **"1.0.0 (3) internal"** status `completed`, committed |

What versionCode 3 carries over versionCode 2: the `main` merge (fixes-r5/r6, sheets-keyboard, work-docs and i18n changes since 7.9) and this branch's B-AT1-1 airplane-indicator fix from the 7.9 run. The dev-only paywall hook change in this round is inert in the store bundle (`devBuild()` false, `EXPO_PUBLIC_AUTOBUY` unset, gate above). Play will offer "Update" to the internal testers a few minutes after the commit.

## D. Real sandbox purchase on the iPhone without touching settings (time-boxed, 12:20–12:40)

Goal: reach Apple's sandbox (sandbox account already signed in on the phone), let the dev auto-buy open the "Sandbox" sheet, confirm it without a finger and without changing a setting. Result: **no primitive on this phone can confirm the sheet**; documented for Moshe.

1. **pymobiledevice3 10.7.3, accessibility audit service** (`developer accessibility …`): connects over the no-root userspace tunnel (`--userspace`; the default lockdown path hangs on iOS 17+). The service does implement `perform_press(element)` ("deviceElement:performAction:withValue:" = AXAction Activate), but the only way to obtain an element is the inspector focus walk (`iter_elements` / `list-items`), and on this iOS 26.6.1 phone the daemon never publishes a focus or app-state event: `list-items` → "timed out waiting for accessibility focus events" on the home screen and inside the app; `notifications` streamed nothing in 45 s. Without an element there is nothing to press. `developer dvt` has process control, screenshots and location, no touch. `developer wda` drives a WebDriverAgent runner, which is an XCUITest bundle (same gate as 2).
2. **XCUITest through testmanagerd** (`ios-tests/SandboxPurchaseUITests.swift`: launch, deep link to the paywall, wait for the auto-buy's sheet, tap "Purchase" once, then only watch for "owned" or a password prompt and never type; built with `scripts/ios-add-storekit-tests.rb` + `xcodebuild build-for-testing`, run with `test-without-building`): the runner installed and started, then failed with **"Timed out while enabling automation mode"**, and the phone showed a full-screen system prompt **"Enter iPhone Passcode for 'XCTest' · Enable UI Automation"** (`10-prompt-check.png`). Entering the passcode is the settings change that is out of bounds, so nothing was typed; the runner (`com.inbornapp.mobile.uitests.xctrunner`) was uninstalled and the app process killed. The prompt is hosted by `LocalAuthenticationUIService` and stayed on screen for 5 minutes; on the lead's decision (12:35) the DDI daemon that had raised it, `testmanagerd` (pid 2948, part of Xcode's developer disk image, not the phone's OS), was killed once and the prompt went away by itself 30 s later (`11-after-testmanagerd-kill.png`: home screen, no prompt); `LocalAuthenticationUIService` was not touched. Documented exception, next to the PassbookUIService one.
3. **devicectl**: `device process launch` can only start the app and pass environment / a payload URL; StoreKit 2 `Product.purchase()` always presents Apple's sheet, and no code path in the app or in StoreKit confirms it. The sheet from the first Task A launch (11:07) also proved it outlives the app process.

### Outcome 14:06–14:20 (Moshe at the phone)
Moshe accepted the "Enable UI Automation" passcode prompt once, and the setting stays on. `SandboxPurchaseUITests` then ran hands-free three times: app → `inborn://paywall` → real ASC products in the Israel storefront (Pro ₪69.90, Work ₪249.90, "Family Sharing is not enabled for this product yet") → the dev auto-buy opened Apple's **Sandbox** sheet (Inborn Pro · ₪69.90 · "For testing purposes only. You will not be charged" · Account tester1@example.com) → the runner **tapped Purchase** → Apple asked **"Enter the password for tester1@example.com to authorise this transaction [Environment: Sandbox]"** (`sandbox-shots-run1/t003.png` sheet, `t004.png` password prompt; run 2 `sandbox-shots-run2/t002–t022`). The test never typed; it waited for a person. **Moshe decided not to complete the sandbox purchase** ("Android works, so this will too") and the run was stopped: the sheet was dismissed by ending the runner, no password entered, app and runner uninstalled, phone on the home screen (`12-final-phone.png`). What is proven on iOS beyond Task A: the production StoreKit path (real product ids, localized prices, family-sharing flag) and the sheet round-trip; the sandbox JWS verification and Restore-after-reinstall on the sandbox environment remain unproven on a device (the Xcode-environment run in Task A covers the same code path with `allowTestEnvironments`).

**Runbook if it is ever needed (UI Automation is now on):** the two-step script below collapses to one step, the password.

Two-step script (as written before Moshe's decision):
1. Run the UI test once with the phone in hand: from `apps/mobile` on the Mac, `scripts/ios-storekit-proof.sh`-style: `npx expo prebuild -p ios --no-install && (cd ios && pod install) && ruby scripts/ios-add-storekit-tests.rb ios/Inborndev.xcodeproj Inborndev`, then `xcodebuild build-for-testing … -destination id=REDACTED-IPHONE` and `xcodebuild test-without-building -xctestrun ios/build/dd/Build/Products/Inborndev_iphoneos*.xctestrun -only-testing:InbornUITests/SandboxPurchaseUITests` (both commands are in scratch `purchases-r2/ios-build-for-testing.sh` and `run-sandbox-test.sh`). When the phone shows **"Enter iPhone Passcode for 'XCTest' · Enable UI Automation"**, enter the passcode once. That toggles Settings → Developer → UI Automation on, and from then on the test taps the Sandbox sheet hands-free.
2. The same test run continues by itself: it opens the paywall, waits for the "Sandbox" sheet, taps Purchase once, and stops at any password prompt (if the sandbox asks for the password of tester1@example.com, type it on the phone; the test never types). Result: YOU OWN PRO on screen, `Documents/licence-run.json` with `environment: "sandbox"`; then delete + reinstall and Restore (the `restore` bundle from Task A, or the paywall's Restore button).

Without step 1, the manual alternative (2 minutes): open Inborn (dev build with `EXPO_PUBLIC_AUTOBUY=inborn.pro`, or the paywall in any dev build and tap Unlock Pro), tap **Purchase** on the "Sandbox" sheet (account tester1@example.com, "you will not be charged"), enter the sandbox password if asked; the app then shows YOU OWN PRO and `Documents/licence-run.json` records `environment: "sandbox"`. Then delete and reinstall, open the paywall, Restore purchases. Alternatively enable Settings → Developer → UI Automation and the test in `ios-tests/SandboxPurchaseUITests.swift` does the tap (the password prompt, if any, still needs him).

## C. Real Play delivery on the OnePlus 6T (Task E, substitute for the OnePlus 11 run) — 14:19–14:28

The OnePlus 11 (`8a3120ef`) was never attached today, so the lead moved the run to the OnePlus 6T (`REDACTED-6T`, Android 11, Snapdragon 845, 8 GB) once the QA stream released it. Account check without names: `dumpsys account` counts 19 `type=com.google` lines and the two internal-tester addresses match 6 lines, so a tester account is signed in. The QA stream's debug build (versionCode 1, debug key) was uninstalled first (Play cannot update over a different signer).
Evidence: scratch `purchases-r2/6t/` (`01-optin.png` … `20-restore.png`, `logcat.txt` = full `logcat -v time` from before the install to after Restore).

| step | result | evidence |
|---|---|---|
| opt-in link in Chrome | "App not available … hasn't yet been invited" — Chrome's web session is a different account; irrelevant, the Play Store app's account is the tester | `01-optin.png` |
| `market://details?id=com.inbornapp.mobile` | Play Store sheet "com.inbornapp.mobile (unreviewed) · In-app purchases · 56 MB · Install" | `02-market.png` |
| Install | `input tap` on Install works in the Play Store (the app itself ignores taps: TAB / DPAD_DOWN + DPAD_CENTER, see `6t-focus.sh`); "0% of 56.48 MB" → installed 14:21:31: `versionCode=3`, `versionName=1.0.0`, `installerPackageName=com.android.vending` | `04-after-tap.png`, `05-installed.png` |
| installed manifest | `dumpsys package` requested permissions: RECORD_AUDIO, USE_BIOMETRIC, VIBRATE, BILLING, CAMERA, ACCESS_NETWORK_STATE, FOREGROUND_SERVICE, FOREGROUND_SERVICE_DATA_SYNC, DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION **and `com.android.vending.CHECK_LICENSE`** — no INTERNET, no WAKE_LOCK, no RECEIVE_BOOT_COMPLETED. CHECK_LICENSE is not in the AAB (the bundletool gate saw 9): Play adds it to the delivered APKs for licensing; harmless, but the data-safety text should not claim "9 permissions" | dumpsys output in this section |
| **fast-follow Instant pack without WAKE_LOCK (B16)** | the app launched 14:21:42 on the welcome screen with "Delivering INSTANT · 21% of 508 MB"; logcat: `Finsky … RF: onProgress … artifact_id=inborn_model artifact_bytes=…/519450674` (Play downloads), then `PlayCore … ExtractChunkTaskHandler : Extraction finished for chunk 0…10 of slice inborn_model of pack inborn_model of session 1` (11 chunks, extraction runs in the app's own `AssetPackExtractionService`, UID of the app), `AssetPackServiceImpl : notifyModuleCompleted` 14:22:35, and `[inborn] engine model instant from file:///data/data/com.inbornapp.mobile/files/assetpacks/inborn_model/3/3/assets/Qwen3.5-0.8B-Q4_K_M.gguf` 14:22:36. No wake-lock line for the app in the whole log. 53 s from launch to model located, on Wi-Fi | `06-launch.png`, `logcat.txt` |
| onboarding model step | "Your model — READY NOW · Instant · built in · 508 MB · works offline" appeared by itself (the `useInstalledModel()` fix from fixes-r4a), Fast (1.3 GB) offered as optional, "Delivered by Google Play. Inborn itself has no internet access." | `13-small.png` (`13-step.png`) |
| first answer | "Prove it to yourself" step: Ask → **INSTANT · ON-DEVICE AI — "17 times 23 is 391."**, counter **OUT 0 B · IN 0 B** | `16-answer.png` |
| Proof screen (`inborn://proof`) | **SEALED · ON-DEVICE · since install · 0 days · OUT 0 B · IN 0 B · CONNECTIONS 0 open**, network allowlist "none · the app has no internet permission", last delivery "Instant arrives as a Play asset pack · nothing downloaded by Inborn", Internet "none (not in the manifest)", trackers 0 | `18-proof.png` |
| paywall (`inborn://paywall`) | **YOU OWN PRO · Unlocked on every device that uses this Google Play account** at once (startup refresh: this Play account is the one that bought Pro on 7.9 on the OnePlus 11), Work card = **Upgrade to Work · ₪149.90**, "Family Library does not include in-app purchases" | `19-paywall.png` |
| Restore purchases | focus + DPAD_CENTER on "Restore purchases" → **"Purchase restored"** | `20-restore.png` |

Not seen: any 16 KB compatibility dialog (a 4 KB Android 11 device cannot show one; 16 KB was proven on the ps16k emulator on 7.9). Left on the phone: the Play build 1.0.0 (3) with Pro owned, phone on the launcher home screen; one Chrome tab with the opt-in page stays open in Chrome's tab list (no way to close a single tab over adb). What remains OnePlus-11-only: nothing for this checklist; a 16 KB / Android 16 device run of the Play path would only repeat what the emulator proved.

## E. Play internal release versionCode 4 — 15:00–15:07

Same recipe as B, from `main` 90a82f9 (fast-forward merge into `purchases-verify`; includes 14b58d4 and the merged round-2 branch), prebuild with `INBORN_PACKS=instant,fast INBORN_VERSION_CODE=4`, `scripts/check-store-env.sh` → "store env clean". `pn typecheck` and `pn lint` pass on the merged tree before the build. Gradle ran only while no xcodebuild was alive (the lead's "go vc4"), `--no-daemon`, `GRADLE_USER_HOME=~/.gradle-pr2`: BUILD SUCCESSFUL in 1m 22s (an earlier, unintended waiter of mine had already built the same tree 14:39–14:42 when `pgrep xcodebuild` was empty; the 15:00 run rebuilt it incrementally, see the report to the lead).

| check | result |
|---|---|
| AAB | `app/build/outputs/bundle/release/app-release.aab`, 2,091,988,850 bytes (vc3 was 1,870,499,229: the Fast pack grew with the main merge) |
| sha256 | `db345f5d9e435a9dea8edb70a6d58e60147b9e05b5a0402e6365d4c60268f4ae` |
| `bundletool validate` | OK; modules `base`, `inborn_model` (fast-follow, `Qwen3.5-0.8B-Q4_K_M.gguf` 532,517,120 bytes), `inborn_model_fast` (on-demand, `Qwen3.5-2B-Q4_K_M.gguf` 1,280,835,840 bytes) |
| manifest | versionCode 4, versionName 1.0.0; `ACTION_SEND` filters (text/plain and the document types) on `MainActivity`; `ACTION_PROCESS_TEXT` text/plain on `com.inbornapp.sharetarget.ProcessTextActivity` (label "Ask Inborn", standard launch in the caller's task, translucent) |
| signer | `CN=Inborn Upload Key, O=Inborn, C=IL`, SHA-256 `E7:02:C9:A9:…:ED:CD` |
| `scripts/check-android-permissions.sh` | "OK: no INTERNET permission; every declared permission is in the allowlist (9 declared)." — the share-target module adds none |
| upload | edit `08048933420369955521`, bundle versionCode 4 (sha256 matches), track `internal` release **"1.0.0 (4) internal"** status `completed`, committed |

## F. Share target and "Ask Inborn" on the real Play build, OnePlus 6T — 15:09–15:57 (Replace pressed 17:31 after a session pause)

Evidence: `purchases-r2/6t/21-play-page.png` … `45-home.png` (`-s.png` = small copies).

**Update via Play.** `market://details?id=com.inbornapp.mobile` showed "Update" once the internal release propagated (about 9 minutes after the commit, `22-play-poll.png`); pressed with keyboard focus (TAB to the button's bounds + DPAD_CENTER, `23d-after-center.png`: "2% of 840 MB · Verified by Play Protect"); `versionCode=4` installed 15:33:12, `installerPackageName=com.android.vending`, splits base + config.arm64_v8a + languages. Play re-delivered the fast-follow Instant pack for the new version (`RESOURCE_STATUS_SUCCEEDED … size: 519450660/519450660`, `AssetPackServiceImpl : onNotifyChunkTransferred(inborn_model … chunkIndex=10)`), and the app logged `[inborn] engine model instant from …/assetpacks/inborn_model/4/4/assets/Qwen3.5-0.8B-Q4_K_M.gguf` at first launch. Installed permissions again the 9 from the AAB plus Play's `com.android.vending.CHECK_LICENSE` (now written into `docs/legal/app-privacy-details.md` §4.2 and the rendered privacy policy §3).

**Surface 1 — text shared from another app (`ACTION_SEND`).** `am start -a android.intent.action.SEND -t text/plain --es android.intent.extra.TEXT "Their going to the park tomorow, and she dont want to come with us becuase its to cold."` raised the system share sheet with **Inborn** among the targets (`25-chooser.png`); Inborn chosen with "Just once" (`26-chooser-inborn.png`, no default set). The app came up on onboarding (see finding 1), and the moment the chat mounted with the model up the **Quick actions** sheet opened on the shared text: Summarize · Rephrase · Fix grammar · Translate · Explain · Extract tasks, "Detected: English · Translate to Spanish ›", Open in chat (`30-share-sheet.png`). **Fix grammar** → "Their going to the park tomorrow, and she doesn't want to come with us because it is cold." with Copy / Open in chat and no Replace (a share has nobody to send a result back to — correct) (`31-share-fixed.png`).

**Surface 2 — text selected in a foreign field → ⋮ → Ask Inborn → Fix grammar → Replace (`ACTION_PROCESS_TEXT`).** Host field: Google Docs' document-search box (nothing is saved by a search; Keep and Chrome were tried first, see finding 2). Typed "Their going to the park tomorow and she dont want to come", long-press → floating toolbar → Select all → ⋮ (More options) → the overflow lists **Read aloud** (TalkBack) and **Ask Inborn** (`41-docs-overflow.png`). Ask Inborn: logcat `START u0 {act=android.intent.action.PROCESS_TEXT typ=text/plain cmp=com.inbornapp.mobile/com.inbornapp.sharetarget.ProcessTextActivity} … callingPackage:com.google.android.apps.docs.editors.docs`, then Inborn's main task in front with the Quick actions sheet on the selected text (`42-ask-inborn-sheet.png`). **Fix grammar** → "Their going to the park tomorrow and she doesn't want to come", buttons **Copy · Replace · Open in chat** (`43-fixed-with-replace.png`). **Replace** → focus returned to Docs by itself and its search field now reads **"Their going to the park tomorrow and she doesn't want to come"** (`44-after-replace.png`; the `EditText` node text read back through accessibility). The field was cleared afterwards, Docs closed, phone on the launcher home screen with Inborn 1.0.0 (4) installed (`45-home.png`).

Findings:
1. **Onboarding shown again after the Play update (3) → (4).** The first launch of (4) started at "Nothing leaves this phone." → model step ("READY NOW · Instant · built in") → airplane test → seal → lock question, although (3) had completed onboarding on this phone at 14:2x. Chats were not inspected. Either the onboarding flag does not survive an update, or the app reset its state; worth a look by the owner of onboarding/persistence before the next release (`27-share-sheet.png` … `29-after-onb.png`). The pending share survived the whole onboarding and opened as soon as the chat mounted, which is the intended behaviour.
2. **"Ask Inborn" is visible only to apps that declare a `PROCESS_TEXT` query (Android 11+ package visibility).** `dumpsys package queries` on the 6T lists which packages can see `com.inbornapp.mobile`: Gmail, Google Messages, Docs, Sheets, Calendar, Google Chat, WhatsApp, Slack, YouTube … can; **Google Keep and Chrome cannot** (Keep's overflow showed only "Read aloud", `38-keep-overflow.png`). Nothing on our side can change that; the spec's "every app's text-selection menu" should be read as "every app that declares the standard text-processing query".
3. `[inborn]` logcat at launch: `new NativeEventEmitter() was called with a non-null argument without the required addListener / removeListeners method` — the ShareTarget native module does not implement the two legacy-bridge methods; harmless warning, events still arrive (surface 1 and 2 both used them), but a dev build would show it as a yellow box.
4. **Injected touches are ignored on this phone** (`input tap/swipe`, also in the Play Store and the system share sheet today; `sendevent` on `/dev/input/event2` is denied by SELinux). OnePlus keeps simulated input behind "USB debugging (Security settings)", which stays off (no settings changed). Key events work, so Inborn and the Play Store were driven with TAB/DPAD; the floating text-selection toolbar has no keyboard path, so it was driven through **accessibility node actions** from a tiny self-instrumenting test APK, `apps/mobile/android-dev/a11y-drive/` (packages `com.inbornapp.mobile.uitest` + `.test`, allowed by the phone rule; installed 15:51, uninstalled 17:32). It clicks, long-clicks and reads nodes by text / content-description / view id in every window (`am instrument -w -e steps "longclick:<id>;sleep:1500;click:Select all;click:More options;click:Ask Inborn"`). Its own debug build (`assembleDebug assembleDebugAndroidTest`, `--no-daemon`, 1 GB heap) ran while the iOS archive was building; it is not an app release build.
5. Side effect to know about: `market://search?q=…` was used once while looking for a host field, so one Play Store search ("she dont want to come becuase its to cold") is in that account's Play search history. No note, message or document was created; Messages' "Continue as Moshe" prompt was backed out of without touching it.

## G. Play internal release versionCode 5 (fixes-r9) and the launch check on the 6T — 20:14–20:42

`purchases-verify` reset to the local `main` 07bc402 (fixes-r9 F1–F15 merged, F15 not yet on origin at build time; my 1264e92 was already in main), `pn install --frozen-lockfile`, `scripts/check-store-env.sh` clean, prebuild with `INBORN_PACKS=instant,fast INBORN_VERSION_CODE=5`. The two new native pieces landed: `plugins/withStoredNightMode.js` wrote `applyStoredNightMode()` into `android/app/src/main/java/com/inbornapp/mobile/MainActivity.kt` (AppCompatDelegate night mode from the stored preference before `attachBaseContext`), and `modules/read-aloud` is autolinked (`expo-module.config.json` → `com.inbornapp.readaloud.ReadAloudModule`, present in `base/dex/classes3.dex`; its manifest only adds a `<queries>` for `android.intent.action.TTS_SERVICE`, which is package visibility, not a permission).

Gradle (no xcodebuild alive, `--no-daemon`, `~/.gradle-pr2`): the first `bundleRelease` compiled everything and then **failed in `:app:signReleaseBundle` with `java.lang.OutOfMemoryError: Java heap space`** (prebuild's `gradle.properties` has `org.gradle.jvmargs=-Xmx2048m`; bundletool signs the 2 GB bundle inside the Gradle JVM and vc4 had been at the edge). Re-running only that task with `-Dorg.gradle.jvmargs="-Xmx8g -XX:MaxMetaspaceSize=1g"` signed it in 1m 13s. Recipe for the next build: pass that `-D` on the command line, or raise `org.gradle.jvmargs` in the prebuilt `android/gradle.properties` (regenerated by prebuild; a config-plugin change would make it permanent).

| check | result |
|---|---|
| AAB | `app/build/outputs/bundle/release/app-release.aab`, 1,870,567,596 bytes (vc4 was 2,091,988,850 with the same two `.gguf` files; the difference is bundle compression, not content) |
| sha256 | `861d805d027b7746b71523f9e46282a1f44bdc62259aa41c73017317833404eb` |
| `bundletool validate` | OK; `base`, `inborn_model` fast-follow (`Qwen3.5-0.8B-Q4_K_M.gguf` 532,517,120 B), `inborn_model_fast` on-demand (`Qwen3.5-2B-Q4_K_M.gguf` 1,280,835,840 B) |
| manifest | versionCode 5, versionName 1.0.0; SEND filters, `ProcessTextActivity` (PROCESS_TEXT), `<queries>` TTS_SERVICE; `uiMode` in `configChanges` |
| `scripts/check-android-permissions.sh` | "OK: no INTERNET permission; every declared permission is in the allowlist (9 declared)." — read-aloud adds none |
| upload | edit `05949408492873814732`, bundle versionCode 5 (sha256 matches), track `internal` **"1.0.0 (5) internal"** `completed`, committed 20:25 |

**6T update and launch (F12 on the real device).** Play showed "Update" at 20:39 (`46-play-vc5.png`), pressed by keyboard focus (`47-play-updating.png`, "2%"), `versionCode=5` installed by `com.android.vending` 20:41:03 (a small delta this time: the asset packs did not change, so Play did not re-download them). Cold launch (`force-stop` + launcher intent): **the app opened straight to the chat screen** — top bar Chats · SEALED · INSTANT, the "This is AI…" notice, empty chat "Nothing leaves this phone." with the three suggestions and the composer (`48-vc5-launch.png`) — **no onboarding, no lock prompt (the lock switch was left off on 11.9)**, so the finding from F.1 (onboarding shown again after the (3)→(4) update) does not reproduce on (4)→(5) with fixes-r9. Logcat for the launch: `[inborn] engine model instant from …/assetpacks/inborn_model/5/5/assets/Qwen3.5-0.8B-Q4_K_M.gguf`, `[inborn] llama.rn loaded … in 1507 ms`, no `[prefs]` line (nothing to repair), no `AndroidRuntime` error. One line worth a glance by the persona/voice owner: `[inborn] null loaded bundled://null in 90 ms` right after "Running main". Phone returned to the launcher home screen with 1.0.0 (5) installed (`49-home.png`).

## H. vc5 sanity on the OnePlus 6T after fixes-r9 (storage) — 13.9.2026 21:58–22:06

Installed Play build 1.0.0 (5), phone on its launcher before and after (qa-r4 was not on it: `mCurrentFocus` = launcher at 21:58 and 22:06), driven with keys only. Evidence `purchases-r2/6t/50-h-answer1.png` … `57-h-proof.png`, full log `6t/logcat-h.txt` (`logcat -c` before the first launch).

| step | result | evidence |
|---|---|---|
| cold launch → new chat → "Name three colours" → Send | streams **"Here are three colors: 1. Blue 2. Red 3. Yellow"** (INSTANT · ON-DEVICE AI, LEDGER toggle under it) | `50-h-answer1.png` |
| follow-up "Which of them is the warmest" | **"Red is generally considered the warmest color … Blue is considered the coolest … Yellow is a neutral color …"** | `51-h-answer2.png` |
| `am force-stop com.inbornapp.mobile` → relaunch | opens on a fresh empty chat (by design); **Chats** panel lists **"Name three colours · 10:00 PM"** under RECENT (and the Friday chat "Give me a JSON object describing" from the vc3/vc4 days, so the (3)→(4) onboarding re-show in F.1 did not lose data) | `52-h-relaunch.png`, `53-h-chats.png` |
| reopen the chat | both turns and both answers are there, unchanged | `54-h-reopened.png` |
| Vault (`inborn://vault`) | "Model vault · 508 MB in the vault · 19 GB free", INSTANT Qwen3.5 0.8B **Loaded · In use** | `55-h-vault.png` |
| Settings (`inborn://settings`) | opens (APPEARANCE · Theme: System / Dark …) | `56-h-settings.png` |
| Proof (`inborn://proof`) | **SEALED · ON-DEVICE · OUT 0 B · IN 0 B · CONNECTIONS 0 this session**, allowlist "none · the app has no internet permission", Internet "none (not in the manifest)" | `57-h-proof.png` |
| HOME | launcher in front, app left installed | — |

Vault, Settings and Proof were opened by deep link (the Chats panel's TAB order loops between the suggestion chips when the keyboard is up; DPAD_UP + DPAD_LEFT reaches the Chats button, which is how the panel was opened for the chat check).

Logcat (whole session, 21:58–22:06): `[storage]` 0 lines, `[prefs]` 0 lines, "ANR in" 0, "FATAL EXCEPTION" 0. The six lines that matter:

```
09-13 21:58:22.345 ActivityManager: Force stopping com.inbornapp.mobile appid=11422 user=0: from pid 5075
09-13 21:58:25.997 ReactNativeJS: [inborn] engine model instant from file:///data/data/com.inbornapp.mobile/files/assetpacks/inborn_model/5/5/assets/Qwen3.5-0.8B-Q4_K_M.gguf
09-13 21:58:28.503 ReactNativeJS: [inborn] llama.rn loaded …/inborn_model/5/5/assets/Qwen3.5-0.8B-Q4_K_M.gguf in 2506 ms
09-13 22:00:57.668 ActivityManager: Force stopping com.inbornapp.mobile appid=11422 user=0: from pid 6225      ← after both answers
09-13 22:01:02.087 ReactNativeJS: [inborn] engine model instant from …/inborn_model/5/5/assets/Qwen3.5-0.8B-Q4_K_M.gguf
09-13 22:01:03.693 ReactNativeJS: [inborn] llama.rn loaded …/inborn_model/5/5/assets/Qwen3.5-0.8B-Q4_K_M.gguf in 1606 ms
```

## I. Play internal release versionCode 6 (fixes-r10) and the sanity run on the 6T — 14.9.2026 03:43–03:53, 07:52–08:03

Built from `main` 70e1cfa (fixes-r10 rounds 10/10b/10c; `main` 5bb8b64 merged afterwards adds only a docs/qa file, so the uploaded bundle is code-identical to it). **Clean prebuild** (`rm -rf android` first, mandatory because round 10b added the native module `modules/hardware-keys`, which an incremental prebuild leaves out of the module registry), `INBORN_PACKS=instant,fast INBORN_VERSION_CODE=6`, `scripts/check-store-env.sh` clean, then `bundleRelease --no-daemon` in `~/.gradle-pr2` with `-Dorg.gradle.jvmargs="-Xmx8g -XX:MaxMetaspaceSize=1g"` from the start (the G trap): BUILD SUCCESSFUL in 2m 25s, no xcodebuild at any time.

| check | result |
|---|---|
| AAB | `app/build/outputs/bundle/release/app-release.aab`, 2,092,019,571 bytes |
| sha256 | `847bac90ce3e288ef58863b687503e1d8f31ad493679bb31b4f40b45fb6142c8` |
| `bundletool validate` | OK; `inborn_model` fast-follow (532,517,120 B) + `inborn_model_fast` on-demand (1,280,835,840 B) |
| manifest | versionCode 6, versionName 1.0.0; 9 `uses-permission`, no INTERNET; `modules/hardware-keys` has an empty manifest (adds nothing) |
| module registry (dex strings) | AssetPacks, DeviceGuard, DocExtract, **HardwareKeys**, ReadAloud, SecureScreen, ShareTarget, TrafficMeter, VaultNative — all nine |
| `scripts/check-android-permissions.sh` | "OK: no INTERNET permission; every declared permission is in the allowlist (9 declared)." |
| upload | edit `00845605017362204929`, bundle versionCode 6 (sha256 matches), track `internal` **"1.0.0 (6) internal"** `completed`, committed 03:53 |

**6T update and sanity** (evidence `6t/58-play-vc6.png` … `68-home.png`, log `6t/logcat-i.txt`; launcher before and after, no other stream on the phone): Play showed "Update" (07:52), pressed by keyboard focus, `versionCode=6` installed by `com.android.vending` 07:54:35.

| step | result | evidence |
|---|---|---|
| cold launch → "What is the capital of France" | **INSTANT · ON-DEVICE AI — "The capital of France is Paris."** | `60-vc6-answer.png` |
| assistant row a11y label (`uiautomator dump`, `resource-id="assistant-message"`) | `content-desc="INSTANT · ON-DEVICE AI · The capital of France is Paris."` — the answer's first line is in the label | dump in this section |
| soft Enter in the composer | `input keyevent KEYCODE_ENTER` (virtual device, so `HardwareKeysModule.isHardware()` is false, same path as the on-screen keyboard's Enter): composer text became `line one⏎` and then `line one⏎line two`, field grew to two lines; no send happened. No physical keyboard on the 6T, so the hardware-Enter path itself is not testable here | `61-vc6-enter.png` |
| Send on the two-line message | sent (composer empty), answer streamed (the 0.8B model riffed on "Line one / Line two" as names, expected for such input) | `62-vc6-two-line-sent.png` |
| Vault → FAST → "Install · 1.2 GB from Google Play" | first press opens the confirm sheet **"Download Fast? Google Play will download 1.2 GB. Inborn itself opens no connection."** (Cancel / Download); Download → "Delivering FAST · 10% of 1.19 GB", `model-status-fast` "10% · 122 MB of 1.2 GB" with Cancel | `64-vc6-fast-press.png`, `64-vc6-fast-delivering.png` |
| Fast delivered | PlayCore `Extraction finished for chunk 0 … 24 of slice inborn_model_fast … session 9` (08:01:38–08:02:40), `AssetPackServiceImpl : notifyModuleCompleted` 08:02:44, `[inborn] engine model fast from …/assetpacks/inborn_model_fast/6/6/assets/Qwen3.5-2B-Q4_K_M.gguf`, `llama.rn loaded model FAST` 08:02:48; vault "1.7 GB in the vault · 17 GB free", Instant **Installed**, Fast **Loaded**. About 2 min on Wi-Fi, no wake-lock line for the app | `67-vc6-fast-done.png` |
| paywall (`inborn://paywall`) | **YOU OWN PRO**, Work card "PRO FOR WORK · ₪149.90 · one-time purchase · Upgrade to Work" | `65-vc6-paywall.png` |
| Restore purchases | **"Purchase restored"** (`paywall-status`) | `66-vc6-restore.png` |
| HOME | launcher, 1.0.0 (6) installed with both packs | `68-home.png` |

Logcat for the whole sanity (07:54–08:03): `[storage]` 0, `[prefs]` 0, "ANR in" 0, "FATAL EXCEPTION" 0, no wake-lock line for the app.

## J. Play internal release versionCode 7 (fixes-r13) and the sanity run on the 6T — 20.9.2026 20:14–21:20

Built from `main` ff39f94 (merge of fixes-r13: catalog v3 from the measured tiers, unknown languages, zh-Hant/zh-Hans) in a fresh worktree `android-vc7`, so the prebuild was clean by construction (no `android/` directory existed). `pn install --frozen-lockfile`, `scripts/check-store-env.sh` → "store env clean", prebuild with `INBORN_MODELS_DIR=…/.models INBORN_PACKS=instant,fast INBORN_VERSION_CODE=7`. Gradle `bundleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a -Dorg.gradle.jvmargs="-Xmx8g -XX:MaxMetaspaceSize=1g"` (the G trap avoided from the start) with a private `GRADLE_USER_HOME` inside the session scratch (APFS clone of `~/.gradle-pr2`): **BUILD SUCCESSFUL in 5m 18s**, 1105 tasks. `gradlew --stop` was never run; another stream's gradle daemon on a different `GRADLE_USER_HOME` was alive throughout and untouched. No xcodebuild ran in this stream; the lead was told the minute gradle finished so the iOS stream could start.

| check | result |
|---|---|
| AAB | `app/build/outputs/bundle/release/app-release.aab`, 1,870,640,031 bytes |
| sha256 | `37c97d3446d0d408b2163bc19981d4f13b00d5127394e119355759f695f0cdd1` |
| `bundletool validate` (1.18.3) | OK; asset packs `inborn_model` **fast-follow** (`Qwen3.5-0.8B-Q4_K_M.gguf` 532,517,120 B) and `inborn_model_fast` **on-demand** (`Qwen3.5-2B-Q4_K_M.gguf` 1,280,835,840 B) |
| manifest | `versionCode="7" versionName="1.0.0"`, package `com.inbornapp.mobile`, compileSdk 36; 3 × `android.intent.action.SEND`, `ProcessTextActivity` with `PROCESS_TEXT`, `<queries>` for `TTS_SERVICE` |
| module registry (dex strings, `base/dex/classes*.dex`) | AssetPacks, DeviceGuard, DocExtract, **HardwareKeys**, ReadAloud, SecureScreen, ShareTarget, TrafficMeter, VaultNative — all nine |
| `scripts/check-android-permissions.sh` | "OK: no INTERNET permission; every declared permission is in the allowlist (9 declared)." |
| upload | `--next-version-code` returned 7 before the upload; edit `08066290382974104798`, bundle versionCode 7 with **the same sha256 as the local file**, track `internal` **"1.0.0 (7) internal"** `completed`, committed 20:46 |

**Why the 6T was updated through Play and not through bundletool.** The brief asked for a bundletool install from the AAB while keeping the model packs. On this app the two are mutually exclusive, and the check that settles it is worth recording. The app uses **Play app signing**: the installed `base.apk` pulled off the phone verifies as `CN=Android, OU=Android, O=Google Inc.` with certificate SHA-256 `a79f4b8baf28f9d5238c1f8accb33170acaaaca3a76860bf176b7c6869aa51a1`, while our upload key `inborn-upload` is `E7:02:C9:A9:19:C8:85:BC:E7:6C:C6:A0:D7:94:70:F0:AD:91:75:AF:49:3B:21:B7:32:02:57:4D:D2:CC:ED:CD`. Any APK bundletool builds from our AAB carries the upload-key signature, so installing it over the Play build is refused, and the only way through would have been an uninstall — which wipes the chat DB, the Pro entitlement cache and both model packs (1.7 GB to re-download). The Play update path preserves all of it and is also the path a real tester takes, so it is both cheaper and better evidence. It is what vc5 and vc6 used.

**Update and sanity** (evidence `soak3/run3/71-vc7-launch.png` … `82-attach-sheet.png`, logcat `soak3/run3/logcat.txt`; launcher in front before the run). Play showed **Update** on `market://details?id=com.inbornapp.mobile` within a minute of the commit; pressed at 20:47, `versionCode=7` installed by `com.android.vending` at **20:49:10**, a small delta because the asset packs did not change.

| step | result | evidence |
|---|---|---|
| cold launch (`force-stop` + launcher intent) | opens straight to the chat screen — Chats · SEALED · INSTANT, the "This is AI…" notice, empty chat "Nothing leaves this phone." with the three suggestions and the composer. **No onboarding, no lock prompt** | `71-vc7-launch.png` |
| model packs after the update | both survived: vault lists **INSTANT · Qwen3.5 0.8B** in use and **FAST · Qwen3.5 2B "Installed"** with "Use this model"; nothing re-downloaded | `74-vc7-vault.png` |
| chat on Instant | "What is the capital of France?" → **"The capital of France is Paris."**, assistant row `content-desc="INSTANT · ON-DEVICE AI · The capital of France is Paris."`, 6 s | `73-vc7-answer-instant.png` |
| model switch → Fast, chat on Fast | chip reads **FAST**, "Name three colours." answered in 12 s, `content-desc="FAST · ON-DEVICE AI · 1. Blue"` | `75-vc7-answer-fast.png` |
| paywall (`inborn://paywall`) | **YOU OWN PRO** — "Unlocked on every device that uses this Google Play account."; Work card "PRO FOR WORK · ₪149.90 · one-time purchase". Restore was not needed | `76-vc7-paywall.png` |
| proof (`inborn://proof`) | **SEALED · ON-DEVICE**, since install · 9 days, **OUT 0 B · IN 0 B**, **CONNECTIONS 0 this session**, allowlist "none · the app has no internet permission", Internet "none (not in the manifest)", **TRACKERS 0** | `77-vc7-proof.png` |

The vault card also shows the fixes-r13 catalog v3 copy on this build: FAST carries "RECOMMENDED ON THIS PHONE · CHAT IN ENGLISH", "~5-7 tok/s on your phone", and the tiered language row "Native · English, Chinese, Arabic / Basic · German, Korean / **No · Hebrew**" under the tier-neutral heading.

The soak that follows this sanity is `docs/qa/soak-run-3-2026-09-20.md`.

## K. Play internal release versionCode 8 (fixes-r14) and the sanity run on the 6T — 21.9.2026 00:51–02:05

Built from `main` 543a5af (merge of fixes-r14: F33 list clipping during screen re-attach, plus F30–F32) in a fresh
worktree `android-vc8`, so the prebuild was clean by construction. `pn install --frozen-lockfile`,
`scripts/check-store-env.sh` → "store env clean", prebuild with `INBORN_MODELS_DIR=…/.models
INBORN_PACKS=instant,fast INBORN_VERSION_CODE=8`. Gradle `bundleRelease --no-daemon
-PreactNativeArchitectures=arm64-v8a -Dorg.gradle.jvmargs="-Xmx8g -XX:MaxMetaspaceSize=1g"` with a private
`GRADLE_USER_HOME` in the session scratch (APFS clone of `~/.gradle-pr2`): **BUILD SUCCESSFUL in 3m 18s**, 1105
tasks. `gradlew --stop` was never run and no other stream's daemon was touched. No xcodebuild ran in this stream.
The shipped app code is identical to `main` c9c1752 — `git diff 543a5af c9c1752 -- apps/mobile/src packages` is
empty — so the uploaded bundle is code-identical to current main.

| check | result |
|---|---|
| AAB | `app/build/outputs/bundle/release/app-release.aab`, 2,092,078,443 bytes |
| sha256 | `5a93a1b1cd6dc5d4529e46a11346540faad10badcb16581596b6e31a7d3d68b6` |
| `bundletool validate` (1.18.3) | OK; asset packs `inborn_model` **fast-follow** (`Qwen3.5-0.8B-Q4_K_M.gguf` 532,517,120 B) and `inborn_model_fast` **on-demand** (`Qwen3.5-2B-Q4_K_M.gguf` 1,280,835,840 B), both byte-identical to vc6 and vc7 |
| manifest | `versionCode="8" versionName="1.0.0"`, package `com.inbornapp.mobile`, compileSdk 36 |
| module registry (dex strings, `base/dex/classes*.dex`) | AssetPacks, DeviceGuard, DocExtract, **HardwareKeys**, ReadAloud, SecureScreen, ShareTarget, TrafficMeter, VaultNative — all nine |
| `scripts/check-android-permissions.sh` | "OK: no INTERNET permission; every declared permission is in the allowlist (9 declared)." |
| the F33 fix is in the artifact | all four lists (`screens/Chat.tsx`, `screens/Chats.tsx`, `screens/vault/VaultScreen.tsx`, `screens/documents/DocumentsScreen.tsx`) spread `listClipping`, `removeClippedSubviews` is present in the Hermes bundle inside the AAB, and `src/lib/listClipping.test.ts` is 2/2 green |
| upload | `--next-version-code` returned 8 before the upload; edit `09760590197853827663`, bundle versionCode 8 with **the same sha256 as the local file**, track `internal` **"1.0.0 (8) internal"** `completed` |

**bundletool lives in the repo at `.tools/bundletool-all-1.18.3.jar`.** I did not find it and fetched 1.18.3
into the session scratch instead; the two files are byte-identical
(`a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29`), so the validation above is the same tool
sections I and J used. Pass it as `BUNDLETOOL=.tools/bundletool-all-1.18.3.jar` to
`scripts/check-android-permissions.sh`, which needs it for an AAB.

**The base module ships about 229 MB of iOS binaries.** `base/assets/ios/libtesseract.xcframework` carries four
copies of `libtesseract` (ios-arm64, ios simulator, maccatalyst, macos) inside the Android bundle, none of which
Android can load. Base totals 636 MB against 1.81 GB of models. That is most of the 220 MB gap between vc8 and
vc7 and it is paid by every Android download. Not changed in this release; recorded for whoever trims the bundle
before 1.0.

**Play refused the install for half an hour: the asset packs were not published yet.** The Play page offered
Update within a minute of the commit, but pressing it only ever produced

```
Requesting installation of asset modules: [inborn_model_fast, inborn_model]
AssetModuleService gRPC failure requesting asset module info
AssetModuleException: Request to PGS failed because all packs are unavailable.
```

and the queued download never started — at 01:19:58 and again at 01:40:55. The publishing API said the release
was live (`tracks/internal` → "1.0.0 (8)", `completed`) the whole time, so this is Google still processing the
2.09 GB bundle's asset packs, not a bad upload. The phone was not at fault: Wi-Fi up, screen on, 100% on the
charger, 16 GB free, Play not background-restricted, no stuck install session. The third press, at 01:45, went
straight through: 246 MB base APK, 277 MB total, versionCode 8 installed by `com.android.vending` at **01:46:49**.
vc7's two-minute turnaround was a smaller bundle following an identical predecessor; budget half an hour here.

**bundletool install was not an option, same as vc7.** An APK bundletool builds from our AAB carries the
upload-key signature and cannot install over a Play-signed build; the only way through is an uninstall, which
wipes the chat DB, the Pro entitlement cache and both model packs. Section J settles this. The Play update path
preserves all of it and is what a real tester takes.

**Sanity on the 6T** (evidence in the session scratch `soak4/run4/`, screenshots `90-play-vc8.png` …
`104b-vc8-about.png`, logcat `logcat-soak.txt`; launcher in front before the run).

| step | result | evidence |
|---|---|---|
| cold launch (`force-stop` + launcher intent) | opens straight to chat — Chats · SEALED · INSTANT, the "This is AI…" notice, empty chat "Nothing leaves this phone." with the three suggestions and the composer. **No onboarding, no lock prompt** | `95-vc8-launch.png` |
| About | **VERSION 1.0.0 (8)**, commit **543a5af3671b** | `104b-vc8-about.png` |
| chat on Instant | "What is the capital of France?" → **"The capital of France is Paris."** in 8 s, row `content-desc="INSTANT · ON-DEVICE AI · The capital of France is Paris."` | `96-vc8-answer-instant.png` |
| model packs after the update | **Instant survived, Fast did not.** The vault read "508 MB in the vault" and the Fast card offered `install-fast` "Install · 1.2 GB from Google Play", although PlayCore had logged `onNotifyModuleCompleted` for both packs | `97-vc8-vault.png`, `97f-vc8-fast-status.png` |
| Fast re-install | the confirm sheet reads "Download Fast? Google Play will download 1.2 GB. Inborn itself opens no connection." (Cancel / Download); Download completed **instantly**, vault jumped to "1.7 GB in the vault". The bytes were never gone — the on-demand pack simply has to be re-requested after a version bump | `98-vc8-fast-confirm.png`, `99-vc8-fast-delivering.png` |
| chat on Fast | chip **FAST**, "Name three colours." in 13 s, `content-desc="FAST · ON-DEVICE AI · Blue, Red, and Green."` | `100-vc8-answer-fast.png` |
| paywall (`inborn://paywall`) | **YOU OWN PRO** — "Unlocked on every device that uses this Google Play account."; Work card "PRO FOR WORK · ₪149.90 · one-time purchase". Restore not needed | `101-vc8-paywall.png` |
| proof (`inborn://proof`) | **SEALED · ON-DEVICE**, since install · 9 days, **OUT 0 B · IN 0 B**, **CONNECTIONS 0 this session**, allowlist "none · the app has no internet permission", **TRACKERS 0** | `102-vc8-proof.png` |

"since install · 9 days" and the surviving chat history confirm the update preserved app data.

**A user-visible consequence of the Fast finding:** after every version update the vault will tell the user that
Fast needs a 1.2 GB download from Google Play, when in fact the pack is already on the device and comes back
instantly. Worth a card.

**F28 passes, F27 does not.** Finish a turn, background 3 s later, return, new chat → no "Paused while Inborn was
in the background" banner (F28, PASS). But the F27 TAB focus trap on an empty chat **reproduces on this phone**,
against the README's round-13 claim that it was not reproducible: sixteen consecutive TAB stops inside the
suggestion chips with `composer-input` present in the tree throughout. Full ring in
`docs/qa/soak-run-4-2026-09-21.md`.

The soak that follows this sanity is `docs/qa/soak-run-4-2026-09-21.md`: **48 F33 pop cycles, 48 OK, one process
for 5 h 39 min, zero Inborn crashes — and `dumpsys dropbox` still holds only the two versionCode 7 crash entries
and none for versionCode 8.**

## L. Play internal release versionCode 9 (fixes-r15 + fixes-r16) and the real vc8 → vc9 update path on the 6T — 21.9.2026 11:52–12:39

Built from `main` f27a8c5 (merge of fixes-r15: Android bundle without iOS binaries, the F27 TAB trap, Play packs kept
across updates; on top of fixes-r16) in a fresh worktree `android-vc9`, so the prebuild was clean by construction —
no `android/` directory existed and the build script removes one anyway. `pn install --frozen-lockfile`,
`scripts/check-store-env.sh` → "store env clean: no EXPO_PUBLIC_* dev switch set", prebuild with
`INBORN_MODELS_DIR=…/.models INBORN_PACKS=instant,fast INBORN_VERSION_CODE=9`. Gradle `bundleRelease --no-daemon
-PreactNativeArchitectures=arm64-v8a -Dorg.gradle.jvmargs="-Xmx8g -XX:MaxMetaspaceSize=1g"` with a private
`GRADLE_USER_HOME` in the session scratch (APFS clone of `~/.gradle-pr2`): **BUILD SUCCESSFUL in 3 m 21 s**, 1105
actionable tasks, 1105 executed. `gradlew --stop` was never run. `pgrep -fl xcodebuild` was empty before gradle
started and no xcodebuild ran beside it.

| check | result |
|---|---|
| AAB | `app/build/outputs/bundle/release/app-release.aab`, **1,870,641,095 bytes** (vc8 was 2,092,078,443) |
| sha256 | `67cc2aad9687596a7ba416b02e3f79a97cb3f70fbdaac1c8d35394455a4beb58` |
| signer | `CN=Inborn Upload Key, O=Inborn, C=IL`, SHA-256 `E7:02:C9:A9:…:ED:CD` |
| `bundletool validate` (`.tools/bundletool-all-1.18.3.jar`, sha256 `a099cfa1…028e29`) | **OK**; `inborn_model` **fast-follow** (`Qwen3.5-0.8B-Q4_K_M.gguf` 532,517,120 B) and `inborn_model_fast` **on-demand** (`Qwen3.5-2B-Q4_K_M.gguf` 1,280,835,840 B), both byte-identical to vc6, vc7 and vc8 |
| **entries under `base/assets/ios`** | **0** — round 15 finding A holds in the shipped artifact (vc8 had 257) |
| module sizes, uncompressed | base 197,537,563 B / 1451 entries · `inborn_model` 532,518,071 B · `inborn_model_fast` 1,280,836,794 B · 2,063,211,981 B over 1491 entries in total |
| `base/assets` | 12,720,769 B / 118 entries (vc8: 451,697,441 B) |
| manifest | `versionCode="9" versionName="1.0.0"`, package `com.inbornapp.mobile`, minSdk 26, compileSdk 36 |
| module registry (dex strings, `base/dex/classes*.dex`) | AssetPacks, DeviceGuard, DocExtract, HardwareKeys, ReadAloud, SecureScreen, ShareTarget, TrafficMeter, VaultNative — all nine |
| `scripts/check-android-permissions.sh` | "OK: no INTERNET permission; every declared permission is in the allowlist (9 declared)." |
| the round 14/15/16 fixes are in the artifact | the Hermes bundle inside the AAB carries `removeClippedSubviews` (r14), `nextFocusForward` (r15 F27), `requestKnownPacks` (r15 pack retention) and `planDocsTurn` / `documents.noneAttached` (r16); the dex carries the `dangerouslyForceOverride` / `enableCustomFocusSearchOnClippedElementsAndroid` strings of `withScrollFocusEscape` |
| upload | `--next-version-code` returned **9** before the upload; edit `09099726880344100841`, bundle versionCode 9 with **the same sha256 as the local file**, track `internal` release **"1.0.0 (9)"** `completed` |

`play-upload.mjs` names a release after its versionCode unless `--name` is passed, so the first commit produced a
release called "9"; a second edit, `16893204149433844248`, renamed it **"1.0.0 (9)"** to match vc3 … vc8.

### The vc9 bundle ships no Tesseract OCR data

`unzip -l` of the AAB finds **zero** `traineddata` entries, and `base/assets` is 12,720,769 B against the
17,792,265 B round 15 recorded — the 5.07 MB difference is exactly `eng.traineddata` (4,113,088 B) plus
`heb.traineddata` (961,404 B). `DocExtractModule.kt:171` reads the data with `assets.list("tessdata")`, so on vc9
`bundledLanguages()` is empty and `tessFor` fails `ERR_NO_OCR`: **OCR of scanned PDFs and images is unavailable on
this build**, where vc8 had it.

The cause is in `main`, not in this release. Round 15 replaced the `ocr/` assets source root with a `Sync` task
staging the one named path, registered as
`assets.srcDir(stageTessData.map { it.destinationDir })` (`apps/mobile/modules/doc-extract/android/build.gradle`).
That provider does not carry the task dependency: in this build `:doc-extract:stageOcrTessData` **never ran** (0
lines in `gradle.log`), `:doc-extract:mergeReleaseAssets` ran over an empty directory, and
`modules/doc-extract/android/build/generated/ocrAssets` was never created. `.models/ocr/tessdata/` holds both files
and the module logged no "no OCR data at …" warning, so the path resolved — only the staging never happened.

Round 15 never proved the final formulation from clean. Its `build-release.log` ran `stageOcrTessData` under the
*first* formulation and failed `:doc-extract:generateReleaseLintModel` validation; after the change to
`assets.srcDir(provider)` every later log (`build-release2.log`, `build-verify.log`, `c-build-vc9fixed.log`) has zero
`stageOcrTessData` lines and shows `:doc-extract:mergeReleaseAssets UP-TO-DATE`, reusing the staged output the first
run had left on disk. `rm -rf android` does not clear `modules/doc-extract/android/build`, so that worktree kept it;
a fresh worktree has nothing to reuse. Fix belongs in a round 17: make the merge and lint tasks depend on the Sync
task explicitly.

### The real Play update path, vc8 → vc9, on the OnePlus 6T

Round 15 uninstalled Inborn from the phone, so the vc8 baseline was rebuilt **through the Play Store app** rather
than with adb: `market://details?id=com.inbornapp.mobile` → Install (278 MB offered), base APK 246,433,498 B and
277,778,188 B in total, `versionCode=8` installed by `com.android.vending` at **11:57:38**. Onboarding was walked
with keys only: Instant delivered as a fast-follow pack ("Delivering INSTANT · 508 MB", done by 11:58:47), the
"Prove it to yourself" step answered **"17 times 23 equals 391."** on INSTANT with **OUT 0 B · IN 0 B**, and the
lock step was passed without enabling anything. Fast was then installed from the vault — confirm sheet "Download
Fast? Google Play will download 1.2 GB. Inborn itself opens no connection." → Download, "Delivering FAST · 1.19 GB",
vault **"1.7 GB in the vault"** at 12:06 — and Fast answered "Three colours are red, blue, and green." in 14 s.

vc9 was uploaded at 12:12 and the Play page offered Update within minutes. The first press, **12:16:56**, produced
the section-K symptom, `AssetModuleException: Request to PGS failed because all packs are unavailable`; the second,
**12:17:59**, went straight through. vc9 was installed by `com.android.vending` at **12:24:02** —
`firstInstallTime` stayed **11:57:38** and `lastUpdateTime` moved to 12:24:02, so this was an update in place, no
uninstall, and the chat database, the Pro entitlement and both model packs are the ones vc8 left behind. Play's own
processing cost **6 minutes** here, not the half hour vc8 needed.

**Round 15 finding C is proven on the real update path.** Nothing was tapped in the vault.

| step | result | evidence |
|---|---|---|
| cold launch after the update | opens straight to chat — Chats · SEALED · INSTANT, the "This is AI running on your phone" notice, the empty chat and the composer. **No onboarding, no lock prompt.** pid 28601 | `20-vc9-launch.png` |
| About | **VERSION 1.0.0 (9)**, commit **f27a8c59b3b6** = `main` f27a8c5 | `23-vc9-about.png` |
| **the vault after the update** | **"1.7 GB in the vault · 14 GB free"**, Fast reads **Loaded · In use**, and there is **no `install-fast` node and no "Install" text anywhere on the screen**. vc8 in section K showed "508 MB in the vault" and an `install-fast` offer of "Install · 1.2 GB from Google Play" at this exact point | `21-vc9-vault.png`, `vault-vc9.xml` |
| what did it, in the log | opening the vault fired `AssetPackServiceImpl : onRequestDownloadInfo()` at **12:26:01**; **two seconds later**, 12:26:03, `[inborn] engine model fast from file:///data/data/com.inbornapp.mobile/files/assetpacks/inborn_model_fast/9/9/assets/Qwen3.5-2B-Q4_K_M.gguf` — the versionCode-9 path, reached with no download. A 1.2 GB fetch cannot happen in two seconds; `requestKnownPacks` re-bound bytes that were already on the phone | `logcat-update.txt` |
| chat on Fast | chip **FAST**, "Name three colours." answered in 15 s, `content-desc="FAST · ON-DEVICE AI · The three colours are red, blue, and green."` | `24-vc9-fast-answer.png` |
| proof (`inborn://proof`) | **SEALED · ON-DEVICE**, since install · 0 days, **OUT 0 B · IN 0 B**, **CONNECTIONS 0 this session**, allowlist "none · the app has no internet permission", **TRACKERS 0** | `22-vc9-proof.png` |
| paywall (`inborn://paywall`) | **YOU OWN PRO** — "Unlocked on every device that uses this Google Play account."; Work card "PRO FOR WORK · ₪149.90 · one-time purchase"; Restore purchases present | `22-vc9-paywall.png` |

`inborn://about` is not a route ("That screen does not exist."); About is reached from the bottom of Settings.

**F27 is fixed on the floor device.** The trap section K reproduced on vc8 — sixteen consecutive TAB stops inside the
suggestion chips — is gone. Eighteen TABs on a fresh empty chat give two identical nine-stop rings and reach
`composer-input` at tab 9 and again at tab 18: `open-chats → model-chip → attach → mic → (notice) Dismiss →
suggestion-summarize → suggestion-translate → suggestion-draft → composer-input`. Six non-chip stops follow the
first chip, where vc8 had zero. **F28 still passes**: no "Paused while Inborn was in the background" banner on the
returned chat or on a new one.

The soak that follows this sanity is `docs/qa/soak-run-5-2026-09-21.md`.

## M. Play internal release versionCode 10 (fixes-r17) and the vc9 → vc10 update path on the 6T — 21.9.2026 15:05–15:58

The release that puts the Tesseract OCR data back into the Android bundle. Root cause, fix and the artifact table are in
README "Fixes round 17"; this section records the release and what the phone did.

**Build.** Fresh worktree `fixes-r17` off `origin/main` (7c1d47d), `pn install --frozen-lockfile`, `.models` symlinked to
`/Users/moshecohen/dev/inborn/.models`, no `android/` directory and `modules/doc-extract/android/build` removed so nothing
stale could be reused — the mistake that invalidated round 15's proof. `scripts/check-store-env.sh` clean, prebuild with
`INBORN_MODELS_DIR=…/.models INBORN_PACKS=instant,fast INBORN_VERSION_CODE=10`, then `bundleRelease --no-daemon
-PreactNativeArchitectures=arm64-v8a -Dorg.gradle.jvmargs="-Xmx8g -XX:MaxMetaspaceSize=1g"` with a private
`GRADLE_USER_HOME` (APFS clone of `~/.gradle-pr2`) in the session scratch. **BUILD SUCCESSFUL in 3 m 29 s**, 1107
actionable tasks, 1107 executed, `:doc-extract:stageOcrTessData` and `:doc-extract:verifyOcrAssets` both present.
`gradlew --stop` was never run; `pgrep -fl xcodebuild` was empty before it started and no xcodebuild ran beside it.

| check | result |
|---|---|
| AAB | `app/build/outputs/bundle/release/app-release.aab`, **1,873,100,969 bytes** (vc9 was 1,870,641,095) |
| sha256 | `593cbb5e297183824eeb746fed3af26b1b01b5d7030196043918508b86cddbda` |
| signer | `CN=Inborn Upload Key, O=Inborn, C=IL`; `jarsigner -verify` → "jar verified" |
| **`traineddata` entries** | **2** — `base/assets/tessdata/eng.traineddata` 4,113,088 B, `heb.traineddata` 961,404 B (vc9 had none) |
| **entries under `base/assets/ios`** | **0** |
| `scripts/check-android-bundle.sh` | **exit 0** on this AAB; **exit 1** on the shipped vc9 AAB, naming both missing language files |
| `bundletool validate` (`.tools/bundletool-all-1.18.3.jar`) | **OK**; `inborn_model` fast-follow (532,517,120 B) and `inborn_model_fast` on-demand (1,280,835,840 B), both byte-identical to vc6…vc9 |
| module sizes, uncompressed | base 202,611,998 B / 1453 entries · `inborn_model` 532,518,071 B · `inborn_model_fast` 1,280,836,794 B |
| `base/assets` | 17,795,262 B / 120 entries (vc9: 12,720,769 B / 118) — the delta is the two language files plus one byte in `app.config` |
| manifest | `versionCode="10" versionName="1.0.0"`, package `com.inbornapp.mobile`, minSdk 26, compileSdk 36 |
| module registry (dex strings) | AssetPacks, DeviceGuard, DocExtract, HardwareKeys, ReadAloud, SecureScreen, ShareTarget, TrafficMeter, VaultNative — all nine |
| `scripts/check-android-permissions.sh` | "OK: no INTERNET permission; every declared permission is in the allowlist (9 declared)." |
| gates | `pnpm typecheck`, `pnpm test` (core 461, mobile 169, i18n 10, ui 11) and `pnpm lint` all exit 0 |

**Upload.** `--next-version-code` returned **10**; edit **`15899917972752807139`**, bundle versionCode 10 with the same
sha256 as the local file, track `internal` release **"1.0.0 (10)"** `completed`. `--name "1.0.0 (10)"` was passed on the
upload, so unlike vc9 no second edit was needed to rename the release.

**The vc9 → vc10 update path, through the Play Store app.** The 6T (`REDACTED-6T`) started with Play's vc9, app
force-stopped, on its launcher. `market://details?id=com.inbornapp.mobile` offered **Update** at 15:21:43 and the download
started within 30 s; no wait for the packs to publish was needed. `versionCode=10` at **15:27:43**,
`installerPackageName=com.android.vending`, `lastUpdateTime=2026-09-21 15:27:25`, `firstInstallTime` still 11:57:38 (the
vc8 install from section L), so this was an update in place and nothing was uninstalled.

- **About** reads **1.0.0 (10)** with the short hash **`ed3636aa25ed`** (`docs/qa/fixes-r17/a-01`), the commit the bundle
  was built at.
- **Fast survived the update** (round 15 finding C, now on the real Play path a second time): the vault reads
  **"1.7 GB in the vault · 15 GB free"**, the FAST card is **Loaded · In use**, and the whole accessibility tree of the
  vault screen has no Download, Install or Delivering node (`a-02`). The Instant fast-follow pack was re-delivered by Play
  right after the update (`onNotifyModuleCompleted(inborn_model)`, 532,558,250 B). Fast then answered **"Here are three
  colours: 1. Red 2. Blue 3. Green"** in 16 s (`a-03`), loading from
  `files/assetpacks/inborn_model_fast/10/10/assets/Qwen3.5-2B-Q4_K_M.gguf` in 35 ms.
- **The OCR data is on the phone.** `base.apk` pulled from `/data/app/…` (70,243,831 B, `aapt2 dump badging` →
  `versionCode='10'`) carries `assets/tessdata/eng.traineddata` and `heb.traineddata`, and their sha256 —
  `7d4322bd…70b2` and `11f9e43a…04db` — are identical to `.models/ocr/tessdata` and to the uploaded AAB. That path is
  exactly what `DocExtractModule.kt:171` `assets.list("tessdata")` reads.
- **The OCR *run* is blocked on the internal build, for an unrelated reason.** A 1650 × 1200 300-dpi scanned-style PNG
  (three English lines, one Hebrew line, grain and a 0.4° skew; `b-00`) was pushed to the phone and shared in with
  `ACTION_SEND`. It opened a fresh chat with the file attached (`b-01`) and was imported into the library, but the row
  says **"Install the document index model first."** and its details read **PASSAGES 0 · OCR PAGES 0 · INDEX MODEL —**
  (`b-02`, `b-03`). Indexing is what calls OCR, and it needs `embed-nomic` (262 MB), delivered on Android as the
  `inborn_model_embed` Play pack, which `INBORN_PACKS=instant,fast` leaves out of the bundle: pressing "Install · 262 MB"
  logs `AssetPackServiceImpl: onError(-2)` (MODULE_UNAVAILABLE). The question "Which locker holds the storeroom key" was
  therefore answered from the model's own weights, not from the page — correct behaviour for an unindexed attachment, and
  no evidence either way about OCR. vc8 and vc9 list the same three modules in `bundletool validate`, so no internal build
  has ever been able to reach OCR. **An internal build with `INBORN_PACKS=instant,fast,embed` is needed to prove it on a
  device.**
- **F27** (hardware-keyboard escape from the empty chat's suggestion chips) on vc10: from `composer-input`, 12 TAB presses
  with one serialised `uiautomator dump` each walk `… suggestion-summarize → suggestion-translate → suggestion-draft →
  composer-input → open-chats → model-chip → attach`. Four non-chip stops after the first chip, the composer reached at
  tab 9 — **PASS** (`c-01`). The driver's DPAD escape still works.
- **F33 × 5** (HOME → 60 s → launcher relaunch → `inborn://vault` → BACK, on a chat with six messages): all five cycles
  **OK**, pid **6579** unchanged through every one, `fatal_delta=0` and `procdied_delta=0` each time. Across the whole
  103,496-line app log and 774-line events log of the run: **0 `FATAL EXCEPTION`, 0 `am_proc_died` for the app, 0 ANRs.**

**State left behind.** The imported test document was deleted from the library (Documents reads "No documents · 0 B on this
device"), and the pushed PNG and its MediaStore row were removed from `/sdcard/Pictures`. The four chats the run created
were left. The 6T holds only `com.inbornapp.mobile`, **Play versionCode 10**, Instant and Fast packs present, Pro owned;
the app is force-stopped and the phone is on its launcher. Nothing was uninstalled, no setting was changed, the phone was
never locked or unlocked.

## N. Play internal release versionCode 11 (the embed pack) and the OCR proof on the 6T — 21.9.2026 16:06–17:00

The release that puts the document index model into the Android bundle, so document indexing and the OCR of scans are
reachable from a Play install for the first time. Round 17 (section M) found every internal build so far was made with
`INBORN_PACKS=instant,fast`, which leaves `inborn_model_embed` out: "Install · 262 MB" on the Documents screen answered
`AssetPackServiceImpl: onError(-2)` (MODULE_UNAVAILABLE).

**Build.** Fresh worktree `android-vc11` off `origin/main` (50b50f5), `pn install --frozen-lockfile`, `.models` symlinked
to `/Users/moshecohen/dev/inborn/.models`, no `android/` directory and `modules/doc-extract/android/build` removed.
`scripts/check-store-env.sh` clean, prebuild with `INBORN_MODELS_DIR=…/.models INBORN_PACKS=instant,fast,embed
INBORN_VERSION_CODE=11` — which declared three pack modules, each asset a symlink into `.models` — then `bundleRelease
--no-daemon -PreactNativeArchitectures=arm64-v8a -Dorg.gradle.jvmargs="-Xmx8g -XX:MaxMetaspaceSize=1g"` with a private
`GRADLE_USER_HOME` (APFS clone of `~/.gradle-pr2`) in the session scratch. **BUILD SUCCESSFUL in 3 m 30 s**, 1108
actionable tasks, 1108 executed. `gradlew --stop` was never run; `pgrep -fl xcodebuild` was empty before it started and
no xcodebuild ran beside it.

| check | result |
|---|---|
| AAB | `app/build/outputs/bundle/release/app-release.aab`, **2,125,769,716 bytes** (vc10 was 1,873,100,969; the delta is the embed pack) |
| sha256 | `738a0935bea34ce7e3f687bd687e9d78d5f8416f080f339b62da9bd323181818` |
| signer | `CN=Inborn Upload Key, O=Inborn, C=IL` (SHA-256 `E7:02:C9:A9:…:ED:CD`); `jarsigner -verify` → "jar verified" |
| **asset packs** | **three** — see the pack table below (vc8…vc10 had two) |
| `traineddata` entries | **2** — `base/assets/tessdata/eng.traineddata` 4,113,088 B, `heb.traineddata` 961,404 B |
| entries under `base/assets/ios` | **0** |
| `scripts/check-android-bundle.sh` | **exit 0** on this AAB; **exit 1** on the shipped vc10 AAB, naming the missing `inborn_model_embed` |
| `bundletool validate` (`.tools/bundletool-all-1.18.3.jar`) | **OK** |
| module sizes, uncompressed | base 202,612,260 B / 1453 entries · `inborn_model` 532,518,071 B · `inborn_model_fast` 1,280,836,794 B · `inborn_model_embed` 274,291,515 B |
| `base/assets` | 17,795,396 B / 120 entries (vc10: 17,795,262 B / 120 — one byte of `app.config`, the new commit hash) |
| manifest | `versionCode="11" versionName="1.0.0"`, package `com.inbornapp.mobile`, minSdk 26 |
| commit baked into `app.config` | `50b50f5a0dc0` — what About shows |
| module registry (dex strings) | AssetPacks, DeviceGuard, DocExtract, HardwareKeys, ReadAloud, SecureScreen, ShareTarget, TrafficMeter, VaultNative — all nine |
| `scripts/check-android-permissions.sh` | "OK: no INTERNET permission; every declared permission is in the allowlist (9 declared)." |
| gates | `pnpm lint`, `pnpm test` (core 461, mobile 169, i18n 10, ui 11) and `pnpm typecheck` all exit 0 |

| asset pack | delivery | asset | uncompressed |
|---|---|---|---|
| `inborn_model` | fast-follow | `Qwen3.5-0.8B-Q4_K_M.gguf` | 532,518,071 B |
| `inborn_model_fast` | on-demand | `Qwen3.5-2B-Q4_K_M.gguf` | 1,280,836,794 B |
| **`inborn_model_embed`** | **on-demand** | `nomic-embed-text-v1.5.f16.gguf` | **274,291,515 B** |

The embed pack's GGUF in the AAB is byte-identical to `.models/nomic-embed-text-v1.5.f16.gguf` (sha256 `f7af6f66…`), and
both `traineddata` files still carry the round-17 digests (`7d4322bd…`, `11f9e43a…`).

**Upload.** `--next-version-code` returned **11**; edit **`08321992585409943482`**, bundle versionCode 11 with the same
sha256 as the local file, track `internal` release **"1.0.0 (11)"** `completed`, committed.

**The vc10 → vc11 update path, through the Play Store app.** The 6T (`REDACTED-6T`) started with Play's vc10, app
force-stopped, on its launcher. The first **Update** press at **16:19:20** answered "all packs are unavailable" — Play had
not finished publishing the new pack set; the second press, **16:24:51**, started the download within a minute
(16:25:43). Play re-fetched both existing packs for the new version code (`inborn_model_fast` 1,280,876,968 B,
`inborn_model` 532,558,250 B; 1,886,676,695 B for the package). `versionCode=11` at **16:31:47**,
`installerPackageName=com.android.vending`, `lastUpdateTime=2026-09-21 16:31:31`, `firstInstallTime` still 11:57:38 (the
vc8 install from section L), so this was an update in place and nothing was uninstalled.

- **About** reads **1.0.0 (11)** with the commit **`50b50f5a0dc0`** (`docs/qa/android-vc11/a-01`), the commit baked into
  the bundle's `app.config`.
- **Fast survived the update** a third time on the real Play path: the vault reads **"1.7 GB in the vault · 15 GB free"**,
  the FAST card is **Loaded · In use**, and the vault's whole accessibility tree has no Download, Install or Delivering
  node (`a-02`). Fast loaded from `files/assetpacks/inborn_model_fast/11/11/assets/Qwen3.5-2B-Q4_K_M.gguf` in 1,667 ms.
- **The index model installs from Play — the gap vc11 closes.** The Documents screen offered **"Install · 262 MB"**
  (`b-01`); pressing it downloaded the pack (`15% · 40.7 MB of 262 MB` → `62%` → `87%`, `b-02`) and PlayCore logged
  **`AssetPackServiceImpl : onNotifyModuleCompleted(inborn_model_embed, sessionId=32)`** at 16:33:57. The embedder card
  is then gone from the screen (`b-04`) — on vc10 the same press logged `onError(-2)` MODULE_UNAVAILABLE.
- **OCR of a scan, end to end.** The round-17 fixture (1650 × 1200, 300 dpi, three English lines, one Hebrew line, grain,
  0.4° skew) was shared in with `ACTION_SEND` and attached to a fresh chat (`b-08`). Import read no text layer —
  `[documents] inborn-ocr-proof.png: needs-ocr · 1/1 pages · 0 chunks · 100 ms` — and the row offered **"Scanned. Run OCR
  on this phone?" · Run OCR** (`b-09`). Run OCR → `indexed · 1/1 pages · 1 chunks · 2211 ms` and **"Indexed · 1 passage"**.
  Details (`b-11`): TYPE **IMAGE** · PAGES **1** · PASSAGES **1** · LANGUAGE **English / Latin** · INDEX MODEL
  **embed-nomic** · **OCR PAGES 1 · tesseract** · INSTRUCTION-LIKE LINES 0.
- **The recognized text answers a question in chat.** With the scan attached, "Which locker holds the storeroom key" →
  **"According to the document [1], the storeroom key is kept in locker 47."** with the citation **`[1]
  inborn-ocr-proof.png · p.1`** (`b-13`, 40 s). "The storeroom key is kept in locker 47." exists only as pixels in the
  fixture, so the sentence came through Tesseract and the embedder.
- **A three-page PDF cites the right page.** `handbook.pdf` (the pass-7 fixture, one distinct fact per page) shared in
  warm → `indexed · 3/3 pages · 3 chunks · 5716 ms` (`b-14`). "How many crates were counted at the Reykjavik depot" →
  **"According to passage [1], the Reykjavik depot inventory was counted on March 14, 2031, and the count came to 5,842
  crates."**, citation **`[1] handbook.pdf · p.2`** (`b-15`, 77 s) — the fact and the page are both page two's.
  The library then holds both documents, indexed (`b-16`).
- **F33 × 5** (HOME → 60 s → launcher relaunch → `inborn://vault` → BACK, on a chat with six messages): all five cycles
  **OK**, pid **6903** unchanged through every one, `fatal_delta=0` and `procdied_delta=0` each time. Across the whole
  324,915-line app log and 6,755-line events log of the run: **0 `FATAL EXCEPTION`, 0 `am_proc_died` for the app,
  0 ANRs.** The three pids the run saw (19951, 6902, 6903) are the launch after the update and the two force-stops this
  run made on purpose.

**Driving note for the next round: how a file gets into the app from `adb`.** `ACTION_SEND` with a MediaStore URI
(`content://media/external/images/media/<id>`) and `--grant-read-uri-permission` imports **nothing**: the shell's grant is
never created (`dumpsys activity permissions` lists none for the app), so `ShareTargetModule.copyIntoCache` has its
`openInputStream` throw and returns null — the chat opens with no attachment and no error. Pushing the file to
`/sdcard/Android/data/com.inbornapp.mobile/files/` and sharing that `file://` URI works, cold and warm, because the app
may read its own external files directory without any permission. This is the same wall QA pass 7 hit as F29.

**State left behind.** Both test documents were deleted from the library (Documents reads "No documents · 0 B on this
device"), and the two pushed fixtures and the MediaStore row the run created were removed from
`/sdcard/Android/data/com.inbornapp.mobile/files/` and `/sdcard/Pictures`. The three chats the run created were left. The
6T holds only `com.inbornapp.mobile`, **Play versionCode 11**, Instant, Fast **and the embed pack** present, Pro owned;
the app is force-stopped and the phone is on its launcher home screen. Nothing was uninstalled, no setting was changed,
the phone was never locked or unlocked.

## O. Play internal release versionCode 12 — every asset pack, built with `INBORN_PACKS` unset — 21.9.2026 17:51–20:00

The first Android bundle that carries the **production** pack set. Every internal build before this one was made with an
`INBORN_PACKS` subset (`instant,fast` up to vc10, `instant,fast,embed` for vc11), so Sharp, Whisper and the vision
projector had never been built, uploaded or delivered to a device at all. The app has no INTERNET permission, so Play is
the only road those models can travel: a Pro user on an internal build could not reach them by any other path.

**The rule this run writes down.** A store bundle is built with `INBORN_PACKS` **unset** — which is every pack of
`ALL_PACKS` in `apps/mobile/app.config.ts`. `scripts/check-android-bundle.sh` now reads the pack list out of `ALL_PACKS`
itself (a `sed` over the `const ALL_PACKS = {` block) and fails the bundle when one of them is missing, so a new pack
cannot be added to the app without the release gate seeing it, and a subset build can no longer be uploaded by accident.
README's PAD section carries the same rule plus Play's three size limits.

**Build.** Fresh worktree `android-vc12` off `origin/main` (**bab755b**), `pn install --frozen-lockfile`, `.models`
symlinked to `/Users/moshecohen/dev/inborn/.models`, no `android/` directory and `modules/doc-extract/android/build`
removed. `scripts/check-store-env.sh` clean. Prebuild with `INBORN_MODELS_DIR=…/.models INBORN_VERSION_CODE=12` and
**no `INBORN_PACKS`**, which declared **seven** pack modules, each asset a symlink into `.models`. Then `bundleRelease
--no-daemon -PreactNativeArchitectures=arm64-v8a -Dorg.gradle.jvmargs="-Xmx8g -XX:MaxMetaspaceSize=1g"` with a private
`GRADLE_USER_HOME` (APFS clone of `~/.gradle-pr2`) in the session scratch. **BUILD SUCCESSFUL in 4 m 11 s**, 1112
actionable tasks, 1112 executed. `gradlew --stop` was never run; `pgrep -fl xcodebuild` was empty before it started and
no xcodebuild ran beside it.

Before the build, every model file `ALL_PACKS` names was confirmed present in `.models` at its catalog size — none was
missing, so no pack was skipped.

| check | result |
|---|---|
| AAB | `app/build/outputs/bundle/release/app-release.aab`, **5,117,797,242 bytes** (4.77 GiB; vc11 was 2,125,769,716) |
| sha256 | `4b8ca8c705af53ca66aae3491d5e1066645bca770ad852fc07cb8d3b34510e1b` |
| signer | `CN=Inborn Upload Key, O=Inborn, C=IL` (SHA-256 `E7:02:C9:A9:…:ED:CD`); `jarsigner -verify` → "jar verified" |
| **asset packs** | **seven** — see the pack table below (vc11 had three, vc8…vc10 two) |
| `traineddata` entries | **2** — `base/assets/tessdata/eng.traineddata` 4,113,088 B, `heb.traineddata` 961,404 B |
| entries under `base/assets/ios` | **0** |
| `scripts/check-android-bundle.sh` (extended) | **exit 0** on this AAB, all seven packs named OK; **exit 1** on the shipped vc11 AAB, naming `inborn_model_speech`, `inborn_model_vision`, `inborn_model_sharp`, `inborn_model_sharp_2` as missing |
| `bundletool validate` (`.tools/bundletool-all-1.18.3.jar`) | **OK**, rc 0 |
| module sizes, uncompressed | base 202,612,790 B / 1453 entries; the seven packs below |
| `base/assets` | 17,795,926 B / 120 entries (vc11: 17,795,396 B / 120) |
| manifest | `versionCode="12" versionName="1.0.0"`, package `com.inbornapp.mobile`, minSdk 26 |
| commit baked into `app.config` | `bab755bb1e82` — what About shows |
| module registry (dex strings) | AssetPacks, DeviceGuard, DocExtract, HardwareKeys, ReadAloud, SecureScreen, ShareTarget, TrafficMeter, VaultNative — all nine |
| `scripts/check-android-permissions.sh` | "OK: no INTERNET permission; every declared permission is in the allowlist (9 declared)." |
| gates | `pn lint` exit 0; `pn test` exit 0 (core 461, mobile 169, i18n 10, ui 11 — 651 tests) |

| asset pack | delivery | asset | asset bytes | module bytes | catalog model |
|---|---|---|---|---|---|
| `inborn_model` | fast-follow | `Qwen3.5-0.8B-Q4_K_M.gguf` | 532,517,120 | 532,518,071 | `instant` (Instant) |
| `inborn_model_fast` | on-demand | `Qwen3.5-2B-Q4_K_M.gguf` | 1,280,835,840 | 1,280,836,794 | `fast` (Fast) |
| `inborn_model_embed` | on-demand | `nomic-embed-text-v1.5.f16.gguf` | 274,290,560 | 274,291,515 | `embed-nomic` (Document index) |
| **`inborn_model_speech`** | **on-demand** | `ggml-base.bin` | **147,951,465** | 147,952,421 | `speech-whisper-base` (Voice input) |
| **`inborn_model_vision`** | **on-demand** | `mmproj-Qwen3.5-0.8B-F16.gguf` | **204,987,232** | 204,988,188 | `vision-qwen35` (Photo understanding) |
| **`inborn_model_sharp`** | **on-demand** | `Qwen3.5-4B-Q4_K_M-00001-of-00002.gguf` | **1,401,058,176** | 1,401,059,131 | `sharp` shard 1 of 2 |
| **`inborn_model_sharp_2`** | **on-demand** | `Qwen3.5-4B-Q4_K_M-00002-of-00002.gguf` | **1,339,879,904** | 1,339,880,861 | `sharp` shard 2 of 2 |

Play's limits, all met: base + install-time is **202,612,790 B** (no install-time pack) against the 4 GB cap; fast-follow
plus on-demand is **5,181,520,297 B** (4.83 GiB) against 30 GB; the largest single pack is `inborn_model_sharp` at
**1,401,058,176 B** (1.30 GiB) against the 1.5 GB per-pack cap — which is why Sharp is split into two shards, and the two
shards together are exactly the catalog's 2,740,938,080 B for `sharp`.

Every pack asset is byte-identical to its source in `.models`: `Qwen3.5-4B-…-00001` `49bd3df5…`, `-00002` `1f4a1a6d…`,
`ggml-base.bin` `60ed5bc3…`, `mmproj-Qwen3.5-0.8B-F16.gguf` `56e4c6cf…`, each sha256 the same read out of the AAB and out
of `.models`.

**Upload.** `--next-version-code` returned **12**; edit **`06260306700914179612`**, bundle versionCode 12 with the same
sha256 as the local file (`4b8ca8c7…`), track `internal` release **"1.0.0 (12)"** `completed`, committed. The upload of
4.77 GiB took about 35 minutes over 80 chunks of 64 MiB; the last chunk's response came back as a `fetch failed` once
while Play was still processing the bundle, and the uploader's own probe-and-resume retry carried it through without
re-sending what Google had already stored.

**The vc11 → vc12 update path, through the Play Store app.** The 6T (`REDACTED-6T`) started with Play's vc11, app
force-stopped, on its launcher, **15,901,540 KB (15.2 GB) free on `/data`**. The first **Update** press at **18:20:16**
answered "all packs are unavailable" — Play had not finished publishing the new pack set, the same first-attempt
behaviour vc11 saw. The second press, **18:24:48**, started the download within a minute (18:25:40). `versionCode=12` at
**18:30:58**, `installerPackageName=com.android.vending`, `lastUpdateTime=2026-09-21 18:30:40`, `firstInstallTime` still
11:57:38 (the vc8 install from section L), so this was an update in place and nothing was uninstalled.

Play re-fetched the three packs the device already had, for the new version code: `inborn_model_fast` 1,280,876,968 B,
`inborn_model_embed` 274,334,128 B and `inborn_model` (11 chunks), each ending in
`onNotifyModuleCompleted(…, sessionId=36/37/38)` between 18:31:26 and 18:31:41. The four **new** packs were not fetched
by the update — they are on-demand, and the vault has to ask for them, which is exactly what the rest of this section does.

- **About** reads **1.0.0 (12)** with the commit **`bab755bb1e82`** (`a-01`), the commit baked into the bundle's
  `app.config`.
- **Fast survived the update** a fourth time on the real Play path (round 15 finding C): the vault reads **"1.9 GB in the
  vault · 15 GB free"**, the FAST card is **Loaded · In use**, the embed card reads **Installed**, and the whole
  accessibility tree of the vault screen has **no Download, Install or Delivering node** for them (`a-02`).
- **All three new companions are offered from Play for the first time** (`b-01`, `b-02`): SHARP **"Install · 2.6 GB from
  Google Play"**, SPEECH **"Install · 141 MB from Google Play"**, VISION **"Install · 195 MB from Google Play"**. On every
  build up to vc11 these cards had no Play plan at all.

**Sharp — installed from Play, both shards, and it answers.** The first press at **18:37:36** downloaded to **48% ·
1.2 GB of 2.6 GB** and then failed at **18:40:10** with **`Could not install: -6 · Asset Pack Download Error(-6): Network
error. Unable to obtain the asset pack details.`** At that exact moment the phone's own Google account token was failing
(`Auth: ahbr: GetToken failed with status code and recovery intent: BadAuthentication`, 18:40:05–18:40:16, alongside a
Finsky storage sweep), so Play could not fetch the pack metadata. **Pressing the card again recovered it**: the retry at
**18:40:33** resumed rather than restarting and reached ready in **159 s**; `inborn_model_sharp_2` downloaded
1,321,892,683 B and logged `onNotifyModuleCompleted(inborn_model_sharp_2, sessionId=40)` at **18:44:11**. A PAD `-6` on a
multi-GB pack is worth one retry before it means anything.

- The vault line goes **1.9 GB → 4.5 GB in the vault** (`b-04`), the 2.6 GB Sharp adds.
- Pressing **Use** loaded it: `[inborn] llama.rn loaded model SHARP (sharp) from
  file:///data/user/0/com.inbornapp.mobile/files/assetpacks-joined/sharp/Qwen3.5-4B-Q4_K_M-00001-of-00002.gguf in
  **4540 ms**` — the `assetpacks-joined` directory is `playDelivery.locate`'s `linkInto`, which joins two separate Play
  packs into the one directory llama.cpp needs to find shard 2 beside shard 1. **The two-pack shard split works on a real
  Play install.**
- "Name the three primary colours and one fruit that is each of them." → **"Red: Strawberry · Blue: Blueberry · Yellow:
  Lemon"** (`b-06`).
- **Ledger** (`b-07`): MODEL **SHARP**, QUANT Q4_K, CONTEXT 142 / 4096, MS/TOKEN **1820 ms**, **TOK/S 0.5**, FIRST TOKEN
  **32,912 ms**, TOKENS 109 + 33, GENERATION **65.9 s**. The vault card estimates "~3-4 tok/s on your phone"; the measured
  rate on this 2018 phone is **0.5 tok/s**, roughly seven times slower than the card promises.

**Speech (Whisper) — the pack arrives and the app binds it; a transcription could NOT be proven.** The card installed in
**25 s** (`onNotifyModuleCompleted(inborn_model_speech, sessionId=41)` 18:51:25) and reads **Installed** (`c-01`).
`inborn://voice` then renders the **live hands-free screen** — `voice-screen`, `voice-seal`, `voice-wave`, phase
**LISTENING**, "Say something. Everything stays on this phone." — instead of the "Voice input needs the transcription
model" screen with its Open-vault button. That branch is `ready = whisperInstalled()`, i.e. `getVault().state(
"speech-whisper-base").kind === "ready"` with a real path, so **the vault resolved the model inside the Play pack**.
`RNWhisper: Loaded native library` follows.

**Transcription is blocked by a crash that has nothing to do with the packs.** `RECORD_AUDIO` was `granted=false` on this
phone, so the recorder could not open at all (`AudioRecord: AudioFlinger could not create record track, status: -1`) and
the screen sat in LISTENING forever. Granted (`pm grant`, and **revoked again afterwards** — the permission is
`granted=false` again now, as it was before), the mic path **crashes the app**, three times out of three, about 24 s after
the screen opens:

```
FATAL EXCEPTION: Thread-14
java.lang.NullPointerException: Attempt to invoke virtual method 'void android.media.AudioRecord.release()' on a null object reference
	at com.imxiqi.rnliveaudiostream.RNLiveAudioStreamModule$1.run(RNLiveAudioStreamModule.java:115)
```

The hands-free listener restarts the recorder about every 12 s; on the second or third restart `stop()` and `start()`
interleave across three threads (`AudioRecord: stop(261): mActive:1 / :0 / :0`) and the reader thread dereferences a
`recorder` that the stopping thread has already nulled. Whisper never gets asked for anything: **no whisper model load
appears anywhere in the run's 34,794 log lines**, only the JNI library. So for the speech pack this run proves
**delivery + binding**, and **NOT RUN: whisper decoding audio**, because `react-native-live-audio-stream` kills the
process before the engine is used. That crash is present on vc11 too — it is not caused by this release — and it means
dictation and hands-free are unusable on this device today, whichever build is installed.

**Vision — installed from Play and it describes a photo, but the shipped projector only fits Instant.** The card
installed in **25 s** (`onNotifyModuleCompleted(inborn_model_vision, sessionId=42)` 19:02:24) and reads **Installed**
(`d-01`); the vault line goes **4.5 GB → 4.8 GB**. A 1024 × 640 fixture — a red circle on the left, a blue square in the
middle, a green triangle on the right, nothing else — was pushed to `/sdcard/Pictures`, picked through the system photo
picker and attached to a chat (`d-02`).

| resident model | `n_embd` | `mtmd` init with `mmproj-Qwen3.5-0.8B-F16.gguf` | what the model answered |
|---|---|---|---|
| **Instant** (Qwen3.5 0.8B) | 1024 | **"Multimodal context initialized successfully"** | **"The picture shows three shapes: 1. A red circle on the left. 2. A blue square in the middle. 3. A green triangle on the right."** (`d-04`) |
| Fast (Qwen3.5 2B) | 2048 | **"Failed to initialize multimodal context with mmproj"** | "I cannot see the image you are referring to." (`d-03`) |
| Sharp (Qwen3.5 4B) | 2560 | **"Failed to initialize multimodal context with mmproj"** | not waited for (0.5 tok/s) |

The projector is loaded straight out of the pack —
`/data/data/com.inbornapp.mobile/files/assetpacks/inborn_model_vision/12/12/assets/mmproj-Qwen3.5-0.8B-F16.gguf` — so
**the vision pack itself is proven end to end**: Play delivers it, the vault binds it, llama.rn attaches it and the model
reads a picture it has never seen. Instant's ledger for that turn: 135 + 49 tokens, 13.3 tok/s, first token 49,871 ms
(the image encode), generation 53.6 s.

**But `vision-qwen35` is a 0.8B projector, and the catalog sells it as "Lets Instant, Fast and Sharp look at your photos
on this device."** Two of those three cannot load it: the embedding widths do not match, `mtmd` refuses, and the failure
is silent to the user beyond a flash — the message is sent without the picture and the model answers that it cannot see
anything. **Photo input on Android works only when Instant is the resident model.** This is a product decision for Moshe
(ship a projector per model family, or say "Instant only" on the card); it is not a packaging bug and it does not block
this release, which is the first build where the pack reaches a device at all.

**F33 × 5** (HOME → 60 s → launcher relaunch → `inborn://vault` → BACK, on a chat with six messages, Fast resident):
all five cycles **OK**, pid **18500** unchanged through every one, `fatal_delta=0` and `procdied_delta=0` each time
(19:47:54, 19:49:45, 19:51:35, 19:53:25, 19:55:15). The only `FATAL EXCEPTION` in the 60,095-line app log of that window
is at 19:41:41 in pid 10208 — the `uiautomator` driver colliding with itself
(`UiAutomationService … already registered!`), not the app. **0 ANRs.** The three `am_proc_died` entries in the
19,396-line events log are at 18:53:52, 18:56:43 and 18:58:51 — the three hands-free mic crashes above, all before F33
started.

**Disk on the 6T.**

| moment | free on `/data` |
|---|---|
| before the update | 15,901,540 KB (15.2 GB) |
| after the vc12 update | 13,690,552 KB (13.1 GB) |
| after Sharp | 13,222,364 KB (12.6 GB) |
| end of run (Sharp + speech + vision in) | 12,872,052 KB (12.3 GB) |

Removing Fast from the vault was never needed.

**State left behind.** The pushed fixture and the MediaStore row the run created are gone from `/sdcard/Pictures` (the
`Pictures/InbornQA/` folder with `house-exif.jpg`, `house.heic` and `huge.png` is the 11.9 QA run's, left untouched).
`RECORD_AUDIO` is `granted=false` again, exactly as the run found it. The resident model is **Fast**, as it was before the
run. The chats the run created were left. The 6T holds only `com.inbornapp.mobile`, **Play versionCode 12**, with
**Instant, Fast, embed, Sharp (both shards), speech and vision** installed — all six packs, 4.8 GB in the vault — Pro
owned; the app is force-stopped and the phone is on its launcher home screen. Nothing was uninstalled, no phone setting
was changed, the phone was never locked or unlocked.

## P. Play internal release versionCode 13 — rounds 15–18 on the real Play path, from a fresh install — 21.9.2026 21:54 – 22.9.2026 02:00

The release that carries the round-18 fixes to a device through Google Play: F35 (the microphone race that killed the
app about 24 s into hands-free), F36 (photo input is Instant-only and now says so), F37 (Sharp's speed estimate on
legacy chips). It is also the first run in this series that **uninstalls and installs from scratch** rather than
updating in place: the 6T was holding a locally signed release APK of `fixes-r18` (versionCode 13, debug keystore, no
packs) that round 18 left there, and that build cannot be updated over by Play.

**Build.** Fresh worktree `android-vc13` off `origin/main` (**9e1157f**), `pn install --frozen-lockfile`, `.models`
symlinked to `/Users/moshecohen/dev/inborn/.models`, no `android/` directory and `modules/doc-extract/android/build`
removed. `scripts/check-store-env.sh` clean. Prebuild with `INBORN_MODELS_DIR=…/.models INBORN_VERSION_CODE=13` and
**no `INBORN_PACKS`**, which declared **seven** pack modules, each asset a symlink into `.models`. Then `bundleRelease
--no-daemon -PreactNativeArchitectures=arm64-v8a -Dorg.gradle.jvmargs="-Xmx8g -XX:MaxMetaspaceSize=1g"` with a private
`GRADLE_USER_HOME` (APFS clone of `~/.gradle-pr2`) in the session scratch. **BUILD SUCCESSFUL in 4 m 18 s**, 1112
actionable tasks, 1112 executed. `gradlew --stop` was never run; `pgrep -fl xcodebuild` was empty before it started.
Every model file `ALL_PACKS` names was present in `.models` at its catalog size first, so no pack was skipped.

| check | result |
|---|---|
| AAB | `app/build/outputs/bundle/release/app-release.aab`, **5,117,801,881 bytes** (4.77 GiB; vc12 was 5,117,797,242) |
| sha256 | `de73d737ed2e79716f2f6286c409a416cae739a1eaebfda46e84c7ec2acabfe1` |
| signer | `CN=Inborn Upload Key, O=Inborn, C=IL` (SHA-256 `E7:02:C9:A9:…:ED:CD`); `jarsigner -verify` → "jar verified" |
| asset packs | **seven**, the same set and delivery types as vc12 — see the pack table |
| `traineddata` entries | **2** — `base/assets/tessdata/eng.traineddata` 4,113,088 B, `heb.traineddata` 961,404 B |
| entries under `base/assets/ios` | **0** |
| `scripts/check-android-bundle.sh` | **exit 0**, all seven packs named OK |
| `bundletool validate` (`.tools/bundletool-all-1.18.3.jar`) | **OK**, rc 0 |
| module sizes, uncompressed | base 202,628,026 B / 1453 entries; the seven packs below |
| `base/assets` | 17,810,826 B / 120 entries (vc12: 17,795,926 B / 120) |
| manifest | `versionCode="13" versionName="1.0.0"`, package `com.inbornapp.mobile`, minSdk 26 |
| commit baked into `app.config` | `9e1157fab9b8` — what About shows |
| module registry (dex strings) | AssetPacks, DeviceGuard, DocExtract, HardwareKeys, ReadAloud, SecureScreen, ShareTarget, TrafficMeter, VaultNative — all nine |
| `scripts/check-android-permissions.sh` | "OK: no INTERNET permission; every declared permission is in the allowlist (9 declared)." |
| gates | `pn lint` exit 0; `pn test` exit 0 (core 473, mobile 169, i18n 10, ui 11 — **663 tests**) |

**The round-18 fixes are in the artifact, not only on the branch.** The Hermes bundle inside the AAB carries
`Too slow to use on this {device}` (F37) and `{model} cannot look at photos. {seer} is the one model here that can.`
(F36); `base/dex/classes3.dex` carries `stopAndJoin` and `recordingThread`, the two symbols the F35 patch adds to
`RNLiveAudioStreamModule`.

| asset pack | delivery | asset | asset bytes | module bytes | catalog model |
|---|---|---|---|---|---|
| `inborn_model` | fast-follow | `Qwen3.5-0.8B-Q4_K_M.gguf` | 532,517,120 | 532,518,071 | `instant` (Instant) |
| `inborn_model_fast` | on-demand | `Qwen3.5-2B-Q4_K_M.gguf` | 1,280,835,840 | 1,280,836,794 | `fast` (Fast) |
| `inborn_model_embed` | on-demand | `nomic-embed-text-v1.5.f16.gguf` | 274,290,560 | 274,291,515 | `embed-nomic` (Document index) |
| `inborn_model_speech` | on-demand | `ggml-base.bin` | 147,951,465 | 147,952,421 | `speech-whisper-base` (Voice input) |
| `inborn_model_vision` | on-demand | `mmproj-Qwen3.5-0.8B-F16.gguf` | 204,987,232 | 204,988,188 | `vision-qwen35` (Photo understanding) |
| `inborn_model_sharp` | on-demand | `Qwen3.5-4B-Q4_K_M-00001-of-00002.gguf` | 1,401,058,176 | 1,401,059,131 | `sharp` shard 1 of 2 |
| `inborn_model_sharp_2` | on-demand | `Qwen3.5-4B-Q4_K_M-00002-of-00002.gguf` | 1,339,879,904 | 1,339,880,861 | `sharp` shard 2 of 2 |

Play's limits, all met: base + install-time is **202,628,026 B** against the 4 GB cap; fast-follow plus on-demand is
**5,181,526,981 B** (4.83 GiB) against 30 GB; the largest single pack is `inborn_model_sharp` at **1,401,058,176 B**
(1.30 GiB) against the 1.5 GB per-pack cap. Every pack asset is byte-identical to its source in `.models` — seven
sha256 pairs, all MATCH.

**Upload — budget two attempts on a 4.77 GiB bundle.** `--next-version-code` returned **13**. The first attempt (edit
`16968012088619458428`) sent all 5,117,801,881 bytes and then lost the session on the last chunk: the PUT at offset
5,100,273,664 came back `fetch failed`, and by the time the uploader's probe-and-resume retry reached Play the edit was
gone — `400 FAILED_PRECONDITION: This edit has expired, please create a new Edit.` Nothing was committed, so Play kept
versionCode 12 and `--next-version-code` still answered 13. vc12 hit the identical drop at the identical offset and its
retry carried it through; Play holds the connection open while it validates a bundle this size and the edit can age out
behind it, so which way it falls is luck. The second attempt, edit **`13404118910722444753`**, uploaded the bundle with
**the same sha256 as the local file**, set track `internal` release **"1.0.0 (13)"** `completed` and committed.
Pass `--name "1.0.0 (13)"`: without it the uploader names the release after the bare version code.

### The fresh Play install on the 6T

The 6T (`REDACTED-6T`) started with round 18's locally signed release APK, app force-stopped, on its launcher. It was
uninstalled at **22:18:00** (`pm uninstall` → Success), leaving **17,990,224 KB (17.2 GB)** free on `/data` and no
Inborn on the phone.

**Play's Install button ignores injected taps on this phone; keys press it.** `market://details?id=com.inbornapp.mobile`
opens the internal-test sheet ("com.inbornapp.mobile (unreviewed)", 59 MB, Install). An `input tap` on the button's own
bounds did nothing three times over, which is round 18's finding; what works is **five TAB presses from a freshly
opened page, which focus the Install node, then ENTER**. Pressed at **22:59:04**, Play began the download within
25 s. This is the missing half of round 18's note that pressing Install "is a human step" — it is not, with keys.

`versionCode=13` installed at **22:59:16**, `installerPackageName=com.android.vending`, and `firstInstallTime` equals
`lastUpdateTime` equals 22:59:16, so this is a genuine fresh install and nothing survived from any earlier build. The
**fast-follow `inborn_model` pack followed on its own**: `RESOURCE_STATUS_SUCCEEDED … size: 519450656/519450656` at
**23:00:16**, one minute after the base APK, with no action from the app or the driver.

**Onboarding**, which only a fresh install shows, ran end to end on keys: welcome (**"RUNS ON: SNAPDRAGON 845 · 8 GB"**)
→ the model step, where **"Stay on Instant only"** was taken so the rest of the vault could be installed from Play the
way a user would → the airplane test, **skipped** with its own `airplane-skip` button because this run changes no phone
setting → SEALED · ON-DEVICE → the lock step, left off → chat on INSTANT.

- **About** reads **1.0.0 (13)** with the commit **`9e1157fab9b8`** (`a-01`), the commit baked into the bundle's
  `app.config`.
- **Proof** (`a-02`) reads **SEALED · ON-DEVICE**, *since install · 0 days*, **OUT 0 B · IN 0 B**, **CONNECTIONS 0 this
  session**, allowlist "none · the app has no internet permission", Internet "none (not in the manifest)", **TRACKERS 0**.
- **Pro is owned** without a restore: the paywall reads **YOU OWN PRO**, "Unlocked on every device that uses this Google
  Play account."

**Every pack installed from Play, on this build.**

| pack | where it is offered | time to ready | evidence |
|---|---|---|---|
| `inborn_model` (Instant) | fast-follow, no user action | 60 s after the base APK | `RESOURCE_STATUS_SUCCEEDED` 23:00:16 |
| `inborn_model_fast` (Fast) | vault card `install-fast` | **114 s** (2 % · 27 MB → Loaded) | `onNotifyModuleCompleted(inborn_model_fast, sessionId=44)` 23:17:29 |
| `inborn_model_embed` (Document index) | vault, EMBEDDING section | ~ 4 min | `onNotifyModuleCompleted(inborn_model_embed, sessionId=45)` |
| `inborn_model_speech` (SPEECH) | vault, COMPANIONS | **40 s** | `…(inborn_model_speech, sessionId=46)` 23:36:47 |
| `inborn_model_vision` (VISION) | vault, COMPANIONS | **22 s** | `…(inborn_model_vision, sessionId=47)` 23:38:39 |
| `inborn_model_sharp` | vault card `install-sharp` | **376 s** for shard 1 | `…(inborn_model_sharp, sessionId=48)` 23:47:43 |
| `inborn_model_sharp_2` | joined to shard 1 by the vault | **+155 s** | `…(inborn_model_sharp_2, sessionId=49)` 23:50:18 |

Sharp was installed because the disk allowed it: `/data` never went below **12.3 GB** free. The vault then reads
**"4.8 GB in the vault · 12 GB free · RUNS ON: ANDROID-LEGACY · 8 GB"** (`b-02`), with all seven packs present — the
same 4.8 GB vc12 reached, from a fresh install this time rather than an update. The COMPANIONS offers before installing
are `b-01`: SPEECH "Install · 141 MB from Google Play", VISION "Install · 195 MB from Google Play".

Two driving notes this run adds. `v-install.sh` walks the vault's focus ring to find a card, and the **EMBEDDING** card
sits above **COMPANIONS**, so a scroll that overshoots reports an empty status while the pack is in fact downloading —
read `onNotifyModuleCompleted` from logcat, not the card, to decide a pack is in. And the vault's card status node is
only in the accessibility dump while the card is on screen, so a poll that scrolls away sees `status=[]` forever.

### The five round-15…18 proofs, on the Play build

**F37 — Sharp's card tells the truth about this phone, and the recommendation moved off it.** The vault header reads
`RUNS ON: ANDROID-LEGACY · 8 GB`. Both Sharp tiers carry **`~0.4-0.6 tok/s on your phone · Too slow to use on this
phone`** under **FITS YOUR PHONE**, with `Install · 2.6 GB from Google Play` still offered (`c-01`) — the measured vc12
rate (0.5 tok/s, 1,820 ms/token), not the old "~3-4 tok/s" promise. **`recommended-fast` is the only recommendation
node in the whole vault**: walking the entire ring from top to bottom finds `RECOMMENDED ON THIS PHONE · CHAT IN
ENGLISH` on FAST (`c-02`) and no recommendation on either Sharp.

**F27 — the hardware-keyboard ring leaves the suggestion chips.** From `composer-input` on a fresh empty chat, twelve
TAB presses with one serialised `uiautomator dump` each give a closed nine-stop ring:
`open-chats → model-chip → attach → mic → (dismiss) → suggestion-summarize → suggestion-translate → suggestion-draft →
composer-input` and then repeat. **Four non-chip stops after the first chip, the composer reached at tab 9 — PASS**
(`d-01`). The driver's DPAD escape still works.

**F36 — photo input is honest, and Instant reads the picture.** With **FAST resident**, the attach sheet disables Photo
and Camera and says **"FAST cannot look at photos. INSTANT is the one model here that can."**, with the one-tap row
**`attach-use-vision` · "Use INSTANT for photos"** (`e-01`). One press on that row loaded Instant straight out of the
Play pack: `llama.rn loaded model INSTANT (instant) from
file:///data/data/com.inbornapp.mobile/files/assetpacks/inborn_model/13/13/assets/Qwen3.5-0.8B-Q4_K_M.gguf` in
**2,313 ms**. The round-12 fixture (1024 × 640: a red circle left, a blue square centre, a green triangle right) was then
attached through the system photo picker (`e-03`, node `pending-image-0`), and llama.rn attached the projector **out of
the Play vision pack**:

```
Multimodal context initialized successfully with mmproj:
/data/data/com.inbornapp.mobile/files/assetpacks/inborn_model_vision/13/13/assets/mmproj-Qwen3.5-0.8B-F16.gguf
```

Instant's answer (`e-04`): **"The shapes in the picture are a circle, a square, and a triangle. The colors of each shape
are red, blue, and green."** So on vc13 the vision pack is proven end to end from a Play install, and the cartridge copy
matches what the engine can actually do — the VISION card now reads "Lets Instant look at your photos on this device."

**F35 — hands-free dictation stays alive on the RELEASE build.** `RECORD_AUDIO` was granted with `pm grant` for the run
and **revoked again afterwards**. `inborn://voice` renders the live hands-free screen on the release build with no
paywall and no dev stand-ins — `voice-screen`, the seal, the waveform, **LISTENING**, "Tap when you are done speaking"
(`f-01`) — which is already proof that the vault resolved whisper inside the Play speech pack (`RNWhisper: Loaded native
library`). The screen then ran **136 s on one pid (20338 → 20338)** through **five microphone open/close cycles**, and
the log shows the fixed ordering the round-18 patch produces, every time:

```
set() 00:26:39.560  start(318)  stop(318) .636/.755/.756/.762
set() 00:26:53.715  start(321)  stop(321) 00:27:05.823/.908/.910
set() 00:27:05.924  start(324)  stop(324) 00:27:18.031/.121/.122
set() 00:27:18.136  start(327)  stop(327) 00:27:30.259/.348
set() 00:27:30.xxx  start(330)  stop(330) 00:27:42.507
```

Each `stop(N)` finishes before the next `set()` opens a recorder — the opposite of the control run in round 18, where
`set()` built a new recorder while the old thread was still unwinding and the third open died. **0 `FATAL EXCEPTION`,
0 `AudioRecord.release` in 55,869 log lines**, against 3-out-of-3 deaths on vc11 and vc12 at about 24 s. The screen
ended in **ENDED** at t≈63 s, the reducer's own silence ceiling, and stayed alive and responsive for the remaining 73 s.

**NOT RUN: whisper turning speech into text.** A headless run has nobody to speak into the phone, the room is silent,
and the VAD therefore never hands whisper a segment — no whisper model-load or decode line appears anywhere in the run.
What vc13 proves is the half that was broken: the release build opens and closes the microphone repeatedly without
killing the process. Dictating real words is still a Moshe-only check.

Revoking `RECORD_AUDIO` restarts the app process, as Android always does for a runtime-permission change; the new pid
(17487) is not a crash and carries no `FATAL EXCEPTION`.

**F33 × 5 — the pop cycle.** HOME → 60 s → launcher relaunch → `inborn://vault` → BACK, on a chat with six messages:

| cycle | time | pid before → after | FATAL Δ | am_proc_died Δ | verdict |
|---|---|---|---|---|---|
| 1 | 00:39:14 | 17487 → 17487 | 0 | 0 | OK |
| 2 | 00:41:03 | 17487 → 17487 | 0 | 0 | OK |
| 3 | 00:42:51 | 17487 → 17487 | 0 | 0 | OK |
| 4 | 00:44:38 | 17487 → 17487 | 0 | 0 | OK |
| 5 | 00:46:26 | 17487 → 17487 | 0 | 0 | OK |

**OCR of a scan, again on this build.** The round-17 fixture (1650 × 1200, 300 dpi, three English lines and one Hebrew
line, grain, 0.4° skew) was shared in with `ACTION_SEND` over a `file://` URI in the app's own external files directory.
Import read no text layer — `[documents] inborn-ocr-proof.png: needs-ocr · 1/1 pages · 0 chunks · 90 ms` — and the row
offered **"Scanned. Run OCR on this phone?" · Run OCR** (`g-01`). One press: `indexed · 1/1 pages · 1 chunks · 2,670 ms`
and **"Indexed · 1 passage"** (`g-02`). Details (`g-04`): TYPE **IMAGE** · PAGES **1** · PASSAGES **1** · LANGUAGE
**English / Latin** · INDEX MODEL **embed-nomic** · **OCR PAGES 1 · tesseract** · INSTRUCTION-LIKE LINES 0. Asked in
chat, "Which locker holds the storeroom key?" → **"The storeroom key is kept in locker 47."** with the citation chip
`citation-1` (`g-03`). That sentence exists only as pixels in the fixture, so it came through Tesseract reading the base
module's `tessdata` and the embedder inside the Play `inborn_model_embed` pack.

**A driving trap worth writing down: an `adb push`ed image never reaches the system photo picker.** The picker orders by
`datetaken`, the `MEDIA_SCANNER_SCAN_FILE` broadcast on Android 11 inserts the row without parsing EXIF, and a row with
`datetaken` NULL is not shown at all — not at the top of Recent, not at the end of an album, not in Albums. `content
update` on the row is refused for the shell under scoped storage. What works is both halves together: give the file a
real EXIF capture date, then run a **full volume scan**,
`content call --uri content://media --method scan_volume --arg external_primary`, after which `datetaken` is populated
and the fixture is the first cell in Recent. The picker's own **Add (n)** button also ignores a tap at the centre of the
bounds the dump reports; it takes the press about 25 px higher, at the top edge of the button.

### The 60-minute soak

`docs/qa/soak-run-6-2026-09-21.md`: 00:47:06 → 01:47:19, prompts over Instant and Fast, a background cycle every five
minutes, three model switches, six new chats, deep-link visits to vault, settings and proof, and a `meminfo` /
`thermalservice` / `battery` sample every five minutes. **Fourteen F33 cycles, fourteen OK, one app process (pid 17487)
for 1 h 12 min, 0 `FATAL EXCEPTION` in 39,385 app-scoped log lines, 0 ANRs, 0 `am_proc_died`, and no `dumpsys dropbox`
entry for versionCode 13 at all** — the phone's newest Inborn crash record is 21.9 20:32:34, from round 18's control
run, ninety minutes before Play installed this build. PSS tracks the resident model (≈1.1–1.4 GB on Instant, ≈2.0 GB on
Fast) and comes back down when the model does, so nothing leaks across the hour. The proof screen at minute 51 still
read **OUT 0 B · IN 0 B**.

Six of the seventeen prompt turns ran past the driver's wait; none failed. Five of them are the same three-word
arithmetic question, which answers in 8 s the first time it is asked in a chat and 83–87 s on every repeat — **F38**,
which Moshe filed at 01:00 watching the phone. **vc13 predates the fix**: round 19 landed it on `main` **5338fb3**
(`packages/core/src/chat/length.ts`), three merges after the 9e1157f this bundle was built from. vc14 retests it
through Play. The sixth is Instant answering a Hebrew prompt, which its own cartridge marks **"No · Hebrew"**.

### State left behind

The 6T holds only `com.inbornapp.mobile`, **Play versionCode 13**, with **all seven asset packs** — Instant, Fast, the
document index, speech, vision and both Sharp shards, 4.8 GB in the vault — Pro owned, **12,824,988 KB (12.2 GB) free on `/data`**. The
app is force-stopped and the phone is on its launcher home screen. `RECORD_AUDIO` is `granted=false` again, as the run
found it. The pushed fixtures and the MediaStore rows this run created are gone from `/sdcard/Pictures`,
`/sdcard/Pictures/Screenshots` and the app's external files directory; the `Pictures/InbornQA/` folder is the 11.9 QA
run's and was left untouched. Both test documents were deleted from the library, which reads "No documents · 0 B on
this device" again; the chats the run created were left. Nothing else was uninstalled, no phone setting was changed,
the phone was never locked or unlocked.

**vc13 is left installed on purpose**: vc14 will arrive over it as a Play update.

## Q. Play internal release versionCode 14 — the F38 answer-length policy on the real Play path — 22.9.2026

The release that carries **round 19** (F38, `packages/core/src/chat/length.ts`) to a device through Google Play, as an
**update in place over vc13** rather than a fresh install. Round 19 was proven on an emulator with an
`INBORN_PACKS=instant` build, which cannot reach the state Moshe actually complained about — a chat that also holds an
attached document. This run retests F38 on the OnePlus 6T, on the store bundle, with every pack installed.

> Written while section P (vc13) was still on its branch; both are on `main` now, P directly above.

**Build.** Fresh worktree `android-vc14` off `origin/main` (**fc7b3ee**), `pn install --frozen-lockfile` 0, `.models`
symlinked to `/Users/moshecohen/dev/inborn/.models`, no `android/` directory and `modules/doc-extract/android/build`
removed. `scripts/check-store-env.sh` clean. Prebuild with `INBORN_MODELS_DIR=…/.models INBORN_VERSION_CODE=14` and
**no `INBORN_PACKS`**, which declared **seven** pack modules, each asset a symlink into `.models`. Then `bundleRelease
--no-daemon -PreactNativeArchitectures=arm64-v8a -Dorg.gradle.jvmargs="-Xmx8g -XX:MaxMetaspaceSize=1g"` with a private
`GRADLE_USER_HOME` in the session scratch. **BUILD SUCCESSFUL in 7 m 56 s**, 1112 actionable tasks, 1112 executed.
`gradlew --stop` was never run; `pgrep -fl xcodebuild` was empty and `ios-build-10/xcodebuild.running` absent before it
started.

| check | result |
|---|---|
| AAB | `app/build/outputs/bundle/release/app-release.aab`, **5,117,808,142 bytes** (4.77 GiB; vc13 was 5,117,801,881, +6,261) |
| sha256 | `a2b1bd0938dceaa04f392a9dd49ac10a4a7ccb06c16c2a9a996d210fd8bacd26` |
| signer | `CN=Inborn Upload Key, O=Inborn, C=IL` (SHA-256 `E7:02:C9:A9:…:ED:CD`); `jarsigner -verify` → "jar verified" |
| asset packs | **seven**, `inborn_model` fast-follow and the other six on-demand, the same set as vc12 and vc13 |
| `traineddata` entries | **2** — `base/assets/tessdata/eng.traineddata` 4,113,088 B, `heb.traineddata` 961,404 B |
| entries under `base/assets/ios` | **0** |
| `scripts/check-android-bundle.sh` | **exit 0**, all seven packs named OK |
| `bundletool validate` (`.tools/bundletool-all-1.18.3.jar`) | **OK**, rc 0 |
| module sizes, uncompressed | base 202,650,086 B / 1453 entries; the seven packs below |
| `base/assets` | 17,832,886 B / 120 entries (vc13: 17,810,826 / 120) |
| manifest | `versionCode="14" versionName="1.0.0"`, package `com.inbornapp.mobile`, minSdk 26 |
| commit baked into `app.config` | `fc7b3ee0c8ff` — what About shows |
| module registry (dex strings) | AssetPacks, DeviceGuard, DocExtract, HardwareKeys, ReadAloud, SecureScreen, ShareTarget, TrafficMeter, VaultNative — all nine |
| `scripts/check-android-permissions.sh` | "OK: no INTERNET permission; every declared permission is in the allowlist (9 declared)." |
| gate | `pn lint` exit **0** |

**Round 19 is in the artifact, not only on the branch.** The Hermes bundle inside the AAB (`base/assets/index.android.bundle`,
5,281,376 bytes) carries all four `LENGTH_INSTRUCTIONS` strings and the explicit-count line — `Answer in one to three
sentences`, `Keep the answer as short as the question allows`, `Give the whole answer the task needs`, `Answer in one or
two short spoken sentences and stop.` and `match that length` — one occurrence each. The round-17/18 strings
(`Too slow to use on this`, `cannot look at photos`) are still there too.

| asset pack | delivery | asset | asset bytes | module bytes | sha256 vs `.models` |
|---|---|---|---|---|---|
| `inborn_model` | fast-follow | `Qwen3.5-0.8B-Q4_K_M.gguf` | 532,517,120 | 532,518,071 | MATCH |
| `inborn_model_fast` | on-demand | `Qwen3.5-2B-Q4_K_M.gguf` | 1,280,835,840 | 1,280,836,794 | MATCH |
| `inborn_model_embed` | on-demand | `nomic-embed-text-v1.5.f16.gguf` | 274,290,560 | 274,291,515 | MATCH |
| `inborn_model_speech` | on-demand | `ggml-base.bin` | 147,951,465 | 147,952,421 | MATCH |
| `inborn_model_vision` | on-demand | `mmproj-Qwen3.5-0.8B-F16.gguf` | 204,987,232 | 204,988,188 | MATCH |
| `inborn_model_sharp` | on-demand | `Qwen3.5-4B-Q4_K_M-00001-of-00002.gguf` | 1,401,058,176 | 1,401,059,131 | MATCH |
| `inborn_model_sharp_2` | on-demand | `Qwen3.5-4B-Q4_K_M-00002-of-00002.gguf` | 1,339,879,904 | 1,339,880,861 | MATCH |

Play's limits, all met: base + install-time **202,650,086 B** against the 4 GB cap; fast-follow plus on-demand
**5,181,526,981 B** (4.83 GiB) against 30 GB; the largest single pack `inborn_model_sharp` at **1,401,058,176 B**
(1.30 GiB) against the 1.5 GB per-pack cap.
**Upload.** `scripts/play-upload.mjs` with the service account from the keychain, internal track, release name
**"1.0.0 (14)"**. Edit `16023054192311232036`. The 4.77 GiB resumable upload dropped its connection at offset
`5,100,273,664` — the identical offset vc13's upload failed at — and vc13's `upload-patient.mjs` probe-and-resume
recovered it after two retries. `tracks.update` then `commit` both returned 200; the internal track lists version
**14** with status `completed`, and Play's own sha256 for the artifact equals the local one.

**The update on the 6T, in place through the Play Store.** The phone (`REDACTED-6T`, Android 11) held Play's **vc13** with
all seven packs. No uninstall, no `bundletool install`, no `adb install`: the Play Store app was driven by keys only.

The Update button cannot be reached the way section P describes. P's five TABs land on a different node in this
listing; what works is TAB until the **focused node's bounds contain the Update label's bounds**, which took **seven**
TABs here, then ENTER. The first press at **02:35:48** answered *all packs unavailable* — Play had published the
bundle but not yet the packs. The second press at **02:37:09** started the download.

| stage | time |
|---|---|
| first Update press (refused, packs not published) | 02:35:48 |
| second Update press, download starts | 02:37:09 |
| Play finishes the 5,135,296,632 B package | 02:49:23 |
| `versionCode=14`, `installerPackageName=com.android.vending` | 02:49:33 |
| app relaunched, Instant pack re-delivered, vault back to 4.8 GB | 02:52:35 |

Play re-delivered **every** pack, not a delta: a new versionCode gives every asset pack a new version, so the whole
5.14 GB came down again. Between 02:49 and 02:52 the vault reported 1.8 GB and a `Delivering INSTANT · 98% of 508 MB`
banner; by 02:52:35 the banner was gone and the vault read **4.8 GB in the vault · 12 GB free**.

**The other proofs, all on the updated build.**

| proof | result | shot |
|---|---|---|
| About | **1.0.0 (14)** and commit **fc7b3ee0c8ff** | `a-01-about-1-0-0-14.png` |
| Proof screen | `SEALED · ON-DEVICE`, **OUT 0 B · IN 0 B**, `CONNECTIONS 0 this session`, allowlist `none · the app has no internet permission`, `Internet: none (not in the manifest)`, no trackers | `a-02-proof-out-0b.png` |
| every pack still installed after the update | **7 model cards, 0 `install-` nodes anywhere in the vault** — Instant `Loaded`; Fast, Sharp, embed-nomic, speech-whisper-base and vision-qwen35 all `Installed`; sharp-phi correctly `Not offered through Google Play` (it is a browser import, not one of the seven packs). `4.8 GB in the vault · 12 GB free` | `b-01-vault-top.png`, `b-02-vault-all-packs.png` |
| F33 ×5 | 5 / 5 **OK**: pid **18707** at both ends of all five cycles, `fatal_delta=0`, `procdied_delta=0` | `d-02-f33-five-cycles-ok.png` |
| F35 hands-free on the release build | alive **126 s**, pid 18707 unchanged; `voice-screen` present at every 12 s poll, phase `LISTENING` to t=53 s then `ENDED` on its own silence timeout. Mic granted by `pm grant` for the proof and **revoked after** (`granted=false`) | `d-01-f35-voice-alive.png` |

Round 15 C is the test that matters in that table: a Play update must not turn an installed pack back into an Install
offer. It did not — but Play did re-download all 5.14 GB, because a new versionCode versions every asset pack.

**F38, the headline.** vc13 (round 18, no answer-length policy) was measured on this phone on Instant before the update;
vc14 (round 19, `packages/core/src/chat/length.ts`) was measured after it, same phone, same model, same driver.
Seconds are to the last change in the answer text; words are counted from every TextView under the message, not from
`content-desc`, which carries only the first paragraph.

| scenario | vc13 seconds | vc13 words | vc14 seconds | vc14 words |
|---|---|---|---|---|
| (a) fresh chat, "What is 2 plus 2?" ×4 | 3 / 4 / 3 / 4 | 5 / 1 / 1 / 1 | 5 / 3 / 3 / 3 | 5 / 5 / 5 / 5 |
| (b) chat holding an attached document, same ask ×4 | 3 / 4 / 5 / 5 | 5 / 5 / 5 / 5 | 4 / 4 / 3 / 4 | 5 / 5 / 5 / 5 |
| (c) "…in about 200 words." | 37 | 137 | 11 / 21 | 99 / 160 |
| (d) short question, answer asked for in Hebrew | 16 | 34 | 27 | 24 |

**The honest reading: F38 changes nothing measurable in the case Moshe complained about, because that case was already
short on vc13.** Every repeat of "What is 2 plus 2?" answers in 3–5 seconds and about five words on both builds, with
and without a document attached to the chat. vc14's answers are five words every time where vc13 twice collapsed to the
bare token `4`, which is the policy's "give the answer first, then stop" reading rather than a length change.

**Soak 6's "85 second timeouts" were the driver, not the model.** Soak 6's sender called a turn complete when the last
assistant line differed from its value before the send and then held still. Two identical answers to the same question
have the same first line, so the test could never fire on a repeat and every one of them ran to the poll ceiling and was
logged as a timeout at 83–87 s. Replacing that test with the stop button plus a full-text stability fallback shows the
same question answering in 3–5 s on vc13 itself. The round-19 notes that cite those numbers as a model problem are
wrong, and this run is the correction.

**(c) is the one place the policy shows, and it needs a caveat.** The prompt was run twice on vc14. In a chat that
already held four short turns it produced **99 words in 11 s**; in a fresh chat, **160 words in 21 s**, ending on a
complete sentence with no truncation. vc13's single run produced **137 words in 37 s** in a chat that also held four
short turns. The two vc14 numbers are the honest pair: the comparable one is 99 words, the fresh-chat one is 160. All
three word counts for vc13 and for the first vc14 run were read from what the accessibility tree had on screen, which
for a long answer is less than the whole message; the 160-word figure is the only one read by scrolling the message
from its top and collecting every line, so it is the only count that is certainly complete. None of the three answers
reached 200 words, and none was cut off mid-sentence.

**(d) could not be asked in Hebrew, and the answer is not Hebrew in any useful sense.** `adb shell input text` cannot
type Hebrew and the release build has no autoprompt hook, so the question was the ASCII sentence *"Answer in Hebrew:
what is the capital of France?"* on both builds. Both answers are Hebrew-script gibberish — vc13's names Austria and
Rome, vc14's is not a sentence at all. This is Instant (Qwen3.5 0.8B) doing what its own vault card says it does: under
LANGUAGES it lists **"No · Hebrew"**. It is not an F38 result and F38 does not claim to fix it.

**Soak run 7** ran for the hour after the proofs: `docs/qa/soak-run-7-2026-09-22.md`. 26 prompts, 26 completed, **0
timeouts**, 0 send failures, 12 F33 cycles all OK, one pid for the whole hour, 0 FATAL, 0 ANR, and **no dropbox entry
belonging to versionCode 14**.

**The one process restart in the whole run was the proofs' own microphone revoke**, not a crash:
`am_kill [0,18707,com.inbornapp.mobile,0,permissions revoked]` at 03:40:52, followed 121 ms later by
`am_proc_start [0,15910,…]`. Android kills an app when a runtime permission is revoked under it. No `am_crash`, no
`am_anr`, no new dropbox entry.

**Gate:** `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm@10.34.5 lint` exit **0**.

## R. Play internal release versionCode 15 — round 20 (F39) on the real Play path — 22.9.2026

The release that carries **round 20** (F39, `isExplanatoryAsk` in `packages/core/src/chat/length.ts`) to a device
through Google Play, as an **update in place over vc14**. Round 20 was proven on an emulator with an
`INBORN_PACKS=instant` build; this run retests it on the OnePlus 6T, on the store bundle, with every pack installed —
and, unlike section Q, it measures the **vc14 baseline on the same phone before the update**, so the before/after pair
is one device, one driver, one afternoon.

**Build.** Fresh worktree `android-vc15` off `origin/main` (**c7f57c0**), `pn install --frozen-lockfile` 0, `.models`
symlinked to `/Users/moshecohen/dev/inborn/.models`, no `android/` directory and `modules/doc-extract/android/build`
removed. `scripts/check-store-env.sh` clean. Prebuild with `INBORN_MODELS_DIR=…/.models INBORN_VERSION_CODE=15` and
**no `INBORN_PACKS`**, which declared **seven** pack modules, each asset a symlink into `.models`. Then `bundleRelease
--no-daemon -PreactNativeArchitectures=arm64-v8a -Dorg.gradle.jvmargs="-Xmx8g -XX:MaxMetaspaceSize=1g"` with a private
`GRADLE_USER_HOME` in the session scratch. **BUILD SUCCESSFUL in 8 m 29 s**. `gradlew --stop` was never run;
`pgrep -f xcodebuild` was empty and `ios-build-11/xcodebuild.running` absent before it started.

| check | result |
|---|---|
| AAB | `app/build/outputs/bundle/release/app-release.aab`, **5,117,810,222 bytes** (4.77 GiB; vc14 was 5,117,808,142, +2,080) |
| sha256 | `ad27d8573c6b726ff8eed8b3f3d6fb9b5fa1c316402ba5023d7ac649f4f65cc9` |
| signer | `CN=Inborn Upload Key, O=Inborn, C=IL` (SHA-256 `E7:02:C9:A9:…:ED:CD`); `jarsigner -verify` → "jar verified" |
| asset packs | **seven**, `inborn_model` fast-follow and the other six on-demand, the same set as vc12–vc14 |
| `traineddata` entries | **2** — `base/assets/tessdata/eng.traineddata` 4,113,088 B, `heb.traineddata` 961,404 B |
| entries under `base/assets/ios` | **0** |
| `scripts/check-android-bundle.sh` | **exit 0**, all seven packs named OK |
| `bundletool validate` (`.tools/bundletool-all-1.18.3.jar`) | **OK**, rc 0 |
| module sizes, uncompressed | base 202,646,091 B / 1453 entries; the seven packs below |
| `base/assets` | 17,828,891 B / 120 entries (vc14: 17,832,886 / 120) |
| manifest | `versionCode="15" versionName="1.0.0"`, package `com.inbornapp.mobile`, minSdk 26 |
| commit baked into `app.config` | `c7f57c0ebe31` — what About shows |
| module registry (dex strings) | AssetPacks, DeviceGuard, DocExtract, HardwareKeys, ReadAloud, SecureScreen, ShareTarget, TrafficMeter, VaultNative — all nine |
| `scripts/check-android-permissions.sh` | "OK: no INTERNET permission; every declared permission is in the allowlist (9 declared)." |
| gate | `pn lint` exit **0** |

**Round 20 is in the artifact, and finding it needs UTF-16.** The Hermes bundle inside the AAB
(`base/assets/index.android.bundle`, 5,277,380 bytes) carries every literal F39 introduced — `walk me through`,
`pros and cons`, `advantages and disadvantages`, `how it works`, `how does it work`, `what's the difference`,
`difference between`, `comparison between`, `explain|explanation`, `how (?:much|many|old|far|long|tall|big|heavy)`,
`\bshould i\b[^?]*\bor\b`, and the Hebrew, Japanese, Korean and Chinese tables (`מה ההבדל`, `ספר לי על`,
`יתרונות וחסרונות`, `מה קורה אם`, `どうやって`, `어떻게`, `為什麼`) — one occurrence each. Round 19's four
`LENGTH_INSTRUCTIONS` strings and the round-17/18 strings are all still there, once each.

**The trap worth recording:** Hermes stores any string holding a non-ASCII character as **UTF-16**, and F39's three
tables all carry CJK and Hebrew. `strings`, plain `grep` and `grep -a` therefore find **none** of the ASCII halves of
those regexes and report the feature missing on a bundle that contains it. The gate
(`scratchpad/android-vc15/f39-strings.sh`) counts every literal in **both** encodings; `\bshould i\b[^?]*\bor\b` is the
one F39 literal that is pure ASCII, and it is the only one a naive grep finds.

| asset pack | delivery | asset | asset bytes | module bytes |
|---|---|---|---|---|
| `inborn_model` | fast-follow | `Qwen3.5-0.8B-Q4_K_M.gguf` | 532,517,120 | 532,518,071 |
| `inborn_model_fast` | on-demand | `Qwen3.5-2B-Q4_K_M.gguf` | 1,280,835,840 | 1,280,836,794 |
| `inborn_model_embed` | on-demand | `nomic-embed-text-v1.5.f16.gguf` | 274,290,560 | 274,291,515 |
| `inborn_model_speech` | on-demand | `ggml-base.bin` | 147,951,465 | 147,952,421 |
| `inborn_model_vision` | on-demand | `mmproj-Qwen3.5-0.8B-F16.gguf` | 204,987,232 | 204,988,188 |
| `inborn_model_sharp` | on-demand | `Qwen3.5-4B-Q4_K_M-00001-of-00002.gguf` | 1,401,058,176 | 1,401,059,131 |
| `inborn_model_sharp_2` | on-demand | `Qwen3.5-4B-Q4_K_M-00002-of-00002.gguf` | 1,339,879,904 | 1,339,880,861 |

Play's limits, all met: base + install-time **202,646,091 B** against the 4 GB cap; fast-follow plus on-demand
**5,181,526,981 B** (4.83 GiB) against 30 GB; the largest single pack `inborn_model_sharp` at **1,401,058,176 B**
(1.30 GiB) against the 1.5 GB per-pack cap.

**Upload.** `scripts/play-upload.mjs` with the service account from the keychain
(`INBORN_PLAY_SA_KEYCHAIN=store-reviews:play-service-account`), internal track, release name **"1.0.0 (15)"**.
Edit **14440618357465592616**. The 4.77 GiB resumable upload dropped its connection at offset **5,100,273,664** — the
identical offset vc13 and vc14 failed at, for the third release running — but this time `play-upload.mjs`'s own retry
recovered it and vc13's `upload-patient.mjs` was not needed. `tracks.update` then `commit` both returned 200. Read back
from a fresh edit, the internal track lists `{"name":"1.0.0 (15)","versionCodes":["15"],"status":"completed"}` and
Play's own sha256 for the artifact equals the local one.

**The update on the 6T, in place through the Play Store.** The phone (`REDACTED-6T`, Android 11) held Play's **vc14**
with all seven packs. No uninstall, no `bundletool install`, no `adb install`: the Play Store app was driven by keys
only, with section Q's containment rule — TAB until the focused node's bounds enclose the Update label's bounds.
It took **seven** TABs again, and unlike vc14 the **first** press started the download: Play had already published the
packs by the time it was pressed, about 33 minutes after the commit.

| stage | time |
|---|---|
| Update label found at `[718,630][851,687]`, focused after 7 TABs, ENTER | 07:01:18 |
| download starts (first press, no "packs unavailable") | 07:01:50 |
| `versionCode=15`, `installerPackageName=com.android.vending`, `lastUpdateTime` 07:08:28 | 07:08:39 |
| app relaunched, Instant pack re-delivered, delivery banner gone | 07:11:14 |

Play re-delivered **every** pack again, not a delta — a new versionCode gives every asset pack a new version — and the
vault was back to **4.8 GB in the vault · 12 GB free** when the banner cleared.

**The other proofs, all on the updated build.**

| proof | result | shot |
|---|---|---|
| About | **1.0.0 (15)** and commit **c7f57c0ebe31** | `a-01-about-1-0-0-15.png` |
| Proof screen | `SEALED · ON-DEVICE`, **OUT 0 B · IN 0 B**, `CONNECTIONS 0 this session`, allowlist `none · the app has no internet permission` | `a-02-proof-out-0b.png` |
| every pack still installed after the update | **zero `install-` nodes anywhere in the vault.** Fast `Loaded · In use`; Instant, embedding-nomic, speech-whisper-base, vision-qwen35 and Sharp all `Installed` with a `Use this model` button; sharp-phi correctly `Not offered through Google Play` (a browser import, not one of the seven packs). `4.8 GB in the vault · 12 GB free` | `b-01-vault-top.png`, `b-06-vault-use-vision-qwen35.png`, `b-07-vault-use-sharp.png`, `b-02-vault-all-packs.png` |
| F33 ×5 | 5 / 5 **OK**: pid **29368** at both ends of all five cycles, `fatal_delta=0`, `procdied_delta=0` | `f33-proofs.csv` |
| crash sweep over the proofs window | 13,207 app-scoped log lines, **0** FATAL/ANR/SIGSEGV/`am_crash`; **0** `am_anr` and **0** `am_proc_died` for the app in the events log | |

Round 15 C is the test that matters in that table: a Play update must not turn an installed pack back into an Install
offer. It did not.

**F39, the headline.** vc14 (round 19, no `isExplanatoryAsk`) was measured on this phone **before** the update; vc15
(round 20) **after** it, same phone, same driver, a fresh chat for every scenario. Seconds are to the last change in
the answer text; words and sentences are counted from every TextView under the message, read by scrolling the message
from its top when it is longer than one screen.

| scenario | model | vc14 s | vc14 words | vc14 sentences | vc15 s | vc15 words | vc15 sentences |
|---|---|---|---|---|---|---|---|
| "How do I set up SSH keys on my Mac?" | Instant | 9 | 59 | 4 | 5 | **64** | 2 |
| "Why is the sky blue?" | Instant | 6 | 34 | 1 | 7 | **51** | 1 |
| "What is the capital of France?" | Instant | 3 | 6 | 1 | 5 | **6** | 1 |
| "What is 2 plus 2?" (1) | Instant | 3 | 4 | 1 | 3 | **5** | 1 |
| "What is 2 plus 2?" (2) | Instant | 3 | 5 | 1 | 3 | **5** | 1 |
| "How do I set up SSH keys on my Mac?" | Fast | 12 | 66 | 3 | 12 | **93** | 5 |
| "How do I set up SSH keys on my Mac?" (second Fast sample) | Fast | — | — | — | 15 | **52** | 3 |

The Fast how-to as it appears on the phone is `c-01-f39-ssh-fast.png`.

**The honest reading: the control holds, the explanatory asks trend longer, and the size of that trend is not
established by one sample per cell.** The two short factual asks are the control and they behaved exactly as they must:
"What is the capital of France?" is one sentence and six words on both builds, and "What is 2 plus 2?" is one sentence
and about five words on both. **F39 widened the explanatory door without letting the short-ask rule go** — that is the
part this run does prove, and it is the part that could have regressed.

The explanatory asks moved the way F39 intends: on Instant the how-to goes from 59 words to 64 and the sky question
from 34 to 51, and on Fast the how-to goes from 66 words and three sentences to 93 and five. **But the last row is the
caveat that governs the rest of the table.** The Fast how-to was measured twice on vc15, fourteen minutes apart on the
same build and the same model, and answered **93 words once and 52 the other time**. vc14's 66 sits between them. A
run-to-run spread that wide is larger than every vc14→vc15 difference in the table, so these numbers establish the
*direction* and cannot establish the *magnitude*. Anyone who wants the magnitude needs repeats per cell, not one shot.

Why the effect is small at all: neither budget ever binds here. Without F39 a one-line how-to gets the `short` plan,
224 tokens; with F39 it keeps `moderate`, 512. An answer of 55–95 words spends roughly 75–130 tokens, far below both,
so what actually changes is the instruction line the model reads, not a cap it hits. That is the same shape of finding
section Q recorded for F38 and it should be read the same way.

Two things the numbers do not say. **No answer on either build produced numbered steps**; all seven how-to answers are
prose, and F39 does not promise a shape. And the answers are **wrong on both builds** — vc14's Instant answer invents
an `ssh-keygen -f <your-email>` flag, vc15's Instant answer sends the reader to `/home/[yourname]/SSH`, vc15's Fast
answer puts SSH settings in Terminal preferences, and during the mislabelled first pass one repeat of "What is 2 plus
2?" answered *"4 plus 2 equals 6."* That is small-model quality, not answer length, and F39 neither causes nor fixes it.

**Soak run 8** ran after the proofs: `docs/qa/soak-run-8-2026-09-22.md`. It is two half-hour windows, 07:52–08:22 on
Fast and 08:38–09:08 on Instant, because the first one was executed while the model switch was silently failing (see
the driver repairs below) and had to be re-run; both are reported. **26 prompts, 26 completed, 0 timeouts, 0 send
failures, 12 F33 cycles all OK, 0 FATAL, 0 ANR, no dropbox entry belonging to versionCode 15, and one process — pid
29368 — from the proofs at 07:11 through to 09:08.**

**Driver repairs this run needed, all in the session scratch copy under `android-vc15/drv/`.** Four faults cost this
run two baseline attempts, one mislabelled F39 pass and one whole soak, and are worth knowing before the next release:

1. **About one `uiautomator dump` in three is killed outright on this phone** — it prints `Killed` and exits 0, so an
   empty screen is indistinguishable from a real one. `lib.sh`'s `dump()` now retries a short result up to four times
   instead of believing it.
2. **`focus_tab` TABbed 40 times on the screen before the one it wanted.** The `inborn://chats` deep link can take well
   over the old 3 s to swap screens; `focus_tab` now waits for the wanted node to exist and gives up in seconds when it
   does not, and `s-newchat.sh` was rewritten to poll for `new-chat`, to stop pressing BACK first (BACK on the chat
   root exits the app), and to return immediately when the app is already on an untouched chat.
3. **The app can end up with no focused node at all.** Every TAB is then a no-op and every send fails at
   `focus_composer` while the screen looks perfectly normal; only `am force-stop` plus a relaunch brings the focus ring
   back. `focus_composer` now detects a dead ring and revives the app itself.
4. **The fix for (2) silently broke every model switch, and `s-model.sh` reported the failure as success.** The vault
   scrolls, so `use-instant` is genuinely absent from the accessibility tree until TAB walks it into view; the new
   "does the node exist yet" pre-check returned early and `s-model.sh` logged its old fallback line, *"no use-instant
   reachable (already in use)"*. The first F39 pass on vc15 and the **whole of the first soak** therefore ran on Fast
   while the logs claimed Instant. Both were re-run after the fix. `focus_tab`'s wait is now only a head start and
   never a verdict, and **`s-model.sh` reads the model chip back and fails loudly when it does not match**. The lesson
   is the general one: a driver step that cannot verify its own effect will eventually report a run that never
   happened.

**Gate:** `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm@10.34.5 lint` exit **0**.

## S. Play internal release versionCode 16 — the Android submission candidate from `main` 9da93a2 — 22.9.2026

The build proposed for the Android submission. Same seven-pack production bundle as vc15, rebuilt from `main`
**9da93a2** (the merge that closed the R2 CDN and spec-14f work). It was uploaded to the internal track and
**Google Play updated the OnePlus 6T in place from vc15 to vc16**; every phone row below is from that build,
delivered that way — no uninstall, no `bundletool install`, no `adb install`.

The pass ran in two sittings. The first (14:00-15:50) built, uploaded, took the Play update and proved the
About / Proof / vault / attach / F39 rows. Moshe reclaimed the phone at 15:30 and the remaining rows moved to the
Pixel 6 API 33 emulator. He freed the phone again at **16:47**, and the second sitting (16:48-18:15) took the rows
the emulator cannot answer: the vault after the update, Play billing, and soak run 9.

### Build

Worktree `android-vc16` off `origin/main` **9da93a2**, `.models` symlinked to `/Users/moshecohen/dev/inborn/.models`,
prebuild with `INBORN_VERSION_CODE=16` and **no `INBORN_PACKS`** (so all seven pack modules are declared), then
`bundleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a` with a private `GRADLE_USER_HOME` in the session
scratch.

| check | result |
|---|---|
| AAB | `app/build/outputs/bundle/release/app-release.aab`, **5,117,817,952 bytes** (4.77 GiB; vc15 was 5,117,810,222, +7,730) |
| sha256 | `5dea312ce28dab5d372a2c6c8213d31c0dee2dd1c476d5813407be4cb7d247a1` |
| signer | `CN=Inborn Upload Key, O=Inborn, C=IL` (SHA-256 `E7:02:C9:A9:…:ED:CD`); `jarsigner -verify` → "jar verified" |
| asset packs | **seven**, `inborn_model` fast-follow and the other six on-demand, byte-for-byte the vc12–vc15 set |
| `traineddata` entries | **2** — `base/assets/tessdata/eng.traineddata` 4,113,088 B, `heb.traineddata` 961,404 B |
| entries under `base/assets/ios` | **0** |
| `scripts/check-android-bundle.sh` | **exit 0**, all seven packs named OK |
| `bundletool validate` (`.tools/bundletool-all-1.18.3.jar`) | **OK**, rc 0 |
| module sizes, uncompressed | base **202,661,773 B / 1453 entries**; the seven packs unchanged from §R's table |
| `base/assets` | **17,844,575 B / 120 entries** (vc15: 17,828,891 / 120) |
| manifest | `versionCode="16" versionName="1.0.0"`, package `com.inbornapp.mobile`, minSdk **26**, targetSdk **36** |
| commit baked into `app.config` | **9da93a296bbe** — what About shows |
| module registry (dex strings) | AssetPacks, DeviceGuard, DocExtract, HardwareKeys, ReadAloud, SecureScreen, ShareTarget, TrafficMeter, VaultNative — all nine |
| `scripts/check-android-permissions.sh` | "OK: no INTERNET permission; every declared permission is in the allowlist (9 declared)." |
| gate | `pn lint` exit **0** |

Play's limits, all met: base + install-time **202,661,773 B** against the 4 GB cap; fast-follow plus on-demand
**5,181,526,981 B** (4.83 GiB) against 30 GB; the largest single pack `inborn_model_sharp` at **1,401,059,131 B**
against the 1.5 GB per-pack cap.

**Upload.** `scripts/play-upload.mjs` with the service account from the keychain, internal track, release name
**"1.0.0 (16)"**. Edit **01823738192199699579**. The resumable upload dropped its connection at offset
**5,100,273,664** — the same offset as vc13, vc14 and vc15, now four releases running — and retried twice from the
script's own recovery; `upload-patient.mjs` was not needed. Read back, the internal track lists
`{"name":"1.0.0 (16)","versionCodes":["16"],"status":"completed"}` and the commit returned.

### The Play update on the phone

Play was driven by keys only, with section Q's containment rule: TAB until the focused node's bounds enclose the
Update label's bounds. **The first press did nothing.** Play had not finished publishing the packs, the poll gave up
still on vc15, and the attempt is recorded as UNCLEAR rather than as a failure.

| stage | time |
|---|---|
| attempt 1 — Update label at `[718,630][851,687]`, focused after 6 TABs, ENTER | 14:46:38 → 14:47:01 |
| attempt 1 verdict — **UNCLEAR**, still `versionCode=15` after the poll | 14:47:33 |
| attempt 2 — same label, focused after **7** TABs, ENTER | 14:56:56 → 14:57:18 |
| download starts | 14:57:50 |
| `versionCode=16` | 15:08:55, **665 s** after the download started |

`dumpsys package` on the updated phone: `versionCode=16 versionName=1.0.0 minSdk=26 targetSdk=36`,
`installerPackageName=`**`com.android.vending`**, `lastUpdateTime=2026-09-22 15:08:50`, `firstInstallTime=2026-09-21
22:59:16`.

### On the phone — the rows

| # | proof | result | shot |
|---|---|---|---|
| S1 | About | **1.0.0 (16)** and commit **9da93a296bbe** (= `main` 9da93a2) | `a-01-about-1-0-0-16.png` |
| S2 | Proof screen | `SEALED · ON-DEVICE`, **OUT 0 B · IN 0 B**, `CONNECTIONS 0 this session`, allowlist `none · the app has no internet permission`, trackers 0 | `a-02-proof-out-0b.png` |
| S3 | F39 answer lengths, four turns | Instant "capital of France" 5 s / 6 words; Instant "SSH keys on my Mac" 5 s / **46 words**; Fast same question 14 s / **92 words**; Fast Hebrew "shalom" 13 s / 30 words, 2 sentences — an explanatory ask still gets a paragraph and a lookup still gets a line | `c-03-fast-hebrew.png`, `run/f39.csv` |
| S4 | attach sheet | opens with `attach-templates`, `attach-photo`, `attach-camera`, `attach-use-vision`, `attach-import`, `attach-strict`, `attach-manage`, the honest row *"FAST cannot look at photos. INSTANT is the one model here that can."*, and the previously imported `inborn-ocr-proof.png` listed as *Not indexed yet* | `d-01-attach-sheet.png`, `run/f36-attach-sheet.xml` |
| S5 | **every pack survived the update** | the whole vault walked in 22 screens: **zero `install-` nodes anywhere**, and a `model-status-` node for all **seven** catalog entries — instant, fast, sharp, sharp-phi, embed-nomic, speech-whisper-base, vision-qwen35. A `use-` node on instant, sharp, embed-nomic, speech-whisper-base and vision-qwen35; **fast has none because fast was the model in use**, which is the same shape the 15:11 sweep showed with the pair reversed. `4.8 GB in the vault · 12 GB free · RUNS ON: ANDROID-LEGACY · 8 GB` | `b-01-vault-top.png`, `b-02-vault-all-packs.png`, `run/vault-sweep.txt` |
| S6 | the bottom of the vault | SHARP · **Phi-4-mini 3.8B**, `2.3 GB · Q4_K_M · Battery: High`, `~0.4-0.6 tok/s on your phone · Too slow to use on this phone`, and **"Not offered through Google Play. Download the file in your browser, then import it here."** over `Import GGUF`. The one catalog entry with no Play pack behind it renders as an import offer, not as a broken install button | `b-02-vault-all-packs.png` |
| S7 | Fast's own speed claim against the measurement | the FAST card on this phone reads `1.2 GB · Q4_K_M · Battery: Medium`, **`~5-7 tok/s on your phone`**, `Loaded`, `In use`, `RECOMMENDED ON THIS PHONE · CHAT IN ENGLISH`. Soak run 9 measured Fast on this phone at **7.0–7.2 tok/s** — the top of the range the app promises. The estimate is honest on the legacy tier | `b-01-vault-top.png`, `docs/qa/soak-run-9-2026-09-22.md` |
| S8 | **paywall, real Play billing** | `inborn://paywall` draws **YOU OWN PRO** · "Unlocked on every device that uses this Google Play account.", and the Work card **PRO FOR WORK · ₪149.90 · one-time purchase** with `Upgrade to Work · ₪149.90` — shekels from Play Billing, not the USD fallback constants. Nodes `owned`, `price-inborn.work.upgrade`, `buy-inborn.work.upgrade`, `restore`, `close-paywall`. Footers: "Family Library does not include in-app purchases.", "One purchase per store…", "Play refunds a purchase the app could not confirm within 3 days." | `f-01-paywall-owns-pro.png` |
| S9 | **Restore purchases** | focused `restore` by TAB, ENTER → `paywall-status` reads **"Purchase restored"** while the card stays YOU OWN PRO | `f-02-restore-purchase-restored.png` |
| S10 | one hour of continuous use | soak run 9, see `docs/qa/soak-run-9-2026-09-22.md` | — |

### Incognito on the real phone (§5.7)

`docs/qa/spec-conformance-2026-09-22.md` marks §5.7 *"incognito: chat rows never written to the DB or the search
index"* **UNPROVEN** — correct in code, but "simulator and emulator only, never a real device". The phone was free,
so it was run here, **paired**: the same flow twice, once normal and once incognito, so the test could fail.

| # | check | result | shot |
|---|---|---|---|
| S11 | the incognito door and its toggle | `new-incognito` on the chats screen opens the new-chat sheet with `incognito-switch` **`checked="true"`** and the line *"Incognito · Not saved, no memory. Gone when you close it."*; the ordinary `new-chat` door opens the same sheet with the switch **`checked="false"`**. Both states read off the node, not assumed | `g-02-incognito-open.png` |
| S12 | an incognito turn really runs | the chat header reads **`INCOGNITO · NOT SAVED`** beside `SEALED` and `INSTANT`, and the model answered the `ZARFOLIN` prompt on screen. The session is a real chat, not a stub | `g-03-incognito-answer.png` |
| S13 | **what each chat leaves behind** | both chats are in the list **while the incognito session is alive** (`ZARFOLIN…` = 1 row, `KESTREL…` = 1 row). After `am force-stop` and a relaunch: the normal chat is **still there** and the incognito chat is **gone** — `KESTREL` 1 row, `ZARFOLIN` **0 rows** | `g-04-chatlist-after.png`, `g-05-chatlist-cold.png` |

**PASS, and the control is what makes it one.** The first attempt of this test returned INCONCLUSIVE and was thrown
away rather than reported: both codewords sat at the *end* of the prompt, the chat list truncates its title to the
first few words, and so neither chat could ever have been found — a "the incognito chat is not in the list" that
would have been true no matter what the app did. With the codeword moved to the front, the normal chat is found and
the incognito one is not, which is the only shape in which this result means anything.

One nuance the run confirms rather than contradicts: the incognito chat **is** listed while its session is live, and
disappears when the process exits. That matches the audit's own caveat that `chat/store.ts endSession()` has zero
callers, so today the guarantee is delivered by process death. This run proves the user-visible promise on real
hardware; it does not prove that closing an incognito chat *without* killing the app clears it, and that remains
open.

**No purchase was made.** The only billing action was Restore, which re-reads what this Google Play account already
owns; the Work upgrade button was never pressed and no Play payment sheet was raised.

### On the emulator — what the Pixel 6 API 33 could and could not answer

While the phone was with Moshe, the same AAB was installed on the emulator with
`bundletool build-apks --local-testing` + `install-apks` from `.tools/bundletool-all-1.18.3.jar` (`vc16.apks`,
5,369,996,479 B; `build-apks` rc 0, `install-apks` rc 0). Local testing pushes the pack APKs to
`/sdcard/Android/data/com.inbornapp.mobile/files/local_testing`; bundletool's cleanup step printed
`run-as: package not debuggable` because the APKs are release-signed, which is expected for this install mode and
did not stop it.

| # | check | result | shot |
|---|---|---|---|
| S-E1 | About on the emulator build | **1.0.0 (16)** | `e-01-about-1-0-0-16.png` |
| S-E2 | Proof screen | **OUT 0 B · IN 0 B** | `e-02-proof-out-0b.png` |
| S-E3 | airplane test | the "Prove it to yourself" screen answered `What's 17 × 23?` with **"17 times 23 is 391."** from Instant and the counter read **OUT 0 B · IN 0 B**. The screen says so itself: *"Airplane Mode is off; the counter still shows OUT 0 B."* — **Airplane Mode was never switched on**, because that is a device setting and out of bounds for this run. What this proves is the byte counter at 0 on a connected device, not the airplane path | `e-00-airplane-out-0b.png` |
| S-E4 | **device tier** | the emulator reports `RUNS ON: ANDROID-ENTRY · 4 GB` against the phone's `ANDROID-LEGACY · 8 GB`, and the same vault renders a different set of offers. **Instant** is `RECOMMENDED ON THIS PHONE`, `508 MB`, `~6-12 tok/s on your phone`. **Fast, Sharp and Sharp (Phi) are all drawn in full — cards, GOOD AT, LANGUAGES, Weak-at — and all three are gated off**: `model-card-fast` ends `1.2 GB · Q4_K_M · Battery: Medium` / **"Will not run on 4 GB"**, `model-card-sharp` `2.6 GB` / "Will not run on 4 GB", `model-card-sharp-phi` `2.3 GB` / "Will not run on 4 GB" plus "Not offered through Google Play". None of the three carries a `model-status-`, `use-` or `install-` node, so there is **no install button to press** — the 4 GB tier explains what it will not run instead of offering a download that would fail. The only installable entries are the three companions, embedding / speech / vision | `e-07-fast-gated-4gb.png`, `e-03-vault-top.png`, `e-04-vault-bottom.png`, `erun/vault-full.txt` |

A note on how S-E4 was established, because the first reading of it was wrong. The 22-screen `vault-sweep.txt`
lists no `model-status-fast` and no `model-status-sharp`, and that was first written up as "Fast does not appear on
the 4 GB tier at all". It does appear. The sweep only collects `model-status-` / `use-` / `install-` ids, and a
gated card has none of those, so its absence from that file says nothing about whether the card is drawn. A second
walk that captured **every** id and every text (`vault-full.txt`, 26 screens) found `text="FAST"`, `· Qwen3.5 2B`
and `model-card-fast` with the gate line inside it. A negative claim needs a capture that could have shown the
positive.

**Play billing on the emulator: what it can and cannot prove.** The image does carry the Play Store —
`com.android.vending`, `com.google.android.gms` and `sdk_gphone64_arm64-userdebug` — but **no Google account is
signed in** (`dumpsys account` lists 0). So `BillingClient` has a service to bind to and no account behind it, and
the paywall was opened to record exactly what the app then does rather than to assert a limitation.

| # | check | result | shot |
|---|---|---|---|
| S-E5 | paywall with no Play account | the **Free** card set, not the owned one: `buy-inborn.pro`, `buy-inborn.work`, `price-inborn.pro`, `price-inborn.work`, no `owned` node. Prices fall back to the **USD constants** — PRO **$19.99**, PRO FOR WORK **$69.99** — and the app says so on each card: **"US price shown. The store shows your local price."** `paywall-status` carries **"Purchases need a connection once. What you already own keeps working from the signed cache."** | `e-05-paywall-usd-fallback.png` |
| S-E6 | Restore with no Play account | pressed `restore`: **"Could not reach the store. Try again when you are online."** The app reports the failure and grants nothing — it does not fall through to a free entitlement and does not claim a restore that did not happen | `e-06-restore-could-not-reach-store.png` |

That is the whole of what the emulator can say about billing, and it is a real result: the fallback copy is honest
about being a US price, and an unreachable store produces an error rather than a silent grant. What it **cannot**
prove is a localized Play price, a real entitlement or a real restore — nothing there was stubbed, mocked or
recorded as a billing success. Rows S8 and S9 are the phone's, where Play Billing is real, and that is the only
place a working purchase path is claimed.

### Two honest notes on the driver

**One capture was thrown away.** `b-02-vault-all-packs.png` as first taken at 15:12 was not a vault screen at all:
it was a **Google Play subscription sheet for another of Moshe's own apps**, captured while Inborn was not in the
foreground, by a `shot.sh` that photographed whatever was on the display. It was deleted rather than committed, and
`shot.sh` now calls `fg()` first and **refuses to write into the repo unless Inborn holds window focus**. The
`b-02` in the repo is the 16:50 re-capture, taken with that guard in force.

**The ledger detector was reading the wrong answer, and soak 9 caught it in its first turn.** `s-ledger.sh` used to
TAB to "the first node whose resource-id is `ledger-toggle`", which on a chat with more than one answer is an
**older** message. Turn 1 of the first soak attempt printed a card byte-identical to the previous turn's — 11,521 ms
first token, 12.4 s generation — while the send itself had taken 8 s. The run was stopped at minute 2 and restarted.
The second attempt, matching the newest toggle by its bounds, cannot converge either: the chat list scrolls under
the focus ring and the target's bounds move between dumps. What works is one **DPAD_UP from the composer**, which
lands on the newest answer's toggle directly because the list is at the bottom whenever the composer holds focus.
Same lesson as §R's fourth note, one layer down: a driver step that cannot verify *which* object it acted on will
eventually report a measurement of something else.

## Moshe-only list (unchanged from 7.9 plus one)

1. Play payments profile banner (products cannot be sold until fixed).
2. Sandbox purchase on the iPhone: the sandbox account `tester1@example.com` is already signed in; open the paywall in a dev build and confirm the sheet once (then Restore after reinstall, airplane relaunch).
3. Family Sharing on `inborn.pro` (one-way door).
4. Submit the four IAPs with app version 1.0.
5. Regional price policy (store conversion vs the country-ratio table).

## Devices, processes

iPhone: only `com.inbornapp.mobile` (proof bundles, 5 installs) and `com.inbornapp.mobile.uitests.xctrunner` (once, Task D) installed, both uninstalled at the end; exceptions, each once and documented: `AppStore` and `PassbookUIService` killed to dismiss the stuck sandbox sheet (Task A), the DDI's `testmanagerd` killed to clear the UI-Automation passcode prompt (Task D, lead's decision); later Moshe himself enabled UI Automation (left on); nothing typed by me, phone on the home screen with no sheet or prompt (`12-final-phone.png`, 14:21). No simulator, emulator or Metro started. 6T at the end: only `com.inbornapp.mobile` (Play, versionCode 6, Instant + Fast packs) installed, the accessibility driver uninstalled, launcher home screen. xcodebuild and gradle ran one after the other, never together; gradle with `--no-daemon` in `GRADLE_USER_HOME=~/.gradle-pr2` (APFS clone).

After section L (21.9, 14:56): the 6T holds only `com.inbornapp.mobile`, **Play versionCode 9**, Instant and
Fast packs present, Pro owned; the app is force-stopped and the phone is on its launcher home screen. Nothing was
uninstalled and no setting was changed. Gradle ran once, `--no-daemon`, in a private `GRADLE_USER_HOME` inside the
session scratch; `pgrep -fl xcodebuild` was empty before it started and no xcodebuild ran beside it.

After section M (21.9, 15:58): the 6T holds only `com.inbornapp.mobile`, **Play versionCode 10**, Instant and Fast packs
present, Pro owned; the document library is empty again and the pushed scan is gone from `/sdcard/Pictures`; the app is
force-stopped and the phone is on its launcher home screen. Nothing was uninstalled and no setting was changed. Gradle ran
once, `--no-daemon`, in a private `GRADLE_USER_HOME` inside the session scratch; `pgrep -fl xcodebuild` was empty before it
started and no xcodebuild ran beside it. No emulator, simulator or browser was started and the iPhone was not touched.

After section N (21.9, 17:00): the 6T holds only `com.inbornapp.mobile`, **Play versionCode 11**, Instant, Fast and the
**embed** pack present, Pro owned; the document library is empty again and the two pushed fixtures and the MediaStore row
the run created are gone; the app is force-stopped and the phone is on its launcher home screen. Nothing was uninstalled
and no setting was changed. Gradle ran once, `--no-daemon`, in a private `GRADLE_USER_HOME` inside the session scratch;
`pgrep -fl xcodebuild` was empty before it started and no xcodebuild ran beside it. No emulator, simulator or browser was
started and the iPhone was not touched.

After section O (21.9, 20:00): the 6T holds only `com.inbornapp.mobile`, **Play versionCode 12**, with **all six packs**
installed — Instant, Fast, embed, **Sharp (both shards), speech and vision** — 4.8 GB in the vault, Pro owned; the
resident model is Fast, as before the run. The pushed image fixture and its MediaStore row are gone and `RECORD_AUDIO` is
`granted=false` again, as the run found it. The app is force-stopped and the phone is on its launcher home screen.
Nothing was uninstalled and no phone setting was changed. Gradle ran once, `--no-daemon`, in a private `GRADLE_USER_HOME`
inside the session scratch; `pgrep -fl xcodebuild` was empty before it started and no xcodebuild ran beside it. No
emulator, simulator or browser was started and the iPhone was not touched.

After section P (22.9, 02:00): the 6T holds only `com.inbornapp.mobile`, **Play versionCode 13**, with **all seven asset
packs** installed — Instant, Fast, embed, speech, vision and both Sharp shards — 4.8 GB in the vault, Pro owned,
12,824,988 KB (12.2 GB) free on `/data`. The document library is empty again, the pushed fixtures and the MediaStore rows
the run created are gone from `/sdcard/Pictures`, `/sdcard/Pictures/Screenshots` and the app's external files directory,
and `RECORD_AUDIO` is `granted=false` again, as the run found it. The app is force-stopped and the phone is on its
launcher home screen; **vc13 is left installed on purpose, because vc14 will arrive over it as a Play update**. Nothing
else was uninstalled and no phone setting was changed. Gradle ran once, `--no-daemon`, in a private `GRADLE_USER_HOME`
inside the session scratch; `pgrep -fl xcodebuild` was empty before it started and no xcodebuild ran beside it. No
emulator, simulator or browser was started and the iPhone was not touched.
After section Q (22.9, 04:50): the 6T holds only `com.inbornapp.mobile`, **Play versionCode 14**, installed by
`com.android.vending` as an **update in place** over vc13 with **all seven packs** re-delivered — Instant, Fast, embed,
Sharp (both shards), speech and vision — 4.8 GB in the vault and 12 GB free; the resident model is Instant. The OCR
fixture the F38 document case pushed to the app's external files directory is deleted; `/sdcard/Pictures/InbornQA/` is
the 11.9 run's and was left alone. `RECORD_AUDIO` is `granted=false` again, as the run found it. The app is
force-stopped and the phone is on its launcher home screen. Nothing was uninstalled, no phone setting was changed, the
phone was never locked or unlocked, and the iPhone was not touched. Gradle ran once, `--no-daemon`, in a private
`GRADLE_USER_HOME` inside the session scratch; `gradlew --stop` was never run; `pgrep -f xcodebuild` was empty and
`ios-build-10/xcodebuild.running` absent before it started. No emulator, simulator or browser was started.
