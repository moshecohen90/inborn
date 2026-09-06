# Store questionnaires: exact answers and why

Spec basis: §11.1, §11.2, §11.5, §10.10 #64, #67. Verified 5 September 2026 against Apple's App Privacy Details page, Apple's age-rating announcement, Google Play's Data safety help, the AI-Generated Content policy pages and the July 2026 Play policy announcement (sources at the end). Everything below is entered into App Store Connect / Play Console as a **draft**; submission is Moshe's action.

## 1. Apple App Privacy (App Store Connect › App Privacy)

**Answer: "Data Not Collected."** Concretely: to "Do you or your third-party partners collect data from this app?" answer **No**. No data types, no purposes, no tracking.

Why this is honest, per Apple's definitions:
- Apple defines *collect* as "transmitting data off the device in a way that allows you and/or your third-party partners to access it for a period longer than what is necessary to service the transmitted request in real time." The app transmits nothing except, on iOS 17–25, the HTTPS request for a model file the user tapped. Apple's page says explicitly that an IP address "sent on a server call and not retained" need not be disclosed. We keep no request logs (Cloudflare R2, no logpush).
- "Data that is processed only on device is not 'collected'." Chats, documents, embeddings, reports: all on device.
- Purchases: "You are not responsible for disclosing data collected by Apple." StoreKit transactions are Apple's.
- Crash and usage diagnostics: only via the OS opt-in, collected by Apple. Not ours.
- Support email: happens outside the app in the user's mail client; even inside Apple's optional-disclosure test (infrequent, optional, user-provided with consent, not primary functionality) it would be exempt.
- Third-party SDKs: none with network access, so nothing to declare on their behalf. Keep it that way: any SDK addition re-opens this section (spec §10.9 #60).

Also in App Store Connect: **Privacy Policy URL** = `{{PRIVACY_URL}}` (required by Guideline 5.1.1 even with zero collection); **App Review notes** (see §6).

## 2. PrivacyInfo.xcprivacy (app-level privacy manifest)

Apple requires the app's own manifest to declare every "required reason API" the app *and its non-manifest dependencies* touch. Inventory of manifests actually present in `node_modules` (worktree, 5.9.2026):

| Dependency manifest | Declares |
|---|---|
| react-native/React/Resources | FileTimestamp C617.1, UserDefaults CA92.1 |
| react-native/ReactCommon/cxxreact | FileTimestamp C617.1 |
| react-native/ReactCommon/react/timing | SystemBootTime 35F9.1 |
| react-native third-party (boost, glog, RCT-Folly) | present, no APIs |
| expo-file-system | FileTimestamp 0A2A.1, 3B52.1; DiskSpace E174.1, 85F4.1 |
| expo-constants, expo-localization | UserDefaults CA92.1 |
| llama.rn 0.12.9 | **no manifest** (C++ engine; uses `stat`/`mmap` on model files) |
| expo-sqlite, expo-secure-store, expo-local-authentication, expo-crypto | no manifest in the pod (Swift modules; expo-sqlite writes files, which is not a required-reason API by itself) |

Because llama.rn ships no manifest and reads file metadata, the app-level manifest must cover the file-timestamp category itself. Content to put in `apps/mobile` via `app.config.ts` → `ios.privacyManifests` (Expo writes the file at prebuild):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyTracking</key><false/>
  <key>NSPrivacyTrackingDomains</key><array/>
  <key>NSPrivacyCollectedDataTypes</key><array/>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array><string>C617.1</string><string>3B52.1</string></array>
    </dict>
    <dict>
      <key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array><string>CA92.1</string></array>
    </dict>
    <dict>
      <key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategorySystemBootTime</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array><string>35F9.1</string></array>
    </dict>
    <dict>
      <key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategoryDiskSpace</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array><string>E174.1</string><string>85F4.1</string></array>
    </dict>
  </array>
</dict>
</plist>
```

Reason codes and why each is true for Inborn:
- **C617.1** file timestamps inside the app container (model files, DB, exports). **3B52.1** timestamps of files the user picked via the document picker (GGUF/PDF import).
- **CA92.1** UserDefaults for the app's own settings.
- **35F9.1** system boot time used to measure elapsed time in-app (React Native timing, tok/s stats).
- **E174.1** free-disk-space check before a download / when low (spec §10.1 #5–#6). **85F4.1** displaying disk usage to the user in the Vault (spec §5.4).

The spec (§11.1) lists E174.1, CA92.1, C617.1, 35F9.1; the two additions (3B52.1, 85F4.1) come from what expo-file-system actually declares and what the Vault screen does. Not declared: Active keyboards (no custom keyboard at launch; add 3EC4.1 when the keyboard extension ships in Pro), Screen size, Address book, and any tracking domain. Xcode's "Generate Privacy Report" on the archive should show only these four categories; that check is test T35 in `docs/qa/release-checklist.md`.

## 3. Apple age rating (App Store Connect › Age Rating, new 2026 questionnaire)

Apple's tiers since 31 January 2026: 4+, 9+, **13+**, 16+, 18+. Apple's announcement says developers "must consider how all app features, including AI assistants and chatbot functionality, impact the frequency of sensitive content appearing." Expected result: **13+**. If Apple computes lower, set the rating manually to 13+ (allowed; spec §11.1). Do not select 18+ (would erase the everyday-tool positioning) and do not enrol in Kids.

| Question (2026 questionnaire) | Answer | Reasoning |
|---|---|---|
| Cartoon or fantasy violence | None | |
| Realistic violence | None | |
| Prolonged graphic or sadistic realistic violence | None | |
| Profanity or crude humour | Infrequent/Mild | An open-weight model can produce it on request; family-safe filter reduces, does not eliminate |
| Mature/suggestive themes | Infrequent/Mild | Same reasoning; no adult personas, no roleplay |
| Horror/fear themes | None | |
| Medical/treatment information (new "medical or wellness" question) | Infrequent/Mild | Users ask health questions; the model answers with disclaimers; no dosing tools, no diagnosis feature |
| Alcohol, tobacco, drug use or references | Infrequent/Mild | Conversational references possible |
| Sexual content or nudity | None | Family-safe default; no image generation |
| Gambling (simulated or real) | None | |
| Contests | None | |
| Unrestricted web access | No | The app has no browser and no INTERNET path on Android |
| User-generated content / messaging between users | No | Single-user, local; no user-to-user communication |
| In-app controls / parental controls (new) | Yes: content filter on by default; no account-level parental control | Describe family-safe mode |
| App capabilities: AI chatbot | Yes, generative text, on-device | Answer the chatbot capability question honestly (spec: "unrestricted generative text") |
| Loot boxes | No | |
| Made for Kids | No | |

Region note: Apple assigns ratings per country; a few regions may show 12 or 16 for the same answers. Accept the computed regional values.

## 4. Google Play

### 4.1 Data safety (Play Console › App content › Data safety)

| Form question | Answer | Why |
|---|---|---|
| Does your app collect or share any of the required user data types? | **No** | Nothing leaves the device; Play Asset Delivery and Play Billing traffic is Google Play's, not the app's (Play's help page: data collected by Google Play services on Google's behalf is not the developer's disclosure) |
| Is all of the user data collected by your app encrypted in transit? | not asked (only shown when data is collected) | Should the form still show it, answer Yes: the only transfer that exists anywhere (iOS/desktop model download) is HTTPS |
| Do you provide a way for users to request that their data is deleted? | not asked / Yes | Settings → Storage → Delete all, Emergency Wipe, uninstall; described in the privacy policy §6 |
| Privacy policy URL | `{{PRIVACY_URL}}` | Required for every app, including zero-collection apps |
| Data types table | empty | |

Store result: "No data collected" and "No data shared". The spec's line "encryption at rest, deletion mechanism" describes what we *do*; the form only asks about them when data is collected, so they live in the policy text instead.

### 4.2 Permissions

Merged release manifest: **no INTERNET**, no storage, no SYSTEM_ALERT_WINDOW (blocked in `app.config.ts`). Expected declared permissions: `com.android.vending.BILLING` (Play Billing), `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_DATA_SYNC` (asset delivery / short-lived generation service), `USE_BIOMETRIC` (app lock), `RECORD_AUDIO` (dictation, requested at first mic tap), `POST_NOTIFICATIONS` (download progress; Android 13+), `CAMERA` only if the image-input feature ships in the same release. No "sensitive/restricted permission" declaration forms are triggered by that list. Test T31 (`aapt2 dump permissions`) is the gate.

### 4.3 AI-Generated Content policy (Play Console has no separate runtime declaration; compliance is in the app)

Requirements from Play's policy page and how Inborn meets each:

| Requirement | Inborn |
|---|---|
| "Apps that generate content using AI must contain in-app user reporting or flagging features that allow users to report or flag offensive content to developers without needing to exit the app." | S13 Report on every AI message; saves locally, optional "Email report"; works offline (Play does not require that the report be transmitted, only that the flow exists in-app) |
| Developers must prevent generation of prohibited content (CSAM, non-consensual sexual deepfakes, scam voice/video, harmful-behaviour encouragement, deceptive election content, bullying, sexually gratifying apps, forged official documents, malicious code) | Safety system prompt, family-safe classifier default, catalogue of officially safety-tuned models only, no image/voice cloning features, no "uncensored" claims anywhere (spec §2.3, §10.5 #36, #41) |
| Developers are responsible for outputs | Reports reviewed by us when emailed; catalogue prompt updated by app update |
| July 2026 update: user-data requirements "also apply to third-party AI integrations" | Not applicable: no third-party AI service; nothing is sent anywhere |

**"Declaring AI-generated content" (Play Console content flows):** this is the per-asset checkbox for **store listing images and videos**, not for the app's output. Screenshots produced by the screenshot engine from real app captures: unchecked. Feature graphic or icon elements made with generative tools: check the box for that asset (Play labels it "AI-generated" in the store). Decide per asset when uploading; record the decision in the ASO ledger.

### 4.4 Content rating (IARC questionnaire)

Expected: **Teen** (ESRB) / PEGI 12 / USK 12, per spec §11.2. Play's July 2026 announcement confirms "unrated apps are no longer permitted", so complete it before the first upload.

| IARC question group | Answer | Reasoning |
|---|---|---|
| Violence | No | |
| Sexuality / nudity | No | |
| Language | Mild/infrequent possible | Same AI reasoning as Apple |
| Controlled substances | No features; references possible | |
| Gambling | No | |
| Users interact or exchange content | **No** | Single-user, no social features |
| Shares user-provided location | No | |
| Shares personal information | No | |
| Digital purchases | Yes | Pro/Work one-time IAP |
| Unrestricted internet access | No | |
| AI-generated content (if the questionnaire version asks) | Yes, text chatbot, on-device, with reporting | Answer as presented; it feeds the same Teen outcome |

### 4.5 Other App content declarations

Ads: No. Government app: No. Financial features: No. Health apps: No (the crisis card is a static resource card, not a health feature). News: No. Target audience: 13+ (not Designed for Families). Age-Restricted Content policy (26 August 2026 update): out of scope, the app is not anonymous/random chat, dating or gambling; re-assess if a "companion" persona is ever added (spec §11.2). Developer verification: the existing account is verified; every app must be registered in Play Console before 30 September 2026 enforcement in the first four markets. 16 KB page-size support and target API 36: mandatory for a new app today (T33, T32).

## 5. Apple App Review Guidelines: which apply and what we show

| Guideline | Status |
|---|---|
| 1.2 User-generated content (Apple extended it to AI chatbot output): filtering, reporting, blocking, contact | Family-safe filter; S13 report; report reasons include "block persona"; support email in Settings |
| 2.3.6 Accurate age rating | §3 above |
| 5.1.1(i) Privacy policy link | in listing and in-app Settings |
| 5.1.2(i) Consent before sharing personal data with third-party AI (Nov 2025 update) | Not applicable: no third-party AI, nothing shared. Say so in review notes |
| 5.1.4 Kids | Not a Kids app |
| 3.1.1 In-app purchase | Pro/Work via StoreKit only; Family Sharing enabled for Pro |
| 4.2 Minimum functionality / June 2026 "apps that do not add value" | The proof screen, vault, documents and the no-network design are the documented differentiation (spec §11.2 last row applies to Apple too) |
| 2.5.x Foundation Models Acceptable Use | FM used only as accelerator; excluded from Work medical/legal personas; family-safe on |

## 6. App Review notes (paste into ASC "Notes" and Play "Instructions for review")

> Inborn runs an open-weight language model entirely on the device. Reviewers can test it in Airplane Mode: the built-in "Instant" model is inside the app bundle (iOS) / delivered by Play as an asset pack (Android), so no download or account is required. There is no server, no login, no analytics SDK; on Android the manifest has no INTERNET permission. To test the required reporting flow: long-press any AI answer → Report → choose a reason → Save. Reports are stored on the device and can optionally be emailed from Settings → Reports. To test the purchase: sandbox/licence-tester account `{{TESTER}}`, product `pro` (non-consumable). The privacy policy is at Settings → Privacy and at `{{PRIVACY_URL}}`.

## 7. Sources

- Apple, App Privacy Details (definition of "collect", on-device exemption, Apple-collected data): https://developer.apple.com/app-store/app-privacy-details/
- Apple, Updated age ratings in App Store Connect (13+/16+/18+, chatbot note, 31 Jan 2026 deadline): https://developer.apple.com/news/?id=ks775ehf
- Apple, Privacy manifest files and required-reason API reasons: https://developer.apple.com/documentation/bundleresources/privacy-manifest-files
- Apple, Foundation Models Acceptable Use Requirements: https://developer.apple.com/apple-intelligence/acceptable-use-requirements-for-the-foundation-models-framework/
- Apple, App Review Guidelines (1.2, 5.1.2(i) Nov 2025 update): https://developer.apple.com/app-store/review/guidelines/ and https://developer.apple.com/news/?id=ey6d8onl
- Google Play, Data safety section: https://support.google.com/googleplay/android-developer/answer/10787469
- Google Play, AI-Generated Content policy: https://support.google.com/googleplay/android-developer/answer/13985936 and explainer https://support.google.com/googleplay/android-developer/answer/14094294
- Google Play, Declaring AI-generated content (store assets): https://support.google.com/googleplay/android-developer/answer/17262077
- Google Play, Policy announcement 15 July 2026 (third-party AI, unrated apps, registration): https://support.google.com/googleplay/android-developer/answer/17134731
- Google Play, Age-Restricted Content and Functionality: https://support.google.com/googleplay/android-developer/answer/16302250
- Google Play, target API level requirements (API 36 from 31 Aug 2026): https://support.google.com/googleplay/android-developer/answer/11926878
- Android developer verification timeline (30 Sep 2026 first markets): https://android-developers.googleblog.com/2026/06/android-developer-verification.html
- Google, 16 KB page size requirement (1 Nov 2025 for new apps and updates targeting Android 15+): https://android-developers.googleblog.com/2025/05/prepare-play-apps-for-devices-with-16kb-page-size.html
