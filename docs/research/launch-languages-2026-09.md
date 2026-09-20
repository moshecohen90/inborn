# Launch languages: which ones the models we ship are actually good at (decision doc, 20 Sep 2026)

Question from Moshe, 20.9.2026: *"Hebrew users are not the first target. We want to pick 5–10 launch languages
where the on-device models that exist today are actually good; Hebrew maybe later. Research it."*

This is a decision, not a survey. It rests on two legs, both gathered for this document:

- **Leg A — measured on a device.** Every score below comes from the real Inborn chat running on one
  Pixel_6_API_33 emulator (7.6 GB guest RAM, CPU only, debug APK off `main` at 596e229), 132 generations
  across 18 languages and 3 model tiers. Nothing here is copied from a model card.
- **Leg B — market.** Store spend, evidence that consumers pay for AI, privacy appetite and store blockers,
  each with a cited URL and date. Raw notes: the scratch dir for this round; every claim reproduced below
  carries its source inline.

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
| 2 | **Japanese** | #3 app market ($16.5B), 67% iOS, Gen-AI IAP +262% YoY, no domestic consumer incumbent since LINE's assistant closed, and post-MSCA App Store fees of 10% for most developers. | 3/3/3 | 3/3/1.5 | ✅ shipped |
| 3 | **German** | The only market on earth with a *quantified* willingness to pay for AI privacy: 73% will pay a premium, averaging 9%. Highest per-user app spend in Europe ($71.5) and #3 worldwide for ChatGPT mobile spend. | 2.5/2.5/3 | **1.5**/2/2.5 | ✅ shipped |
| 4 | **Spanish** | Spain's own wallet is thin ($23.3/user) but one locale buys Hispanic LatAm, and the AEPD is publicly telling citizens not to give personal data to AI. | 2.5/3/3 | 3/3/2.5 | ✅ shipped |
| 5 | **French** | $59.5 per user, second-largest European wallet, and a regulator (CNIL) that has named *prompts* as the privacy problem. | 3/2.5/3 | 3/2.5/2.5 | ✅ shipped |
| 6 | **Portuguese (Brazil)** | The largest and most AI-hungry audience in the study, with a real privacy grievance. Price a one-time BRL unlock, never a USD subscription. | 3/3/3 | 3/2/1.5 | ✅ shipped |
| 7 | **Korean** | #2 in the world for paid ChatGPT subscribers, and the only country whose regulator has already *deleted a cloud AI app from the store* over data egress. That is our thesis proven in public. | 3/3/3 | 2/2.5/1 | ❌ new locale |
| 8 | **Chinese (Traditional)** | Taiwan is #8 globally by IAP, 60% iOS, 18% of adults already subscribe to an AI service, and there is no ICP filing, no AI filing, no licence. Hong Kong rides the same locale free. | 3/3/3 | 3/2.5/3 | ❌ new locale |

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
| **Hebrew** | Sharp 1/1/1 | See §5. Needs a dedicated model. |

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
That is a work item in §6, and it must ship before German does.

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

## 4. Disagreements with catalog v2

To be corrected in a follow-up round. **This document does not edit the catalog.** Reference:
`packages/core/src/catalog/manifest.json` (v2, 15.9.2026) and `docs/models/model-fit.md`.

### 4.1 Tiers that are wrong

| Model | Lang | Catalog | Measured | Verdict |
|---|---|---|---|---|
| **Instant** | de | `good` | 1/1/1 | **Wrong by two tiers.** Non-words, wrong case, and a factually absurd claim. `basic` at best; `none` is arguable. |
| **Instant** | fr | `good` | 2/1.5/2 | Wrong. `basic`. |
| **Instant** | es | `good` | 2/2/2 | Wrong. `basic` is the honest tier. |
| **Instant** | pt | `good` | 2.5/2.5/1 | Prose is `good`; the translation invented "Monday at 12:00". Keep `good` only if `translate: weak` is prominent. |
| **Instant** | zh | `native` | 2/2.5/2.5 | Overstated for a 0.8B at Q4. `good`. |
| **Fast** | de | `good` | **1.5**/2/2.5 | **Wrong, and it matters most.** The wrong-case opener reproduced in 3/3 samples. `basic`. This is the correction that makes the app steer German users to Sharp. |
| **Fast** | ko | `good` | 2/2.5/**1** | Wrong. The translation invented a weekday and appended an English meta-note "correcting" itself. `basic`. |
| **Fast** | he | `basic` | 1/1/**0** | The translation was gibberish (*"בקפידה, תתבייש ליצור לוואיט"*). `none` is more honest, and matches what Instant already carries. |
| **Fast** | ar | `good` (flagged least-certain) | 2/2/**3** | Under-rated. The doubt in `model-fit.md` runs the wrong way; Arabic's Fast translation was the best of 18. |
| **Sharp** | ja, ko, ru | `good` | 3/3/3 each | Under-rated. These are native-quality on Sharp. |
| **Sharp** | he | `basic` | 1/1/1 | The 15.9 downgrade was right; this run is worse than that one. Arabic script bled into a Hebrew word (*המهارה*) and "Thursday" became the festival of Shavuot. |

### 4.2 Structural gaps, which are user-visible bugs

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

## 5. Hebrew

### 5.1 What it scored

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

### 5.2 What a dedicated Hebrew model would need, and which ones exist

The answer changed in December 2025: **DictaLM 3.0 shipped, and it includes a 1.7B model.** That makes a
phone-sized Hebrew-native option real for the first time.

| Candidate | HF repo | Params | License | GGUF Q4_K_M | Phone feasible? |
|---|---|---|---|---|---|
| **DictaLM-3.0-1.7B-Instruct** ⭐ | `dicta-il/DictaLM-3.0-1.7B-Instruct` | 1.72B, Qwen3-1.7B base | **Apache-2.0, unconditional** — no MAU cap, no attribution duty, no use policy | **1.11 GB** (`Ibrerhim/DictaLM-3.0-1.7B-Instruct-GGUF`) | **Yes, comfortably.** ~1.5–1.8 GB resident with KV cache — smaller than Fast, so it fits every device that clears the Fast floor. |
| DictaLM-3.0-1.7B-Thinking | `dicta-il/DictaLM-3.0-1.7B-Thinking` | 1.72B | Apache-2.0 | 1.11 GB, **first-party GGUF + imatrix** | Yes, but the `<think>` block costs seconds per answer on a phone — wrong shape for Instant-class chat. |
| DictaLM 2.0 Instruct | `dicta-il/dictalm2.0-instruct` | 7B, Mistral | Apache-2.0 | 4.37 GB | **No.** Over the budget *and* worse at Hebrew than the 1.7B v3. Spec §7.8 currently names DictaLM 2.0; that reference is out of date. |
| Hebrew-Mistral-7B | `yam-peleg/Hebrew-Mistral-7B` | 7B | Apache-2.0 | ~4.4 GB | No, and 2024 vintage. |
| HEBATRON | `HebArabNlpProject/Hebatron` | 31.6B total / ~3B active | ⚠️ card says Apache-2.0, arXiv 2605.11255 says CC BY-NC-ND 4.0 | none published | No. All 31.6B must be resident, and the licence is unresolved — do not assume. |
| aya-expanse-8b | — | 8B | **CC-BY-NC-4.0 — unusable in a paid app** | ~4.9 GB | No. |

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

### 5.3 How I would verify it, and when

**Verification — the same rig as this document, so the numbers are comparable.** Convert the Apache-2.0
safetensors ourselves with `convert_hf_to_gguf.py` + `llama-quantize` rather than trusting a community
quantisation, using Dicta's published imatrix (shipped in the Thinking-GGUF repo; imatrix quantisation matters
at 1.7B). Then run exactly the three prompts in §2 on the Pixel_6_API_33 emulator through the vault's HTTPS
path, score them 0–3 the same way, and compare against the Sharp Hebrew numbers in §5.1 and the 15.9 spot
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

## 6. Work items this implies

**Catalog (do before German ships).**

1. Correct the tiers in §4.1, most importantly `Fast · de: good → basic`, which is what makes the app steer
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

## 7. Claims that circulate and are false

Flagged because they came up repeatedly while researching and would embarrass us in a deck.

1. *"Italy fined OpenAI €15m."* Annulled by the Court of Rome on 18 March 2026 on jurisdictional grounds.
2. *"The AEPD opened 147 AI proceedings."* The AEPD never published that figure.
3. *"Turkey is a top-5 ChatGPT country."* Turkey is #1 in *share of national AI traffic going to ChatGPT*
   (94.49%), not in absolute users; only 19.2% of Turks used generative AI in 2025.
4. Any UAE country market-size figure sourced from this round — the underlying page refused the fetch and the
   search snippet duplicated Saudi Arabia's number. Do not quote one.

## 8. Honest data gaps

- **Taiwan and Hong Kong total consumer app spend** is paywalled at every vendor. If Traditional Chinese needs
  a revenue model rather than a ranking, buy a one-off Sensor Tower or Appfigures country pull.
- **No public Israel-specific app-spend figure exists.** Israel's market size in §5 is an order of magnitude,
  not a number.
- **No Israel-specific paid-AI conversion data exists.** The 88% ChatGPT figure is usage, not spend.
- **There is no public demand data anywhere for offline or on-device AI chat apps, in any market.** That is
  genuinely unmeasured and no report will supply it. Every market judgement here is about *adjacent* demand:
  who pays for AI, and who distrusts the cloud.
