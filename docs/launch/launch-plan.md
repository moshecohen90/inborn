# Launch plan and drafts

**Everything in this file is a DRAFT. NOTHING HERE HAS BEEN SENT, POSTED OR SCHEDULED.** Publishing any of it is Moshe's action. Spec basis: §13.5 (launch week, creators, professionals, paid test), §13.1–§13.2 (keywords and titles), §3.3 (voice: factual, second person, numbers not adjectives, always "verify it yourself"), §2.3 (never "uncensored"), §11.3 (never "HIPAA-compliant"/"privileged"), §14.6 (paid test $30/day × 14 = $420, only with Moshe's approval). Written 6 September 2026.

Fill `{{…}}` at launch. Numbers quoted in the posts (tok/s, sizes) must be re-measured on the release build before posting; the ones below are the week-0 measurements from the README.

## 0. Launch week timeline (relative to store approval day D)

| Day | Action | Owner | Status |
|---|---|---|---|
| D-14 | Word-mark filings done, domains live, privacy policy at `{{PRIVACY_URL}}`, Proof page live with the Exodus report and the release hash | Moshe / lead | not started |
| D-7 | Creator outreach emails sent (§3), promo codes generated (§4); TestFlight/Internal-testing build to creators | Moshe sends | drafted |
| D-1 | Product Hunt listing scheduled for 00:01 PT; Show HN text final; Reddit posts final; ASA and UAC campaigns created in **paused** state | lead prepares, Moshe approves | drafted |
| D | Product Hunt live; Show HN posted 08:00–10:00 ET; r/LocalLLaMA post; ASA/UAC unpaused ($30/day) | Moshe | |
| D+1 | r/privacy post (different angle, see §1.3); reply to every comment within the day | Moshe / lead drafts replies | |
| D+3 | Privacy newsletters pitched (§1.5) | Moshe | |
| D+7 | First weekly metrics note (`docs/ops/metrics-without-sdk.md` template); adjust ASA keywords | lead | |
| D+14 | Paid test ends; decision to continue or stop, with CPI and Pro conversion from ASC/Play | Moshe | |
| D+30 | Launch price ($14.99) ends; Pro back to $19.99 | lead schedules the price change in both consoles | |

## 1. Community posts

### 1.1 Product Hunt (draft)

**Name:** Inborn
**Tagline (60):** Private AI chat that runs entirely on your phone
**Description (260):** Inborn runs an open-weight language model on your device. No account, no cloud, no analytics. On Android it doesn't even have the internet permission. Chat, documents, voice, all offline. Free is complete; Pro is a one-time $19.99.
**First comment (maker):**

> Hi PH. I'm the maker of Inborn. The idea is simple: an AI assistant where "nothing leaves your device" is physics, not a policy.
>
> How it works: a Qwen3.5 model (0.8B–9B, Apache-2.0) runs on your phone through llama.cpp. The model is inside the app (iOS) or delivered by Play as an asset pack (Android). There is no server. No account. No analytics SDK, no crash reporter, no ads.
>
> How you verify it, because you shouldn't take my word for it:
> 1. Turn on Airplane Mode and ask anything. It works the same.
> 2. Android: open the app's permissions page on Google Play. "Full network access" isn't there; the manifest has no INTERNET permission. Exodus report: 0 trackers.
> 3. iOS: Settings → Privacy → App Privacy Report. Inborn's row is empty.
> 4. The engine/storage/network core is open source with a published hash per release: `{{REPO_URL}}`.
>
> Honest limits: a 2B model on a phone is not GPT-5. The app tells you the model name and speed for your device (iPhone 13 Pro: ~27 tok/s on the 0.8B model; a 2018 OnePlus 6T: ~16 tok/s), and when a bigger model would help.
>
> Free is a complete product: unlimited chat, no watermark. Pro is $14.99 this month ($19.99 after), one time, no subscription. Happy to answer anything technical.

Assets: 5 screenshots from §13.3 (airplane mode, OUT 0 B, documents, pay once, vault), 1 short screen recording of the airplane-mode test. Topics: Privacy, Artificial Intelligence, Productivity. **Not scheduled.**

### 1.2 Hacker News, Show HN (draft)

**Title (80):** Show HN: Inborn – on-device AI chat with no internet permission on Android
**URL:** `{{DOMAIN}}/proof`
**Text:**

> Inborn is an AI chat app (iOS, Android, web; Windows/macOS later) that runs open-weight models on the device. The design goal was to make the privacy claim verifiable rather than promised:
>
> - Android release build has no INTERNET permission at all. Models come as Play Asset Delivery packs, purchases via Play Billing; the app never opens a socket. Verified with `aapt2 dump permissions` in CI, which fails the build if the permission ever appears via manifest merging.
> - iOS: the 0.8B model ships in the bundle. App Privacy Report shows zero domains unless you explicitly download a larger model (then exactly one host, only during the download).
> - Engine is llama.cpp via llama.rn (phones) and wllama/WASM (browser). Chats are in SQLCipher with the key in the Secure Enclave/Keystore. Incognito chats never touch disk.
> - The core (engine adapter, storage, network allowlist, catalogue) is MIT on GitHub; the release hash is on the proof page. The UI is closed; Pro is a one-time purchase.
>
> Numbers (Qwen3.5-0.8B Q4_K_M, thinking off): iPhone 13 Pro 27 tok/s, TTFT 146 ms warm; OnePlus 6T (SD845, CPU) 16 tok/s; browser (WASM, 6 threads) 33 tok/s on an M-series Mac.
>
> Things I'd like feedback on: the allowlist approach vs. a full no-network build on iOS (Apple has no equivalent of dropping INTERNET), and the marking of exported text as AI-generated for the EU AI Act.

**Not posted.**

### 1.3 Reddit (drafts; two different angles, per subreddit rules read on the day)

**r/LocalLLaMA** — title: *I built a local-LLM phone app whose Android build has no INTERNET permission. Here's how to verify it doesn't phone home.*
Body: the four verification steps from 1.1, the engine details from 1.2, the model catalogue (Qwen3.5 tiers, Phi-4-mini, SmolLM3), GGUF import for any model, and an explicit ask: "which models do you want in the catalogue next?" Disclose that it's my app and that Pro is paid. No link in the title; link in the body per sub rules.

**r/privacy** — title: *Is a "private AI chat" app actually private? A checklist I used to build one, and how to run it on any app.*
Body: lead with the checklist (airplane test, permissions page, App Privacy Report, Exodus, firewall), apply it to five well-known apps without naming and shaming beyond what's public, then mention Inborn as the one that passes all five, with the caveat that iOS can't drop network at the OS level. Mods often remove self-promotion; the value must stand without the app.

**Not posted.**

### 1.4 Community replies (rules for whoever answers)

Second person, numbers, no adjectives. Never "uncensored", never "military-grade", never "100% secure", never "HIPAA-compliant". When someone finds a real issue, say "you're right", fix, and post the commit. Every thread answered within 24 h on launch week.

### 1.5 Newsletters and press (pitch draft, 120 words)

> Subject: An AI chat app that literally cannot go online (Android build has no internet permission)
>
> Hi {{NAME}}, I make Inborn, a private AI assistant that runs on the phone. What's different is verifiability: the Android release has no INTERNET permission in its manifest, iOS shows zero domains in App Privacy Report, and the core is open source with a published hash. No account, no analytics, one-time purchase. Proof page with the Exodus report: {{DOMAIN}}/proof. Happy to send a Pro code and answer questions. — {{MOSHE}}

Targets: privacy newsletters and podcasts (list kept in the ASO ledger, not here). **Not sent.**

## 2. Store metadata placeholders the spec left empty (§13.2)

Proposed values, to be validated with the ASO keyword tools before entry:

- **IOS_KEYWORDS (100):** `private,local,offline,ai,chat,llm,chatbot,on device,assistant,no internet,secure,gguf,llama,documents,pdf`
- **IOS_PROMO (170):** `Private AI chat that runs 100% on your device. No account, no cloud, no analytics. Works in airplane mode. Pay once for Pro. Verify it yourself.`
- **PLAY_OPENING (first lines of the description):** `Inborn is an offline AI chatbot. The model runs on your phone: no internet needed, no account, no ads, no data leaves your device. On Android the app has no internet permission at all.`

## 3. Creator outreach (template + list template)

Rule from §13.5: 10 YouTube channels in "local AI" and "privacy" get Pro for free and a link to the proof page. **No paid reviews.**

**Email template:**

> Subject: Free Pro code for Inborn (on-device AI chat), no strings
>
> Hi {{CREATOR}}, I watched your {{VIDEO}} and thought Inborn fits what you cover. It's an AI chat app that runs entirely on the phone; the Android build has no INTERNET permission, iOS shows zero domains in App Privacy Report, core is open source with a published hash. Here's a Pro code: {{CODE}} (App Store) / {{CODE}} (Play). No obligation to cover it, and if you do, say what's wrong with it too. Proof page: {{DOMAIN}}/proof. Questions: reply here. — {{MOSHE}}

**List template (`docs/launch/creators.csv`, not created; keep personal data out of the repo):**

| # | Channel | Platform | Subject area | Subscribers | Contact route | Code issued (date) | Reply | Coverage link |
|---|---|---|---|---|---|---|---|---|
| 1–10 | | YouTube | local AI / privacy | | business email from the About tab | | | |

## 4. Promo codes and offer codes

- **App Store:** App Store Connect › Inborn › Promo Codes: up to 100 codes per IAP per request, 1,000 per app per six months; codes expire 28 days after generation, so generate in the week they are sent. Use **offer codes** (custom code, e.g. `LAUNCH`, redeemable N times, expiry up to 6 months) for the launch-price and cross-store discount cases; offer codes work for non-consumables. Source: https://developer.apple.com/help/app-store-connect/offer-promo-codes/request-and-manage-promo-codes and https://developer.apple.com/help/app-store-connect/manage-in-app-purchases/create-offer-codes-for-in-app-purchases
- **Google Play:** Play Console › Monetise › Promotions › Promo codes: one-time codes for the Pro in-app product, up to 500 per quarter per app; set an expiry.
- Plan: 20 creator codes per store (10 creators × 2 stores), 30 spare for support ("Pro on the other store", D5 20–30% offer via a custom offer code rather than a free code), all logged in the ASO ledger with date and recipient. **Codes not yet generated.**

## 5. Paid test: Apple Search Ads and Google UAC ($30/day × 14 days = $420, needs Moshe's approval)

**Apple Ads (Advanced, not Basic):** Basic is CPI-only with no keyword control and no minimum spend, capped at $10,000/month; Advanced is cost-per-tap with keyword control, minimum daily budget $1. Use Advanced. Source: https://ads.apple.com/app-store/help/apple-ads-basic/0001-compare-apple-ads-solutions

| Setting | Value |
|---|---|
| Campaign | Inborn · US · Search results · Exact match |
| Daily budget | $20 (of the $30) |
| Keywords (exact) | private ai chat; local ai; on device ai; offline ai; private ai; local llm |
| Negative | gpt; uncensored; free unlimited |
| Max CPT | $1.00 start (2026 median CPT ≈ $0.92–1.56); raise to $1.50 only for "private ai chat" if impression share < 20% after 3 days |
| Creative | default product page; custom product page with the "OUT 0 B" screenshot first if PPO is live |
| Success | CPI < $2.00 and any Pro conversion from ASA installs (ASC attribution) at ≥ 1% |

**Google UAC (App campaign, Play):**

| Setting | Value |
|---|---|
| Daily budget | $10 |
| Target | installs; tCPI $1.00 |
| Assets | headlines "Offline AI chat", "AI without internet", "No account. No cloud."; descriptions from PLAY_OPENING; the 6 screenshots; 15-s airplane-mode clip |
| Negative themes | (UAC has limited negatives) exclude "uncensored" via asset wording, never bid on it |
| Success | CPI < $1.00 (offline keyword competition is low per §13.1) |

Both campaigns are created **paused**; Moshe unpauses on day D. Stop rule: if CPI is 2× target after 5 days, pause and rebalance to the other network.

## 6. Professionals (§13.5 third item)

A dedicated guide for lawyers and therapists ("How to use AI without sending client material anywhere") lives on the website (phase 2 content); outreach to bar associations with the Work Team licence waits for phase 3. Nothing to send at mobile launch; note only so the plan is complete.

## 7. What is NOT in the plan, on purpose

No cross-promotion from the Bible apps (§13.5: brand stays separate; the developer page name is neutral). No paid reviews. No "uncensored" or "no filters" wording anywhere, including ad keywords. No launch email list (there is no list; there are no accounts).
