# Brand, positioning, pricing and store listings — private on-device AI chat app

Research date: 2 September 2026. Checks were run live (iTunes Search API US, Google Play search/listing HTML US, registry RDAP + whois, web search, ASO autocomplete tools). No USPTO / EUIPO clearance search was run — do one on the final pick before filing.

## TL;DR

- **Top 3 names:** 1) **Autark** (self-sufficient, off-grid; stores clean, `autarkai.app` / `autarkapp.com` / `useautark.com` / `autark.so` free), 2) **Airtight** (nothing leaks; stores clean; `airtightai.app` free; 8 letters, so the iOS title formula needs one word dropped), 3) **Atoll** (your own island; stores clean; `atollapp.com` / `tryatoll.com` / `useatoll.com` / `atollai.app` / `atoll.so` free). Alternate: **Innate** (clean stores, but a YC robotics startup already trades as Innate).
- **Tagline:** "AI that never leaves your phone."
- **Proof:** Android app ships **without the INTERNET permission**. Verified: DownloadManager needs INTERNET (so it is not a loophole), but Play Asset Delivery and Play Billing libraries declare no INTERNET permission (checked the 2.3.0 and 9.1.0 AAR manifests), so models and purchases both work through the Play Store process. iOS: bundled default model + "Data Not Collected" label + App Privacy Report showing zero domains + Apple-hosted asset packs (iOS 26) for bigger models.
- **Prices:** Pro lifetime **$19.99** (launch/founder price $14.99), Pro yearly anchor **$9.99/yr**, Pro for Work **$49.99** lifetime (or $29.99/yr). Net at 15%: $16.99 / $8.49 / $42.49.
- **Category reality:** free-to-install apps with lifetime tiers ($59.99–$119.99 Secret AI, $69 Off Grid) vs paid-upfront apps at $4.99–$9.99 (Private LLM, OfflineLLM, Local LLM). Free + one-time Pro at $19.99 sits in the empty middle.

---

## 1. Brand name candidates

Rules applied: 1–2 syllables, English, evokes sealed / private / power / on-device, sayable in Hebrew, no "GPT", no "uncensored", not a search keyword. Store checks = search for the bare name and for "<name> ai" in the US App Store and US Google Play (AI category conflicts only are listed). Domain checks = .com/.ai/.app plus modifier domains, via registry RDAP/whois.

| # | Name | Meaning / rationale | Hebrew | App Store (AI conflicts) | Google Play (AI conflicts) | Domains | Trademark / web red flags | Verdict |
|---|------|---------------------|--------|--------------------------|----------------------------|---------|---------------------------|---------|
| 1 | **Autark** | German/Greek root "autarkes" = self-sufficient, needs nothing from outside. "Auto" + "ark". Exactly "AI that needs only your phone". | אוטארק — easy | None ("Autark 2.0" is a tiny productivity app) | None | .com/.ai/.app/.io taken (autark.com = German factory-automation firm; autark.io registered Jan 2026). **Free: autarkai.app, autarkapp.com, useautark.com, autark.so, autark.chat (likely)** | "Autark" is a plain German adjective; users are industrial/energy companies (Autark Energy Solutions, autarc.energy). No consumer-AI use found. Descriptive word = weak marks, easy coexistence, but also harder to enforce in DACH. | **Top pick** |
| 2 | **Airtight** | Sealed so nothing gets out. "Airtight privacy." Also hints at airplane mode. | אירטייט — fine | None | None | .com/.ai/.app/.io taken (airtight.so registered 27 Aug 2026). **Free: airtightai.app, airtight.chat (likely)** | Legacy "AirTight Networks" (Wi-Fi security, renamed Mojo 2016, bought by Arista). Common English word, suggestive for software = registrable. Name becomes a meme if a leak is ever found. 8 letters: "Airtight: Private Local AI Chat" = 31 chars, over Apple's 30. | **#2** |
| 3 | **Atoll** | Ring of land around a closed lagoon: your own island, nothing gets in or out. Ring icon. | אטול — easy | None (ATOLL hi-fi remote apps only) | None | .com/.ai/.app/.io taken (atoll.ai parked 2023). **Free: atollapp.com, tryatoll.com, useatoll.com, atollai.app, atoll.so** | atollhq.com (small B2B project-management tool for AI agents), Atoll Solutions (IoT), ATOLL Electronique (hi-fi). No consumer AI chat. Meaning is prettier than it is obvious. | **#3** |
| 4 | **Innate** | Built-in, inborn: intelligence that is part of the phone. | אינייט — fine | None | None ("INNATE - Mood" only) | .com/.ai/.app/.io taken. **Free: innateai.app** | **Innate (innate.bot), YC F24 robotics/AI startup** — same broad AI software class; real opposition risk. | Alternate #4 |
| 5 | **Sanctum** | Inner sacred room no outsider enters. Strongest English meaning. | סנקטום — OK | Crowded: 8+ "Sanctum" apps incl. **SanctumAI** (health) and "Sanctum-Bible AI" | "Photo Sanctum AI", "Sanctus AI" | All base + modifier domains taken | Sanctum (Solana DeFi protocol), many apps. Brand search would show 8 rivals above us. | Usable but crowded |
| 6 | **Tacit** | Unspoken, understood in silence. | טאסיט — Hebrew speakers may read "takit" | None ("Tacit App" is a pharma HR app) | None | Base taken; tacit.ai resolves to a site | tacit.ai exists (unknown size). Meaning is subtle, not visual. | Reserve |
| 7 | **Cabin** | Off-grid retreat with no signal; also a ship cabin = private quarters. | קאבין — easy | None in AI | **"Cabin AI" (real-time voice translation app) exists** | cabin.com/.ai/.app taken | cabina.ai (multi-model chat), usecabin.ai, cabinco.com. Bare search is Airbnb/camping. | Risky |
| 8 | **Bunker** | Nothing in, nothing out. Instantly understood, very natural in Hebrew. | בונקר — perfect | None in AI (games dominate bare term) | None | All base + modifier domains taken | **BunkerAI (bunkerai.io) sells "uncensored offline AI on USB"** — same space and the exact association the brief avoids; also Bunker DB, bunkertech.io. | Risky |
| 9 | **Sovran** | Sovereign: your AI answers to no one. | סוברן — fine | "Sovran" finance app only | None | .com/.ai/.app taken. Free: sovranai.app, trysovran.com, usesovran.com | **Sovran AI (London voice-automation company, 2019) and sovran.ai (ad-creative platform)** — two AI companies already. | Out |
| 10 | **Kura** | Japanese "kura": thick-walled storehouse for valuables — a vault. | קורה — fine (also a Hebrew word, "beam") | None (Kura Sushi, Kura Finance) | "Kura" app (unknown) | Base taken. Free: kuraai.app | Three AI companies named Kura (YC browser agents, Kura AR glasses, usekura.com DevOps). | Out |
| 11 | **Arca** | Latin: strongbox, chest, ark. Root of "arcane". | ארקה — easy | **"Arca AI Chat" ($1.99 indie AI chat app)** and "Private Photo Vault - Arca" | "Arca: Private Speech to Text" | .com/.ai/.app taken | ARCA is Argentina's tax agency ("ARCA Móvil" is a top app in AR); Arca (musician). | Out |
| 12 | **Hush** | Quiet, keep it secret. | האש — easy | **"Hush AI Assistant" exists**; "Hush – Express Freely" (social) | None direct | hush.com/.ai/.app taken | Many "Hush" brands (Hushed, Hush blankets). | Out |

### Top-3 ranking and recommendation

1. **Autark** — the only candidate that is simultaneously store-clean on both platforms, ownable (no consumer-tech user of the word anywhere), meaningful for the product ("self-sufficient AI"), 6 letters (fits both title formulas: "Autark: Private Local AI Chat" = 29, "Autark - Offline AI Chat" = 24), and has usable domains today (autarkai.app, autarkapp.com, useautark.com, autark.so). Risk: unfamiliar to English speakers on first read; pronunciation "AW-tark". Mitigation: the subtitle/screenshots carry the meaning; German-speaking markets read it literally as "self-sufficient", which is a plus.
2. **Airtight** — clearest meaning of all twelve, zero store collisions, and a name that doubles as the proof story ("airtight: nothing leaks"). Two costs: 8 letters break the 30-char iOS title formula (use "Airtight: Private Local AI" + subtitle "Offline On-Device LLM Chatbot"), and the name invites scrutiny — acceptable only because the no-INTERNET-permission proof is real.
3. **Atoll** — clean, short, pretty, good domains, strong icon (a ring). Loses to the two above only because the metaphor needs a beat of explanation.

Recommendation: **Autark**, with **Airtight** as the fallback if the team wants a word everyone already knows. Run a clearance search (USPTO TESS, EUIPO, IL ILPO) and buy autarkai.app + autarkapp.com + useautark.com + autark.so the same day.

### Also tested and rejected (so nobody re-checks them)

Existing offline/private-AI apps already use: **Ember** ("Ember - Local AI"), **Loci/Locus** ("Loci - Private, Local AI"), **Cloak** ("Cloak: Offline AI Chat", "Cloaked: Private AI LLM Chat", "Cloak AI - Local AI Assistant"), **Cloudless** ("Cloudless - Private & Local"), **ArX** ("ArX — Private AI Assistant"), **Veil** ("Veil AI", Veil messengers/vault), **Off Grid**, **Secret AI**, **Enclave**, **Numen** (Private LLM's publisher). Web AI collisions: **Conclave** (three "Conclave AI" products), **Vesper AI**, **Monk AI**, **Talo** ("Talo - AI Chat Agent"), **Cabin AI**. Crowded or wrong associations: Umbra, Flint, Cove, Sotto (four "Sotto: Private…" apps), Bastion (Supergiant game), Alcove, Naos (Bioderma), Isle (games), Cella, Sigil (occult), Vesta, Kept, Cache, Capsule, Grotto, Burrow ("Burrow — Secure Personal Vault"), Cubby, Atum (Hebrew אטום also means "dense/obtuse"), Domi, Safehouse (VPN brand), Fort/Forte, Trove ("TroveAI"), Tent, Hull, Holm, Capsa, Raz, Neve, Koti, Whist, Attic, Cellar, Isola, Inhouse, Snug. Trademark walls: Keep (Google Keep), Silo (AMD Silo AI), Onyx, Kernel, Lantern, Haven (Guardian Project), Harbor, Nomad, Anvil, Kiln (Kiln AI), Palm/PaLM, Pocket, Whisper, Nox, Obsidian, Strongbox, Tresor (Trezor), Latent (Latent AI).

---

## 2. Positioning

### Tagline

**"AI that never leaves your phone."**

Alternates: "Your AI. Your phone. Nothing else." / "The AI you can use in airplane mode."

### Three supporting messages

1. **Nothing leaves your device.** No account, no cloud, no analytics, no ads, no crash reporting. On Android the app does not even ask for internet access — the permission is not in the manifest, so it cannot phone home.
2. **Works anywhere.** The model lives on your phone: plane, subway, abroad, dead zones, a private room with the Wi-Fi off. Same speed, same answers.
3. **Own it.** Pay once for Pro, keep it forever. No subscription, no message quota, no one reading your chats — not even us.

### Proof concept: make "nothing leaves the device" visible

| Proof | Platform | What the user sees | Notes |
|-------|----------|--------------------|-------|
| **Airplane-mode ritual** | both | Onboarding step 2: "Turn on Airplane Mode, then ask me anything." Chat works. A small ✈︎ badge stays in the header whenever the device is offline. | Zero cost, most persuasive demo; the review sites already tell users to test apps this way. |
| **No INTERNET permission** | Android | Play listing "About this app → App permissions" shows no "Have full network access". Third-party auditors (Exodus Privacy) show 0 trackers and no network permission. An in-app "Sealed" badge links to the Play permissions page. | Only credible if the merged manifest truly lacks INTERNET (see research below). Marketing line: "The only AI app that cannot go online." |
| **App Privacy label "Data Not Collected"** | iOS | Shown on the product page. Private LLM, Enclave, Locally AI, Cloak, Secret AI, PocketPal, Off Grid all have it — table stakes, not a differentiator. | Some rivals claim "private" but collect analytics (Loci, Cloudless) or ad identifiers (Local AI - Private & Offline). |
| **App Privacy Report: 0 domains** | iOS | Settings → Privacy & Security → App Privacy Report lists domains each app contacted in the last 7 days. Our row: none. Put a screenshot in the listing and a "Check for yourself" page in the app. | Apple support doc 102188. |
| **Model ships inside the app** | iOS (and Android install-time pack) | The default model is in the bundle, so there is no download code path at all for the free tier. Private LLM does this (1.4 GB app). | App Store max app size 4 GB; Play modules + install-time packs ≤ 4 GB. |
| **Store-delivered optional models** | both | Larger models arrive via Play Asset Delivery (Play Store process downloads) or Apple-hosted asset packs (iOS 26 system download). The app itself never opens a socket. | Android: 1.5 GB per pack, 30 GB cumulative on-demand. iOS: up to 200 packs / 200 GB per app record. |
| **Open-source core** | both | Inference/chat core under MIT with reproducible builds and a published build hash; README states the manifest has no INTERNET permission. PocketPal and Off Grid are open source; neither ships without INTERNET. | Keep the store shell closed if desired; the core is what auditors read. |
| **Firewall invite** | both | Help page: "Put us behind NetGuard / Little Snitch / Lockdown and watch nothing appear." | Cheap credibility with the exact audience that buys. |

### Research: can an Android app ship WITHOUT the INTERNET permission and still get models?

Facts established:

- **INTERNET is required for any socket the app opens.** Without it every network call throws immediately. It is a normal permission, so users never see a prompt, but its absence is visible in the Play permissions list and in third-party reports.
- **DownloadManager is not a loophole.** The Android reference says the app "must have the INTERNET permission to use this class"; the download provider enforces it on insert. ([DownloadManager](https://developer.android.com/reference/android/app/DownloadManager))
- **Play Asset Delivery works without it.** The Play Store app performs the download and hands the files to the app; the app talks to Play over IPC. The `com.google.android.play:asset-delivery:2.3.0` AAR manifest declares only `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_DATA_SYNC` — no INTERNET (verified 2 Sep 2026 by unzipping the AAR from dl.google.com). Size limits (Play Console help 9859372): individual asset pack 1.5 GB; cumulative on-demand/fast-follow packs 30 GB; base + feature modules + install-time packs 4 GB; up to 100 packs. Large models are split into shards across packs. On mobile data, big packs trigger a Play confirmation dialog handled by the library (`ASSET_PACK_REQUIRES_USER_CONFIRMATION`).
- **Play Billing works without it.** `com.android.billingclient:billing:9.1.0` AAR manifest declares only `com.android.vending.BILLING` (verified the same way). Purchases go through the Play Store process. Do not add RevenueCat or similar SDKs — they make their own network calls and would force INTERNET back into the merged manifest.
- **Import path for power users:** the Storage Access Framework picker (`ACTION_OPEN_DOCUMENT`) needs no permission. Register the app for `.gguf` files so a model downloaded in the browser opens straight into the app. This is exactly how the open-source **OfflineLLM** (github.com/jegly/OfflineLLM) works: "no INTERNET permission in the manifest, cannot phone home", models imported from Hugging Face via the file picker.
- **Sideloaded installs** (APK outside Play) cannot use Asset Delivery; they get the import path only.
- **Verify before claiming:** run `aapt2 dump permissions app-release.apk` on every release; any transitive SDK (Firebase, ads, WebView-based SDKs) can inject INTERNET through manifest merging.

Recommended Android model plan: default 1–2B model as an **install-time asset pack** (or fast-follow) so the free tier is offline from first launch; optional 3B–8B models as **on-demand packs** delivered by Play; GGUF import for everything else. Result: a manifest with zero network permissions and a store listing that can say so.

iOS has no per-app network permission (only China's cellular-data prompt), so the iOS proof is: bundled default model, Data Not Collected label, App Privacy Report showing zero domains, and Apple-hosted asset packs (iOS 26, downloaded by the system, 200 packs / 200 GB per app) for optional models.

### What competitors claim today

| App | Claim language | Privacy label | Network reality |
|-----|----------------|---------------|-----------------|
| Private LLM (iOS, $4.99) | "Local Offline Private AI Chat"; "no internet required after the first model download"; airplane mode works | Data Not Collected | 1.4 GB app with bundled models; no analytics |
| Enclave (iOS, free + $9.99/mo cloud) | "Anonymous, Offline, Private AI"; "no account, no cloud, no data collection"; "Privacy is not a feature. It's the foundation." | Data Not Collected | Downloads models; Pro forwards messages to cloud models |
| Locally AI by LM Studio (iOS, free) | "Offline. Private. No login. No data collection." | Data Not Collected | Downloads models |
| Loci (iOS, free) | "works anywhere, even in airplane mode"; "no tracking" | **Collects identifiers, usage, diagnostics** | Contradicts its own copy |
| Cloudless (iOS, free) | "no cloud, no one listening" | **Collects device ID, usage, crash data** | Same contradiction |
| Local AI - Private & Offline (iOS) | "Your data never leaves your device" | **Ad-tracking identifiers** | Same contradiction |
| PocketPal (both, free, open source) | "conversations remain confidential and offline" | Data Not Collected | Manifest **does** declare INTERNET (for the downloader) — a blog claim that it has "zero internet permission" is false |
| Off Grid (both, free MIT + Pro) | "no account, no API key, zero data leaves your device" | Data Not Collected | Has network (downloads, multi-device sync) |
| OfflineLLM (Android, GitHub) | "no INTERNET permission in the manifest, cannot phone home" | n/a | The only one found making the manifest claim; not a mainstream store brand |

No mainstream store app markets "no internet permission". Independent testing (meetaitools, Aug 2026) found 5 of 13 "offline" Android chatbots sending data to external servers — the trust gap is real and unclaimed.

---

## 3. Pricing benchmarks (Sept 2026) and recommendation

### Mobile competitors

| App | Platform | Model | Price points |
|-----|----------|-------|--------------|
| Private LLM | iOS/macOS | Paid up-front, Family Sharing, no IAP | **$4.99** (was $9.99) |
| Local LLM: Private Secure Chat | iOS | Paid up-front | $9.99 |
| OfflineLLM: Private AI Chat | iOS | Paid up-front | $5.99 |
| Secret AI: Local AI Chat | iOS + Android (50K+ installs) | Free + tiers | Plus $4.99, Pro $9.99, **Plus Lifetime $59.99, Pro Lifetime $119.99** |
| Off Grid AI | iOS + Android (50K+) | Free MIT core + Pro | **$69 lifetime** (rising to $149), $49/yr (rising to $99); Play IAP range $19.99–$219.99 |
| Enclave | iOS | Free local; Pro = cloud credits | $9.99/month, no lifetime |
| Locally AI (LM Studio) | iOS | Free, no IAP | — |
| Liquid Apollo | iOS | Free | — |
| PocketPal | both (1M+ Play installs) | Free, open source | Play shows $19.99–$219.99 IAP (support tiers) |
| Layla | Android (10K+) | Was $19.99 paid; now IAP | $4.99–$29.99 |
| Local AI - Offline AI chatbot | Android (50K+) | Free + IAP | $3.99–$119.99 |
| Offline AI: Local Assistant | Android (100K+) | Free + IAP | $0.09–$549.99 |
| Offline AI Chat Private | Android (10K+) | Free + IAP | $4.99–$94.99 |
| LocalAI: Offline AI Chat LLM | Android (10K+) | Free + IAP | $1.09–$104.99 |
| Vethos: Offline AI Chatbot | Android (10K+) | Free + single IAP | $9.99 |
| Private Mind (Software Mansion) | Android | Free, no IAP | — |

### Desktop reference points

| Product | Price |
|---------|-------|
| LM Studio | Free, including for work (since July 2025); paid Enterprise tier |
| Msty Studio | Aurum $149/user/yr or **$349 lifetime** (raised from $249, Dec 2025) |
| Jan | Free, open source |
| Ollama | Free |

Typical Pro gates in the category: larger/better models and model library, document/photo (vision) chat, voice, custom assistants/personas, chat history search and export, multi-device sync (Off Grid), cloud models (Enclave).

### Store fees (net math)

- **Apple Small Business Program:** 15% commission for developers under $1M net proceeds in the prior year; applies to paid apps, IAP and subscriptions. ([Apple](https://developer.apple.com/app-store/small-business-program/))
- **Google Play, rest of world:** 15% on the first $1M per year (30% above), 15% on subscriptions.
- **Google Play, US/EEA/UK from 30 June 2026** (verbatim from the fee page): first $1M of annual earnings **10% service fee + 5% billing fee** via Google Play Billing (= 15%); above $1M, standard 20% + 5% for new installs, 25% + 5% for existing installs, subscriptions 10% + 5%; Apps Experience program lowers the standard tiers by 5 points. ([Google](https://support.google.com/googleplay/android-developer/answer/112622))
- US prices are pre-sales-tax (tax added on top); in VAT countries the store deducts VAT first (e.g. €19.99 in Germany → €16.80 ex-VAT → €14.28 net at 15%).

| Price | Net at 15% (US) |
|-------|-----------------|
| $9.99 | $8.49 |
| $14.99 | $12.74 |
| $19.99 | $16.99 |
| $29.99 | $25.49 |
| $49.99 | $42.49 |

### Recommended price points

| Tier | Price | Net | Gates | Reasoning |
|------|-------|-----|-------|-----------|
| **Free** | $0 | — | Unlimited chat with the bundled small model, airplane-mode proof, no ads, no account | Free install is what wins the Play "offline" keyword axis; usage caps would contradict the "no tracking" story, so gate capability, not usage. |
| **Pro (lifetime, one-time)** | **$19.99** (founder price $14.99 for the launch window, then $19.99, later $24.99 — announce the ladder like Off Grid does) | $16.99 | Larger models (3B–8B) and model library, GGUF import, document + photo chat, voice, personas/system prompts, folders/search/export, biometric lock, themes | Empty middle of the market: above the $4.99–$9.99 paid-upfront apps (which have no free trial), far below the $59.99–$119.99 lifetime tiers, and cheaper than two months of Enclave Pro. One purchase unlocks all devices via Family Sharing / Play account. |
| **Pro yearly (anchor)** | **$9.99/yr** | $8.49 | Same as Pro | Shown next to lifetime purely as an anchor: lifetime = two years, so most buyers pick lifetime. Keep it; do not promote it. |
| **Pro for Work (future)** | **$49.99 lifetime** or $29.99/yr per device | $42.49 / $25.49 | Private document workspace (folders of PDFs/DOCX/notes with on-device retrieval), long context, 7B–14B models on flagship phones, custom assistants, redaction/export tools, optional LAN-only sync to desktop, priority support; volume licensing via Apple Business Manager and Managed Google Play | Lawyers, clinicians, journalists, finance and government staff pay for "data never leaves the device" as a compliance feature. Msty charges $349 lifetime on desktop; Off Grid $69; $49.99 mobile is the safe entry and can rise. |

---

## 4. Store listing drafts (English)

Keyword data (ASO autocomplete proxies, US, 2 Sep 2026): App Store — "private ai", "local ai", "on device ai", "offline ai", "private ai chat", "local llm" all 95/100 demand with LOW competition; "offline ai assistant" 87; "offline chatbot" 78; "no internet ai" 72 but high competition; "ai without internet" 0 on iOS. Google Play — "offline chatbot", "ai offline", "ai without internet", "offline ai chat", "local ai" all 100/100. Subtitle comparison: "Offline On-Device LLM Chatbot" scored 630 vs 610 for "Secure Offline LLM Assistant" and 440 for "Offline, On-Device Assistant".

### iOS (shown with Autark; swap the brand word)

- **Title (30):** `Autark: Private Local AI Chat` — 29 chars. (Airtight variant: `Airtight: Private Local AI` — 26; "chat" moves to the subtitle.)
- **Subtitle (30):** `Offline On-Device LLM Chatbot` — 29 chars.
- **Keywords (100):** `assistant,secure,free,internet,airplane,gguf,llama,mistral,gemma,qwen,encrypted,notes,writer,phi` — 96 chars. No word repeats the title/subtitle; "no" and "ai" are stop words Apple already indexes from the title. Optional test later: add "chatgpt" (Apple tolerates it in the keyword field, not in names).
- **Promotional text (170):** `Runs 100% on your phone. No account, no cloud, no ads. Nothing you type ever leaves your device. Turn on Airplane Mode and it still answers.` — 140 chars.
- **Description opening (for the first three lines, which show before "more"):** "Autark is a private AI chat that runs entirely on your iPhone. The model is inside the app: no account, no cloud, no analytics, no ads. Check Settings → App Privacy Report — Autark contacts zero domains. Put your phone in Airplane Mode and keep chatting."

### Google Play

- **Title (30):** `Autark - Offline AI Chat` — 24 chars. (Airtight: `Airtight - Offline AI Chat` — 26.)
- **Short description (80):** `AI chat without internet. Runs 100% on your phone: no account, no ads, no cloud.` — 80 chars. Alternate: `Offline AI chatbot on your phone. No internet, no account, no ads, no cloud.` — 76.
- **Long description, opening paragraph:**

  "Autark is an offline AI chat app: a private chatbot that runs 100% on your phone, with no internet connection needed. Install it and the AI works in airplane mode — on a plane, underground, abroad, or anywhere without Wi-Fi. Nothing you type ever leaves your device: Autark has no account, no analytics, no ads, and does not even request the Internet permission (check App permissions on this page). It is local AI, not cloud AI. Your questions, notes and documents stay on your phone, and the Pro upgrade is a one-time purchase, not a subscription."

  Follow with bullet sections: "Works without internet", "Private by construction" (no INTERNET permission, no account, no trackers), "Choose your model" (Gemma, Llama, Qwen, Mistral, Phi; import any GGUF), "Pro, once" (features), "Proof" (airplane mode, permissions page, open-source core).

---

## Sources

- Android DownloadManager reference (INTERNET required): https://developer.android.com/reference/android/app/DownloadManager
- Play Asset Delivery overview: https://developer.android.com/guide/playcore/asset-delivery
- Google Play size limits (1.5 GB per pack, 30 GB on-demand, 4 GB install-time): https://support.google.com/googleplay/android-developer/answer/9859372
- AssetPackManager API (user-confirmation flow): https://developer.android.com/reference/com/google/android/play/core/assetpacks/AssetPackManager
- Library manifests inspected: https://dl.google.com/dl/android/maven2/com/google/android/play/asset-delivery/2.3.0/asset-delivery-2.3.0.aar and https://dl.google.com/dl/android/maven2/com/android/billingclient/billing/9.1.0/billing-9.1.0.aar
- Google Play service fees (incl. 30 June 2026 US/EEA/UK table): https://support.google.com/googleplay/android-developer/answer/112622
- Play fee overhaul coverage: https://www.ghacks.net/2026/06/25/google-play-billing-choice-program-goes-live-june-30-with-lower-developer-fees-and-third-party-billing/ ; https://stora.sh/blog/2026-03-31-google-play-fee-overhaul-epic-settlement-developer-guide
- Apple Small Business Program: https://developer.apple.com/app-store/small-business-program/
- Apple maximum build sizes (4 GB): https://developer.apple.com/help/app-store-connect/reference/maximum-build-file-sizes
- Apple-hosted asset pack limits (200 packs / 200 GB): https://developer.apple.com/help/app-store-connect/reference/app-uploads/apple-hosted-asset-pack-size-limits/
- Apple-hosted asset packs (Background Assets, iOS 26): https://developer.apple.com/documentation/backgroundassets/downloading-apple-hosted-asset-packs
- App Privacy Report: https://support.apple.com/en-us/102188
- OfflineLLM (no INTERNET permission, import-only): https://github.com/jegly/OfflineLLM
- PocketPal manifest (declares INTERNET): https://github.com/a-ghorbani/pocketpal-ai/blob/main/android/app/src/main/AndroidManifest.xml
- Private LLM listing: https://apps.apple.com/us/app/private-llm-local-ai-chat/id6448106860
- Enclave listing and pricing: https://apps.apple.com/us/app/enclave-local-ai-assistant/id6476614556 ; https://enclaveai.app/pricing/
- Locally AI: https://apps.apple.com/us/app/locally-ai-by-lm-studio/id6741426692
- Secret AI: https://apps.apple.com/us/app/secret-ai-local-ai-chat/id6744668980
- Off Grid AI Pro pricing: https://getoffgridai.co/pro/ ; https://apps.apple.com/us/app/off-grid-ai-private-local-ai/id6759299882
- Loci: https://apps.apple.com/us/app/loci-private-local-ai/id6762100748 ; Cloudless: https://apps.apple.com/us/app/cloudless-private-local/id6760565298 ; Cloak: https://apps.apple.com/us/app/cloak-offline-ai-chat/id6781878402 ; Local LLM: https://apps.apple.com/us/app/local-llm-private-secure-chat/id6742779670 ; OfflineLLM (iOS): https://apps.apple.com/us/app/offlinellm-private-ai-chat/id6474508768 ; PocketPal: https://apps.apple.com/us/app/pocketpal-ai/id6502579498
- Layla: https://play.google.com/store/apps/details?id=com.layla ; Android competitor IAP ranges scraped from Play listing pages (ids in play_competitors.txt in this folder)
- Msty pricing: https://msty.ai/pricing/ ; https://msty.ai/blog/2025-black-friday-price-increase/
- LM Studio free for work: https://lmstudio.ai/blog/free-for-work
- Jan: https://jan.ai/
- iPhone local-LLM ranking with prices (July 2026): https://modelfit.io/guides/best-llm-for-iphone/
- Android offline chatbot test, 5 of 13 phoned home (Aug 2026): https://meetaitools.com/ai-chatbot-app-for-android-offline/
- BunkerAI (name conflict): https://bunkerai.io/ ; Innate robotics: https://www.innate.bot/about ; Sovran AI: https://www.sovranai.com/ ; Conclave AI: https://conclaveai.app/ ; Cabin AI (Play): https://play.google.com/store/apps/details?id=com.cabinmobile ; Kura AI: https://www.ycombinator.com/companies/kura-ai ; Atoll: https://atollhq.com/ ; Autark (German automation): https://www.autark.com/en_index.html
- Raw check logs in this folder: domains.txt, domains2.txt, domains3.txt, appstore.txt, appstore2.txt, names3.txt, playstore.txt, playstore2.txt, play_competitors.txt, ios_competitor_ids.txt
