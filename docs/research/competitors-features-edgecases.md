# Private on-device AI chat app — competitor matrix, feature universe, edge cases, store & legal (research pack, 2 Sep 2026)

Prepared as input for the PRD of a fully private, offline, on-device LLM chat app (free tier + one-time Pro ≈ $15–20, later "Pro for Work").
All store figures were pulled live on 2 Sep 2026 (iTunes Lookup API for the US storefront, App Store review RSS feeds, Google Play pages + `google-play-scraper`, vendor sites, GitHub). Where a number is an estimate or a third-party claim it is marked as such.

---

## 0. Executive read (what the data says)

1. **The category is free by default.** Every serious local-chat competitor on phones is free for on-device use (PocketPal, Locally AI, Enclave, Apollo, fullmoon, MLC Chat, Google AI Edge Gallery, Off Grid). Money is made on cloud add-ons (Enclave $9.99/mo credits), one-time unlocks of power features (Off Grid Pro $69 one-time / $49 yr), marketplace items (PocketPal PalsHub), or a low one-time price for the whole app (Private LLM $4.99 universal + Family Sharing). Layla ($19.99 paid app that then upsells a cloud subscription) is the cautionary tale: 3.35★ on Play, 3.84★ on iOS, refund complaints.
2. **Ratings correlate with reliability, not price or model choice.** The two best-rated local apps are free and native: Locally AI 4.73★ (1,549 ratings) and Enclave 4.69★ (1,052). The most-installed one, PocketPal (1M+ Play installs), sits at 3.16★ on Play because of download failures, crashes after updates, and "phone too weak" experiences — 1,078 one-star vs 1,242 five-star ratings.
3. **The ten repeated complaints** (evidence in §1.6): downloads fail/stall/no resume; crash on model load or after an update; "which model fits my phone?" + OOM; generation dies when the app is backgrounded; heat & battery; model is dumb/wrong/repeats; documents crash or are missing; bait-and-switch paywalls; privacy claims not verifiable (apps that phone home); missing chat basics (edit/regenerate, delete model, formatting/LaTeX, export, search).
4. **Nobody owns "provably private".** Third-party testing found 5 of 13 "offline" Android apps failed an airplane-mode test; Apollo reviews report background calls to `leap.liquid.ai` and `sentry.io`; Layla reviews report location permission and "collects all chats" in its data-safety declaration. An app that ships network-isolation proof, a Data-Not-Collected label, and an open verifiable client would be alone in the category.
5. **Platform vendors are moving in, but not into this niche.** Apple's Siri AI (iOS 27, standalone Siri app, personal context, Gemini-backed per press reports) and Google's AI Edge Gallery are free, but Siri AI is English-only beta, excluded on iPhone in the EU at launch and absent in China, and the Foundation Models framework's on-device model is a 3B-class model with a 4,096-token context and hard guardrails. Apple's acceptable-use rules also forbid using it for medical/legal/financial outputs without human supervision — relevant to "Pro for Work".
6. **Store/legal 2026 is manageable for a zero-collection app**: Apple's new 13+/16+/18+ tiers explicitly count chatbot output toward sensitive-content frequency; Google Play requires an in-app "report/flag AI content" control for chatbot apps; "Data Not Collected" is achievable if literally nothing leaves the device (including crash SDKs); EU AI Act Article 50 transparency applies from 2 Aug 2026; model licenses are mostly Apache/MIT now (Gemma 4 moved to Apache 2.0), with pass-through obligations only for Gemma ≤3/3n, Llama, and LFM2 (revenue cap).

---

## 1. Competitor feature matrix (2026)

### 1.1 Snapshot table (live store data, 2 Sep 2026)

| App (seller) | Platforms | Pricing | Engine / model source | iOS rating (n) · age | Android rating (n) · installs | Min OS · app size | Last update |
|---|---|---|---|---|---|---|---|
| **PocketPal AI** (Asghar Ghorbani / "LLM Ventures" on Play; open source MIT) | iOS, Android | Free; paid "Pals" marketplace (PalsHub) in US | llama.cpp (llama.rn), any GGUF from Hugging Face, CPU/GPU/Hexagon NPU | 4.11★ (152) · 17+ | 3.16★ (3,194) · **1M+** | iOS 15.1 / Android 7 · 82 MB | 28 Aug 2026 (v1.17.2) |
| **Private LLM** (Numen Technologies, IE) | iOS, iPadOS, macOS (universal purchase); Android beta APK only | **$4.99 one-time**, Family Sharing (6) | Proprietary runtime, OmniQuant/GPTQ 3–4-bit, curated 140+ models incl. uncensored builds; downloads from own CDN since Jul 2026 | 4.16★ (710) · 12+ | n/a (no Play listing) | iOS 17 · 1.36 GB | 9 Jul 2026 (v1.9.15) |
| **Locally AI by LM Studio** (Element Labs) | iOS, iPadOS, macOS 26 | **Free, no IAP** | Apple MLX, curated catalog (Llama, Gemma 4 E2B/E4B, Qwen 3.x, DeepSeek, Granite, LFM), Apple Foundation Model on iOS 26; "LM Link" to desktop LM Studio | **4.73★ (1,549)** · 12+ | n/a | iOS 18.1 · 108 MB | 11 Aug 2026 (v1.64.0) |
| **Enclave** (Piotr Gorzelany) | iPhone, iPad, Mac, Vision Pro, Watch | Free for local; **Pro $9.99/mo** = $9.99 cloud credits (GPT/Claude/Gemini/DeepSeek via OpenRouter) | llama.cpp, any GGUF from HF | **4.69★ (1,052)** · 17+ | n/a | **iOS 26.0** · 748 MB | 11 Aug 2026 (v1.75.0) |
| **Liquid Apollo** (Liquid AI; was Apollo by Aaron Ng) | iOS, Android | Free | LEAP SDK (LFM2 family, 300 MB+), OpenRouter, custom backends (Ollama/LM Studio) | 4.52★ (625) · 12+ | 3.61★ (102) · 10K+ | iOS 18 · 156 MB | 24 Jul 2026 (v2.2.4) |
| **fullmoon** (Mainframe; MIT) | iOS, iPadOS, macOS, visionOS | Free | MLX Swift; 3 models (Llama 3.2 1B/3B, DeepSeek-R1-Distill-Qwen-1.5B) | 4.42★ (113) · 17+ | n/a | iOS 17.6 · 31 MB | 28 Jan 2025 (dormant) |
| **MLC Chat** (Tianqi Chen / MLC AI) | iOS; Android APK sideload | Free, "non-commercial" | MLC-LLM/TVM compiled models, Metal / Hexagon NPU | 4.17★ (84) · 17+ | not on Play | iOS 17 · 1.8 GB | 27 Sep 2024 (dormant) |
| **Google AI Edge Gallery** (Google) | Android, iOS | Free, open source | LiteRT-LM; Gemma 4 E2B/E4B only (+HF LiteRT imports) | 4.04★ (159) · 12+ | ~4.1★ · **1M+** · Teen | iOS 17 / Android 12 · 76 MB | 10 Aug 2026 |
| **Layla** (Layla Network, AU) | Android, iOS (+ free "Layla (Cloud)" app) | **$19.99 paid app**, then cloud/"Blu Morpho" subscriptions for extras | llama.cpp GGUF, LiteRT image gen, Python agents; downloads 4 GB model on first launch, needs 8 GB+ RAM | 3.84★ (31) · **4+** | 3.35★ (543) · 10K+ | iOS 16.4 / Android 9 | 27 Aug 2026 (v7.3.0) |
| **Off Grid AI** (Wednesday Solutions; MIT) | iOS, Android, Mac | Free; **Pro $69 one-time (rising to $149) or $49/yr**, 5 devices | llama.cpp GGUF, Whisper STT, Stable Diffusion, Kokoro TTS (Pro) | 3.04★ (24) · 17+ | (new, low volume) | iOS 17 / Android 10, 4 GB RAM | 22 Aug 2026 (v0.0.107) |
| **HuggingSnap** (Hugging Face) | iOS, macOS, visionOS | Free | SmolVLM2 vision (camera description), not a chat app | not returned by iTunes lookup (US/GB) on 2 Sep 2026 — possibly delisted/region-limited | n/a | iOS 18 | Mar 2025 launch |
| **Chatbox** (2.5 HK / "Mediocre Company") | iOS, Android, desktop, web | Free client; Chatbox AI cloud: Lite $3.99/mo, Pro $19.99/mo, Pro+ $39.99/mo | **No on-device inference on mobile**; connects to Ollama/LM Studio/API keys | 4.62★ (595) · 17+ | 3.72★ (737) · 100K+ · Teen | iOS 16 | 2 Sep 2026 |
| **Msty** | Desktop (Msty Studio); "Msty Go" mobile companions in app review (agent control, not local inference) | Free; Aurum $149/yr; Lifetime $349; Teams $300/seat | llama.cpp + MLX (desktop) | — | — | — | active |
| **Jan** (Menlo Research) | Desktop only (macOS/Win/Linux), 5M+ downloads, 42K GitHub stars | Free, open source | llama.cpp / MLX | — | — | — | active |
| **Ollama** | Desktop app (macOS/Win); no official mobile app; third-party clients (Ollama Mobile, Reins, LMSA, Ollama AI Chat 1K+) or Termux | Free; Ollama Cloud subscription | llama.cpp fork | — | — | — | active |
| **LM Studio** | Desktop; mobile = Locally AI (acquired 2026, first LM-Link build 4 Jun 2026) | Free | llama.cpp + MLX | — | — | — | active |
| **Venice AI** (cloud, "private") | iOS, web; Android listing removed from Play ~30 Aug 2026 (was 2.75★, 2.1K ratings, ~570K downloads per AppBrain) | Free (≈10 text/15 image prompts per day); Pro $18/mo; Pro+ $68; Max $200 | Cloud open models via decentralized GPUs; history in browser storage | 4.0★ (790) · 17+ | removed | iOS 16.4 | 29 Aug 2026 |
| **Lumo by Proton** (cloud, "zero-access encryption") | iOS, Android, web | Free (no account, weekly limits, 7-day history); Plus $9.99/mo annual ($12.99 monthly); Business tiers | Proton-hosted open models (EU infra), Ghost Mode | 3.84★ (504) · 4+ | 3.71★ (2,897) · 100K+ | iOS 17.6 | 21 Aug 2026 |
| **DuckDuckGo / Duck.ai** (cloud, anonymized proxy) | iOS, Android, desktop | Free (GPT-5 mini etc.); Plus $9.99/mo; Pro $19.99/mo | Third-party cloud models via DDG proxy, history local, 30-day deletion | 4.85★ (2.39M, whole browser) · 17+ | 4.69★ (2.45M) · 50M+ | iOS 15 | 31 Aug 2026 |
| Long tail on iOS: "Local LLM: Private Secure Chat" (Pocket Bits, $9.99 one-time, 3.4★/5), "Local LLM – Offline AI" (mandatory subscription, 0 ratings), "ai.local" (3.7★/10), "Local LLM Server" (Apple-Intelligence API server, 3.7★/3) | | | | | | | |
| Long tail on Android (from 13-app test, meetaitools Apr 2026): MLC Chat, Maid (F-Droid), ToolNeuron, ChatterUI, Private AI (local LLM), AnLLM, GPT4All Android, Pocket AI, AiLLaMA, "Offline AI Chat", LMSA (3.24★, 10K+, biometric lock, ads), SmolChat | | | | | | | |

Install proxies: Apple does not publish installs; ratings counts above are the best public proxy (rule of thumb 1 rating ≈ 50–200 installs for utilities). Play brackets are official.

### 1.2 Feature matrix (local-inference apps)

Legend: ● shipped · ◐ partial/limited · ○ absent · ? not verified

| Feature | PocketPal | Private LLM | Locally AI | Enclave | Apollo | fullmoon | MLC Chat | AI Edge Gallery | Layla | Off Grid |
|---|---|---|---|---|---|---|---|---|---|---|
| Model library / catalog | ● HF search, 135K+ GGUF, RAM filter | ● 140+ curated, filter by device/RAM/use | ● curated MLX catalog + Apple model | ● HF GGUF search | ◐ LFM2 set + custom backends | ◐ 3 models | ◐ curated, compiled | ◐ Gemma 4 only + LiteRT imports | ◐ curated + custom GGUF | ● any GGUF |
| Import own model file | ● (local file / HF) | ○ | ○ (top request) | ● | ○ (request) | ○ | ○ | ◐ (LiteRT-LM only) | ◐ | ● |
| Document chat / RAG | ○ (top request) | ○ (FAQ: not supported) | ◐ attach PDF/DOCX/CSV/TXT/code (crashes on larger files) | ◐ PDF/text/image/code attach (crashes on "meaningful size") | ◐ one attachment | ○ | ○ | ○ | ◐ (reference docs request) | ● "Projects" with chunking + citations |
| Image input (vision) | ● vision GGUF | ○ | ● | ● image attach | ● | ○ | ○ | ● Ask Image, multimodal chat | ● | ● camera/vision |
| Voice in / out | ◐ on-device TTS (Kokoro/Kitten/Supertonic; needs first-run internet), no live voice | ○ | ● local voice mode | ● full on-device voice chat (Apple STT/TTS) | ◐ voice (no headset routing) | ○ | ○ | ● Audio Scribe (transcribe/translate) | ● 100+ voices | ● Whisper STT; TTS in Pro |
| Personas / system prompts | ● "Pals" (assistant, roleplay) + PalsHub | ● system prompt | ● system prompt | ● custom assistants w/ own history | ● personas (system prompt overridden complaints) | ● system prompt | ○ | ● prompt editing | ● characters, group chats | ● personas (Pro) |
| Memory across chats (on-device) | ○ (requested) | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● "tell Layla about yourself" | ● persistent memory (Pro) |
| Folders / pin / search | ◐ pin chats, search | ○ | ◐ pinned | ◐ | ◐ search | ○ | ○ history | ● persistent history | ◐ | ◐ |
| Export chat | ● Markdown export | ○ (complaint) | ? | ● export, auto-delete periods | ? | ○ | ○ | ○ | ? | ? |
| App lock / biometrics | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ (LMSA on Android has it) |
| Encrypted local DB | ? | ? | ? | ● "encrypted local storage" | ? | ? | ? | ? | ? | ● E2E sync (Pro) |
| Shortcuts / Siri | ○ (top con in guides) | ● Siri + Shortcuts + x-callback-url; macOS Services | ● Shortcuts, Siri, Control Center, Action button | ● Shortcuts/Siri, model per automation | ◐ limited | ● Shortcut action | ○ | ○ | ○ | ○ |
| Widgets / Lock Screen | ◐ (claimed in guides; not in README) | ○ | ● Controls (Control Center / Lock Screen) | ○ | ○ | ○ | ○ | ○ (requested) | ○ | ○ |
| Share sheet / Android intents | ● Android share sheet | ○ | ○ (requested) | ○ | ○ | ○ | ○ | ○ | ● Android share sheet | ? |
| Web search hybrid | ● BYO key (Brave/Tavily/Exa) | ○ | ○ (requested) | ● cloud models only | ◐ (broken per reviews) | ○ | ○ | ● agent skills (Wikipedia, maps) | ● browser automation | ● built-in |
| Cloud fallback | ○ | ○ | ○ (LM Link to own Mac) | ● Pro (OpenRouter) | ● OpenRouter/custom | ○ | ○ | ○ | ● Layla Cloud | ● LAN servers |
| Tools / MCP | ● talents (calc, time, HTML) | ○ | ○ (requested) | ○ | ○ (complaint) | ○ | ○ | ● MCP (Android, experimental), notifications | ● Python agents | ● tools, MCP (Pro) |
| Benchmark / device fit | ● tok/s + memory, leaderboard | ◐ RAM tiers in picker | ◐ performance indicators | ◐ tok/s display | ● dev mode tok/s | ○ | ○ | ● benchmarking | ○ | ● size + RAM estimate |
| Sampling / context controls | ● full | ◐ temp/top-p; 8K ctx iPhone, 32K Mac | ◐ temperature | ◐ | ◐ (params ignored on custom backend) | ○ | ○ | ● Prompt Lab (temp, top-k) | ● advanced settings plugin | ◐ |
| Background download / resume | ◐ (interrupted on exit; resumes) | ● CDN | ◐ stalls reported | ◐ HF failures reported | ○ inconsistent | n/a | n/a | ◐ | ○ "took days" | ? |
| Open source client | ● MIT | ○ | ○ | ○ | ○ | ● MIT | ● Apache | ● Apache | ○ | ● MIT |
| Report/flag AI output control | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Languages (UI) | 11 (+PT-BR, PL) | EN + W. European | multiple | EN | EN | EN | EN | EN | EN | EN |

Nobody in the local category ships: app lock/biometrics, incognito/no-history mode, panic wipe, screenshot blocking, passphrase-encrypted backup/export, a verifiable "no network" mode, an in-app report control, on-device memory with user control, a keyboard extension, or an accessibility-audited streaming UI. Those are open positions.

### 1.3 Per-competitor notes (what users praise / complain about — from live reviews)

**PocketPal AI** — Praise: "runs well, no ads, completely offline", huge model choice, benchmark feature, open source, fast updates (Gemma 4 support within hours), NPU support. Complaints (Play 1★ cluster): downloads fail or stop mid-way, no resume, HTTP 429 from Hugging Face, "waste of data" in expensive-bandwidth countries; app crashed on every model after the Gemma 4 update (clean install did not help); crashes on specific devices (Galaxy S26 Ultra hangs, Z Fold 4, Redmi Note 5 Pro, Snapdragon 8 Gen 5 on Android 16 = 16 KB page-size crash, GitHub #512); "stops generating and unloads the model when you switch to another app"; "uses a lot of battery and warms up my phone"; no LaTeX/markdown rendering; wrong/dangerous answers ("told me to drink rubbing alcohol"); MediaTek not accelerated ("1 minute for Hello"); "false advertisement — calendar not free" (PalsHub); a model (PrismML Bonsai) that crashes the app on every launch until storage is wiped (GitHub #658); iOS: accessibility for visually impaired missing, model loading failures on iPhone 15 Pro with latest iOS, BitNet model prevents launch. Requests: PDFs/attachments, SD-card/external model folder, internet access/MCP, edit AI reply, voice input, image generation.

**Private LLM** — Praise: one purchase across all Apple devices with Family Sharing, Siri/Shortcuts/x-callback, curated (incl. uncensored) models, OmniQuant quality, responsive developer, no subscription. Complaints (aggregated review summaries): stability/crashes, "less features and overpriced compared to PocketPal/OfflineLLM", no document support, no chat export, copying text reloads the model and clears conversation, looping/repeating context, generation slows to a crawl; stopped loading models on some iOS updates. FAQ acknowledges crashes = insufficient memory ("close background apps, restart, use smaller model"), CPU-only when backgrounded, 8K context on iPhone, Hugging Face outages, Chinese mirror.

**Locally AI (LM Studio)** — Praise: "feels like an official Apple app", "best UI of all local AI apps", fast model additions (Gemma 4, Qwen 3.5), Shortcuts, privacy policy verified by a security analyst, no IAP. Complaints: crashes ("after second or third input or when scrolling", iPhone SE 3 freezes on smallest model, crash on a 21 KB markdown file), cannot import own GGUF/MLX models (top 1★ reason), model downloads stall or slow at the end, Gemma 4 E4B missing/removed on some devices, no formula rendering, battery drain, no multi-photo, no share-sheet/Safari extension, no web search/MCP, "stop advertising new models in the new-chat page".

**Enclave** — Praise: best-in-class on-device voice chat, attachments, Shortcuts, HF models, polished UI, developer responsiveness, "please keep it free", works on older phones. Complaints: "Couldn't initialize the chat service" on first launch (iOS 17 devices; app now requires iOS 26), crashes when a PDF of "meaningful size" is attached (markdown rendering bug), a model listed as 4 GB that was really 400 GB "near soft-bricked" a 256 GB iPad, no regenerate/edit message, cannot delete downloaded models, robotic system voices with no voice picker, model repeating example text, Mac version lacks separate chats, one review confused by the model claiming conversations are tracked.

**Liquid Apollo** — Praise: nice design, local + remote flexibility, LFM2 models are good for their size, dev mode tok/s. Complaints: 1★ "Background Phoning Home" (restarts in background, calls `leap.liquid.ai` and `sentry.io`), tiny context so bots "only see the prompt", system prompt overridden/"how to remove your stupid system prompt", censorship, web search broken, scroll jumping, crashes with custom backends, https forced for LAN endpoints on Android, no send button on some keyboards, "tech demo, not a consumer app", models delete themselves after an update, `libinference_engine_jni.so not found`.

**fullmoon / MLC Chat** — Praise: free, simple, open source, "pretty amazing" offline. Complaints: dormant (Jan 2025 / Sep 2024), MLC resets when backgrounded, no conversation persistence, cannot delete models, only 3-bit 7B fits and "result is comically bad", tiny model lists.

**Google AI Edge Gallery** — Praise: Gemma 4 on-device quality, Audio Scribe, agent skills, official Google, MCP + notification skills (Android). Complaints: freezes after multiple prompts (iPhone 15), crashes when adjusting model settings, LiteRT-LM only (no safetensors/GGUF), Mobile Actions underwhelming, no widget, Play rating "Teen".

**Layla** — Praise (5★): characters/roleplay, voices, offline. Complaints: paid $19.99 then "need a subscription to use parts of the app", "device too weak, must use Layla cloud" after an update, 4 GB download on first launch that "took days", crashes on S25 Ultra/Z Fold 7/Xiaomi 14, "NOT PRIVATE — had full access to my location and claims to collect all chats", personal-assistant features (calendar/to-do) do not work, image generation broken, refunds requested, role-play update broke character cards, iOS "constant crashing", "iPhones aren't ready for this". Rated 4+ on iOS while advertising "no censorship".

**Off Grid** — Praise: Swiss-army-knife (LLM + Stable Diffusion + Whisper + tools), MIT, projects with citations. Weak signal (24 ratings, 3.0★, v0.0.x); Pro at $69 one-time is the highest one-time price in the category.

**Cloud "privacy" apps (Venice, Lumo, Duck.ai, Chatbox)** — Their 1★ reviews are about limits, censorship reversals, lost chats after updates, forced logins, connection errors, and the fact that "it needs their servers" — i.e., the exact promises an offline app can keep. Lumo: "free tier auto-deletes chats after 7 days — deceptive", "speech recognition by Google popup defeats the point", weekly limits hit after 3 sentences, Galaxy Ultra stuck on 2.0 welcome screen. Venice: "no longer uncensored", "months of conversations gone after update", "sessions per device only". Duck.ai: praised for anonymity; complaints are browser-level. Chatbox: forced https for LAN endpoints, no sync, license key nags.

### 1.4 Apple and Google surfaces (2026)

- **Siri AI (iOS 27, announced WWDC 9 Jun 2026)**: new Siri with personal context, on-screen awareness, web answers, cross-app actions, and a dedicated Siri app with conversation history synced via iCloud. Devices: iPhone 15 Pro / 16 and later, M1+ iPad/Mac, Vision Pro. English-only beta at launch; iPhone/iPad/Watch users in the EU excluded initially (Mac/Vision Pro allowed); not available in China. Press (Bloomberg/TechCrunch) reports Google Gemini under the hood. "Extensions" let users route to third-party chatbot apps (Claude, Gemini) from Siri settings — a potential integration surface for a local app.
- **Foundation Models framework** (iOS 26+): on-device ~3B model; availability enum: `available` / `unavailable(deviceNotEligible | appleIntelligenceNotEnabled | modelNotReady)`; generation errors: `exceededContextWindowSize` (4,096-token session window, input+output), `guardrailViolation` (not recoverable), `unsupportedLanguageOrLocale`, `rateLimited`, `concurrentRequests`, `assetsUnavailable`, `refusal`. Three model versions exist across OS 26.0–26.3 / 26.4 / 27.0, so outputs change with OS updates. WWDC26: image input, third-party models (Claude, Gemini) via a `LanguageModel` protocol, framework to be open-sourced, free Private Cloud Compute for developers under 2M downloads. Acceptable-use requirements prohibit, among others, "inaccurate or dangerous outputs or autonomous decisions without human supervision" in employment, medical, legal, finance, adult content, and "dependency or spiraling interactions". Apple positions it as "not a general-knowledge chatbot".
- **Apple Intelligence availability**: iPhone 15 Pro/16+, iPad mini A17 Pro, M1+ iPad/Mac. Languages (16): English, Danish, Dutch, French, German, Italian, Norwegian, Portuguese, Spanish, Swedish, Turkish, Chinese (Simplified/Traditional), Japanese, Korean, Vietnamese. No Hebrew, Arabic, Hindi, Russian, Polish. EU: available since iOS 18.4. China mainland: not on devices bought there / with a China Apple Account.
- **Google**: AI Edge Gallery (above); Gemini Nano through ML Kit GenAI / Prompt API (alpha) — foreground-only (`BACKGROUND_USE_BLOCKED`), Pixel 8+/9/10, Galaxy S24+ and select flagships, not on rooted devices; AICore manages the model lifecycle. Android 15+: `dataSync`/`mediaProcessing` foreground services capped at 6 h per 24 h; 16 KB page-size mandatory for updates targeting API 35+ from 1 Feb 2027.

### 1.5 Pricing landscape and what it means for a $15–20 one-time Pro

| Model | Examples | Signal |
|---|---|---|
| Free forever, local | PocketPal, Locally AI, Enclave (local), Apollo, fullmoon, MLC, AI Edge Gallery, Off Grid (core) | The free tier must be a complete, honest local chat. Gating basic chat loses the category. |
| Low one-time for whole app | Private LLM $4.99 (universal + Family Sharing); "Local LLM: Private Secure Chat" $9.99 | Users accept paying once; they punish crashes and missing basics, not price. |
| One-time power unlock | Off Grid Pro $69 (→ $149), also $49/yr | Sets a high anchor; $15–20 will read as fair if Pro has visible, durable value (docs, voice, privacy vault). |
| Paid app + upsells | Layla $19.99 + subscriptions | Worst-rated pattern; reviews call it bait-and-switch and demand refunds. Avoid any post-purchase subscription for core features. |
| Free local + cloud subscription | Enclave $9.99/mo credits | Proves users want an optional escape hatch; but zero-data positioning argues for keeping cloud out of the product or making it a clearly separate, off-by-default mode. |
| Desktop tiers | Msty $149/yr or $349 lifetime; Jan free; LM Studio free | Prosumer willingness to pay for "knowledge stacks", split chats, workflows — the "Pro for Work" analog. |
| Cloud privacy | Venice $18/mo, Lumo $9.99/mo, Duck.ai $9.99–19.99/mo | Monthly anchors of $10–18 make a $15–20 one-time look like a bargain in marketing copy. |

### 1.6 The most repeated complaints in the category (ranked by frequency across sources)

1. **Model download fails, stalls, cannot resume, or is huge with no warning.** PocketPal Play 1★ cluster ("download failed 429", "stops halfway, no resume", "waste of data"), Locally AI ("stuck every time", "slows at the end"), Layla ("took days"), Apollo ("do not download consistently"), Enclave ("HF downloads don't work"; a 400 GB listing). PocketPal's Aug 2026 release notes: "improved download reliability" — still a live wound.
2. **Crash on model load or after an app/OS update.** PocketPal (all models crashed after the Gemma 4 update; S26 Ultra; Z Fold 4; SD 8 Gen 5 16 KB pages), Locally AI (SE 3, iPhone 15 Pro), Enclave ("couldn't initialize chat service"), Layla (S25 Ultra, Xiaomi 14), Apollo (`.so not found`, models deleted after update), Private LLM (copy text reloads model).
3. **"Which model fits my phone?" and out-of-memory kills.** Reddit: "confused which model is the best for my iPhone 16 Pro"; reviews: "downloaded the lowest model and it's still slow", "if you run 27B on a phone it will crash"; guides: 7B on iPhone = crash; PocketPal's RAM filter and Private LLM's device tiers are the only mitigations.
4. **Generation dies when the app is backgrounded / phone locks.** PocketPal ("stops generating and unloads the model when you switch apps"), MLC ("resets when backgrounded"), Android OEM battery killers (Samsung/OnePlus) noted in every Android roundup, Lumo added "screen stays awake while writing" as a feature.
5. **Heat and battery.** "Warms up my phone very fast", "takes a lot of charge"; measured 20–30 % battery/hour and 30–50 % slowdown after 10–15 minutes from thermal throttling.
6. **Model is dumb, wrong, repeats, ignores the system prompt.** "Drink rubbing alcohol", "dog water answers", "two people with brain damage", "repeats the example words", "reverts to default system prompt", context so small the bot "only sees the prompt" (Apollo). Expectation gap vs ChatGPT is the #1 reason for "useless" reviews on free apps.
7. **Documents: missing, size-limited, or crash.** Requests on PocketPal/Private LLM; crashes on Enclave (bank statement PDF) and Locally AI (21 KB markdown); Lumo "file must be tiny"; Layla asks for "answer only from my PDF".
8. **Paywall surprises / bait-and-switch.** Layla ($19.99 then subscription; "must use cloud"), Venice ("everything behind paywall", "no longer uncensored"), Lumo (7-day deletion not disclosed, weekly limit), PocketPal ("calendar not free"), LMSA ("cost to remove ads extremely high").
9. **Privacy that cannot be verified.** Apollo phoning home (LEAP + Sentry), Layla location permission + "collects all chats", PocketPal TTS needing internet on first use ("NOT FULLY LOCAL"), 5/13 Android apps failing an airplane-mode test, Lumo's Google speech-recognition popup, Chatbox forcing HTTPS on LAN.
10. **Missing chat basics and polish.** Edit/regenerate (Enclave), delete a model (Enclave, MLC), Markdown/LaTeX (PocketPal, Locally AI, Apollo), scroll jumping/auto-scroll (Apollo, Enclave), export (Private LLM), copy the question (Lumo), pin/search/folders, separate chats on Mac (Enclave), multi-file attach (Locally AI), share-sheet entry (Locally AI), send button missing (Lumo, Apollo Android).
11. **Hardware/OS floor surprises.** Enclave requires iOS 26; Locally AI 18.1; PocketPal still supports iOS 15.1 (praised). MediaTek/Mali not accelerated; NPU only on Snapdragon 8 Gen 2+; first MLC compile 5–15 min; "SD card support" requests.
12. **Accessibility.** PocketPal "lack of accessibility for visually impaired"; Venice update broke a low-vision user's screen-reader flow.
13. **Voice.** Robotic system voices without a picker (Enclave), no headset routing (Apollo), no live voice mode (PocketPal), mic crash (Lumo).

### 1.7 What users consistently praise (keep these)

- Truly offline, no account, no ads, no telemetry — and saying so plainly in the UI ("dev points out when it uses local vs remote").
- Native, polished, "feels like an Apple app" UI (Locally AI, Enclave) beats feature count.
- Fast model catalog updates (new open model available within days) and a benchmark/"will it run" indicator.
- Shortcuts/Siri/Control Center hooks; one purchase across devices with Family Sharing; responsive developer who replies to reviews.
- Fully local voice conversation (Enclave) is called out as "not found in any other app".

---

## 2. Feature universe with Free / Pro placement

Placement logic used below:
- **Free** = anything the free competitors already give away (basic local chat, model catalog, system prompt, one attachment, Shortcuts "ask"), plus everything that makes the privacy promise credible (lock, airplane proof, no-history mode). Trust features must never be paywalled — a privacy app that charges for privacy reads as a scam (see Layla/Venice reviews).
- **Pro ($15–20 one-time, universal purchase + Family Sharing on iOS)** = durable power and workflow value that competitors gate or lack: document libraries/RAG, unlimited personas + on-device memory, folders/search/export, voices, OCR, keyboard/share-sheet actions, advanced model controls, encrypted backup. Off Grid ($69) gates TTS, personas+memory, action tools and sync; Msty gates knowledge stacks/workflows; Lumo gates unlimited files/history; Private LLM charges for Shortcuts/Siri + curated models.
- **Work** (later tier) = profession templates, vaults, redaction, audit/export for records, longer-context models, dictation-to-notes.

### 2.1 Chat core

| Feature | Who ships it | Placement | Reasoning |
|---|---|---|---|
| Streaming chat, stop, copy, share, retry | all | Free | table stakes |
| Edit any message and regenerate; branch from an edit | PocketPal (edit + regenerate since 1.6), Enclave lacks (1★ reviews) | Free | absence generates 1★ reviews |
| Markdown, code blocks with copy, tables, LaTeX/math rendering | Chatbox (LaTeX), PocketPal/Locally/Apollo lack LaTeX (complaints) | Free | repeated complaint; students are a core segment |
| Hide/show reasoning ("thinking") blocks, thinking toggle | AI Edge Gallery, Enclave (requested), Locally | Free | reasoning models (DeepSeek R1 distills, Qwen 3, Gemma 4) are default now |
| Auto-scroll that respects user scroll position | Enclave/Apollo complaints | Free | polish |
| Pin, rename, archive, delete chats; chat search | PocketPal (pin), Locally (pinned), AI Edge Gallery (history) | Free (pin/search) | basic |
| Folders / projects grouping chats + files | Off Grid "Projects", Lumo Projects (Plus), Msty | **Pro** | competitors gate it; maps to Work vaults later |
| Multiple chats with different models; switch model mid-chat | Msty, Chatbox | Free (switch), Pro (side-by-side compare) | compare is a power feature |
| Token/context meter and "conversation running out of room" warning | PocketPal (warns), Private LLM context 8K | Free | prevents #3/#6 complaints |
| Export chat (Markdown/PDF/JSON), export all | PocketPal (MD), Enclave (export) | Free single chat; **Pro** bulk export | bulk export is a workflow feature |
| Keep-screen-awake while generating | Lumo added it | Free | cheap, avoids "generation died" |

### 2.2 Models

| Feature | Who ships it | Placement | Reasoning |
|---|---|---|---|
| Zero-download first chat (bundled small model or Apple Foundation Model / Gemini Nano where available) | Locally AI (Apple model), Private LLM (1.36 GB app ships assets) | Free | kills complaint #1 at first launch; "first message in 60 seconds" |
| Curated catalog with "fits your device" badge (RAM, speed, quality, size, license) | Private LLM (device tiers), PocketPal (RAM filter), Off Grid (size + RAM) | Free | complaint #3 |
| Recommended default per device tier; auto-pick | Layla ("smartest model that fits"), PocketPal "smarter AI model selection" | Free | onboarding |
| Search Hugging Face and download any GGUF/MLX (incl. gated models with HF token) | PocketPal, Enclave | Free | expected by enthusiasts; keep in Free to avoid "unnecessary limitations" 1★ |
| Import a model file from Files/Downloads/SD card, external storage | PocketPal (file), Off Grid | Free | frequent request; no marginal cost |
| Resumable, verified downloads (Range + SHA-256, background, Wi-Fi-only option) | Private LLM CDN; others weak | Free | complaint #1 |
| Delete/offload models; storage manager | Enclave/MLC lacked (complaints) | Free | hygiene |
| Benchmark (tok/s, prefill, memory) + optional anonymous leaderboard (opt-in only) | PocketPal, AI Edge Gallery | Free | trust + word of mouth; leaderboard must be opt-in and explicit because it is a network call |
| Vision models (image input) | PocketPal, Locally, Enclave, Edge Gallery | Free (1 image), Pro (multi-image, camera live) | Locally AI users ask for multi-photo |
| Reasoning models with effort control | Edge Gallery thinking mode, Chatbox reasoning effort (missing → complaint) | Free | expected |
| Speculative decoding / draft model | PocketPal (experimental) | Pro | performance power feature |
| Multiple models resident / hot swap | Msty | Pro | memory-heavy, power users |
| "Uncensored"/abliterated model curation | Private LLM (its differentiator) | Not in catalog by default; allow user import | age-rating and store-policy risk (see §4); Private LLM's approach costs it nothing because it is 12+/13+ anyway, but a curated uncensored catalog forces 18+ |

### 2.3 Documents / RAG

| Feature | Who ships it | Placement | Reasoning |
|---|---|---|---|
| Attach one PDF/TXT/MD/DOCX/CSV/code file to a chat (size-capped, chunked, streamed) | Locally AI, Enclave, Apollo (one), Off Grid | Free (1 file, e.g. ≤20 pages) | free competitors have it; capping keeps it from crashing |
| Document library with persistent on-device embeddings, multi-doc Q&A with citations | Off Grid Projects, Msty knowledge stacks, Lumo Plus (large files) | **Pro** | the most gated feature in the category |
| Scanned PDF / photo OCR (Vision framework / ML Kit, on device) | none of the local apps; Lumo cloud | **Pro** | "OCR of photos on device" is a Work magnet (receipts, contracts) |
| "Answer only from my documents" strict mode | Layla request | Pro | professional need |
| Spreadsheet/table understanding (CSV/XLSX) | Chatbox (cloud), Locally (CSV attach) | Pro | Work |
| Summaries of long docs with map-reduce over context | none robustly | Pro | needs engineering, differentiator |
| Import from Files/iCloud Drive/Google Drive (read-only, user-initiated) | Locally request ("iCloud folders as RAG") | Pro | note: cloud providers' files are read via the OS file picker, no app network call |

### 2.4 Voice

| Feature | Who ships it | Placement | Reasoning |
|---|---|---|---|
| Dictation via system speech recognition (on-device flag) | Enclave (Apple STT), Lumo (Google popup complaint) | Free | must be truly on-device (`requiresOnDeviceRecognition`) or use Whisper; disclose |
| On-device Whisper/whisper.cpp STT for languages the OS lacks | Off Grid | Pro | model download + CPU cost |
| Read aloud with system voices | PocketPal (System), Enclave | Free | cheap |
| Premium on-device neural voices (Kokoro/Supertonic) with voice picker | PocketPal (free), Off Grid (Pro) | **Pro** | Off Grid gates it; Enclave reviews demand better voices |
| Hands-free voice conversation mode with headset routing, interruption | Enclave (praised, "not found elsewhere"), Apollo (headset bug) | Pro | flagship demo feature |
| Audio transcription/translation of recordings | AI Edge Gallery Audio Scribe | Pro / Work | Work (dictated notes) |

### 2.5 Privacy & security (nobody in the local category ships most of these — the differentiator block)

| Feature | Who ships it | Placement | Reasoning |
|---|---|---|---|
| App lock with Face ID/Touch ID/biometric + passcode; lock on background after N seconds | LMSA (Android) only | Free | trust feature; Signal-style expectation |
| Encrypted on-device database (SQLCipher / Data Protection `completeUntilFirstUserAuthentication`), keys in Secure Enclave/Keystore | Enclave claims "encrypted local storage" | Free | the promise |
| Incognito chat (never written to disk, purged on close) | Lumo "Ghost Mode" (cloud) | Free | cheap, marketing-strong |
| No-history mode / auto-delete after N days | Enclave (auto-deletion periods), Lumo (7-day, but hidden = complaint) | Free | must be explicit and user-set |
| Panic wipe (long-press / shake / Shortcut / wrong-passcode count) | none | Free | journalists/lawyers segment; low cost |
| Screenshot & screen-recording blocking, hide content in app switcher | none (FLAG_SECURE on Android; iOS = privacy overlay + `isCaptured` detection) | Free (toggle) | trust; note iOS cannot block screenshots, only detect + blur switcher |
| Airplane-mode proof: in-app network monitor showing "0 bytes sent since install", per-session network log, optional OS-level block (Android: no INTERNET permission variant; iOS: `NWPathMonitor` + no URLSession use except downloads) | none; 5/13 Android apps failed independent airplane test | Free | headline claim; consider a second Android build flavor without `INTERNET` permission at all ("Offline Edition") |
| Verifiable client: open-source app or reproducible build + published privacy audit / pen-test report | PocketPal/fullmoon/MLC/Off Grid/Edge Gallery open source; Private LLM/Locally/Enclave closed | Free (publish) | matters to r/LocalLLaMA and the Work tier |
| Local-only encrypted backup/export with passphrase (Argon2 + AES-GCM), restore on new device | Off Grid E2E sync (Pro) | **Pro** | backup convenience is paid in the category |
| Device-to-device transfer (AirDrop/Nearby/QR) of chats and models without cloud | none | Pro | Work feature too |
| Model-download-only network mode with visible egress domains (huggingface.co, own CDN) and a kill switch | Private LLM (CDN) | Free | transparency |
| Privacy dashboard: what is stored where, sizes, one-tap delete-all | Enclave (delete/clear) | Free | trust |
| Secure input (disable keyboard learning/predictive on sensitive fields) | none | Free | small |

### 2.6 Personalization

| Feature | Who ships it | Placement | Reasoning |
|---|---|---|---|
| System prompt per chat; a few built-in personas | all | Free (e.g. 3 custom personas) | baseline |
| Unlimited personas with icons, default model, tools, sharing as file | PocketPal Pals, Enclave assistants, Off Grid (Pro) | **Pro** | Off Grid gates; PocketPal sells premium Pals |
| On-device memory (facts about me), viewable/editable/deletable, per-persona | Layla memory, Off Grid (Pro), Lumo memory (cloud) | **Pro** | requested on PocketPal; premium in Off Grid; must be transparent (a memory panel) |
| Response style presets (concise/formal/language) | Lumo tones | Free | cheap |
| Themes, fonts, chat bubble colors, app icon | fullmoon, PocketPal | Free (basic) / Pro (icon packs) | low value gate |

### 2.7 Productivity

| Feature | Who ships it | Placement | Reasoning |
|---|---|---|---|
| Quick actions: summarize, rewrite (tone/length), fix grammar, translate, explain, extract to-dos | Private LLM macOS Services, Apple Writing Tools | Free (basic 4) / Pro (custom actions) | drives daily use; custom actions are workflow value |
| On-device OCR of photos/screenshots then act (translate/summarize) | none local | Pro | Work magnet |
| Translation mode with language auto-detect | Edge Gallery Audio Scribe translate | Free (text) | i18n segments |
| Templates library (emails, contracts summaries, SOAP notes, tax memo) | Msty playbooks | Pro / Work | Work |
| Reminders/notification-driven routines | Edge Gallery "Schedule Notification" skill | Pro | agentic; local notifications only |
| Local tools: calculator, date/time, unit conversion, calendar read (with permission), contacts lookup (permission), device info | PocketPal talents, Layla mini-apps (broken), Edge Gallery Mobile Actions | Free (calc/date) / Pro (calendar/contacts/draft actions) | Off Grid gates draft-then-approve actions |
| Optional web search / URL fetch (bring-your-own key, off by default, big red indicator) | PocketPal (BYO Brave/Tavily/Exa), Enclave cloud only | Pro, and only as an explicitly labeled "online mode"; or omit entirely for the zero-egress promise | conflicts with positioning; if included, must be a separate mode with a persistent badge |

### 2.8 Integrations

| Feature | Who ships it | Placement | Reasoning |
|---|---|---|---|
| Share sheet / Android `ACTION_SEND` + `PROCESS_TEXT` ("Ask Private AI about this") | PocketPal (Android), Layla; Locally AI users request it | Free | acquisition surface; cheap |
| Siri Shortcuts / App Intents ("Ask", "Summarize clipboard", pick model/persona, return text) | Private LLM, Locally AI, Enclave, fullmoon | Free ("Ask") / Pro (advanced intents, persona/model parameters, file input) | Private LLM charges for it; keep basic free to match Locally/Enclave |
| Siri AI "Extensions" registration (iOS 27) | none yet | Free | be first; it is discovery |
| Widgets, Lock Screen widgets, Control Center controls, Action button | Locally AI Controls; Edge Gallery users request widgets | Free (quick-ask widget) / Pro (persona widgets) | polish |
| Keyboard extension (rewrite/translate inline in any app) | none in category; Grammarly-style | **Pro** | strong Work/daily driver; note keyboard extensions need "Allow Full Access" only for network — a local model in an extension is memory-limited, so route via main app + Universal Clipboard/App Groups |
| macOS/iPadOS Services, "Writing Tools"-style text selection actions | Private LLM Services | Pro | desktop later |
| LAN connect to own Ollama/LM Studio (never cloud) | Apollo, Locally LM Link, Chatbox, Off Grid | Pro | power users; must allow plain HTTP on LAN (Chatbox/Apollo 1★) |
| Android intents/Tasker, x-callback-url, URL scheme | Private LLM x-callback | Pro | automation |
| Files app provider for exports; Quick Look | none | Free | standard |

### 2.9 Power features

| Feature | Who ships it | Placement | Reasoning |
|---|---|---|---|
| Context length selector with memory estimate | PocketPal, Private LLM (fixed 8K) | Free (presets) / Pro (custom up to model max) | complaint #3 mitigation |
| Sampling params (temp, top-p, top-k, min-p, repeat penalty, seed) | PocketPal, Edge Gallery Prompt Lab | Pro (advanced panel) | enthusiasts pay; keep temperature free |
| GPU/NPU layers, threads, Flash-attention, KV cache quantization, mmap/mlock toggles | PocketPal | Pro | power |
| Stop sequences, grammar/JSON mode, custom chat template | Apollo lacks (complaint) | Pro | power |
| Per-message stats (tok/s, TTFT, tokens, energy estimate) | Apollo dev mode, Enclave 1.70 | Free (basic) / Pro (detailed) | trust in benchmarks |
| Battery/thermal-aware performance profiles (Eco/Balanced/Max) | none | Free | complaint #5; also a safety feature |
| Prompt Lab / single-turn playground | Edge Gallery | Pro | niche |
| Local OpenAI-compatible server on device (LAN) | "Local LLM Server" apps | Pro (desktop first) | niche but loved by devs |

### 2.10 Accessibility

| Feature | Placement | Notes |
|---|---|---|
| VoiceOver/TalkBack labels on all controls; chunked announcements while streaming (post `.announcement` per sentence, not per token; `updatesFrequently` trait), "read response" action | Free | PocketPal and Venice have accessibility 1★ reviews; Venice broke a low-vision user's flow with an update |
| Dynamic Type / large fonts, high contrast, reduce motion, bold text | Free | |
| Full keyboard navigation on iPad/Mac, Shift+Enter newline setting | Free | Chatbox 1★ for Enter hijack on tablets |
| Voice control commands, Switch Control | Free | |
| Haptics toggle | Free | Apollo 2★ "unable to disable haptics" |
| Dyslexia-friendly font, reading mode | Free | |

### 2.11 i18n

| Feature | Placement | Notes |
|---|---|---|
| UI localized in the top store languages (EN, ES, PT-BR, DE, FR, IT, JA, KO, ZH-Hans/Hant, RU, AR, HE, HI, TR, PL, VI, ID) | Free | PocketPal ships 11 + PT/PL; Locally AI users ask for Chinese; Venice 1★ "we need Chinese" |
| RTL layout (AR/HE/FA/UR) incl. mixed-direction chat bubbles, Markdown tables, code blocks LTR inside RTL | Free | Apple's own model has no Arabic/Hebrew; a multilingual Gemma 4 / Qwen catalog is the differentiator |
| Model language badges (which models are good in which languages) and per-language recommended model | Free | Private LLM lists per-model languages and language-specific models (DictaLM Hebrew, SauerkrautLM German, Rakuten Japanese) |
| Translation of UI strings of the model's reasoning labels; locale-aware numbers/dates in tools | Free | |
| Store listings + screenshots per locale | n/a | ASO |

### 2.12 Suggested Free vs Pro summary (for the PRD)

**Free (complete product, no ads, no account, no telemetry):** zero-download first chat, curated catalog + HF search + file import, resumable verified downloads, unlimited chats, edit/regenerate, Markdown+LaTeX, 1 attachment per chat, 3 personas, quick actions (summarize/rewrite/translate/explain), system-voice read-aloud + on-device dictation, app lock, encrypted DB, incognito + auto-delete, panic wipe, screenshot protection toggle, network monitor "0 bytes" proof, share sheet, basic Shortcut, widgets, benchmark, context presets, temperature, accessibility, all locales, in-app "report output" control, single-chat export.

**Pro ($15–20 one-time, universal + Family Sharing):** document library with citations + OCR, unlimited personas + on-device memory, folders/projects, bulk export + passphrase-encrypted backup/restore + device-to-device transfer, premium on-device voices + hands-free voice mode + Whisper, keyboard extension + custom quick actions + advanced Shortcuts, LAN connect to own server, advanced sampling/GPU/context controls + speculative decoding + multi-model, side-by-side compare, calendar/contacts draft actions, icon packs. Everything in Pro is a permanent local capability, so a one-time price is honest.

**Pro for Work (later, one-time or annual with a clear line that nothing leaves the device):** profession packs (legal/therapy/medical/accounting templates and disclaimers), client/matter vaults with separate passcodes, redaction/anonymization tool before pasting, DOCX/XLSX/HTML ingestion, dictation-to-notes (SOAP/DAP), audit log + timestamped export for records, larger-context and domain models, team license keys validated offline (signed JWT), a printable privacy attestation ("no data leaves the device — architecture statement") for compliance files.

---

## 3. Edge cases & failure modes for on-device LLM apps (exhaustive)

Format: **Case** → what happens in the market today → required behavior for our app (spec-ready). Grouped by lifecycle.

### 3.1 First launch, onboarding, downloads

1. **First launch with no model.** Market: PocketPal/Enclave/Apollo show an empty model list and a 1–4 GB download before the first message; Layla downloads 4 GB on first start; Private LLM ships a 1.36 GB app. Required: ship a tiny bundled model (≈300–700 MB on-device-optimized, e.g. Gemma 4 E2B-class or LFM2/Qwen 0.6–1.7B quant) so the first message works offline within seconds of install; on iOS 26+ Apple-Intelligence devices optionally use the Foundation Model for the very first chat while the bundled model unpacks; on Android 12+ AICore devices optionally Gemini Nano (foreground only). Onboarding must never block on a network download. Use On-Demand Resources / Play Asset Delivery (install-time or fast-follow packs) so the bundled model does not count against cellular download prompts; keep the app binary under 200 MB where possible.
2. **Download interrupted (app killed, network lost, phone locked, user leaves).** Market: PocketPal "stops halfway with no way to resume", "interrupted if the program is exited", Locally AI "gets stuck", Layla "took days". Required: `URLSession` background download tasks (iOS) / `WorkManager` + `DownloadManager` (Android) with HTTP Range resume, chunked SHA-256 verification against a manifest, automatic retry with backoff, persistent progress notification, and a "Downloads" screen that survives relaunch. Support pause/resume/cancel and multiple queued downloads.
3. **HTTP 429 / Hugging Face rate limits or outages, corporate firewalls, China/Hong Kong blocking.** Market: PocketPal "Download failed Client error: 429", Private LLM FAQ (HF status page, hf-mirror.com fallback, VPN advice). Required: primary CDN we control for the curated catalog (with signed manifests), Hugging Face only for user-initiated imports, mirror fallback list, clear error text that names the cause, and an "import file manually" path that always works.
4. **Cellular/metered/Low Data Mode and expensive networks.** Market: "waste of data" complaints from Afghanistan and other expensive-bandwidth markets. Required: default Wi-Fi-only for downloads > 100 MB, honor `NWPathMonitor.isExpensive/isConstrained` and Android `isActiveNetworkMetered`, show size before download, confirm on cellular with size in the dialog, allow "download later on Wi-Fi" scheduling.
5. **Wrong or misleading model size / very large model.** Market: Enclave review: model listed as 4 GB was 400 GB, "near soft-bricked" a 256 GB iPad (Wi-Fi/Bluetooth shut down, screen flicker). Required: read the real file size from the HEAD request before download, hard-block downloads that exceed free space minus a safety margin (e.g. 2 GB), warn when a model exceeds device RAM-fit, and never let a single download exhaust the disk.
6. **Storage full (before, during, after download; during chat DB writes; during OS updates).** Required: pre-flight free-space check (declare `NSPrivacyAccessedAPICategoryDiskSpace` reason E174.1 in the privacy manifest), store models in Caches/purgeable or Application Support marked `isExcludedFromBackup`, handle `ENOSPC` during writes without corrupting the DB (SQLite WAL + transactions), show a storage manager with per-model sizes and one-tap delete, react to the OS low-storage broadcast (Android `ACTION_DEVICE_STORAGE_LOW`) by pausing downloads.
7. **User moves the app to SD card / external storage (Android) or wants models on an SD card.** Market: PocketPal reviews request SD support. Required: allow choosing a storage location via SAF for imported models; document that adopted storage may be slower; never split a model across volumes.
8. **Downloaded file is corrupt/truncated/wrong format (GGML instead of GGUF, safetensors, LiteRT-LM, MLX, unsupported architecture, unsupported quant such as BitNet).** Market: PocketPal crashes on launch after a bad model and keeps crashing until storage is wiped (GitHub #658), BitNet model "prevents app launch", AI Edge Gallery LiteRT-only, Locally cannot load user GGUF. Required: validate magic bytes, header, architecture and tensor count before enabling "Load"; verify checksum; quarantine a model that crashed the app during load (write a "last attempted model" marker before load, clear it after success; on next launch skip and flag the model); show a specific error ("This file is not a GGUF v3 model") instead of crashing; never auto-load the last model on launch after a crash.
9. **Model catalog lists a model the current engine version cannot run (new architecture such as a fresh Gemma/Qwen release).** Market: PocketPal issues #231/#241 (new models crash), Locally "Gemma 4 E4B removed on my device". Required: catalog entries carry `minEngineVersion` and device constraints; hide or grey out with reason; ship engine updates before catalog updates.
10. **Gated or licensed models (HF token, Gemma terms acceptance, Llama license).** Required: token entry for gated repos, show and require acceptance of the model's license before download, keep a license notice screen (see §4.5).

### 3.2 Device capability and memory

11. **Model incompatible with device RAM (OOM at load or mid-generation).** Market: universal failure mode; iOS kills silently (jetsam), Android OOM-kills; users blame the app ("crashes every time"). Required: a device-fit model (physical RAM, OS reserve, per-process ceiling — e.g. iOS per-process limit ≈ 50–60 % of RAM without the `com.apple.developer.kernel.increased-memory-limit` entitlement, ≈ 6 GB with it on 12 GB iPhones), estimate = weights + KV cache (context × layers) + activations + app baseline, and classify each catalog entry as Runs well / Runs slowly / Will not run. Block "Will not run" with an override for experts. Reduce context automatically when memory is tight and tell the user.
12. **Memory kill (iOS jetsam) mid-generation or while a large model is resident.** Market: Private LLM FAQ ("close background apps, restart, use smaller model"), "iPhones aren't ready for this". Required: `mmap` weights (page in/out), mlock only what is needed, stay under the dirty-memory ceiling, respond to memory warnings by dropping KV cache/unloading secondary models, persist partial responses to the DB as they stream so a kill loses nothing, and on relaunch show "The system stopped generation to free memory — tap to continue". Use MetricKit crash/hang diagnostics only if the user opts in to share, otherwise show them locally.
13. **Low-end Android (4–6 GB RAM, MediaTek/Unisoc/older Mali, no NPU, 32-bit-only devices are gone but arm64 without dotprod/i8mm exist).** Market: "1–3 tok/s unusable", MediaTek "1 minute for Hello", Redmi Note 5 Pro display lag. Required: `minSdk` 26–28, arm64-v8a only, runtime CPU feature detection to pick kernels, default to the smallest model and a 2K context on <6 GB devices, warn at install/first launch ("this phone can run small models slowly"), never ship a "Will not run" default. Consider a Play Console device exclusion list for devices under 4 GB.
14. **Old iPhones (iPhone 11/SE2 3–4 GB RAM) and old OS floors.** Market: PocketPal praised for iOS 15.1 support; Enclave criticized for iOS 26 requirement; Locally 18.1. Required: decide floor explicitly (recommendation: iOS 17 / A12+ for llama.cpp+Metal; Apple Foundation Model only as an enhancement on iOS 26+), keep 1B-class models for 4 GB devices.
15. **16 KB page size (Android 15+/16 devices such as Pixel 8/9/10 and Snapdragon 8 Gen 5 phones).** Market: PocketPal GitHub #512 (SIGBUS on load). Required: build all `.so` with NDK r28+ or `-Wl,-z,max-page-size=16384`, uncompressed JNI libs with AGP ≥ 8.5.1, test on the 16 KB emulator image, mandatory for Play updates targeting API 35+ from 1 Feb 2027.
16. **GPU/NPU backend failures (Vulkan driver bugs, OpenCL missing, Metal `recommendedMaxWorkingSetSize` lower than RAM, Hexagon library mismatch).** Market: "can't detect my GPU", Apollo `libinference_engine_jni.so not found`. Required: backend probing with automatic CPU fallback and a visible "Acceleration: CPU/GPU/NPU" badge; allow manual override; keep GPU layers adjustable.
17. **Rooted/jailbroken devices.** Market: Gemini Nano refuses rooted devices. Required: do not block (privacy audience overlaps with GrapheneOS/de-Googled users); AICore/Play features simply become unavailable; local purchase validation must not depend on Play Integrity (see §3.9).
18. **Thermal throttling and sustained load.** Market: 30–50 % slowdown after 10–15 min; "phone warms up very fast". Required: observe `ProcessInfo.thermalState` / `PowerManager.getThermalHeadroom` and `OnThermalStatusChangedListener`; at "serious" reduce threads/GPU layers and show a subtle "Slowing down to keep the phone cool" note; at "critical" pause generation with resume; expose Eco/Balanced/Max profiles; cap max tokens by default (e.g. 1,024) with "continue".
19. **Battery low / Low Power Mode / Battery Saver.** Required: detect `isLowPowerModeEnabled` and Android `isPowerSaveMode`, auto-switch to Eco profile, defer downloads, show energy estimate per response; never start a long generation at <5 % battery without confirmation.
20. **Charging while generating (extra thermal pressure) and wireless charging.** Required: thermal handling above; optional hint.

### 3.3 App lifecycle and concurrency

21. **App backgrounded during generation / screen locks / notification interruption / phone call.** Market: PocketPal "stops generating and unloads the model when you switch apps", MLC resets; Android OEM killers. Required: on iOS request a `beginBackgroundTask` (≈30 s) to finish the current response gracefully, persist partial output, and offer "Continue" on return; optionally keep the screen awake while generating (opt-in like Lumo); do not attempt long background inference (no legitimate background mode). On Android run generation in a foreground service with a persistent notification (type `dataSync` is time-capped 6 h/24 h on Android 15+; prefer a short-lived service and stop it when done), request battery-optimization exemption only with a rationale, detect Samsung/OnePlus deep-sleep and show a one-time guide.
22. **App killed while writing the DB / mid-migration.** Required: SQLite WAL, atomic migrations with backups, integrity check on launch, "Repair" path.
23. **Multiple concurrent generations (two chats, Shortcut + UI, widget + app, keyboard extension + app).** Market: Apple's model throws `concurrentRequests`; llama.cpp contexts are single-threaded per session. Required: a single inference queue with priorities; second request shows "Waiting for the current answer"; Shortcuts run through the same queue with a timeout; keyboard/extension processes cannot load a model (extension memory limits) — route to the main app via App Groups + Darwin notifications / `UNNotification` or run only tiny models.
24. **Model switch while generating; delete model in use; download completes while chatting.** Required: cancel-then-switch with confirmation; block deleting the loaded model; reload prompt after downloads.
25. **Shortcut/automation invoked while the app is locked (app lock) or in incognito.** Required: Shortcuts respect the lock (require unlock or explicit "allow automations without unlock" setting); incognito sessions never appear in Shortcut results history.
26. **OS update / app update changes the model runtime (engine ABI, quant format, chat template) or removes support.** Market: PocketPal Gemma 4 update crashed all models; Apollo models deleted after update; Locally E4B removed. Required: engine and models versioned independently; migration step re-validates each model on first launch after update and marks incompatible ones; never delete user files silently; release notes in-app.
27. **Apple Foundation Model changes with OS updates (3 model versions across 26.0–26.3 / 26.4 / 27.0), `modelNotReady` right after an update while assets download, guardrail refusals, 4,096-token window, unsupported locale.** Required: treat the Apple model as an optional accelerator, always keep a bundled fallback model, handle every `GenerationError` case with a user-visible fallback ("Apple's model declined; switching to Private model"), never route documents through it (context), and keep it off in unsupported locales.
28. **Apple Intelligence disabled by the user, device not eligible, or region/account restrictions (China mainland; EU for Siri AI features on iPhone).** Required: feature-detect at runtime, no UI that depends on it, copy that never promises Apple Intelligence.
29. **Gemini Nano / AICore unavailable (device, region, rooted, background) or model still downloading.** Required: same optional-accelerator pattern; `BACKGROUND_USE_BLOCKED` handling; never depend on it for the promise.

### 3.4 Documents and input

30. **Huge PDF (hundreds of pages), scanned PDF with no text layer, password-protected PDF, PDF with forms/columns/tables, DOCX with tracked changes, XLSX with many sheets, images inside documents.** Market: Enclave/Locally crash on modest files; Lumo "file size must be very small". Required: stream-parse with page limits per tier, extract text with PDFKit/Vision on iOS and PdfRenderer + ML Kit Text Recognition on Android, detect zero-text pages and offer on-device OCR with progress and cancel, preserve reading order for columns, chunk + embed incrementally in the background with a visible index status, refuse encrypted files with a clear message, and never load a whole file into the prompt.
31. **Non-English documents, mixed scripts, RTL PDFs (Hebrew/Arabic), vertical CJK.** Required: OCR language packs on-device, bidi-aware chunking, tokenizer-aware chunk sizes (CJK/Hebrew tokens are longer), embedding model that is multilingual (e.g. multilingual MiniLM/BGE-M3 small), and model recommendation per document language.
32. **Very long chats exceeding the context window.** Market: PocketPal "context window limitations causing chat interruptions", Lumo "chat has gotten too long", Apollo tiny context. Required: token meter, sliding window with pinned system prompt, automatic on-device summary of earlier turns ("memory of this chat") with a visible marker, "start a new chat with a summary" action, and never a hard error mid-conversation.
33. **Pasting enormous text / clipboard with images / sharing a 100 MB file via share sheet.** Required: size caps with truncation notice, background import, share extension hands off to the main app.
34. **Prompt injection through documents/web pages** (relevant if tools or URL fetch exist). Required: tool calls need confirmation for side effects (Off Grid draft-then-approve), documents are data not instructions, no auto-execution.
35. **Image input edge cases: HEIC/HDR/Live Photos, huge resolution, EXIF orientation, screenshots with sensitive data, camera permission denied.** Required: downscale on-device, strip EXIF before persisting, honor permission denial gracefully.

### 3.5 Model output, safety, and expectations

36. **Model outputs harmful, hateful, sexual, or dangerous content** (open-weight small models will). Market: Google Play AI-Generated Content policy requires an in-app way to report/flag offensive AI content without leaving the app; Apple counts chatbot output toward sensitive-content frequency for age rating; none of the local apps ship a report control. Required: per-message "Report" (stores a local report, offers to email/export it — since nothing is sent automatically, the flow must work offline and make clear that reporting is user-initiated), an optional on-device safety classifier (ShieldGemma-class) that can be toggled in "Family-safe mode", a default system prompt with safety guidance, and user-visible guardrail settings. Document the mechanism for review teams.
37. **User asks for medical, legal, financial, or mental-health advice; crisis language (suicide/self-harm).** Market: Private LLM's own listing touts "unfiltered answers"; Apple's Foundation Model acceptable use prohibits dangerous outputs in medical/legal/finance and "dependency or spiraling"; PocketPal review: "told me to drink rubbing alcohol". Required: lightweight on-device intent detection for crisis phrases with a locale-aware resource card (hotlines) that does not block the chat; a standing disclaimer in the persona system prompts for these domains; Work tier adds profession-specific disclaimers and "verify before use" banners.
38. **Hallucination / confidence.** Required: a persistent, dismissible "Private AI can be wrong — check important facts" note on first chats and in every persona header; citations when answering from documents; show the model name and size next to each answer so users calibrate expectations ("a 2B model on your phone, not GPT").
39. **Model ignores or leaks the system prompt / repeats examples / loops / never stops.** Market: Apollo, Enclave, Layla complaints. Required: correct chat templates per model family, repeat-penalty defaults, max-token cap with "continue", stop-sequence support, loop detection (n-gram repetition) that stops generation and offers regenerate, and a "reset persona to default" action.
40. **Wrong language or script in the reply (model answers in Chinese to a Hebrew question, mixes RTL/LTR).** Required: language hint in the system prompt from the UI locale/input detection, per-language recommended models, bidi-safe rendering.
41. **"Uncensored" expectations vs store policy.** Market: Venice 1★ wave when censorship changed; Private LLM markets uncensored builds at 12+. Required: pick a stance in the PRD; if user-imported models can be anything, keep the catalog family-safe by default, rate honestly (likely 13+ minimum; 18+ if the catalog includes uncensored models or the app markets "no filters"), and never promise "uncensored" in store copy.

### 3.6 Data, device change, backup

42. **iCloud/Google backup of models (GBs) and of chats.** Market: no competitor documents behavior; Apple guidance: exclude re-downloadable large content (`isExcludedFromBackup`), never exclude user-created data. Required: models in an excluded directory; chats included in device backup only if the user opts in (default: included but encrypted with a device-bound key? No — device-bound keys do not restore across devices; use a user-passphrase-encrypted export for cross-device, and OS backup for same-device restore with Data Protection class). State the policy in the privacy dashboard.
43. **New phone / restore from backup / transfer.** Required: chats restore via OS backup; models re-download automatically with one tap; passphrase-encrypted export/import; device-to-device transfer (AirDrop/Nearby/QR pairing over local Wi-Fi) as the "no cloud" path; Pro entitlement restores via App Store/Play.
44. **Same Apple ID on many devices (iPhone + iPad + Mac) without cloud sync.** Market: Venice/Chatbox complaints "sessions per device only". Required: be explicit that there is no cloud sync; offer local-network sync (E2E, Off Grid-style) as a Pro feature later.
45. **Shared device / multiple users / family member finds the app.** Required: app lock by default after first launch prompt, incognito, per-persona hidden chats behind a second passcode (Work vaults), quick "hide app" guidance (iOS Hide App / Android private space), no widget previews of content while locked.
46. **User deletes the app.** Required: warn that chats are local-only and offer export first (on iOS the system deletes container; show the warning in Settings > Storage).
47. **Data Protection: device locked while a background download finishes or a Shortcut runs.** Required: use `completeUntilFirstUserAuthentication` for the DB and model files so downloads can write while locked.

### 3.7 Purchases, licensing, monetization

48. **Offline license validation for Pro without our server.** Required: StoreKit 2 `Transaction.currentEntitlements` (JWS-signed, verifiable on device, cached locally; note StoreKit's cache can be empty until the first sync and a 26.x regression that drops family-shared non-consumables after restore — keep a signed local receipt cache and a "Restore purchases" button calling `AppStore.sync()`), Play Billing `queryPurchasesAsync` (cached purchases available offline; verify the purchase signature with the app's Play public key on device; acknowledge within 3 days or Play refunds it). Grace: if the store cannot be reached, keep the last known entitlement for N days.
49. **Restore purchases, family sharing, refunds, revocation.** Required: Apple Family Sharing for the non-consumable (enable in App Store Connect; `revocationDate` becomes non-nil when refunded or the member leaves the family — re-lock Pro features but never delete user data); Google Play Family Library does not share in-app purchases (say so in the paywall to avoid refund requests); handle Play voided purchases by re-checking on launch; refunds are store-handled (Apple "Report a Problem", Play 48-hour policy) — no support-server needed but publish a support email.
50. **Price changes, regional pricing, promo codes/offer codes, upgrade to Work tier, cross-grade from Pro.** Required: one non-consumable "Pro", a second non-consumable "Work" with intro pricing for Pro owners (StoreKit does not do discounts on non-consumables natively — use a separate "Work upgrade" SKU shown only to Pro owners), Play one-time products likewise.
51. **Piracy / cracked IAP on jailbroken or rooted devices.** Required: accept some leakage; on-device JWS verification raises the bar; do not add Play Integrity hard gates (breaks de-Googled users, who are the audience); no server-side licensing.
52. **Purchase flow interrupted (Ask to Buy, pending, network loss).** Required: handle `.pending` and deferred transactions, show state, finish transactions on next launch.

### 3.8 Accessibility, i18n, UI

53. **VoiceOver/TalkBack during streaming.** Required: per-sentence announcements with a polite queue, a "read latest answer" action, avoid focus stealing, mark streaming region `updatesFrequently`; test with a 1,000-token answer.
54. **Dynamic Type at the largest sizes with code blocks/tables; RTL locales with LTR code; screen readers reading Markdown syntax aloud.** Required: accessible Markdown renderer (spoken plain text), horizontal scroll for tables/code, RTL QA on every screen.
55. **Hardware keyboards (iPad/Android tablets): Enter vs Shift+Enter.** Market: Chatbox 1★. Required: setting.
56. **Very long single message rendering (10k tokens) performance; scroll jumps.** Required: virtualized message list, stable scroll anchoring.

### 3.9 Security posture

57. **Screenshots/screen recording of sensitive chats.** Required: iOS: detect `UIScreen.isCaptured`, blur in app switcher, optional "hide content in switcher"; Android: `FLAG_SECURE` toggle (breaks user screenshots — make it opt-in); never store thumbnails in the switcher snapshot.
58. **Clipboard leaks (Universal Clipboard/Handoff, Android clipboard read by other apps).** Required: "copy with expiry" (clear after 60 s option), local-only pasteboard flag on iOS (`UIPasteboard.setItems(... .localOnly)`), warn once.
59. **Crash logs containing prompt text.** Required: never include prompt/response text in logs; strip user content from any local diagnostics; no third-party crash SDK (contradicts Data Not Collected); if using Apple/Google OS-level crash reports (opt-in by users at the OS level), the developer receives them via the store — mention in the privacy policy that OS-level diagnostics are handled by Apple/Google under their terms.
60. **Third-party SDK creep (analytics, ads, attribution, RevenueCat) silently adding network calls.** Required: policy — zero third-party network SDKs; CI test that runs the app in a network-monitored sandbox and fails on any egress except allow-listed download hosts; publish the egress allow-list; ship an "Offline Edition" Android flavor with no `INTERNET` permission for maximal proof.
61. **Model supply-chain integrity (malicious GGUF, pickle-style payloads).** GGUF is a safe tensor container, but parsers have had memory-safety bugs; Required: signed catalog manifests, checksums, sandboxed parsing where possible, keep llama.cpp/MLX updated, fuzz the loader.
62. **Local network features (LAN connect, local server) exposing prompts on hostile Wi-Fi.** Required: off by default, mDNS discovery with pairing code, allow plain HTTP only on RFC1918 ranges (users demand it), warn on public networks.
63. **Sideloaded builds / alternative app stores (EU) and notarization.** Required: same privacy claims, age rating declarations also required for notarized apps (Apple's Sept 2026 social-media declarations apply to notarization).

### 3.10 Age, kids, regulated use

64. **Kids and age rating.** Market: Apple's new tiers (13+/16+/18+) explicitly count AI assistant/chatbot output; local competitors sit at 12+/13+ (Private LLM, Locally, Apollo, Edge Gallery) or 17+/18+ (PocketPal, Enclave, fullmoon, MLC, Off Grid); Layla is 4+ while advertising "no censorship" (risk). Google Play: content rating via IARC questionnaire (Edge Gallery/Chatbox "Teen"), AI content for minors must not be unsafe/sexual/manipulative; state age-verification laws (Utah/Texas/Louisiana etc.) route through the platform age APIs. Required: rate 13+ minimum with an honest questionnaire (unrestricted generative text), 18+ if uncensored catalog/roleplay; no Kids category; family-safe mode with on-device classifier; no child-directed marketing; if a "companion/roleplay" persona exists, revisit rating and Play's companion/minor rules.
65. **Regulated professionals (Work tier).** Required: the product must not claim compliance ("HIPAA-compliant") — it can claim architecture facts (no transmission, encryption at rest, no vendor access) and provide documentation professionals can file; add "verify outputs" banners (California's proposed rule requires lawyers to verify every AI output), retention controls, and export for records.

### 3.11 Operational edge cases

66. **Time/clock changes, timezone, DST for reminders and auto-delete.** Required: monotonic timers for auto-delete, local notification scheduling.
67. **Localization of model names/licenses; store review testers with no network and no model.** Required: a review-mode bundled model so App Review can test offline; reviewer notes explaining the zero-network design and how to test the report control.
68. **Very first update after launch changing the catalog/manifest signature.** Required: manifest versioning with grace for old apps.
69. **Users expecting cloud-level speed (real-time voice at 3–5 tok/s).** Required: honest onboarding speed estimate per device ("~15 tokens/s on this phone") and pre-generated demo.
70. **Widgets/Live Activities showing partial answers on the Lock Screen.** Required: content hidden until unlocked; Live Activity shows only progress.

---

## 4. Store & legal recap (2026)

### 4.1 Apple App Store

- **Age ratings (in force since 31 Jan 2026):** tiers are 4+, 9+, 13+, 16+, 18+ (12+ and 17+ removed; legacy metadata maps 12+→13+, 17+→18+). The questionnaire adds required questions on in-app controls, capabilities (unrestricted web access, user-generated content, messaging/chat, social media, advertising), medical/wellness, violence, and frequency-based descriptors (mature themes, sexuality, chance-based activities). Apple states explicitly that developers "must consider how all app features, including AI assistants and chatbot functionality, impact the frequency of sensitive content." Developers may set a higher rating than computed. Since 9 Jul 2026 social-media questions are in the questionnaire and mandatory from Sept 2026 for new apps, every update, and notarization. Practical outcome for a general-purpose local chatbot: 13+ with a family-safe default, 18+ if it curates uncensored models or markets "no restrictions."
- **Review guidelines relevant to a chat app:** 1.2 (objectionable content: filtering, reporting mechanism, blocking, contact info — reviewers apply this to AI output), 2.3.6 (answer age questions honestly), 5.1.1 (privacy policy link in metadata and in-app even when collecting nothing; consent for any usage data), 5.1.2(i) (explicit permission before sharing personal data with third-party AI — irrelevant if there is no cloud, but binding for any optional online mode), 5.1.4 (kids). Apple requires moderation of generative output and rejects deepfake-style content of real people. Provide reviewer notes describing the offline design and a bundled model for testing.
- **Privacy nutrition label:** "Collect" means transmitting data off the device where you or partners can access it beyond the real-time request; data processed only on-device is not collected. "Data Not Collected" is achievable only with zero SDK egress; Apple has rejected apps that declared no collection while an analytics SDK ran. Diagnostics (crash data, performance) must be declared if any is transmitted by your code; OS-level crash sharing with Apple is Apple's own collection. **Privacy manifest** (`PrivacyInfo.xcprivacy`) is mandatory: declare required-reason APIs you use — disk space (`NSFileSystemFreeSize`, reason E174.1: check space before writing/deleting, data may not leave the device), UserDefaults (CA92.1), file timestamps (C617.1), system boot time (35F9.1) — and `NSPrivacyTracking = false`.
- **Foundation Models framework acceptable use:** no medical/legal/financial/employment outputs that are inaccurate or dangerous or autonomous without human supervision, no adult content, no self-harm facilitation, no "dependency or spiraling" interactions, no circumventing guardrails. If Apple's model is used at all, keep it out of Work-tier medical/legal flows and out of any uncensored path.
- **Purchases:** non-consumable Pro with Family Sharing enabled in App Store Connect; StoreKit 2 JWS transactions verifiable on device; refunds/revocations arrive as `revocationDate` and must gate features, not data; Small Business Program (15 %) applies under $1M/yr.
- **iCloud backup guidance:** exclude re-downloadable large content (models) with `isExcludedFromBackup`; do not exclude user-created content; Caches/tmp are excluded by default and purgeable.
- **Siri AI Extensions (iOS 27):** third-party chatbot apps can register to be invoked from Siri; Apple offers download links in Settings. Implementation details are not public in the sources reviewed; track the App Intents documentation.

### 4.2 Google Play

- **AI-Generated Content policy (since Jan 2024; clarified 2025–2026):** applies to text-to-text chatbot apps where AI chat is a central feature. Requirements: (a) an in-app way for users to report or flag offensive AI-generated content without leaving the app, and use of those reports to inform filtering/moderation; (b) no generation of prohibited content (CSAM, deceptive content, content facilitating scams/harassment, sexual gratification apps, election deception, malicious code, fraudulent documents); (c) responsibility for outputs incl. proactive prevention and testing; (d) labeling/disclosure that content is AI-generated where users might believe they interact with a human; (e) AI content for minors must not be unsafe, sexual, or manipulative. July 15 2026 announcement clarifies that User Data policy (limited use, disclosure, consent) applies to third-party AI integrations and that unrated apps are prohibited. Also relevant: "low-value/duplicative AI app" enforcement (2026), developer verification/registration deadline 30 Sept 2026, target API 36 by 31 Aug 2026, 16 KB page size for API 35+ updates from 1 Feb 2027.
- **Age-Restricted Content & Functionality / Child Safety Standards (Aug 26 2026 update):** anonymous/random chat, dating, gambling apps must block declared minors via Play Console tools; AI chatbots are not named in the preview policy, but companion/roleplay features that connect strangers or are anonymous would be. Keep the app single-user, local, non-social.
- **Content rating:** IARC questionnaire; generative text apps typically land "Teen" (Edge Gallery, Chatbox). Unrated = removal.
- **Data safety form:** required even for zero-collection apps; "collect" = transmitted off device (including by SDKs); on-device-only processing need not be disclosed; ephemeral processing exception exists; misdeclaration is enforceable. Declare "No data collected", "No data shared", encryption at rest, deletion mechanism (export/delete), and a privacy policy URL. Model downloads are outbound requests without user data; state that download hosts see the IP address as any file download would (policy-level transparency, not a data-safety "collection").
- **Billing:** one-time products via Play Billing Library 7+; purchases cached for offline `queryPurchasesAsync`; acknowledge within 3 days; Family Library does not cover in-app purchases; Voided Purchases API needs a server (optional) — without a server, rely on `queryPurchasesAsync` results which drop refunded/revoked purchases once synced.
- **Foreground service limits:** Android 15+ caps `dataSync` and `mediaProcessing` services at 6 h per 24 h; generation should run as a short-lived foreground service only while the user is waiting, not as a persistent service.

### 4.3 GDPR / UK GDPR / CCPA posture for an app that collects nothing

- If no personal data reaches the developer (no accounts, no analytics, no crash SDK, no server), the developer is not a controller or processor for chat content; the user's own processing is household use. The store still requires a privacy policy (Apple 5.1.1, Play Data Safety), so publish one stating: processed on device only, no collection, no sharing, no tracking; purchases and OS diagnostics are processed by Apple/Google as independent controllers under their terms; model downloads reveal an IP address to the download host (Hugging Face or our CDN) like any web download, with no account or identifier; support email is the only channel where personal data (the email) is processed, on a legitimate-interest basis, deleted after resolution.
- CCPA/CPRA applies to businesses over the revenue threshold (~$25M, inflation-adjusted) or handling 100K+ consumers' data or deriving 50 %+ revenue from selling/sharing data; with no personal information collected it is out of scope, but keep the "Do not sell or share" statement in the policy for clarity.
- Data subject requests: none possible server-side; the app itself gives access/export/delete controls, which is the strongest answer to "how do I exercise my rights."
- **EU AI Act:** the app developer is a "provider of an AI system" (chatbot) and the model makers are GPAI providers. Article 50 transparency obligations apply from 2 Aug 2026: (1) users must be informed they interact with AI unless obvious (make it explicit in onboarding and the persona UI anyway); (2) providers of systems generating synthetic text/audio/image must mark outputs as artificially generated in a machine-readable way — for on-device text this is an open compliance question (Commission code of practice on marking in progress; the May 2026 AI Omnibus provisional agreement gives generative systems already on the market until 2 Dec 2026 for the marking requirement). Track it; export functions can embed a "generated by AI" metadata/footer as a defensible interim. No high-risk classification for a general consumer chat app; Work-tier templates must not turn it into an employment/credit/medical decision system.
- **Regulated-user positioning (Pro for Work):** ABA Formal Opinion 512 (2024), Florida Bar 24-1 (2024), and California's Practical Guidance (updated 14 May 2026, with proposed rule amendments requiring verification of AI output and treating exposure of confidential information to AI as "revealing" when there is material risk) all hinge on whether confidential information leaves the lawyer's control and whether the tool retains or trains on it — an on-device tool with no retention outside the device is the cleanest answer, but the lawyer still owes competence, verification, and disclosure to clients where required. HIPAA: a BAA is only needed with a vendor that creates/receives/maintains/transmits PHI; a purely on-device app that never receives PHI is not a business associate, but the covered entity still needs device-level safeguards (encryption, access controls, backups) — provide the documentation. Tax preparers: IRC §7216 consent is triggered when client data is disclosed to a third party such as a cloud AI; on-device processing avoids the disclosure, which is the selling point. Never write "HIPAA-compliant" or "privileged" in marketing; write "no data leaves your device" and let the professional make the determination, with a downloadable architecture statement.

### 4.4 Model and component licenses (what we can redistribute and what we must show)

| Component | License | Redistribution / attribution obligations (if bundled or served from our CDN) |
|---|---|---|
| **Gemma 4** (E2B/E4B/26B/31B, Apr 2026) | Apache 2.0 | Include the Apache notice/LICENSE and attribution; no use restrictions pass-through. |
| **Gemma 3 / 3n / 2 / 1, EmbeddingGemma, ShieldGemma, PaliGemma, FunctionGemma, etc.** | Gemma Terms of Use (source-available) | Pass the Section 3.2 use restrictions and Prohibited Use Policy to recipients as enforceable terms; give recipients a copy of the terms; mark modified files; non-hosted distributions must carry the NOTICE text "Gemma is provided under and subject to the Gemma Terms of Use found at ai.google.dev/gemma/terms". Hugging Face gates these behind terms acceptance, so user-initiated HF downloads need a token and acceptance flow. |
| **Llama 3.x / 4** (Meta) | Llama Community License | Display "Built with Llama" prominently (website/UI/about page); derivative model names must start with "Llama"; ship a NOTICE file with the copyright line; comply with the Acceptable Use Policy; >700M MAU requires a Meta license. DeepSeek-R1-Distill-Llama variants inherit this too. |
| **Qwen 3 / 3.5 / 3.6** (Alibaba) | Apache 2.0 | Notice/attribution only (earlier Qwen 2.x large sizes had the Qwen license; check per repo). |
| **Phi-4 / Phi-4-mini** (Microsoft) | MIT | Copyright notice. |
| **DeepSeek-R1 and Qwen-based distills** | MIT (weights); Qwen distills also Apache (base) | Notices; Llama distills see above. |
| **Mistral 7B, Ministral 3 (2025+)** | Apache 2.0 (but e.g. Ministral 8B 2410 was Mistral Research License — non-commercial) | Check each release; exclude MRL models from a commercial catalog. |
| **LFM2 / LFM2.5** (Liquid AI) | LFM Open License v1.0 (Apache-based) | Free commercial use only while annual revenue < $10M; above that a commercial license is required — fine at launch, flag for later. |
| **SmolLM2/3** (Hugging Face) | Apache 2.0 | Notice. |
| **IBM Granite 4.x** | Apache 2.0 | Notice. |
| **Apple Foundation Models** | OS feature | No redistribution; acceptable-use requirements (§4.1). |
| **Gemini Nano via AICore** | Google terms | No redistribution; foreground-only API. |
| **llama.cpp, whisper.cpp, MLX, MLX Swift** | MIT | Notices in About/licenses screen. |
| **LiteRT / MediaPipe** | Apache 2.0 | Notice. |
| **Kokoro TTS** | Apache 2.0 (weights) | Beware phonemization dependencies: espeak-ng is GPL-3 — do not link it into a closed app; use misaki's pure-Python/Swift G2P or Supertonic/Kitten alternatives with permissive licenses. |
| **Whisper weights** | MIT | Notice. |
| **Embedding models (e.g., multilingual MiniLM, BGE-M3 small, EmbeddingGemma)** | Apache 2.0 / Gemma terms | As above. |

Practical rule: user-initiated downloads from Hugging Face put the license acceptance on the user (show the license and require a tap); anything bundled or served from our CDN makes us a distributor, so we ship the NOTICE files, the "Built with Llama" line if Llama is in the catalog, the Gemma terms link for Gemma ≤3 models, and an in-app "Model licenses" screen listing every model with license name, link, and any use restrictions. Keep an SBOM of native libraries for the App Store privacy manifest and Play SDK declarations.

### 4.5 One-page compliance checklist for the PRD

1. Age rating: answer "AI chatbot / unrestricted generated text" honestly → 13+ (18+ if uncensored catalog); no Kids category.
2. Report/flag control on every AI message (Play requirement) that works offline and explains that nothing is sent automatically.
3. AI disclosure in onboarding + persona headers (Play labeling, EU AI Act Art. 50); "can be wrong" notice.
4. Privacy policy URL in both stores and in-app, stating zero collection; Apple label "Data Not Collected"; Play Data Safety "No data collected/shared"; privacy manifest with required-reason APIs; no third-party SDKs with network access.
5. Model licenses screen + NOTICE files; "Built with Llama" if applicable; Gemma terms acceptance flow; license gating for HF downloads.
6. Purchases: non-consumable Pro, Family Sharing on (iOS), offline entitlement caching, restore button, refund revocation handling; Play acknowledgement; no server.
7. Backup: models excluded, chats included/encrypted; passphrase export for cross-device.
8. Safety: family-safe default, crisis resource card, medical/legal disclaimers, loop/stop controls.
9. Android: 16 KB page-size builds, target API 36, foreground service pattern, developer verification done.
10. Work tier: architecture statement PDF, no "compliant/privileged" claims, verification banners, retention controls.

---

## 5. Sources

Store data (pulled 2 Sep 2026): iTunes Lookup API (`https://itunes.apple.com/lookup?id=<id>&country=us`) and App Store customer-review RSS (`https://itunes.apple.com/us/rss/customerreviews/page=N/id=<id>/sortby=mostrecent/json`) for ids 6448106860 (Private LLM), 6502579498 (PocketPal), 6741426692 (Locally AI), 6476614556 (Enclave), 6448019325 (Liquid Apollo), 6727014156 (fullmoon), 6448482937 (MLC Chat), 6749645337 (Google AI Edge Gallery), 6456886656 (Layla), 6764344419 (Layla Cloud), 6759299882 (Off Grid), 6742061900 (Venice), 6746714949 (Lumo), 663592361 (DuckDuckGo), 6471368056 (Chatbox), 6749835930, 6742779670, 6757007308, 6741479958, 6742157364 (HuggingSnap — no result). Google Play pages and `google-play-scraper` for com.pocketpalai, com.layla, com.google.ai.edge.gallery, me.proton.android.lumo, xyz.chatboxapp.chatbox, ai.liquid.chatapp, com.duckduckgo.mobile.android, com.lmsa.app, com.charles.ollama.client.play.

Competitor sites and repos
- PocketPal AI repo: https://github.com/a-ghorbani/pocketpal-ai — issues #512 (16 KB page size crash), #658 (crash loop after Bonsai model), #231/#241 (new models crash), #89/#140/#530 (load crashes)
- Private LLM: https://privatellm.app/en , FAQ https://privatellm.app/en/faq , App Store https://apps.apple.com/us/app/private-llm-local-ai-chat/id6448106860
- Locally AI: https://locallyai.app/ , App Store https://apps.apple.com/us/app/locally-ai-by-lm-studio/id6741426692 , LM Studio blog "Run (your largest) local models from your iPhone" https://lmstudio.ai/blog/locally-lm-link , https://lmstudio.ai/locally
- Enclave: https://enclaveai.app/ , pricing https://enclaveai.app/pricing/ , blog https://enclaveai.app/blog/ , App Store https://apps.apple.com/us/app/enclave-local-ai-assistant/id6476614556
- Liquid Apollo: https://www.liquid.ai/apollo , https://www.liquid.ai/blog/liquid-ai-launches-leap-and-apollo-bringing-edge-ai-to-every-developer , App Store https://apps.apple.com/us/app/apollo-powered-by-liquid/id6448019325 , Play https://play.google.com/store/apps/details?id=ai.liquid.chatapp , MWM https://mwm.ai/apps/apollo-powered-by-liquid/6448019325
- fullmoon: https://fullmoon.app/ , https://github.com/mainframecomputer/fullmoon-ios , https://blog.mainfra.me/p/fullmoon-is-now-available-on-the
- MLC Chat: https://apps.apple.com/us/app/mlc-chat/id6448482937 , https://github.com/mlc-ai/mlc-llm/issues/3235 , https://llm.mlc.ai/docs/deploy/android.html
- Google AI Edge Gallery: https://play.google.com/store/apps/details?id=com.google.ai.edge.gallery , https://apps.apple.com/us/app/6749645337 , https://github.com/google-ai-edge/gallery/releases , https://developers.googleblog.com/en/google-ai-edge-gallery-now-with-audio-and-on-google-play/ , https://developers.googleblog.com/a-smarter-google-ai-edge-gallery-mcp-integration-notifications-and-session-continuity/ , https://www.androidauthority.com/gemma-4-ai-edge-gallery-3656199/
- HuggingSnap: https://apps.apple.com/gb/app/huggingsnap/id6742157364 , https://github.com/huggingface/HuggingSnap , https://techcrunch.com/2025/03/19/hugging-faces-new-ios-app-taps-ai-to-describe-what-youre-looking-at/
- Layla: https://www.layla-network.ai/ , https://apps.apple.com/us/app/layla/id6456886656 , https://play.google.com/store/apps/details?id=com.layla , https://dev.to/layla_network_ai/how-to-run-a-private-ai-assistant-on-your-phone-in-2026-offline-no-account-no-filters-2kka
- Off Grid: https://getoffgridai.co/mobile/ , https://github.com/mmhanda/off-grid-mobile-ai , https://apps.apple.com/us/app/off-grid-private-ai-chat/id6759299882 , https://gigazine.net/gsc_news/en/20260401-off-grid-mobile-ai/
- Chatbox: https://chatboxai.app/en/guide/chatbox-ai/plans , https://play.google.com/store/apps/details?id=xyz.chatboxapp.chatbox
- Msty: https://msty.ai/pricing/ , https://msty.ai/resources/blog/msty-claw-is-now-msty-go/ , https://modelpiper.com/blog/msty-alternative-mac
- Jan: https://weavai.app/blog/en/2026/04/24/jan-ai-review-2026-free-open-source-local-ai-app/ , https://www.aimadetools.com/blog/jan-ai-complete-guide/
- Ollama: https://ollama.com/blog/new-app , https://ollamamobile.com/ , https://github.com/ibrahimcetin/reins , https://play.google.com/store/apps/details?id=com.charles.ollama.client.play
- LMSA: https://play.google.com/store/apps/details?id=com.lmsa.app
- Venice: https://apps.apple.com/us/app/venice-ai/id6742061900 , https://toolradar.com/tools/venice-ai/pricing , https://aisotools.com/pricing/venice-ai , https://www.appbrain.com/app/venice-ai/com.ai.venice
- Lumo: https://proton.me/lumo/pricing , https://proton.me/blog/lumo-2 , https://techcrunch.com/2026/06/30/lumo-protons-privacy-focused-ai-chatbot-gets-an-upgrade/ , https://apps.apple.com/us/app/lumo-ai-by-proton/id6746714949 , https://play.google.com/store/apps/details?id=me.proton.android.lumo
- DuckDuckGo / Duck.ai: https://duckduckgo.com/pro/plans , https://spreadprivacy.com/pro-subscription/ , https://www.techradar.com/pro/duck-ai-review , https://play.google.com/store/apps/details?id=com.duckduckgo.mobile.android
- Atomic Chat (self-published roundup): https://atomic.chat/blog/llm-updates/offline-ai-apps-2026 , https://atomic.chat/blog/guides/best-local-llm-apps

Roundups, tests, community
- meetaitools, "Offline LLM App Android Free in 2026 — I tested 13 apps" (airplane-mode test, speeds): https://meetaitools.com/offline-llm-app-android-free/ and https://meetaitools.com/pocketpal-ai-vs-mlc-chat-android/
- PromptQuorum iPhone 2026: https://www.promptquorum.com/power-local-llm/best-local-llm-apps-iphone-2026 ; Android 2026: https://www.promptquorum.com/power-local-llm/best-local-llm-apps-android-2026 ; mobile local LLMs (thermal/battery numbers): https://www.promptquorum.com/local-llms/mobile-local-llms ; sensitive-data guide: https://www.promptquorum.com/local-llms/private-local-llm-sensitive-data
- modelfit.io iPhone ranking + RAM table: https://modelfit.io/guides/best-llm-for-iphone/
- Medium/Techlatest "15 Best Local LLM Apps in 2026": https://medium.com/@techlatest.net/15-best-local-llm-apps-in-2026-ranked-by-hardware-privacy-use-case-f17c4ccf9cc4
- localaimaster "Run an LLM on Your Phone (2026)": https://localaimaster.com/blog/run-llm-on-phone
- MWM PocketPal page (ratings/complaint summary): https://mwm.ai/apps/pocketpal-ai/6502579498
- r/LocalLLaMA threads (via RSS): "Basic PSA. PocketPal got updated, so runs Gemma 4" https://www.reddit.com/r/LocalLLaMA/comments/1scsgid/ ; "PocketPal best model for iPhone 16 Pro" https://www.reddit.com/r/LocalLLaMA/comments/1s84mys/ ; "Anyone able to get Gemma-4 to run on PocketPal iOS?" https://www.reddit.com/r/LocalLLaMA/comments/1sbklls/ ; "I'm looking for fast models on pocketpal" https://www.reddit.com/r/LocalLLaMA/comments/1rq2qdw/ ; "PocketPal AI is open sourced" https://www.reddit.com/r/LocalLLaMA/comments/1g8kl5e/
- AlternativeTo Private LLM review snippet: https://alternativeto.net/software/private-llm/about

Apple platform and policy
- Updated age ratings in App Store Connect: https://developer.apple.com/news/?id=ks775ehf ; guides: https://launchbuddy.app/blog/app-store-age-rating-questionnaire/ , https://ptkd.com/journal/app-store-age-ratings-2025-update , https://ecorpit.com/app-store-social-media-declaration-age-assurance-readiness-2026/
- App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- App privacy details (definition of collect, optional disclosures): https://developer.apple.com/app-store/app-privacy-details/
- Privacy manifest files / required reason APIs: https://developer.apple.com/documentation/bundleresources/privacy-manifest-files
- iCloud backup optimization: https://developer.apple.com/documentation/foundation/optimizing-your-app-s-data-for-icloud-backup
- Foundation Models: SystemLanguageModel https://developer.apple.com/documentation/foundationmodels/systemlanguagemodel ; UnavailableReason https://developer.apple.com/documentation/foundationmodels/systemlanguagemodel/availability-swift.enum/unavailablereason ; GenerationError https://developer.apple.com/documentation/foundationmodels/languagemodelsession/generationerror ; exceededContextWindowSize https://developer.apple.com/documentation/foundationmodels/languagemodelsession/generationerror/exceededcontextwindowsize(_:) ; WWDC26 guide https://developer.apple.com/wwdc26/guides/apple-intelligence/ ; WWDC26 session https://developer.apple.com/videos/play/wwdc2026/241/ ; acceptable use https://developer.apple.com/apple-intelligence/acceptable-use-requirements-for-the-foundation-models-framework/ ; context-window notes https://drobinin.com/consulting/foundation-models-apple-intelligence/putting-apple-foundation-models-in-a-real-app/ , https://zats.io/blog/making-the-most-of-apple-foundation-models-context-window/ , https://developer.apple.com/forums/thread/797512
- Apple Intelligence availability/languages: https://support.apple.com/en-us/121115 ; EU availability https://mjtsai.com/blog/2025/04/03/apple-intelligence-available-in-eu/
- Siri AI / iOS 27: https://www.apple.com/newsroom/2026/06/apple-unveils-next-generation-of-apple-intelligence-siri-ai-and-more/ , https://www.apple.com/newsroom/2026/06/apple-intelligence-brings-powerful-ai-capabilities-into-everyday-experiences/ , https://techcrunch.com/2026/06/09/wwdc-2026-everything-announced-on-siri-ai-os-27-apple-intelligence-and-more/ , https://www.macrumors.com/2026/06/10/ios-27-siri-ai-hands-on/ , https://www.macrumors.com/2026/03/26/apple-ios-27-siri-chatbot-integration/ , https://www.macrumors.com/2026/01/21/siri-chatbot-ios-27/
- iOS memory entitlements / jetsam: https://zenn.dev/mtfum/articles/ios_memory_entitlements?locale=en , https://codoid.com/mobile-application-testing/ios-jetsam-testing-stop-misdiagnosing-memory-kills-as-crashes/ , https://developer.apple.com/forums/thread/805161 , https://mvpfactory.io/blog/on-device-llm-inference-via-kmp-and-llama-cpp-memory-mapped-model-loading-ane
- StoreKit 2 entitlements/offline/family/refunds: https://developer.apple.com/forums/thread/823454 , https://developer.apple.com/forums/thread/775839 , https://developer.apple.com/forums/thread/685064 , https://developer.apple.com/videos/play/tech-talks/10887/ , https://www.theswift.dev/posts/storekit-current-entitlements-vs-updates/ , https://developer.apple.com/documentation/storekit/verificationresult/jwsrepresentation-21vgo
- NWPathMonitor / Low Data Mode: https://www.donnywals.com/supporting-low-data-mode-in-your-app/ , https://www.hackingwithswift.com/plus/networking/user-friendly-network-access
- VoiceOver live announcements: https://appt.org/en/docs/ios/samples/accessibility-live-region , https://www.forasoft.com/blog/article/accessibility-ios-app-development

Google platform and policy
- AI-Generated Content policy: https://support.google.com/googleplay/android-developer/answer/13985936 ; explainer https://support.google.com/googleplay/android-developer/answer/14094294 ; Oct 2023 announcement https://android-developers.googleblog.com/2023/10/announcing-policy-updates-to-support-app-quality-on-google-play.html , https://techcrunch.com/2023/10/25/google-plays-policy-update-cracks-down-on-offensive-ai-apps-disruptive-notifications/ , https://9to5google.com/2023/10/25/google-play-gen-ai-policy/
- Policy announcement 15 Jul 2026: https://support.google.com/googleplay/android-developer/answer/17134731 ; Apr 15 2026: https://support.google.com/googleplay/android-developer/answer/16926792 ; Age-restricted content preview: https://support.google.com/googleplay/android-developer/answer/17036597 ; anonymous chat rules Aug 2026: https://ecorpit.com/google-play-anonymous-chat-age-restricted-policy-august-2026/ ; low-value AI apps: https://appsops.store/news/google-play-ai-content-policy-low-value-apps-2026
- Data safety: https://support.google.com/googleplay/android-developer/answer/10787469 ; guides https://respectlytics.com/blog/google-play-data-safety-guide/ , https://www.nasrtech.dev/blog/google-play-data-safety-explained/
- Content ratings: https://support.google.com/googleplay/android-developer/answer/9898843
- 16 KB page sizes: https://developer.android.com/guide/practices/page-sizes
- Foreground service timeouts (Android 15): https://developer.android.com/develop/background-work/services/fgs/timeout , https://developer.android.com/about/versions/15/behavior-changes-15
- Gemini Nano / ML Kit GenAI / AICore: https://developer.android.com/ai/gemini-nano , https://developers.google.com/ml-kit/genai , https://developers.google.com/ml-kit/genai/prompt/android/get-started , https://developer.android.com/blog/posts/ml-kit-s-prompt-api-unlock-custom-on-device-gemini-nano-experiences
- Play Billing: https://developer.android.com/google/play/billing/integrate , https://developer.android.com/google/play/billing/manage-purchases , voided purchases https://developers.google.com/android-publisher/voided-purchases ; Family Library https://support.google.com/googleplay/answer/7007852
- Play Integrity: https://developer.android.com/google/play/integrity/overview

Licenses
- Gemma Terms of Use: https://ai.google.dev/gemma/terms ; Gemma 4 Apache 2.0: https://dev.to/techsifted/google-gemma-4-review-2026-apache-20-license-benchmarks-commercial-use-3iea , https://www.mindstudio.ai/blog/gemma-4-apache-2-license-commercial-use ; Gemma 4 overview https://ai.google.dev/gemma/docs/core
- Llama 4 Community License: https://developer.meta.com/ai/llama4/license/
- Qwen3 Apache 2.0: https://huggingface.co/Qwen/Qwen3-8B/blob/main/LICENSE ; Phi-4 MIT: https://huggingface.co/microsoft/phi-4 ; DeepSeek-R1 MIT: https://github.com/deepseek-ai/DeepSeek-R1 ; Mistral 7B Apache: https://mistral.ai/news/announcing-mistral-7b/ ; LFM Open License: https://www.liquid.ai/lfm-license , https://docs.liquid.ai/lfm/help/model-license , https://huggingface.co/LiquidAI/LFM2-2.6B-Exp-GGUF/discussions/3 ; SmolLM3: https://huggingface.co/HuggingFaceTB/SmolLM3-3B ; Granite 4: https://www.ibm.com/new/announcements/ibm-granite-4-0-hyper-efficient-high-performance-hybrid-models ; Kokoro: https://huggingface.co/hexgrad/Kokoro-82M ; whisper.cpp: https://github.com/ggml-org/whisper.cpp/blob/master/LICENSE
- GGUF corruption / verification: https://markaicode.com/errors/llamacpp-model-load-failed-fix/ , https://github.com/ggml-org/llama.cpp/issues/3905

Legal / professional
- ABA Formal Opinion 512: https://www.americanbar.org/news/abanews/aba-news-archives/2024/07/aba-issues-first-ethics-guidance-ai-tools/ , https://legalaigovernance.com/resources/aba-opinion-512/
- Florida Bar Opinion 24-1: https://www.floridabar.org/etopinions/opinion-24-1/
- California Bar guidance (May 2026 update, proposed rules): https://www.calbar.ca.gov/Portals/0/documents/ethics/Generative-AI-Practical-Guidance.pdf , https://www.calbar.ca.gov/public/public-meetings-comment/public-comment/public-comment-archives/2026-public-comment/proposed-amendments-rules-professional-conduct-related-artificial-intelligence , https://www.lawnext.com/2026/05/california-bar-proposes-rule-requiring-lawyers-to-verify-every-ai-output-and-five-other-ai-focused-ethics-changes.html
- HIPAA and LLMs: https://medcurity.com/using-llms-with-phi-hipaa/ , https://www.definite.app/blog/hipaa-compliant-llm , https://localaimaster.com/blog/local-ai-therapists , https://basilai.app/articles/2026-04-25-ai-meeting-transcription-therapy-sessions-mental-health-confidentiality-on-device-privacy.html
- IRS §7216 / Circular 230 AI guidance: https://www.wolterskluwer.com/en/expert-insights/circular-230-ai-update-what-is-means-for-firms , https://aitaxpractitioner.com/academy/section-7216-ai-consent/
- EU AI Act Article 50: https://artificialintelligenceact.eu/transparency-rules-article-50/ , https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act , https://www.regulyn.com/insights/ai-act-transparency-obligations-article-50
- Privacy policy requirements for zero-collection apps: https://termly.io/faq/when-is-a-privacy-policy-required-for-an-app/ , https://www.termsfeed.com/blog/ios-apps-privacy-policy/ , https://www.flurry.com/ccpa-compliance-guide/
