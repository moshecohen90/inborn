# Launch languages: which ones the models we ship are actually good at (decision doc, 20 Sep 2026)

Question from Moshe, 20.9.2026: *"Hebrew users are not the first target. We want to pick 5–10 launch languages
where the on-device models that exist today are actually good; Hebrew maybe later. Research it."*

This is a decision, not a survey. It rests on two legs, both gathered for this document:

- **Leg A — measured on a device.** Every score below comes from the real Inborn chat running on one
  Pixel_6_API_33 emulator (7.6 GB guest RAM, CPU only, debug APK off `main` at 596e229), 132 generations
  across 18 languages and 3 model tiers. Nothing here is copied from a model card.
- **Leg B — market.** Store spend, evidence that consumers pay for AI, privacy appetite and store blockers.
  **§4 carries every number with its source URL and date**, and the load-bearing figures were re-verified
  against the primary source a second time before this document was finalised. Three of them did not
  survive that check and are corrected in place, with the correction stated rather than quietly applied.

---

## ‏תקציר מנהלים (עברית)

‏**השורה התחתונה: שמונה שפות השקה — אנגלית, יפנית, גרמנית, ספרדית, צרפתית, פורטוגזית (ברזיל), קוריאנית, סינית מסורתית.**
‏עברית נדחית עד שיכנס מודל ייעודי לקטלוג. זו לא החלטה שיווקית אלא מדידה: עברית קיבלה 1 מתוך 3 בכל שלושת המבחנים, בכל שלושת המודלים.
‏
‏**מה מדדנו.** הרצנו 132 תשובות אמיתיות באפליקציה על אמולטור אחד: 18 שפות × 3 משימות (פסקה של 100 מילים, רשימה של חמישה סעיפים,
‏תרגום של שני משפטים מאנגלית) × שלוש רמות מודל. כל תשובה נקראה ונוקדה 0–3. הקבצים שמורים בתיקיית העבודה של הסבב.
‏
‏**מה שהופתענו ממנו.**
‏1. ‏**סינית היא השפה הכי חזקה שיש לנו** — 3/3/3 גם ב-Fast וגם ב-Sharp, בשתי הכתיבות. הקטלוג צודק כשהוא מדרג zh כ-native.
‏2. ‏**גרמנית ב-Fast שבורה** — שלוש דגימות נפרדות פתחו את הפסקה ב-"Gutem Schlaf ist", שגיאת יחסה. זו לא תקלה חד-פעמית.
‏   הקטלוג מדרג de כ-"good" ב-Fast; זה לא נכון. ב-Sharp גרמנית בסדר גמור (2.5/2.5/3).
‏3. ‏**אינדונזית טובה כמו שפה אירופית** ב-Sharp (3/3/2.5) — אבל היא לא קיימת בכלל בטבלת השפות של הקטלוג, ולכן האפליקציה
‏   תגיד למשתמש אינדונזי ש"שום מודל בטלפון הזה לא טוב באינדונזית". זה באג אמיתי, לא רק אי-דיוק.
‏4. ‏**Instant (0.8B) לא ראוי להשקה בשום שפה מלבד אנגלית ופרוזה בסינית.** גרמנית ב-Instant: 1/1/1. קוריאנית: 1/2/0.
‏   יפנית: הפסקה חזרה על עצמה מילה במילה שלוש פעמים.
‏5. ‏**רוסית מקבלת 3/3/3 ב-Sharp ויש לה את הסיפור השיווקי הכי חזק בעולם** (37.6% שימוש ב-VPN, חסימות אינטרנט ב-83 מחוזות,
‏   ChatGPT נחסם מ-6.9.2026) — **אבל אין שום ערוץ תשלום.** אפל סגרה כל תשלום ברוסיה ב-1.4.2026, גוגל מאז 2022, סטרייפ ופאדל חסומים.
‏
‏**מה זה עולה לנו.** שש מתוך השמונה — אנגלית, יפנית, גרמנית, ספרדית, צרפתית ופורטוגזית — כבר מתורגמות במלואן:
‏1000 מפתחות ב-`packages/i18n/locales` וקופי חנות ב-`docs/store`. צריך להוסיף שתי לוקליזציות בלבד: קוריאנית וסינית מסורתית.
‏
‏**הגל השני:** אינדונזית, סינית פשוטה (כלוקליזציה בלבד, לא בחנות הסינית), ערבית (מפרץ), איטלקית.
‏**נדחות:** רוסית, טורקית, פולנית, הולנדית, הינדי, עברית.
‏
‏**עברית — מה צריך כדי להיכנס.** יש תשובה טובה וזמינה: `DictaLM-3.0-1.7B-Instruct`, רישיון Apache-2.0 ללא תנאים,
‏‎1.11 GB ב-Q4_K_M, מבוסס Qwen3 ולכן llama.cpp כבר תומך. בבנצ'מרק הניקוד שלו 52.76 מול 2.93 של Qwen3-1.7B.
‏ההמלצה: לא להשקה הראשונה. להכניס אותו לקטלוג ברבעון שאחרי ההשקה, אחרי שנריץ עליו בדיוק את שלושת המבחנים האלה.

---

## 1. The recommendation

### 1.1 Launch set — eight languages, in this order

| # | Language | Why it is in | Sharp P/L/T | Fast P/L/T | UI + store copy |
|---|---|---|---|---|---|
| 1 | **English** | Largest market and the only one with proven paid conversion: the US alone is ~$2.2B of GenAI mobile IAP in 12 months, ~38% of the world's. 71% of US adults already believe AI makes their data less secure. | 3/3/3 | 3/3/2 | ✅ shipped |
| 2 | **Japanese** | #3 app market ($16.5B), iOS-majority, Gen-AI IAP +262% YoY, no domestic consumer incumbent since LINE's assistant closed, and the lowest App Store commission of any major market post-MSCA. | 3/3/3 | 3/3/1.5 | ✅ shipped |
| 3 | **German** | The only market with a *quantified* willingness to pay for AI privacy: 73% will pay a premium, averaging 9%. Highest per-user app spend in Europe ($71.5) and #3 worldwide for ChatGPT mobile spend. | 2.5/2.5/3 | **1.5**/2/2.5 | ✅ shipped |
| 4 | **Spanish** | Spain's own wallet is thin ($23.3/user) but one locale buys Hispanic LatAm, and the AEPD is publicly telling citizens not to give personal data to AI. | 2.5/3/3 | 3/3/2.5 | ✅ shipped |
| 5 | **French** | $59.5 per user, second-largest European wallet, and a regulator (CNIL) that has named *prompts* as the privacy problem. | 3/2.5/3 | 3/2.5/2.5 | ✅ shipped |
| 6 | **Portuguese (Brazil)** | The largest and most AI-hungry audience in the study, with a real privacy grievance. Price a one-time BRL unlock, never a USD subscription. | 3/3/3 | 3/2/1.5 | ✅ shipped |
| 7 | **Korean** | #2 in the world for paid ChatGPT subscribers, and the only country whose regulator has already *deleted a cloud AI app from the store* over data egress. That is our thesis proven in public. | 3/3/3 | 2/2.5/1 | ❌ new locale |
| 8 | **Chinese (Traditional)** | Taiwan is a top-10 IAP market, 60% iOS, 18% of adults already subscribe to an AI service, and there is no ICP filing, no AI filing, no licence. Hong Kong rides the same locale free. | 3/3/3 | 3/2.5/3 | ❌ new locale |

Six of the eight already have a complete locale (1,000 keys) and store copy. The launch therefore costs
**two new locales, not eight**.

### 1.2 Second wave

| Language | Sharp P/L/T | Why it waits |
|---|---|---|
| **Indonesian** | 3/3/2.5 | Model quality is as good as any European language and one locale covers 97% of a 288M market whose AI IAP grew +151% against a $4.50 price anchor. It waits only on **Komdigi PSE registration**, which is mandatory for foreign apps with no size threshold and is actively enforced — Komdigi warned OpenAI, Cloudflare and Duolingo in Oct–Nov 2025. Register first, ship second. |
| **Chinese (Simplified)** | 3/3/3 | Near-free once Traditional exists, and the best-scoring language we measured. Ship it as a **localisation on non-China storefronts only** and explicitly deselect mainland China in App Store Connect. |
| **Arabic (Gulf)** | 2.5/2.5/2.5 | Passes both gates and the Gulf market is strong (ChatGPT is the #3 top-grossing app in the entire Middle East; UAE leads the world in AI adoption at 59.4%). It waits on real engineering: full RTL, a ~3× tokenizer tax on context and speed, and a content-moderation layer, because an unfiltered local model discussing the ruling family or apostasy is a genuine removal risk. |
| **Italian** | 3/2.5/**2** | Cheap to add next to Spanish, French and Portuguese, but it fails the Sharp bar on translation, Italy has the EU's lowest GenAI adoption (19.9%), and only 42% would pay a privacy premium, at 5%. |

### 1.3 Defer

| Language | Score | Reason |
|---|---|---|
| **Russian** | Sharp 3/3/3 | **No payment rail exists.** Apple stopped all payments in Russia on 1 April 2026, including subscription renewals; Google Play billing has been suspended since 10 March 2022; Stripe and Paddle are sanctioned-blocked. The best offline narrative in the world (37.6% VPN penetration, shutdowns in 83 regions, ChatGPT TLS-blocked since 6 Sep 2026) lands in a market that cannot pay us. Revisit only as a **diaspora locale** monetised through Kazakhstan, Germany, Israel and the US. |
| **Turkish** | Sharp 2.5/2.5/2 | Fails the Sharp bar, and $14.6 per user per year in the world's arbitrage bargain-bin storefront with no Apple Pay, Google Pay or PayPal. |
| **Polish** | Sharp 2/2/2 | Fails the bar, and Poles have the **highest** trust of any market measured that AI companies protect their data (60%) — precisely the wrong audience for this pitch. |
| **Dutch** | Sharp 2/1.5/**3** | The model genuinely cannot write Dutch prose (see §3.4), and the Netherlands ranks #1 in the world for English proficiency, so the English build already serves those 18M highly privacy-active people. |
| **Hindi** | Sharp 2/2.5/**1** | Fails on translation, and the commercial case is worse than the model: $0.03 revenue per download, and OpenAI, Google and Airtel have each set the consumer price of AI in India to zero. Perplexity's 56M free Indian users converted to a ~$1.9M/year run-rate. **Ship English to India.** |
| **Hebrew** | Sharp 1/1/1 | See §6. Needs a dedicated model. |

---

## 2. How the scores were produced

**Rig.** One private emulator clone (`Pixel_6_API_33_ll`, `-port 5640 -memory 7600 -cores 4 -no-window
-no-snapshot`), debug APK built from the `launch-languages` worktree, Metro on 8147, models served by
`scripts/serve-models.mjs` on 8795 over `adb reverse`, prompts driven through `Documents/dev-prompt.txt`
(`EXPO_PUBLIC_AUTOPROMPT=file`) and replies read back from `Documents/dev-run.json`. Sharp's two shards were
pushed directly and their SHA-256 verified against catalog v2 before the run.

**Every prompt got a fresh chat.** The app is force-stopped and relaunched before each prompt, because
`AppServices` starts with `active = { id: null }`. Without that, turns accumulate in one conversation, an
earlier language contaminates the next, and the growing context halves the token rate. The first attempt at
this study did accumulate context and had to be discarded.

**The three prompts,** the same everyday content in every language:

1. a paragraph of about 100 words on the importance of good sleep for health;
2. the benefits of learning a new language, answered as a list of five;
3. a translation of two English sentences: *"The meeting was moved to Thursday morning because two of the
   managers are traveling. Please confirm that the new time works for you."*

These are deliberately the same three prompts as the Hebrew spot check in `docs/models/model-fit.md`
(15.9.2026), so Hebrew is comparable across rounds. For English, whose translation target would otherwise be
itself, the source sentences were the Spanish rendering instead.

**Scoring, 0–3, by reading every answer:** 0 gibberish or wrong script · 1 understandable but with many
errors or drift to English · 2 fluent with occasional errors · 3 native quality. For the translation prompt,
fidelity counts as well as fluency: a wrong weekday is an error even when the sentence is elegant.

**Coverage:** Fast and Sharp on all 18 languages (108 generations); Instant on the eight recommended launch
languages (24); plus two extra German samples on Fast to test one decisive score (§3.2). Speed on this
CPU-only emulator: Instant 5–9 tok/s, Fast 2.3–11 tok/s, Sharp 1.6–4.8 tok/s.

**Where each score's evidence lives.** Every one of the 132 generations is a JSON file at
`<scratch>/launch-languages/runs/<model>/<lang>-<task>.json`, holding the exact prompt sent, the full reply
text, elapsed wall time and the tok/s the engine reported. That is the evidence behind each cell in §3.1 —
deliberately in preference to screenshots, which would have captured a scrolling chat view and less of the
answer. `<scratch>` is this round's session scratch dir; the files are outside the repo by the hygiene rule.

**Limitations, stated plainly.** One sample per cell, on an emulator, with one prompt per task. A real phone
is faster and the ranking should not change, but a single unlucky generation can move one cell by half a
point. Where a cell decided something, it was re-sampled.

---

## 3. The measurements

### 3.1 Full score table

P = paragraph, L = five-item list, T = translation.

| Lang | Instant P/L/T | Fast P/L/T | Fast min | Sharp P/L/T | Sharp min |
|---|---|---|---|---|---|
| en | 2.5/3/1.5 | 3/3/2 | 2 | **3/3/3** | 3 |
| es | 2/2/2 | 3/3/2.5 | 2.5 | 2.5/3/3 | 2.5 |
| pt-BR | 2.5/2.5/1 | 3/2/1.5 | 1.5 | **3/3/3** | 3 |
| fr | 2/1.5/2 | 3/2.5/2.5 | 2.5 | 3/2.5/3 | 2.5 |
| de | 1/1/1 | **1.5**/2/2.5 | 1.5 | 2.5/2.5/3 | 2.5 |
| it | not run | 3/2.5/1.5 | 1.5 | 3/2.5/2 | 2 |
| ja | 1/2.5/1 | 3/3/1.5 | 1.5 | **3/3/3** | 3 |
| ko | 1/2/0 | 2/2.5/1 | 1 | **3/3/3** | 3 |
| zh-Hans | not run | **3/3/3** | 3 | **3/3/3** | 3 |
| zh-Hant | 2/2.5/2.5 | 3/2.5/3 | 2.5 | **3/3/3** | 3 |
| ru | not run | 3/2.5/2 | 2 | **3/3/3** | 3 |
| ar | not run | 2/2/3 | 2 | 2.5/2.5/2.5 | 2.5 |
| hi | not run | 1/1/1 | 1 | 2/2.5/1 | 1 |
| tr | not run | 2.5/2/1.5 | 1.5 | 2.5/2.5/2 | 2 |
| id | not run | 2.5/3/1.5 | 1.5 | 3/3/2.5 | 2.5 |
| nl | not run | 1/1/2.5 | 1 | 2/1.5/3 | 1.5 |
| pl | not run | 1/1/1 | 1 | 2/2/2 | 2 |
| he | not run | 1/1/0 | 0 | 1/1/1 | 1 |

### 3.2 The gate, and why the recommendation is not exactly the gate

The brief's gate was: **≥2 on Fast and ≥2.5 on Sharp, on all three prompts.** Applied literally it passes
seven languages — en, es, fr, zh-Hans, zh-Hant, ru, ar — and after removing store blockers (mainland China
closed, Russia unpayable) leaves five: **English, Spanish, French, Traditional Chinese, Arabic.**

That set is defensible but I do not think it is right, and here is the concern, stated once before the
recommendation stands.

**The translation prompt on Fast is doing all the work.** Translation is the hardest of the three tasks for a
2B model in every language, and it knocked out Japanese (Fast T 1.5), Portuguese (1.5), Korean (1) and
Indonesian (1.5) — every one of which scores 3/3/3 or 3/3/2.5 on Sharp and writes excellent prose on Fast.
Translation is one of eight uses in the fit map and one quick action in the product; it is not what a chat app
is for, and the catalog already warns about it (`Fast · translate: good`, `Instant · translate: weak`).

**The corrected gate** I applied instead: **Sharp ≥2.5 on all three** (the Pro experience must be right) **and
Fast ≥2 on the paragraph and the list** (the free tier must write good prose). That passes eleven: en, es,
pt-BR, fr, ja, ko, zh-Hans, zh-Hant, ru, ar, id. Removing store blockers and cost gives the eight in §1.1 plus
the second wave in §1.2.

**German is the one place I overrode a failing score, and it deserves the detail.** German fails both gates on
one cell: Fast paragraph, 1.5. Because German is the strongest commercial case in Europe, that cell was
re-sampled twice more. All three samples opened with the same wrong-case phrase, *"Gutem Schlaf ist …"*
(it must be *Guter Schlaf ist*), and two of the three added a gender error on the very next noun
(*ein unverzichtbarer Säule*, *das Körperregieren*). This is systematic, not an unlucky draw.

German is still in the launch set, for a specific reason: **Sharp German is fine (2.5/2.5/3), and the product
already has the machinery to route a user to the model that suits their language.** The correct fix is not to
drop German; it is to correct the catalog so that `de` on Fast is `basic` rather than `good`, at which point
the existing chat card says *"SHARP handles German better than FAST"* and the vault moves the RECOMMENDED tag.
That is a work item in §7, and it must ship before German does.

### 3.3 What surprised us

1. **Chinese is the best language we ship, in both scripts.** `zh-Hans` is the only language scoring 3/3/3 on
   *Fast*, and Traditional matches it on Sharp. The Simplified translation on Fast —
   *"会议已移至周四上午，因两位经理出差。请确认新时间是否方便。"* — is shorter and more idiomatic than the English original.
2. **Korean and Japanese are under-rated by the catalog.** Both are `good` in catalog v2 and both measured
   3/3/3 on Sharp, with natural keigo and correct honorifics. Korean's Sharp translation,
   *"회의는 두 명의 관리자가 여행 중이므로 목요일 오전으로 변경되었습니다"*, is exactly right.
3. **Arabic's Fast translation was the single best translation of all 18 languages on Fast** —
   *"تم نقل اجتماعنا إلى صباح يوم الخميس بسبب سفر اثنين من المديرين"* — correct, idiomatic, right weekday.
   The catalog lists "Fast · Arabic `good` (borderline with basic)" as its second-least-certain judgement.
   The measurement says the doubt runs the other way.
4. **Instant (0.8B) is not launch-grade in any language but English.** German on Instant is 1/1/1 and asserts
   that adults need "at least four hours of sleep per day". The Japanese paragraph repeated the same two
   sentences verbatim three times. The Korean paragraph announced it was writing a 100-word paragraph and then
   produced a ten-item list. The Korean translation inverted the meaning, asking the reader to confirm that the
   new time is *not* suitable. Only Chinese prose holds up.
5. **The translation prompt is the honest discriminator.** Nine of eighteen languages got the weekday wrong on
   Fast — Monday, Sunday, Wednesday, Saturday, "tomorrow", and in Hebrew the festival of Shavuot. Sharp fixed
   almost all of them. If we ever market translation as a feature, it is a Sharp feature.

### 3.4 Evidence for the languages we are turning down

- **Dutch, Fast:** *"wordt de hersenen volledig ontbonden"* ("the brain is completely decomposed"), plus the
  non-words *immuunsystematie* and *slaapkrijze*. On Sharp it improves but still produces *slaappartner*
  ("sleep partner") where it means sleep, and a list item claiming language learning "helps the brain get older".
- **Polish, Fast:** *"Sno dobre i wystarczające"* is not Polish; *"tarciami nocnymi"* ("nocturnal frictions")
  is invented; one list item recommends better communication with relatives *"mieszkającymi na czerstwie
  powietrza"* (gibberish). On Sharp the prose is passable but the translation opens with *"Zarówno spotkanie
  przeniesiono"*, a nonsensical connector.
- **Hindi, Fast:** the paragraph's second word mixes Chinese characters and a Korean particle
  (*"नींद人体의"*); the list contains *"मindspace"* and *"कognition"* in Latin script. Sharp is far better prose
  but its translation renders "meeting" as the non-word *मंथिल* and Thursday as Saturday.
- **Turkish, Sharp:** competent prose, but the translation renders "managers" as *yönetmen* — film directors.
- **Italian, Sharp:** the translation moves the meeting to Thursday *afternoon*.

---

## 4. Market evidence

Every number the recommendation rests on, with its source and date. Figures marked **[re-verified]** were
checked a second time against the primary source on 20.9.2026 before this document was finalised; the
corrections that check produced are noted inline. Anything that could not be pinned to a source is said to be
unsourced rather than quietly rounded.

### 4.1 The one table that decides the order

ChatGPT lifetime mobile consumer spend by country, the cleanest available proxy for "people here pay real
money for an AI assistant on a phone" — Appfigures, 18–27 Dec 2025 **[re-verified]**
(https://appfigures.com/resources/insights/chatgpt-hits-3b-consumer-spend,
https://techcrunch.com/2025/12/18/chatgpts-mobile-app-hits-new-milestone-of-3b-in-consumer-spending/):

| Rank | Country | Lifetime ChatGPT mobile spend | In our launch set? |
|---|---|---|---|
| 1 | United States | $1.2B | ✅ #1 |
| 2 | Japan | $181M | ✅ #2 |
| 3 | Germany | $170M | ✅ #3 |
| 4 | South Korea | $154M | ✅ #7 |
| 5 | United Kingdom | $152M | ✅ (English) |

**Four of the world's top five AI-paying countries are the first four names in §1.1, and the fifth is served
by the English build.** That is the single strongest justification for the ordering, and it was not the
reason the order was chosen — the order fell out of market size × readiness and this table confirmed it
afterwards.

### 4.2 Per language

**English (US / UK / CA / AU).** Global consumer app spend $167B in 2025, +10.6%, with non-game apps
($85.6B) passing games ($81.8B) for the first time — Sensor Tower State of Mobile 2026, Jan 2026
(https://sensortower.com/blog/state-of-mobile-2026). **The US alone generated nearly $2.2B of generative-AI
mobile IAP between Q2 2025 and Q1 2026, almost 38% of the global total; global gen-AI IAP was $6.1B, +232%
YoY** — Sensor Tower State of AI 2026, 16 Jun 2026 **[re-verified at the primary release]**
(https://sensortower.com/press/sensor-tower-state-of-ai-2026-report-global-time-spent-on-generative-ai-apps-projected-to-more-than-double-year-over-year).
Claude's US mobile ARPU rose from under $0.50 in Sep 2025 to $2.76 in May 2026, with 13% of users on a paid
plan (https://techcrunch.com/2026/06/16/chatgpts-market-share-slips-below-50-for-first-time/).
**71% of US adults believe more AI use will make their personal information less secure, against 3% who say
more secure; 49% now use AI chatbots, up from 33% in 2024** — Pew Research, fielded 17–23 Feb 2026, n=5,119,
published 17 Jun 2026 **[re-verified]**
(https://www.pewresearch.org/internet/2026/06/17/americans-and-ai-2026-chatbots-smart-devices-and-views-on-impact/,
https://www.pewresearch.org/chart/americans-largely-think-ai-will-make-their-personal-information-less-secure/).
UK $4.8B in 2024 at $93.20 per consumer, Canada $3.1B, Australia $3.0B — Business of Apps country pages, 2026
editions. Counterweight, and it is real: English is the most contested market, with free OS-level on-device
AI (Apple Intelligence, Gemini Nano) and a free open-source rival in PocketPal AI
(https://apps.apple.com/us/app/pocketpal-ai/id6502579498).

**Japanese.** $16.5B consumer app spend in 2024, the #3 market globally **[re-verified]**
(https://sensortower.com/blog/japan-app-trends-2024-report-by-adjust-and-sensor-tower). iOS share is
**roughly two thirds — StatCounter readings range 61–69% depending on the month and method, so treat "67%"
as a band, not a point** (https://gs.statcounter.com/ios-version-market-share/mobile/japan); the correction
matters only in that Japan is decisively iOS-majority, which is what the on-device argument needs.
**Japan's gen-AI app IAP passed $100M in Q1 2026 alone, +262% YoY** — Sensor Tower State of AI Apps in APAC
2026, Jun 2026 **[re-verified]** (https://sensortower.com/blog/state-of-ai-apps-in-apac-2026-report).
Personal generative-AI usage went from 26.7% to 58.8% in a year — 総務省 情報通信白書 令和8年版, Jul 2026
(https://www.soumu.go.jp/johotsusintokei/whitepaper/ja/r08/html/nd111110.html). **LINE's AI assistant shut
down on 7 January 2026** **[re-verified]**, leaving no domestic consumer incumbent
(https://www.nikkei.com/article/DGKKZO92515260R11C25A1H53A00/).
**Store economics: the Mobile Software Competition Act took full effect 18 December 2025 and Apple's base
App Store commission in Japan is now 10% for the vast majority of developers, or 21% for others — with a
separate 5% payment-processing fee on top when Apple's own IAP is used, stacking onto either tier** (an
earlier draft of this document wrote "21% + 5%" as the alternative to a flat 10%, which mis-stated how the
fees combine) — Apple Newsroom, 17 Dec 2025 **[re-verified]**
(https://www.apple.com/newsroom/2025/12/apple-announces-changes-to-ios-in-japan/). Japan's AI Promotion Act
(in force 1 Sep 2025) carries no fines, bans or mandates
(https://fpf.org/blog/understanding-japans-ai-promotion-act-an-innovation-first-blueprint-for-ai-regulation/).
A narrative gift: the APPI amendment passed on 10 July 2026 **removes opt-in consent for sharing personal
data for AI training** (https://www.nishimura.com/en/knowledge/newsletters/data_protection_260120) — Japan
has just made cloud AI training on personal data easier, which is exactly what an offline app sells against.
Pricing: Japanese monthly subscriptions sit ~57% below the US baseline and price points end in 0 (¥980, not
¥1,099) — https://www.mirava.io/blog/app-pricing-guide-japan.

**German.** $4.9bn consumer app spend in 2024, +19.5%, **$71.5 per smartphone user — the highest per-user
figure in Europe**. Sourcing caveat found on re-verification: these figures trace to Sensor Tower's State of
Mobile 2025 but are read through Business of Apps' aggregation page, which refused a direct fetch, so treat
them as **confirmed via a reputable secondary aggregator, not a primary read**
(https://www.businessofapps.com/data/germany-app-market/). **73% of Germans will pay a premium for AI data
transparency, averaging a 9% premium, against 52% and 7% globally; 75% acted against a brand over AI data
use in six months** — Usercentrics/Sapio State of Digital Trust 2026, n=11,000, fieldwork March 2026,
**published 23 June 2026** (the earlier draft dated this to March, which was the fieldwork, not publication)
**[re-verified]** (https://usercentrics.com/press/usercentrics-state-of-digital-trust-2026-report/).
**13% of German AI users now pay for at least one AI app, up from 8% a year earlier, averaging €20/month** —
Bitkom, n=1,003, weeks 8–11 of 2026 **[re-verified]**
(https://www.bitkom.org/Presse/Presseinformation/Zahlungsbereitschaft-fuer-KI-erhoeht,
https://www.heise.de/en/news/Survey-Few-private-users-pay-for-AI-11299477.html). Trust in cloud AI is
falling: only 37% now say AI's advantages outweigh its disadvantages, down from 49% in 2025 — Ipsos
KI-Monitor 2026, 28 Jul 2026 (https://www.ipsos.com/de-de/ipsos-ki-monitor-2026). Nothing blocks
distribution; the one care item is the age rating, since JMStV's 6. MÄndStV has reached foreign providers
since 1 Dec 2025.

**Spanish.** Spain ~$1.0bn in 2024 at **$23.3 per smartphone user** **[re-verified]**
(https://www.businessofapps.com/data/spain-app-market/) — a thin wallet on its own; the value of the locale
is Hispanic LatAm, and Mexico was among the three fastest-growing App Store subscription markets
(https://adapty.io/blog/mobile-app-monetization-2026/). GenAI usage is 38% of 16–74s, above the EU's 32.7%
(Eurostat 2025, via
https://www.euronews.com/next/2025/12/29/chatgpt-gemini-grok-and-others-which-countries-use-generative-ai-tools-most-across-europe).
The strongest single line in the whole study: **on 27 January 2026 the AEPD published a consumer decalogue,
"Cuidado con lo que le confÍAs", whose core advice is not to share personal or sensitive data with AI**
**[re-verified]**
(https://www.aepd.es/prensa-y-comunicacion/notas-de-prensa/aepd-publica-decalogo-recomendaciones-proteger-privacidad-al-usar-ia).
That is a national regulator writing our marketing copy. 49% of Spaniards would pay a premium for AI
transparency, at 6% (Usercentrics/Sapio, Jun 2026). Spain's own AI law was approved by the Council of
Ministers on 26 May 2026 but **is still not law as of September 2026**
(https://www.congreso.es/public_oficiales/L15/CONG/BOCG/A/BOCG-15-A-97-1.PDF).

**French.** $3.0bn in 2024, +20.9%, **$59.5 per smartphone user**, the second-largest European wallet
**[re-verified]** (https://www.businessofapps.com/data/france-app-market/). GenAI usage 37% of 16–74s
(Eurostat 2025). Only 43% of French people trust AI companies with their data, second-lowest of seven markets
— Ipsos AI Monitor 2025
(https://www.ipsos.com/sites/default/files/ct/publication/documents/2025-06/Ipsos-AI-Monitor-2025.pdf).
**CNIL's Délibération 2025-010, adopted 6 February 2025, explicitly identifies prompts as a locus of
personal-data risk** **[re-verified at Légifrance]**
(https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000051164307,
https://www.cnil.fr/fr/ia-et-rgpd-la-cnil-publie-ses-nouvelles-recommandations-pour-accompagner-une-innovation-responsable)
— an on-device architecture removes that locus entirely. Honest counterweight: **France is absent from the
willingness-to-pay study, so there is no hard evidence that French privacy anxiety converts to purchases.**

**Portuguese (Brazil).** $1.7bn consumer app spend in 2024, up from $1.4bn in 2023 **[re-verified]**
(https://www.businessofapps.com/data/brazil-app-market/). **The widely-quoted "$11.6 per smartphone user"
could not be re-verified — the source page is gated and no independent citation surfaced. Treat Brazil's
per-user spend as low but unquantified rather than repeating that figure.** Demand is not in doubt: 215M
ChatGPT messages a day from Brazil, +54% against Nov 2025
(https://forbes.com.br/forbes-money/2026/08/openai-amplia-operacao-brasil-chatgpt-215-milhoes-mensagens/),
and LatAm gen-AI IAP grew 147% H2'24→H1'25
(https://sensortower.com/blog/state-of-ai-apps-market-overview-2025). The privacy grievance is real and
measured: **66% of Brazilian gen-AI users are worried about how those companies use their data, while 54%
share feelings and emotional content with AI** — Cetic.br/CGI.br, 3rd ed., 2026
(https://cetic.br/pt/pesquisa/privacidade-e-protecao-de-dados-pessoais/). What makes Brazil a one-time-unlock
market rather than a subscription market is tax: **Google withholds 15% IRRF + 10% CIDE = 25% of the customer
price** **[re-verified]** (https://support.google.com/paymentscenter/answer/9384608), Apple applies a 10%
CIDE to non-Brazilian developers from 2 June 2025 (https://developer.apple.com/news/?id=wim4cztw) and IOF of
3.5% from 21 August 2025 (https://9to5mac.com/2025/08/21/apple-details-new-app-store-taxes-and-price-changes-in-select-countries/).
**ECA Digital (Lei 15.211/2025) entered into force 17 March 2026, bans self-declared age and requires a
Brazilian legal representative**, with fines to 10% of Brazilian group revenue **[re-verified at the Senate
and two firms]** (https://www12.senado.leg.br/noticias/materias/2026/03/17/eca-digital-para-protecao-on-line-de-criancas-e-adolescentes-entra-em-vigor,
https://www.demarest.com.br/en/eca-digital-entrada-em-vigor-em-17-de-marco-de-2026/).

**Korean.** Apple's App Store Korea digital goods and services were ₩3.7T ≈ $2.6B in 2025
(https://www.koreajoongangdaily.com/business/apple-app-store-revenue-in-korea-tops-38-trillion-won-in-2025-report-says/12811338);
with official store shares of Play 67.5% / Apple 28.2% / ONE 2.9%
(https://news.mtn.co.kr/news-detail/2026081016565065126) that implies **roughly $8–9B combined, which is my
arithmetic and not a published figure**. **Korea is #2 in the world for paid ChatGPT subscribers, behind only
the US** — OpenAI Chief Strategy Officer Jason Kwon, Seoul, 26 May 2025 **[re-verified, with a caveat: OpenAI
published no absolute numbers, and Korean coverage notes that a subscriber rank is not the same as market
maturity]** (https://www.kedglobal.com/artificial-intelligence/newsView/ked202505260006,
https://www.koreaherald.com/article/10500190). **24.3% of Korean gen-AI users pay, rising to 30.1% among
people in their 20s** — 한국소비자원 2025 소비생활지표 **[re-verified]**
(https://www.sedaily.com/article/20049653). **The PIPC ordered DeepSeek pulled from both Korean app stores at
6pm on 15 February 2025**, over prompt and device data going to ByteDance's Volcano cloud without proper
consent for overseas transfer **[re-verified]**
(https://www.aljazeera.com/news/2025/2/17/south-korea-removes-deepseek-from-app-stores-pending-privacy-review,
https://www.theregister.com/2025/02/18/south_korea_deepseek_ban/). That is our entire thesis, executed by a
regulator, in public. **Naver shut down CLOVA X on 9 April 2026** **[re-verified]**
(https://zdnet.co.kr/view/?no=20260225180559). Costs: Korea is excluded from Google's better June 2026 billing
terms (https://android-developers.googleblog.com/2026/06/play-expanded-billing.html), the AI Basic Act
(22 Jan 2026) needs only a visible AI notice at our size, and **the age rating is a real risk — X was
reclassified 19+ on Korean Google Play after embedding Grok**
(https://www.digitimes.com/news/a20260615PD209/google-play-store-ai-embedded.html).

**Chinese (Traditional) — Taiwan and Hong Kong.** Taiwan is **a top-10 country by mobile IAP revenue in
2025, and one of only two in that top ten whose revenue fell year on year (−3.5%)** — AppMagic Mobile Market
Landscape 2026, Feb 2026. **The specific rank "#8" appeared in an earlier draft and could not be
re-verified against the ranked table; it has been softened here.**
(https://gamedevreports.substack.com/p/appmagic-mobile-market-landscape). **Taiwan is iOS-majority at
60.17% against Android 39.82%, August 2026** **[re-verified exactly]**
(https://gs.statcounter.com/os-market-share/mobile/taiwan). **18% of Taiwanese adults subscribe to at least
one AI service, 27% among 18–30s; about half pay under NT$600/month and over 40% pay NT$601–1,200** —
Mastercard Taiwan, n=1,000 adults 18–65, fielded 1–10 June 2026 **[re-verified]**
(https://focustaiwan.tw/business/202608030017). Hong Kong is the structural anomaly worth having the locale
for: **72.7% of HK professionals use AI daily or weekly against 31% globally**
(https://www.scmp.com/news/hong-kong/hong-kong-economy/article/3363518/72-hong-kong-professionals-use-ai-weekly-double-global-average-survey)
**while ChatGPT and Claude are both geo-blocked there**
(https://digitalinasia.com/which-llms-work-asia-accessibility-tracker/). Regulatory cost is close to zero —
no ICP filing, no AI filing, no licence, and the MIIT regime explicitly excludes Hong Kong, Macau and Taiwan;
Taiwan's AI Basic Act (in force 14 Jan 2026) is a principles framework with no market-entry gate
(https://www.bakermckenzie.com/en/insight/publications/2026/01/taiwan-ai-basic-act). One risk to price in,
specific to Hong Kong: police invoked National Security Law implementation rules to force the game *Reversed
Front: Bonfire* out of both HK stores in June 2025
(https://www.scmp.com/news/hong-kong/law-and-crime/article/3313939/mobile-game-advocating-hong-kong-independence-disappears-apples-app-store),
and an uncensorable offline model is a plausible future target with no server-side fix available to us.

### 4.3 Wave-2 and deferred markets

**Indonesian.** 6.1B downloads in 2025, #4 globally and the fastest-growing of the top markets
(https://www.apptweak.com/en/reports/app-downloads-by-country); #2 in the world for time spent. **131M
gen-AI app downloads (+88.8%) producing $19.1M of IAP (+151.3%)** — Sensor Tower via Databoks, Apr 2026
(https://databoks.katadata.co.id/en/technology-telecommunications/statistics/6982cf73d6e0a/total-downloads-of-ai-applications-in-indonesia-increase-88-by-2025)
— that is $0.146 per AI download against India's ~$0.083. The price anchor is not zero: ChatGPT Go launched
there on 22 Sep 2025 at Rp75,000/month, about $4.50
(https://techcrunch.com/2025/09/22/after-india-openai-launches-its-affordable-chatgpt-go-plan-in-indonesia/).
An Indonesia-only annual spend figure does not exist in the open web; **~$1.2–1.7bn is an unsourced
estimate.** The gate: **Komdigi PSE registration is mandatory for foreign apps and the sanction ladder ends
in access blocking, and it is actively used — Komdigi sent warning letters naming OpenAI/ChatGPT, Cloudflare,
Dropbox, Duolingo and Wikimedia in November 2025** (an earlier draft said "October–November"; the letters
cluster 17–20 Nov) **[re-verified]**
(https://www.cnnindonesia.com/teknologi/20251118131217-185-1296698/belum-daftar-ke-komdigi-akses-chatgpt-dan-duolingo-terancam-diputus).
Upside: Indonesia's Supreme Court rejected Google's final billing appeal on 13 Mar 2026, and VAT is
effectively 11%. Over 97% of Indonesians are fluent in Bahasa Indonesia and EF ranks the country #80/123 for
English, so **one locale covers 97% of a 288M market and English is not a fallback**.

**Chinese (Simplified) — why the mainland storefront is closed, not merely hard.** $22.1B iOS-only consumer
spend in 2025, #2 globally, with Google Play absent and third-party Android stores ~79% of distribution
(https://appinchina.co/blog/the-top-15-app-stores-in-china/). Three stacked blockers. **MIIT app filing
(备案) requires a Chinese business licence or a Chinese national ID, so a foreign entity cannot file
directly** **[re-verified]**
(https://www.nortonrosefulbright.com/en/knowledge/publications/9a7191d2/new-record-filing-requirements-for-internet-application-programs).
**An on-device model still needs a CAC generative-AI filing: on 15 July 2026 the CAC published filings for
seven mobile 手机端侧 generative-AI services — Apple Intelligence, Huawei, OPPO, vivo, Xiaomi, Samsung and
Nubia** (an earlier draft wrote "ZTE"; the filing names Nubia, a ZTE-affiliated brand) **[re-verified at
cac.gov.cn]** (https://www.cac.gov.cn/2026-07/15/c_1785861480767004.htm). Apple's own filing was made by a
Shanghai subsidiary and took about 22 months
(https://www.techtimes.com/articles/320811/20260717/apple-intelligence-wins-china-approval-after-22-months-qwen-handles-language-baidu-handles-search.htm).
Third, the Interim Measures require adherence to core socialist values, and an offline binary cannot be
server-filtered, patched or audited — the property that makes Inborn valuable is the property that makes it
unfilable. Commercially it would not repay the effort anyway: only 9.8% of Chinese AI users have ever paid
(https://www.woshipm.com/ai/6398494.html), and Doubao lost 6.1M MAU in the month it introduced paid tiers
(https://finance.sina.com.cn/wm/2026-06-05/doc-iniaiyyn2810084.shtml).

**Arabic (Gulf).** GCC IAP was $700M in Q2 2025, +20% YoY
(https://sensortower.com/blog/middle-east-app-growth-report); Q1'24→Q1'26 GCC IAP rose 41%, UAE 46%, Saudi
43% (https://www.bidease.com/blog/inside-the-2026-middle-east-app-growth-report). **ChatGPT is the #3
top-grossing app in the entire Middle East** and AI-driven Software-category IAP grew 77% YoY (same Sensor
Tower/Bidease report). **The UAE leads the world in AI adoption at 59.4% of the working-age population**
(https://www.middleeastainews.com/p/ae-leads-world-in-ai-adoption-rates); Saudi AI-tool adoption more than
doubled to 45.2% (https://www.cst.gov.sa/en/media-center/news/N2026071901). Saudi is 51.96% iOS
(https://gs.statcounter.com/os-market-share/mobile/saudi-arabia). Two expected blockers turn out not to
apply: **Saudi's GAMR/Gmedia classification regime is written for video games, and since Gmedia joined IARC
the Saudi rating is generated automatically from the Play Console questionnaire**
(https://globalratings.com/milestones/); CST's Digital Content Platform Regulations cover pay-TV, OTT and
social platforms, not a utility app
(https://www.cst.gov.sa/en/media-center/news/CST-Publishes-the-Regulations-for-Providing-Digital-Content-Platform-Services-Document);
and UAE Cabinet Resolution 68/2024 carves out "the online provision of software"
(https://uaelegislation.gov.ae/en/legislations/2145). What holds Arabic to wave 2 is engineering and content,
not markets: full RTL, a **tokenizer tax of roughly 2.4 tokens per Arabic word against 1.5–1.6 for English —
about 3× the compute and KV-cache per word** (https://huggingface.co/blog/omarkamali/tokenization,
https://arxiv.org/pdf/2412.12310), and a moderation layer, because an unfiltered local model discussing the
ruling family or apostasy is a genuine removal risk.

**Russian — the deferral is a payments fact, not a judgement.** **Apple stopped all payment processing in
Russia on 1 April 2026, including App Store purchases, in-app purchases and subscription renewals**
**[re-verified at Apple's own support document]** (https://support.apple.com/en-us/126891). **Google Play
billing has been suspended in Russia since 10 March 2022 and the Play Console help page still describes that
as current** **[re-verified live]** (https://support.google.com/googleplay/android-developer/answer/11950272).
Stripe and Paddle are both sanctioned-blocked, so direct desktop sales are closed too. This is painful
precisely because the demand and the narrative are the best anywhere: 78% of Russian internet users used a
neural network in the past year (VTsIOM, n=3,209, Jun 2026,
https://ria.ru/20260730/vtsiom-2107884025.html), VPN penetration is 37.6%, second in the world
(https://www.themoscowtimes.com/2026/04/03/as-kremlin-cuts-off-the-internet-vpns-become-a-way-of-life-a92370),
mobile internet shutdowns have hit 83 regions
(https://en.zona.media/article/2026/04/07/russian_internet_censorship_2026), and ChatGPT has been TLS-blocked
in 27+ regions since 6 Sep 2026. But **only 10% of Russians say they would pay for AI, and 62% want it free
and ad-supported** (OMI, n=2,300+, Mar 2026,
https://hi-tech.mail.ru/news/147070-analitiki-nazvali-samye-populyarnye-nejroseti-v-rossii/), against a free
state-backed incumbent in Yandex Alisa at 33.2M WAU. Revisit as a diaspora locale monetised through
Kazakhstan, Germany, Israel and the US.

**Hindi — why English is the right ship to India.** **25.5B downloads in 2025, #1 globally, against just over
$1.0B of consumer spend: $0.03 revenue per download, against $4.60 in the US, $6.10 in Japan and $3.90 in
Korea** (https://techcrunch.com/2026/04/22/indias-app-market-is-booming-but-global-platforms-are-capturing-most-of-the-gains/,
https://techcrunch.com/2026/07/31/india-is-starting-to-pay-for-apps-not-just-download-them/). India is ~20%
of global gen-AI downloads and ~1% of gen-AI IAP
(https://techcrunch.com/2026/02/24/india-ai-boom-pushes-firms-to-trade-near-term-revenue-for-users/). The
consumer price of AI there has been set to zero by three separate actors: ChatGPT Go free for 12 months from
4 Nov 2025, Google AI Pro free for 18 months through Jio, and Perplexity Pro free for 12 months to all 360M
Airtel customers (https://www.airtel.in/press-release/07-2025/airtel-partners-with-perplexity-powers-every-single-of-its-360mn-customers-with-perplexity-pro/).
**Perplexity's 56M free Indian users converted to a run-rate of about $1.9M a year**
(https://techcrunch.com/2026/08/18/perplexitys-free-ai-offer-left-it-with-millions-more-users-in-india/).
Privacy cuts against us too: 92% of Indian respondents agree a global provider protects their data better
than a local one (Cisco 2025 Data Privacy Benchmark). And the hardware is moving backwards — memory-price
inflation is pushing $150–200 phones from 8GB/256GB down to 6GB/128GB
(https://www.business-standard.com/technology/tech-news/why-smartphone-price-inflation-hitting-india-hardest-126090900672_1.html).
The decisive asymmetry is linguistic: the Hindi-speaking majority is the non-paying cohort, and the paying
cohort — urban metro, iPhone — reads English.

**Turkish, Polish, Dutch, Italian — the short version.** Turkey: $1.0bn in 2024 at $14.6 per smartphone user,
the world's arbitrage bargain-bin storefront with no Apple Pay, Google Pay or PayPal, and TurkStat puts
generative-AI use at only 19.2% with 63.3% of non-users saying they simply see no need
(https://www.businessofapps.com/data/turkey-app-market/,
https://turkishminute.com/2025/10/01/one-in-five-people-in-turkey-now-use-ai-official-data-show/).
Poland: 23% GenAI usage against the EU's 32.7%, and **Poles report the highest trust of any market measured
that AI companies will protect their data, at 60% against a 48% global average** (Ipsos AI Monitor 2025) —
the wrong audience for this pitch. Netherlands: 45% GenAI usage, the highest in Europe, and 91.2% of Dutch
internet users took active steps to protect their data, second-highest in the EU
(https://ec.europa.eu/eurostat/en/web/products-eurostat-news/w/ddn-20260128-1) — but only 35% would pay a
premium for AI transparency, the lowest measured, and **the Netherlands ranks #1 in the world on the EF
English Proficiency Index 2025**, so the English build already serves them
(https://www.ef.edu/about-us/press/articles/2025/ef-english-proficiency-index-2025-launched/). Italy: **19.9%
GenAI usage, the EU's lowest bar Romania** (Eurostat 2025,
https://www.infodata.ilsole24ore.com/2026/04/26/solo-il-199-degli-italiani-utilizza-lintelligenza-artificiale-contro-una-media-europea-del-327/),
and 42% would pay a premium, at 5%.

**Hebrew (Israel).** **No public Israel-specific app-spend figure exists** — Sensor Tower, Statista, Business
of Apps and AppTweak were all searched and AppTweak has no Israel row. Any number here would be invented.
What is measured: 8.72M internet users at 91.3% penetration
(https://datareportal.com/reports/digital-2026-israel), iOS at 33.42%
(https://gs.statcounter.com/os-market-share/mobile/israel), and **ChatGPT usage reaching 88% of the Israeli
public in 2026, higher than Instagram, with Gemini jumping from 49% to 73%** — Israel Internet Association /
Geocartography, fielded May 2026 (https://www.calcalistech.com/ctechnews/article/rkqhuhexfl). **Israel ranks
#1 in the world for AI adoption per capita**
(https://www.morningstar.com/news/pr-newswire/20260422ny39743/israel-ranks-1-in-the-world-for-ai-adoption-per-capita-95-of-israeli-tech-workers-now-use-ai-daily-joint-5wpr-louder-study-finds).
Amendment 13 to the Privacy Protection Law came into force 14 Aug 2025 and there is no AI act, making Israel
the **easiest market to ship into in this entire study**. None of that changes the recommendation, because
the blocker is the model, not the market — see §6.

## 5. Disagreements with catalog v2

To be corrected in a follow-up round. **This document does not edit the catalog.** Reference:
`packages/core/src/catalog/manifest.json` (v2, 15.9.2026) and `docs/models/model-fit.md`.

### 5.1 Tiers that are wrong

Columns are model / language / catalog tier / observed tier / evidence. "Evidence" names the score and the
specific failure; the full reply for every row is the JSON file named in the last column, under
`<scratch>/launch-languages/runs/`.

| Model | Language | Catalog tier | Observed tier | Evidence | File |
|---|---|---|---|---|---|
| Instant | `de` | `good` | **`none`–`basic`** | 1/1/1. *"Gut Schlaf ist das fundamentale Bindeglied"*; the non-word *Gedächtnislebens*; asserts adults need "mindestens vier Stunden Schlaf pro Tag". Wrong by two tiers. | `instant/de-*.json` |
| Instant | `fr` | `good` | **`basic`** | 2/1.5/2. *empatie* misspelled; one list item is off-prompt ("Réduction de la stigmatisation"); the paragraph ends "envers la planète". | `instant/fr-*.json` |
| Instant | `es` | `good` | **`basic`** | 2/2/2. *"Cuando se duermen adecuadamente"* (agreement); a circular clause about "la calidad del sueño que se disfruta durante el día". | `instant/es-*.json` |
| Instant | `pt` | `good` | **prose `good`, translate `none`** | 2.5/2.5/1. Prose is fine; the translation invented *"à segunda-feira às 12:00"* — Monday at noon — and opened *"Por dois da equipe"*. | `instant/pt-BR-*.json` |
| Instant | `zh` | `native` | **`good`** | 2/2.5/2.5. Best language on Instant by a distance, but *"修復身體修復功能"* repeats a verb and the paragraph is far short of length. `native` overstates a 0.8B at Q4. | `instant/zh-Hant-*.json` |
| Instant | `ja` | `basic` | `basic` (agree) | 1/2.5/1. The paragraph repeated the same two sentences verbatim three times. | `instant/ja-*.json` |
| Instant | `ko` | `basic` | **`none` for translate** | 1/2/0. The paragraph announced a 100-word paragraph then produced a ten-item list; the translation inverted the request, asking the reader to confirm the new time is *not* suitable. | `instant/ko-*.json` |
| **Fast** | **`de`** | **`good`** | **`basic`** | **1.5/2/2.5, and the decisive correction.** Three independent samples all opened *"Gutem Schlaf ist …"* (must be *Guter Schlaf*); two added a gender error on the next noun (*ein unverzichtbarer Säule*, *das Körperregieren*). Systematic, not an unlucky draw. | `fast/de-paragraph.json`, `fast-resample2/de-paragraph.json`, `fast-resample3/de-paragraph.json` |
| Fast | `ko` | `good` | **`basic`** | 2/2.5/1. The translation invented *일요일* (Sunday), then appended an English meta-note "correcting" itself to a second wrong day. | `fast/ko-translate.json` |
| Fast | `he` | `basic` | **`none`** | 1/1/0. *"בקפידה, תתבייש ליצור לוואיט"* is not Hebrew. Instant already carries `none` for `he`; Fast earns it too. | `fast/he-*.json` |
| Fast | `ar` | `good`, flagged least-certain #2 | **`good`, and the doubt is backwards** | 2/2/3. *"تم نقل اجتماعنا إلى صباح يوم الخميس بسبب سفر اثنين من المديرين"* — the best translation of all 18 languages on Fast. `model-fit.md` calls this the second-least-certain judgement, leaning toward `basic`; it should lean the other way. | `fast/ar-*.json` |
| Fast | `ja` | `good` | `good` (agree, with a note) | 3/3/1.5. Prose is native-quality; the translation left the English word "morning" inside a Japanese sentence (*木曜 morning*). | `fast/ja-*.json` |
| Sharp | `ja` | `good` | **`native`** | 3/3/3. Correct keigo throughout; *"木曜日の朝に延期されました"*. | `sharp/ja-*.json` |
| Sharp | `ko` | `good` | **`native`** | 3/3/3. *"목요일 오전으로 변경되었습니다"*, natural honorifics. | `sharp/ko-*.json` |
| Sharp | `ru` | `good` | **`native`** | 3/3/3. *"двое менеджеров в командировке"* is a better rendering of "are traveling" than the literal one. | `sharp/ru-*.json` |
| Sharp | `he` | `basic` (downgraded 15.9) | **`none`–`basic`; the downgrade was right** | 1/1/1, worse than the 15.9 spot check. Arabic script bled into a Hebrew word (*המهارה*); *הפגישה* became *הפגינה*; "Thursday" became *לשבועות*, the festival of Shavuot. | `sharp/he-*.json` |
| Sharp | `ar` | `good` | `good` (agree) | 2.5/2.5/2.5, right at the bar. *"الأنسجة المهدرة"* is odd and one sentence loses its subject. | `sharp/ar-*.json` |

**Languages with no catalog entry at all**, measured here so a follow-up round can add them. These are the
rows that cause the bug in §5.2, because "absent" currently resolves to `none`.

| Model | Language | Catalog tier | Observed tier | Evidence | File |
|---|---|---|---|---|---|
| Sharp | `id` | **absent** | **`good`** | 3/3/2.5 — as good as any European language, and the largest single miss in the catalog. | `sharp/id-*.json` |
| Fast | `id` | **absent** | **`good`** | 2.5/3/1.5. Prose is natural; the translation drops the subject (*"Diberangkatkan ke pagi hari Kamis"*). | `fast/id-*.json` |
| Sharp | `tr` | **absent** | **`good`** | 2.5/2.5/2. The translation renders "managers" as *yönetmen*, film directors. | `sharp/tr-*.json` |
| Sharp | `pl` | **absent** | **`basic`** | 2/2/2. *Wzroszenie* and *motywatyzację* are non-words; the translation opens with the nonsensical connector *"Zarówno spotkanie przeniesiono"*. | `sharp/pl-*.json` |
| Sharp | `hi` | **absent** | **`basic`** | 2/2.5/1. Good prose, but "meeting" became the non-word *मंथिल* and Thursday became Saturday. | `sharp/hi-*.json` |
| Fast | `hi` | **absent** | **`none`** | 1/1/1. The paragraph's second word mixes Chinese characters and a Korean particle (*नींद人体의*); the list contains *मindspace* and *कognition*. | `fast/hi-*.json` |
| Sharp | `nl` | **absent** | **`basic`** | 2/1.5/3. *slaappartner* ("sleep partner") where it means sleep; a list item claims language learning "helps the brain get older"; three misspellings. | `sharp/nl-*.json` |
| Fast | `nl` | **absent** | **`none`** | 1/1/2.5. *"wordt de hersenen volledig ontbonden"* — "the brain is completely decomposed" — plus the non-words *immuunsystematie* and *slaapkrijze*. | `fast/nl-*.json` |
| Fast / Sharp | `zh-Hant` | **not representable** | **`native`** | Fast 3/2.5/3, Sharp 3/3/3, indistinguishable from Simplified in our tests. See §5.2 item 2. | `*/zh-Hant-*.json` |

### 5.2 Structural gaps, which are user-visible bugs

These are worse than a wrong tier, because the code turns a *missing* language into a *negative* claim.

1. **`languageTierOf` returns `"none"` for any unrated code.** In `packages/core/src/catalog/fit.ts` the
   lookup is `model.fit.languages[code] ?? "none"`. `detectLanguage` can return `hi`, `tr`, `pl`, `id` and
   `vi`, none of which exists in any model's fit block. The consequence: an Indonesian user — whose language
   scored **3/3/2.5 on Sharp**, as good as French — is told by the chat card and the vault tag that
   *nothing on this phone is good at chat in Indonesian*. The same applies to Turkish and Polish, where it is
   closer to true but still unmeasured. Unrated must mean *unknown* (never recommended for, never recommended
   against), exactly as the code already does for imported models, not *none*.
2. **Traditional Chinese cannot be expressed at all.** `validateFit` enforces `/^[a-z]{2}$/` on language keys
   and `detectLanguage` returns `zh` for both scripts, so a launch language in §1.1 has no representable tier.
   Our measurements are identical for both scripts on Sharp, so one `zh` tier is currently adequate — but the
   store listing, the locale and the recommendation copy all need to distinguish them.
3. **Dutch is in neither list** — no fit entry and no stopword set in `detectLanguage` — so Dutch detects as
   `null` and simply never ranks. That is silent rather than wrong, and given the measurements it is the
   right outcome by accident.
4. **`FIT_LANGUAGES` (11 required codes) does not include `it`, `id`, `tr`, `pl`, `hi` or `nl`.** Italian is
   rated anyway; the rest are not rated at all. The required list should become the launch set plus the
   second wave.

---

## 6. Hebrew

### 6.1 What it scored

| Model | Paragraph | List | Translation |
|---|---|---|---|
| Fast (Qwen3.5-2B) | 1 | 1 | **0** |
| Sharp (Qwen3.5-4B) | 1 | 1 | 1 |

Hebrew was the worst language of the eighteen, on both models, on all three prompts. Concretely:

- **Sharp, paragraph:** *"שני אנשים שנהנים משינה איכותית הם פחות מסוכנים, פחות אכזריים"* — "two people who enjoy
  quality sleep are less dangerous, less cruel". Also the non-word *שרפדים* and the tautology *רעלים רעילים*.
- **Sharp, list:** the Arabic word مهارة bled into a Hebrew word, producing *המهارה*; plus the non-words
  *התמקדנות* and *והתחלוצה*, and one item repeating *הלמידה, הלמידה*.
- **Sharp, translation:** *הפגישה* (the meeting) became *הפגינה* (the demonstration), and "Thursday" became
  *לשבועות* — the festival of Shavuot.
- **Fast, translation:** *"בקפידה, תתבייש ליצור לוואיט"* — not Hebrew.

This run is **worse** than the 15.9.2026 Sharp spot check recorded in `docs/models/model-fit.md`, which found
Sharp "readable, not fluent" with three of five list items acceptable. Both runs agree on the conclusion. The
difference is most likely that this run used a fresh chat with no prior English context.

### 6.2 What a dedicated Hebrew model would need, and which ones exist

The answer changed in December 2025: **DictaLM 3.0 shipped, and it includes a 1.7B model.** That makes a
phone-sized Hebrew-native option real for the first time.

| Candidate | HF repo | Params | License | GGUF Q4_K_M | Phone feasible? |
|---|---|---|---|---|---|
| **DictaLM-3.0-1.7B-Instruct** ⭐ | `dicta-il/DictaLM-3.0-1.7B-Instruct` | 1.72B, Qwen3-1.7B base | **Apache-2.0, unconditional** — no MAU cap, no attribution duty, no use policy | **1.11 GB**, file size read directly from `Ibrerhim/DictaLM-3.0-1.7B-Instruct-GGUF` | **Yes on a 6 GB phone, comfortably.** ~1.5–1.8 GB resident with KV cache — *smaller than Fast* (1.28 GB), so it clears the catalog's 6 GB `minRamGB` floor with room to spare and would ship as a `fast`-tier cartridge, not a Pro one. |
| DictaLM-3.0-1.7B-Thinking | `dicta-il/DictaLM-3.0-1.7B-Thinking` | 1.72B | Apache-2.0 | 1.11 GB, **first-party GGUF (`dicta-il/DictaLM-3.0-1.7B-Thinking-GGUF`) carrying `imatrix_dict.gguf_file`** | Yes on 6 GB, but the `<think>` block costs seconds per answer at the 2–4 tok/s a phone delivers — wrong shape for chat. Its value to us is the imatrix file, reusable when quantising the Instruct variant. |
| DictaLM 2.0 Instruct | `dicta-il/dictalm2.0-instruct` | 7B, Mistral | Apache-2.0 | 4.37 GB | **No on 6 GB.** 4.37 GB of weights plus KV leaves nothing for the OS; it would need an 8 GB floor, and it is *worse* at Hebrew than the 1.7B v3 anyway. Spec §7.8 names DictaLM 2.0; that reference is out of date. |
| Hebrew-Mistral-7B | `yam-peleg/Hebrew-Mistral-7B` | 7B | Apache-2.0 | ~4.4 GB | **No on 6 GB**, same arithmetic as DictaLM 2.0, and 2024 vintage. |
| HEBATRON | `HebArabNlpProject/Hebatron` | 31.6B total / ~3B active (Mamba2 MoE) | Card says `apache-2.0`. ⚠️ The arXiv listing (2605.11255) shows CC BY-NC-ND 4.0 — **on checking, that is arXiv's own distribution licence for the paper, not a stated licence for the weights, and the paper body names no weights licence.** Less of a contradiction than it first looks, but unresolved. | none published | **No.** All 31.6B parameters must be resident regardless of the ~3B active, so 6 GB is not close. |
| aya-expanse-8b | `CohereLabs/aya-expanse-8b` | 8B | **`cc-by-nc-4.0` plus a mandatory acceptable-use policy — unusable in a paid app** | ~4.9 GB | No, on licence before size. |

**Why the 1.7B and not something larger** (Dicta-LM 3.0 technical report, arXiv 2602.02104, 2 Feb 2026, Table 8):

| Task | DictaLM-3.0-1.7B-Instruct | Gemma-3-1b-it | Qwen3-1.7B |
|---|---|---|---|
| Nikud / diacritization (acc %) | **52.76** | 3.44 | 2.93 |
| Winogrande-HE (acc %) | **58.2** | 47.84 | 51.08 |
| Israeli trivia (acc %) | **30.21** | 26.58 | 21.59 |
| Summarization (win-rate vs Gemini-2.5-Pro) | **9.72** | 0.35 | 0.4 |
| Translation (win-rate) | **2.16** | 0.15 | 0.0 |

Eighteen times better than the same-size Qwen at diacritization, in a 1.11 GB file, under a licence with no
strings. As a ceiling check, `DictaLM-3.0-24B-Thinking` scores 86.87 on Nikud against Gemini-2.5-Pro's 87.15.

Caveat worth knowing before anyone quotes the leaderboard: the Hebrew Chat Leaderboard v2 contains no sub-10B
models, so the only head-to-head available for the 1.7B is Dicta's own table.

### 6.3 How I would verify it, and when

**Verification — the same rig as this document, so the numbers are comparable.** Convert the Apache-2.0
safetensors ourselves with `convert_hf_to_gguf.py` + `llama-quantize` rather than trusting a community
quantisation, using Dicta's published imatrix (shipped in the Thinking-GGUF repo; imatrix quantisation matters
at 1.7B). Then run exactly the three prompts in §2 on the Pixel_6_API_33 emulator through the vault's HTTPS
path, score them 0–3 the same way, and compare against the Sharp Hebrew numbers in §6.1 and the 15.9 spot
check. The bar for entering the catalog is **≥2.5 on all three** — the same bar Sharp has to clear for a
launch language. Add a fourth prompt for nikud, since that is where the model's advantage is largest and where
a Hebrew user will notice first.

**Timing: not the first launch. The quarter after.** The reasoning is not that Hebrew is unimportant — Israel
has the highest AI adoption per capita in the world, 88% of the public uses ChatGPT, and it is the easiest
market to ship into in this entire study, with no store friction and no AI act. The reasoning is that Hebrew
needs a *different model in the catalog*, which means a new delivery pack, a fit-map entry, RTL work, a new
locale and store copy — while the eight launch languages need at most two new locales and reach a market
several hundred times larger. Doing Hebrew first would delay everything else for ~6.6M native speakers on a
33% iOS base.

One pairing worth noting for later: DictaLM-1.7B (1.11 GB) for Hebrew alongside Qwen3.5-2B (1.28 GB) for
everything else is 2.4 GB total — still inside the budget of an 8 GB phone.

---

## 7. Work items this implies

**Catalog (do before German ships).**

1. Correct the tiers in §5.1, most importantly `Fast · de: good → basic`, which is what makes the app steer
   German users to Sharp instead of quietly serving them broken prose. Re-sign with `scripts/sign-catalog.mjs`.
2. Add fit entries for `id`, `tr`, `pl`, `hi` and `nl` using the measurements in §3.1, and extend
   `FIT_LANGUAGES` to the launch set plus the second wave.
3. Update `docs/models/model-fit.md`: its per-language rows currently cite model cards for judgements this
   document measured on a device.

**Code.**

4. **Fix `languageTierOf` so an unrated language means "unknown", not "none"** (`packages/core/src/catalog/fit.ts`).
   Today the app tells an Indonesian user that nothing on the phone is good at Indonesian, for a language that
   scores 3/3/2.5. Until the fit entries in item 2 land, this is the single most visible defect in the study.
5. Decide how `zh-Hant` is represented. `validateFit` enforces two-letter codes and `detectLanguage` collapses
   both scripts to `zh`. Our measurements justify one shared model tier; the UI locale, the store listing and
   the recommendation copy still need to separate them.
6. Define the **"recommended for your language" behaviour when the UI language is outside the launch set.**
   The honest rule, given §3.1: if the detected language has a tier, use it; if it does not, say the app has
   not measured it rather than implying the models are bad at it; and never show the weak-language caption for
   a language we have no evidence about.

**Localisation.**

7. Two new locales at 1,000 keys each: **ko** and **zh-Hant** (`packages/i18n/locales`, plus `Locale` and
   `LAUNCH_LOCALES` in `packages/i18n/src/index.ts`).
8. Two new store listings: `docs/store/listing.ko.json` and `listing.zh-Hant.json`, native adaptations rather
   than translations, passing `docs/store/scripts/check-store-copy.mjs`.
9. Legal texts (privacy policy, terms) in ko and zh-Hant. Note separately that **Poland would require
   Polish-language consumer contract documents** if it is ever added, which is part of why it is deferred.

**Compliance, per market.**

10. **EU AI Act Article 50 applies from 2 Aug 2026 with no grace period for a new app**: disclose AI at first
    interaction and mark generated output machine-readably. Shipping open weights inside the app very likely
    makes us the provider — the one question here worth a lawyer.
11. **California SB 243** (in force 1 Jan 2026) creates a $1,000-per-violation private right of action for
    companion chatbots and applies to an offline app too. It is the largest legal exposure in the English slice.
12. **Korea's AI Basic Act** (22 Jan 2026): a visible "AI가 생성한 콘텐츠입니다" notice is cheap and sufficient at
    our size. Separately, **get the age rating right**: X was reclassified 19+ on Korean Google Play after
    embedding Grok, and an unfiltered model plausibly draws the same treatment.
13. **Indonesia: Komdigi PSE registration before any Indonesian launch.** This is the highest-probability
    "the app disappears overnight" risk in the study.
14. **Brazil:** price a one-time BRL unlock, not a USD subscription — ~25% withholding plus 3.5% IOF on
    foreign developer proceeds — and note that ECA Digital (in force 17 Mar 2026) requires a Brazilian legal
    representative and bans self-declared age.
15. **Explicitly deselect mainland China** in App Store Connect when Simplified Chinese ships, so the
    tolerated-but-non-compliant grey path is never taken by accident.

---

## 8. Claims that circulate and are false

Flagged because they came up repeatedly while researching and would embarrass us in a deck.

1. *"Italy fined OpenAI €15m."* Annulled by the Court of Rome on 18 March 2026 on jurisdictional grounds.
2. *"The AEPD opened 147 AI proceedings."* The AEPD never published that figure.
3. *"Turkey is a top-5 ChatGPT country."* Turkey is #1 in *share of national AI traffic going to ChatGPT*
   (94.49%), not in absolute users; only 19.2% of Turks used generative AI in 2025.
4. Any UAE country market-size figure sourced from this round — the underlying page refused the fetch and the
   search snippet duplicated Saudi Arabia's number. Do not quote one.

And four this document got wrong in draft and corrected on re-verification, listed so nobody reintroduces them
from an earlier copy:

5. *"Taiwan is #8 globally by IAP revenue."* Taiwan is a **top-10** IAP market and one of only two in that top
   ten to decline year on year (−3.5%); the specific rank could not be verified against the ranked table.
6. *"Brazil is $11.6 per smartphone user per year."* Not verifiable — the source is gated and no independent
   citation exists. Brazil's per-user spend is low but **unquantified** in this document.
7. *"The CAC's seven on-device AI filings include ZTE."* The filing names **Nubia**, a ZTE-affiliated brand,
   not ZTE itself.
8. *"Komdigi warned OpenAI and others in October–November 2025."* The warning letters cluster in
   **November 2025** (17–20 Nov); there was no October wave.

## 9. Honest data gaps

- **Taiwan and Hong Kong total consumer app spend** is paywalled at every vendor, and Taiwan's exact rank
  within the global top ten could not be read from the AppMagic table. If Traditional Chinese needs a revenue
  model rather than a ranking, buy a one-off Sensor Tower or Appfigures country pull.
- **Brazil's per-smartphone-user spend** could not be re-verified; the widely-repeated $11.6 figure sits
  behind a gate. The $1.7bn national total is sound.
- **Germany's $4.9bn / $71.5 per user** are read through an aggregator, not a primary Sensor Tower document.
  They are almost certainly right; they are not a primary read.
- **Japan's iOS share** is a band (61–69% across months and methods), not the single 67% figure often quoted.
  Only the fact that Japan is decisively iOS-majority is load-bearing here.
- **Korea's "#2 in paid ChatGPT subscribers"** comes from an OpenAI executive's public statement with no
  absolute numbers attached, and Korean coverage notes a subscriber rank is not market maturity. It is the
  best evidence available and it is not an audited figure.
- **Indonesia's national app spend** has no public figure; the ~$1.2–1.7bn in §4.3 is an unsourced estimate.
- **No public Israel-specific app-spend figure exists.** Israel's market size in §6 is an order of magnitude,
  not a number.
- **No Israel-specific paid-AI conversion data exists.** The 88% ChatGPT figure is usage, not spend.
- **There is no public demand data anywhere for offline or on-device AI chat apps, in any market.** That is
  genuinely unmeasured and no report will supply it. Every market judgement here is about *adjacent* demand:
  who pays for AI, and who distrusts the cloud.
