# Inborn Privacy Policy

**Status: DRAFT for store submission and the website. Not yet published. Placeholders in `{{…}}` are filled at launch.**
Spec basis: §2.3, §5.1, §5.3, §11.1–§11.3, §15. Last edited 5 September 2026.

Effective date: `{{EFFECTIVE_DATE}}`
Publisher: `{{DEVELOPER_LEGAL_NAME}}` (the developer account shown on the store listing)
Contact: `{{SUPPORT_EMAIL}}`

---

## 1. The short version

Inborn is an AI chat app that runs entirely on your device. Your conversations, documents, settings and the AI model itself live on your phone or computer. **We do not collect, receive, store, sell or share any personal data.** There are no accounts, no analytics, no crash reporting, no advertising, no remote configuration and no push notifications. On Android the app does not even hold the INTERNET permission, so it cannot open a network connection.

The only situations in which anything at all leaves your device are listed in section 3. Each one is either performed by the app store (not by Inborn), or started by you with an explicit tap, and each one is described there in full.

## 2. What Inborn does not do

- It does not create or require an account. No email, phone number, or sign-in of any kind.
- It does not send your messages, prompts, documents, images, voice, or model outputs anywhere.
- It does not include any analytics, crash-reporting, attribution, advertising, A/B testing, or remote-configuration software, from us or from anyone else.
- It does not assign you a device identifier or send a "ping" of any kind.
- It does not read your contacts, location, photos, calendar or microphone unless you use a feature that needs them (for example, tapping the microphone to dictate), and even then the data is processed on the device and never transmitted.
- It does not sell or share personal information. Because nothing is collected, there is nothing to sell or share.

## 3. The complete list of network activity, by platform

### Android
None from the app. The release build does not declare the INTERNET permission (you can confirm this on the app's Google Play permissions page, which does not list "full network access"; the one entry Android's app info may show that Inborn did not declare, "Google Play license check", is added by Google Play itself when it builds the installed APKs from our app bundle and gives the app no network access). Two things happen through Google Play, not through Inborn:

- **Model delivery.** The built-in "Instant" model and any larger model you choose in the Vault are delivered by Google Play as asset packs (Play Asset Delivery). Google performs the download exactly as it performs an app install or update, under Google's own privacy policy.
- **Purchases.** Pro and Work are sold through Google Play Billing. Google processes the payment and holds the purchase record; Inborn only reads the locally cached entitlement. We never see your name, email or payment details.

### iOS and iPadOS
The app itself opens no connection by default.

- **Model delivery, iOS 26 and later.** Additional models are delivered by the operating system as Apple-hosted asset packs (Background Assets). Apple performs the download under Apple's privacy policy. Your iOS App Privacy Report will show no domains for Inborn.
- **Model delivery, iOS 17 to 25.** If you tap "Download" on a model in the Vault, the app fetches that one file over HTTPS from `models.{{DOMAIN}}`, hosted on Cloudflare R2. What is transmitted: the request for the file (its path and byte range), and the technical information any HTTPS request carries (your IP address and a generic user-agent string). What is not transmitted: no identifiers, no cookies, no query parameters, no information about you, your device, or your usage. Cloudflare processes the IP address to serve the file and may keep short-lived edge logs under Cloudflare's privacy policy. We do not receive or keep per-request logs. The App Privacy Report will show `models.{{DOMAIN}}` only while a download you started is running.
- **Hugging Face (optional, explicit).** If you choose to search or import a model from Hugging Face, the app tells you first, and `huggingface.co` will then appear in your App Privacy Report. Hugging Face's privacy policy applies to that download.
- **Purchases.** Pro and Work are sold through the App Store (StoreKit). Apple processes the payment and holds the purchase record; Inborn verifies the signed receipt on the device. We never see your name, email or payment details.

### Windows and macOS
- **Model delivery.** A model download you start fetches one file from `models.{{DOMAIN}}` as described for iOS 17 to 25. You may also import model files by drag-and-drop with no network at all.
- **Purchases.** Through the Microsoft Store (Windows) or the Mac App Store, under their policies; or directly through Paddle, our reseller, which processes payment and issues a licence key. Paddle is an independent merchant of record and its privacy policy governs the purchase. Activating a licence key sends the key and a device-bound identifier to Paddle's licensing endpoint once, so the licence can be checked offline afterwards.

### Web version
The browser version downloads the model from the page's own origin (the same host that served the page) into the browser's own storage and runs it locally; the Proof page shows the origin, size and hash of what was downloaded. If we later serve models from a separate host such as `models.{{DOMAIN}}`, the page will only fetch from that host and this paragraph will name it. Nothing you type is sent to us. Your browser and operating system may make their own connections, which the page does not control. The web demo sets no cookies and loads no third-party scripts.

### Marketing website
`{{DOMAIN}}` uses Cloudflare Web Analytics, which is cookie-free and does not identify visitors, and Cloudflare's server logs. No advertising or tracking scripts.

## 4. Data that Apple, Google, Microsoft and Paddle process on their own behalf

When you install, update, rate or buy something, the store operator processes data (device information, purchase records, and, if you opted in at the operating-system level, crash and usage diagnostics). They do so as independent controllers under their own policies:

- Apple: https://www.apple.com/legal/privacy/
- Google: https://policies.google.com/privacy
- Microsoft: https://privacy.microsoft.com/privacystatement
- Paddle: https://www.paddle.com/legal/privacy

We receive only aggregate, non-identifying reports from the stores (for example, download counts by country). If you opted in to share diagnostics with Apple or Google, the operating system may pass anonymised crash reports to us; these contain stack traces, never the content of your chats. The app itself never writes user content into logs.

## 5. Support email

If you write to `{{SUPPORT_EMAIL}}`, we process your email address and whatever you choose to write, only to answer you. This is the single place where we hold personal data. Legal basis (where GDPR applies): our legitimate interest in answering you (Art. 6(1)(f) GDPR). Retention: the thread is deleted within 90 days after the issue is closed, unless you ask us to keep it. If you attach a "Report a problem" file from the app, note that you choose what it contains; it is generated on the device and sent by you from your own mail app.

## 6. Your data on the device, and how to export or delete it

- Conversations, personas, settings and imported documents are stored in an encrypted database on your device (SQLCipher; the key lives in the Secure Enclave, Android Keystore or Windows Hello/DPAPI). On iOS the files also use Data Protection.
- **Web version exception:** in the browser, conversations are stored in the browser's own storage (IndexedDB) without the app's encryption, protected only by your browser profile. The app says so on screen. Clearing the site's data removes them.
- Model files are stored unencrypted (they are public files) and are excluded from device backups because of their size. Conversations are included in your iCloud or Google device backup, encrypted by the operating system's backup mechanism.
- **Access and portability:** Settings → Export lets you export any conversation, or everything, to a file you control.
- **Deletion:** delete any conversation, delete all data from Settings → Storage, or use Emergency Wipe. Deleting the app deletes everything it stored. Because we hold no copy, there is nothing for us to delete on our side.
- **Incognito chats** are held in memory only and are never written to disk.

## 7. GDPR and UK GDPR

Inborn processes your data only on your own device, for your own use. We never receive it, so we are neither a controller nor a processor of your conversations or documents; your own use falls within the personal or household activity exemption (Art. 2(2)(c) GDPR). The only personal data we control is the support correspondence described in section 5. You have the right to ask us to access, correct or erase that correspondence, to object to its processing, and to complain to your supervisory authority. We do not transfer personal data internationally, other than the email you send us, which is handled by our email provider.

## 8. California (CCPA/CPRA) and other US state laws

We do not collect personal information as defined by the CCPA, and we do not sell or share personal information. This statement serves as our "Do Not Sell or Share My Personal Information" notice: there is nothing to opt out of. If you contact support, the only personal information involved is your email address, used to respond to you.

## 9. Children

Inborn is rated 13+ on the App Store and Teen on Google Play. It is not directed to children under 13 and we do not knowingly collect information from anyone; as described above, we collect no information from any user. The default Family-safe mode filters the AI's output on the device.

## 10. Security

No server means no server to breach. On the device: encrypted database, hardware-backed keys, optional biometric app lock, optional screenshot blocking, incognito mode, emergency wipe, and a published open-source core so that anyone can verify the claims in this policy. The Android build's manifest can be checked with `aapt2 dump permissions`; the iOS App Privacy Report and any firewall (Little Snitch, NetGuard) will show the behaviour described in section 3.

## 11. Changes

We will post changes here with a new effective date, and describe them in the app's release notes. We will never add data collection without changing this policy first and making the change visible in the app.

## 12. Contact

`{{DEVELOPER_LEGAL_NAME}}`
`{{POSTAL_ADDRESS}}`
`{{SUPPORT_EMAIL}}`
