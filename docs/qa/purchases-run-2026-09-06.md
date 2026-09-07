# Purchases run 2026-09-06 — "purchases work in both stores"

Branch `purchases-verify` (worktree of `origin/main` at cbb3810). Store side done through the APIs and the consoles; device steps run one device at a time when the lead hands it over (sections 5 and 7 are filled in as they happen).
Evidence lives in the session scratch directory `/private/tmp/claude-501/-Users-moshecohen-dev-bibleapps/e1fec2dd-3831-49ec-a78e-d650b5c0d26b/scratchpad/` (file names below). Copy what you need before the session directory is cleaned.

## Status at a glance

| Step | Result |
|---|---|
| 1. Play one-time products (4) via API | DONE, all four ACTIVE, 173 regions, 6 listings each |
| 2. Play licence testers | DONE, list "Inborn licence testers" with both accounts, saved and verified after reload |
| 3. Play purchase sheet + Restore on the OnePlus 11 | sheet + test purchase DONE; **app rejects the purchase (empty Play licence key), fix on branch, re-proof pending** |
| 4. ASC products check | DONE, ids and prices right; 5 localizations added; review screenshots still missing |
| 5. iPhone StoreKit configuration run | WAITING for "iPhone free" |

## 1. Google Play one-time products

Script: `scripts/play-products.mjs` (new), auth shared through `scripts/lib/play-api.mjs` (extracted from `scripts/play-upload.mjs`, which now imports it; `--next-version-code` re-verified → 2).

- The legacy `inappproducts` endpoint answers `403 Please migrate to the new publishing API` for this app, so the script uses `monetization.onetimeproducts` (`PATCH …/onetimeproducts/{id}?allowMissing=true&regionsVersion.version=2025/03&updateMask=listings,purchaseOptions`, then `purchaseOptions:batchUpdateStates` → activate).
- Prices: US base from spec §12.1; every other region from Play's own converter (`pricing:convertRegionPrices`, tax inclusive where Play charges tax); new future regions get the converted USD/EUR "other regions" price. One purchase option `buy`, `legacyCompatible: true`, no multi-quantity.
- Idempotent: second run prints "up to date" for all four (listings and 173 regional prices compared).

Result of `node scripts/play-products.mjs --list` (INBORN_PLAY_SA_KEYCHAIN=store-reviews:play-service-account):

| productId | option | US | IL | BR | DE | JP |
|---|---|---|---|---|---|---|
| inborn.pro | buy ACTIVE | USD 19.99 | ILS 60 | BRL 104.99 | EUR 19.99 | JPY 3420 |
| inborn.pro.launch | buy ACTIVE | USD 14.99 | ILS 45 | BRL 76.99 | EUR 14.99 | JPY 2580 |
| inborn.work | buy ACTIVE | USD 69.99 | ILS 199.9 | BRL 359.99 | EUR 69.99 | JPY 12000 |
| inborn.work.upgrade | buy ACTIVE | USD 49.99 | ILS 149.9 | BRL 254.99 | EUR 49.99 | JPY 8600 |

Listings (en-US, ja-JP, de-DE, fr-FR, es-ES, pt-BR), titles keep the brand in Latin script; descriptions follow the `packages/i18n` paywall wording ("Pay once, keep forever" / "buy once" per language). Full text is in the script.

Console check (read-only, own Safari window, closed): Monetise with Play → Products → One-time products lists the four products, "Active purchase options and offers: 1" each, last updated 6 Sept 2026. Evidence: `play-products-console.png` (header; the table is below the fold, its text was read from the DOM).

Note: the spec (§12.2) says regional prices should eventually come from the Bible-apps country-ratio table (`fbcloud …/pricing.json`, Brazil ≈ 36 % of US, etc.). This run used the store conversion as instructed; switching is a one-line change in `desired()` plus that table.

## 2. Licence testers (Play Console → Settings → Licence testing)

Account-level page, so it applies to all apps. Before: email lists "License testers (auto-generated)" (4) and "Testers" (4) were selected; the members are not readable from the page text and were not opened.
Done: created email list **"Inborn licence testers"** with `tester2@example.com` and `owner@example.com`, selected it, licence response stays LICENSED, "Save changes?" → Save, "Your changes have been saved". Reloaded with the window visible: the list shows 2 users and is checked. Evidence: `lt-05-verified.png`.

Play Console traps met (added to the Play memory file): the "Create email list" button and the page's "Save changes" ignore synthetic clicks (needed a real `cliclick` with the window in front, focus handed back to Cursor right after); the email chips only form on real keystrokes; the lists table renders only while the window is visible; every save has a confirmation dialog ("Save changes? These changes will affect all of your apps").

## 3. Play purchase sheet on a device (OnePlus 11, 8a3120ef, Android 16, Moshe's phone)

Device changed by the lead from the 6T to the OnePlus 11 (Moshe's Google account is on it, so a licence-tester test purchase is possible). Pending "OnePlus 11 free".

Prep done in the console (own Safari window, closed):
- Internal track: release "1.0.0 (1) internal" is `completed` (API `edits.tracks`), bundle versionCode 1 uploaded, but the Testers tab had **no tester list selected**, so the track showed "Inactive" and nobody could install from Play. Selected the email list "Inborn licence testers" (the two accounts) on Internal testing → Testers, saved; the track now shows **Active**. Evidence: `it-01-testers.png` (before).
- Opt-in link for the testers: `https://play.google.com/apps/internaltest/4701564557913726350` (join on the web, then install from the Play Store on the phone).
- Why not the bundletool build: the 6T build was signed with the **upload key**; Play App Signing re-signs releases with Google's key, so a sideloaded upload-key build cannot complete Play Billing (signature mismatch → "item not available"). The Play Store install (or a Play-signed APK from App bundle explorer) is the only path to a real purchase sheet.

Run on the OnePlus 11 (7.9.2026, 23:57–00:15):

1. Read-only check: both licence-tester accounts (`tester2@example.com`, `owner@example.com`) are Google accounts on the phone; the Play Store's active account and Chrome's active account are both `owner@example.com`.
2. **Sideloaded build (upload-key signed), as the lead's fallback:** `bundletool build-apks --connected-device --local-testing` from the internal-track AAB, signed with the upload keystore (`scripts/play-signing-env.sh`), `adb install-multiple` of the 5 base splits, Instant pack pushed to `files/local_testing/` (Play Core local testing delivered it: `FakeAssetPackService startDownload([inborn_model])`). `inborn://paywall` opened the paywall straight from onboarding.
   - **Paywall shows the live Play prices**: Pro **₪60.00 · one-time purchase**, Pro for Work **₪199.90** (the ILS prices the API set), so `queryProductDetails` finds the four products even in a sideloaded build. Evidence: `op11/02-deeplink.png`.
   - **Tapping "Unlock Pro · ₪60.00" opened the Google Play sheet, which failed with "Error — The item that you were attempting to purchase could not be found."** (`op11/03-sheet.png`). The app then showed its own message "The purchase did not complete (item-unavailable)." and the button returned to "Unlock Pro · ₪60.00" (`op11/04-after-error.png`). Cause: Play App Signing re-signs the internal release with Google's key; a sideloaded build signed with the upload key does not match, so the purchase flow rejects the item even though pricing works. Uninstalled that build (its `Android/data` dir went with it).
3. **Play Store install path:** the invite link opened in Chrome as `owner@example.com` → "You're invited to test" → Accept invite → "You're a tester" (`op11/05-optin.png`, `06-accepted.png`). "Download test app" and `market://details?id=com.inbornapp.mobile` both showed **"Item not found"** in the Play Store for the first minutes after opting in (the invite page warns it can take a few minutes) — after ~3 minutes the internal-test listing "com.inbornapp.mobile (unreviewed)" appeared (`op11/14-listing.png`) → Install → installed from Play (`installerPackageName=com.android.vending`, versionCode 1, ~10 s; Play then delivered the Instant pack: "Delivering INSTANT · 91% of 495 MB").
4. **Real Google Play purchase sheet:** `inborn://paywall` → "Unlock Pro · ₪60.00" → Play sheet **"Inborn Pro ₪60.00 · Test card, always approves · This is a test order, you will not be charged · 1-tap buy"** (`op11/18-sheet-play.png`). Tapped 1-tap buy (allowed by the lead's rule: test card, no charge) → **"Payment successful"** (`op11/20-payment-successful.png`). Play then asked "Require authentication for purchases?"; answered "No, thanks" (keeps the phone's current setting). Order id `GPA.3381-0820-7188-37102`.
5. **BUG B-PLAY-1 (release blocker): the app refuses the successful purchase.** Paywall shows "The purchase did not complete (verification-failed)." and Pro stays locked (`op11/21-after-ok.png`); logcat: `[licence] refused inborn.pro/GPA.3381-0820-7188-37102: untrusted-root`. Root cause: `PLAY_LICENCE_PUBLIC_KEY_PLACEHOLDER` in `packages/core/src/licence/roots.ts` was `""` and the release build had no `EXPO_PUBLIC_PLAY_LICENCE_KEY`, so `verifyPlayPurchase` (play.ts:58) rejects every real Play purchase. Restore purchases fails the same way. The order stays unacknowledged (Play auto-refunds unacknowledged test orders after 3 days; no money involved).
   - Fix on this branch: the app's licensing public key (Play Console → Monetisation setup → Licensing; RSA-2048 SPKI, 392 base64 chars, validated with node `crypto.createPublicKey`) pasted into `roots.ts`. Proof requires a new build (versionCode 2) on the internal track, then Restore on the phone → "You own Pro" (pending the lead's go).


## 4. App Store Connect products (app 6809165161)

| ASC id | productId | type | USA price (proceeds) | state | family sharing |
|---|---|---|---|---|---|
| 6809166022 | inborn.pro | NON_CONSUMABLE | 19.99 (16.99) | MISSING_METADATA | off |
| 6809166306 | inborn.pro.launch | NON_CONSUMABLE | 14.99 (12.74) | MISSING_METADATA | off |
| 6809166915 | inborn.work | NON_CONSUMABLE | 69.99 (59.49) | MISSING_METADATA | off |
| 6809167088 | inborn.work.upgrade | NON_CONSUMABLE | 49.99 (42.49) | MISSING_METADATA | off |

- Ids and types match `PRODUCTS` in `packages/core/src/licence/types.ts`; prices match §12.1; base territory USA, manual price only in USA (Apple derives the other 174 territories), available in all 175 territories and in new ones.
- Localizations: only en-US existed. Added ja, de-DE, fr-FR, es-ES, pt-BR to all four (same wording as Play; Apple caps the IAP description at 45 characters, so the fr/es/pt/de-upgrade lines are the short form). All 24 localizations verified by GET.
- **What still blocks review:** every product is `MISSING_METADATA` because it has no App Store review screenshot (`appStoreReviewScreenshot` = null). Apple requires one real in-app screenshot per IAP (reviewer-only, not public). The composed store screenshots in `design/store/out/*/04-paywall.png` are marketing frames, not raw captures; the plan is to upload the real paywall screenshot taken during the iPhone step (section 5) through the API (`inAppPurchaseAppStoreReviewScreenshots` create → upload → commit). Also: the app version 1.0 is PREPARE_FOR_SUBMISSION, and the IAPs are submitted with the first app version (Moshe's action).
- Family Sharing is off on all four. Spec §12.1 wants it on for Pro; App Store Connect makes it a one-way door, so it is on Moshe's list, not done.

## 5. iPhone StoreKit configuration run

Pending "iPhone free" from the lead. Plan per the "iOS StoreKit testing headless" recipe: local StoreKit configuration in `apps/mobile/ios`, run from Xcode on the device, purchase sheet (Xcode environment) → `Transaction.currentEntitlements` → Pro unlocked → Restore; screenshots of the sheet and the unlocked state. Sandbox with a real Apple sandbox tester needs Moshe.

## 6. Moshe-only list

1. **Play payments profile:** the console shows "There is an issue with your payments profile. Contact your account owner" on the One-time products page (same banner as the 31.8 "urgent issue with your payments account"). Products cannot be sold until the account owner fixes it in the payments centre.
2. Apple sandbox tester account (Users and Access → Sandbox) for a real sandbox purchase on the iPhone; the StoreKit-configuration run does not need it.
3. Family Sharing on `inborn.pro` (one-way door, spec §12.1 says yes).
4. Submitting the four IAPs with app version 1.0 once the review screenshots are attached.
5. Decide whether Play regional prices stay on the store conversion or move to the country-ratio table (spec §12.2).

## 7. Devices, processes

Nothing started yet on any device. Safari: opened one window (id 84824) for the console, closed at the end of the console work; no other window or tab touched.
