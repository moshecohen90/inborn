# Purchases run 2026-09-11 — iPhone StoreKit configuration proof, Play versionCode 3

Branch `purchases-verify` (merged with `main` at 0e4dba0). Continues `purchases-run-2026-09-06.md` (Play purchase proven on the OnePlus 11, ASC products READY_TO_SUBMIT).
Evidence: session scratch `/private/tmp/claude-501/-Users-moshecohen-dev-bibleapps/e1fec2dd-3831-49ec-a78e-d650b5c0d26b/scratchpad/purchases-r2/` (file names below; copy before the session directory is cleaned).

## Status at a glance

| Task | Result |
|---|---|
| A. StoreKit configuration on the iPhone 13 Pro (T56, T57, T21, T22) | DONE: Pro purchase, Work upgrade from Pro, Work direct, Restore (empty and after an external purchase), refund → Free; every state on screen |
| B. Play internal release versionCode 3 | DONE: AAB 1,870,499,229 bytes, all gates OK, uploaded and committed as "1.0.0 (3) internal" |
| C. Fresh Play install, Instant pack without WAKE_LOCK, first answer, Proof, Restore | DONE on the OnePlus 6T as the substitute (Task E, 14:19–14:28): Play install of 1.0.0 (3), fast-follow pack extracted without WAKE_LOCK, onboarding flipped to "Instant · built in" by itself, first answer OUT 0 B, Proof sealed, YOU OWN PRO + "Purchase restored". OnePlus 11 absent; nothing remains OnePlus-11-only |
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

## Moshe-only list (unchanged from 7.9 plus one)

1. Play payments profile banner (products cannot be sold until fixed).
2. Sandbox purchase on the iPhone: the sandbox account `tester1@example.com` is already signed in; open the paywall in a dev build and confirm the sheet once (then Restore after reinstall, airplane relaunch).
3. Family Sharing on `inborn.pro` (one-way door).
4. Submit the four IAPs with app version 1.0.
5. Regional price policy (store conversion vs the country-ratio table).

## Devices, processes

iPhone: only `com.inbornapp.mobile` (proof bundles, 5 installs) and `com.inbornapp.mobile.uitests.xctrunner` (once, Task D) installed, both uninstalled at the end; exceptions, each once and documented: `AppStore` and `PassbookUIService` killed to dismiss the stuck sandbox sheet (Task A), the DDI's `testmanagerd` killed to clear the UI-Automation passcode prompt (Task D, lead's decision); later Moshe himself enabled UI Automation (left on); nothing typed by me, phone on the home screen with no sheet or prompt (`12-final-phone.png`, 14:21). No simulator, emulator or Metro started. xcodebuild and gradle ran one after the other, never together; gradle with `--no-daemon` in `GRADLE_USER_HOME=~/.gradle-pr2` (APFS clone).
