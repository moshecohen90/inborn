# Purchases run 2026-09-11 — iPhone StoreKit configuration proof, Play versionCode 3

Branch `purchases-verify` (merged with `main` at 0e4dba0). Continues `purchases-run-2026-09-06.md` (Play purchase proven on the OnePlus 11, ASC products READY_TO_SUBMIT).
Evidence: session scratch `/private/tmp/claude-501/-Users-moshecohen-dev-bibleapps/e1fec2dd-3831-49ec-a78e-d650b5c0d26b/scratchpad/purchases-r2/` (file names below; copy before the session directory is cleaned).

## Status at a glance

| Task | Result |
|---|---|
| A. StoreKit configuration on the iPhone 13 Pro (T56, T57, T21, T22) | DONE: Pro purchase, Work upgrade from Pro, Work direct, Restore (empty and after an external purchase), refund → Free; every state on screen |
| B. Play internal release versionCode 3 | DONE: AAB 1,870,499,229 bytes, all gates OK, uploaded and committed as "1.0.0 (3) internal" |
| C. OnePlus 11 fresh Play install, Instant pack without WAKE_LOCK, Restore | BLOCKED: the phone is not attached (`adb devices` shows only the OnePlus 6T) |

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

## C. OnePlus 11 (blocked)

`adb devices` at 11:20 and again before the report: only the OnePlus 6T (`REDACTED-6T`) is attached; the OnePlus 11 (`8a3120ef`) is not. Task C (fresh Play install, Instant pack extraction without WAKE_LOCK, 16 KB dialog check, Restore) is blocked on the phone. versionCode 3 on the internal track is what that run needs; the B16 open question from the README ("does blocking WAKE_LOCK stop Play Core's extraction worker") stays open.

## Moshe-only list (unchanged from 7.9 plus one)

1. Play payments profile banner (products cannot be sold until fixed).
2. Sandbox purchase on the iPhone: the sandbox account `tester1@example.com` is already signed in; open the paywall in a dev build and confirm the sheet once (then Restore after reinstall, airplane relaunch).
3. Family Sharing on `inborn.pro` (one-way door).
4. Submit the four IAPs with app version 1.0.
5. Regional price policy (store conversion vs the country-ratio table).

## Devices, processes

iPhone: only `com.inbornapp.mobile` installed (4 times, incremental proof bundles) and uninstalled at the end; system processes `AppStore` and `PassbookUIService` were killed once each to dismiss the stuck sandbox sheet (both respawn on demand, no setting touched); phone on the home screen. No simulator, emulator or Metro started. xcodebuild and gradle ran one after the other, never together; gradle with `--no-daemon` in `GRADLE_USER_HOME=~/.gradle-pr2` (APFS clone).
