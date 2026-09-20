# Model fit map: sources and judgements

The `fit` block of every chat model in `packages/core/src/catalog/manifest.json` (catalog v3, 20.9.2026) is what the
chat card and the vault's "Best for" recommend from (spec §6.1 fit map, §7.8 recommendation rule). Every value below is a
judgement about the exact GGUF the catalog ships (Q4_K_M, the sizes in §6.1), not about the full-precision model, and it is
deliberately conservative: a tier says what a user can rely on, not what a benchmark peak shows.

Tiers. Uses: `best` (a strong choice for this task on a phone), `good` (usable, expect the odd miss), `weak` (do not rely on
it). Languages: `native` (trained at scale, fluent), `good` (fluent with occasional errors), `basic` (understands, answers
with mistakes or drifts to English), `none` (unusable, gibberish or wrong script). `goodLanguages` is derived: native + good.

Schema: `packages/core/src/catalog/types.ts` (`ModelFit`), checked by `packages/core/test/catalog-fit.test.ts`; any edit
here needs `node scripts/sign-catalog.mjs`.

A language key is an ISO 639-1 code, optionally with a BCP-47 script subtag (`zh-Hans`, `zh-Hant`). The script-tagged tier
wins when the fit map carries one; the plain code is the fallback. A code that appears in no key at all is **unknown**, not
`none`: the app never says a model is bad at a language it has not measured.

**Catalog v3 (20.9.2026) replaced the model-card judgements for every language below with measurements.** 132 real
generations on a Pixel_6_API_33 emulator, 18 languages × 3 prompts (a 100-word paragraph, a five-item list, a two-sentence
translation) × 3 tiers, each answer read and scored 0–3. The run, its rig and its limits are in
`docs/research/launch-languages-2026-09.md`; the score for each language is in its §3.1 table and every row below cites it
as P/L/T. Judgements still sourced from a model card are marked as such.

## Instant · Qwen3.5-0.8B Q4_K_M (533 MB)

| Dimension | Tier | Source of the judgement |
|---|---|---|
| chat | good | Qwen3.5 small-series model card (Feb 2026): 0.8B is the "edge" tier, instruction-following fine for short turns; our device runs (README "Models run on the OnePlus 6T", 7.9.2026) gave coherent short answers. |
| writing | weak | 0.8B at Q4 loses structure past a paragraph; drafts repeat and drift (device runs, QA run 3). |
| summarize | good | Short summaries of pasted text were accurate in the S43 quick-action proofs (README fixes-r8). |
| translate | weak | Translation quality tracks language tier; only en/zh are native, so most pairs are basic. |
| code | weak | Qwen3.5 card: coding benchmarks (LiveCodeBench, HumanEval-class) for 0.8B are far below the 2B/4B; Q4 widens the gap. |
| documents | weak | 4k dev context, small model: multi-chunk RAG answers lose the citation (rag-m5a proofs preferred Fast). |
| voice | good | Dictation follow-ups are short chat turns; same as chat. |
| math | weak | Qwen3.5 card: GSM8K/MATH for 0.8B non-thinking is low; thinking mode is off for Instant (brief). |
| en | native | 2.5/3/1.5 (§3.1). Prose is native; only the translation slips. |
| zh, zh-Hant | good | **Downgraded from `native` 20.9.2026.** zh-Hant measured 2/2.5/2.5 — overstated for a 0.8B at Q4 (§4.1). zh-Hans was not run at this tier and falls back to the plain `zh` tier. |
| pt | good | 2.5/2.5/1 (§3.1). The prose is good; the translation invented "Monday at 12:00", which `translate: weak` already warns about. |
| es, fr, de | basic | **Downgraded from `good` 20.9.2026.** de 1/1/1 with non-words, wrong case and the false claim that adults need "at least four hours of sleep"; fr 2/1.5/2; es 2/2/2 (§4.1). |
| it, ja, ko, ru, ar | basic | ja 1/2.5/1 (the paragraph repeated the same two sentences three times) and ko 1/2/0 (the translation inverted the meaning) on the 20.9 run; it, ru and ar were not run at this tier and keep the v2 judgement. |
| he | none | Hebrew on Instant is gibberish (the reason the §7 language hint exists; not re-run at this tier on 20.9). |

## Fast · Qwen3.5-2B Q4_K_M (1.28 GB)

| Dimension | Tier | Source |
|---|---|---|
| chat | best | Qwen3.5 card: 2B matches Qwen3-4B on general chat evals; spec §6.1 makes it the 6–8 GB default. |
| writing | good | Coherent multi-paragraph drafts at 2B; loses tone control on long pieces. |
| summarize | good | S43 proofs; long inputs (6k chars) summarized correctly. |
| translate | good | Good tier in nine languages; pairs between two good languages work, Hebrew/Arabic pairs do not. |
| code | weak | Qwen3.5 card: 2B coding scores are a fraction of the 4B and of Phi-4-mini; snippets compile but logic errors are common. |
| documents | good | rag-m5a and work-docs proofs ran on Fast with correct citations. |
| voice | best | Fast, short-latency turns; the hands-free S44 proofs (voice-m5b) ran on Fast. |
| math | weak | Non-thinking 2B; GSM8K-class only in thinking mode, which costs seconds per answer on a phone. |
| en | native | 3/3/2 (§3.1). |
| zh, zh-Hans, zh-Hant | native | **The best language we ship.** zh-Hans 3/3/3 — the only language scoring 3/3/3 on *Fast* — and zh-Hant 3/2.5/3 (§3.1). The Simplified translation was shorter and more idiomatic than the English original. |
| ar | native | **Upgraded from `good` 20.9.2026 (§4.1).** 2/2/3: the Arabic translation was the single best of all 18 languages on Fast. The prose scored 2, so this tier is the least certain in the map — see the review list below. |
| es, fr, pt, it, ja, ru | good | es 3/3/2.5, fr 3/2.5/2.5, pt-BR 3/2/1.5, it 3/2.5/1.5, ja 3/3/1.5, ru 3/2.5/2 (§3.1). Prose is strong in all six; translation is where a 2B model loses, which `translate: good` already qualifies. |
| de | basic | **Downgraded from `good` 20.9.2026, and this is the correction that matters most.** 1.5/2/2.5. The paragraph was re-sampled twice more and all three samples opened with the same wrong case, *"Gutem Schlaf ist …"* (it must be *Guter Schlaf ist*), two of them adding a gender error on the next noun (§3.2). Systematic, not an unlucky draw. Sharp German is fine, so the chat card now says "SHARP handles German better than FAST". |
| ko | basic | **Downgraded from `good` 20.9.2026.** 2/2.5/1: the translation invented a weekday and appended an English meta-note "correcting" itself (§4.1). |
| he | none | **Downgraded from `basic` 20.9.2026.** 1/1/0. The translation, *"בקפידה, תתבייש ליצור לוואיט"*, is not Hebrew (§4.1). This now matches what Instant already carried. |

## Sharp · Qwen3.5-4B Q4_K_M (2.74 GB, two shards)

| Dimension | Tier | Source |
|---|---|---|
| chat, writing, summarize, translate, documents, voice | best | Qwen3.5 card: 4B is on par with Qwen3-8B on general, writing and multilingual evals; the best generalist the catalog carries. |
| code | good | Qwen3.5-4B coding scores are solid but below Phi-4-mini's HumanEval/MBPP at the same size (Phi-4-mini card, Feb 2025). |
| math | good | Strong only in thinking mode (Qwen3.5 card AIME/MATH split); non-thinking is good, not best. |
| en, zh, zh-Hans, zh-Hant | native | en 3/3/3, zh-Hans 3/3/3, zh-Hant 3/3/3 (§3.1). |
| ja, ko, ru | native | **Upgraded from `good` 20.9.2026.** 3/3/3 each, with natural keigo and correct honorifics; the Korean translation was exactly right (§3.3, §4.1). |
| es, fr, de, pt, it, ar | good | es 2.5/3/3, fr 3/2.5/3, de 2.5/2.5/3, pt-BR 3/3/3, it 3/2.5/2, ar 2.5/2.5/2.5 (§3.1). Italian fails on translation (it moved the meeting to Thursday *afternoon*); Arabic clears every prompt at 2.5. |
| he | basic | **Downgraded from good on 15.9.2026** after the on-device spot check below, and confirmed worse on 20.9 (1/1/1): the Arabic word مهارة bled into a Hebrew word (*המهارה*) and "Thursday" became the festival of Shavuot. Better than Fast (which is now `none`) but not fluent. No catalog model is `good` at Hebrew until a dedicated one enters the catalog; `DictaLM-3.0-1.7B-Instruct` (Apache-2.0, 1.11 GB) is the candidate and the bar for it is ≥2.5 on all three prompts (research §5). |

## Sharp (Phi) · Phi-4-mini-instruct Q4_K_M (2.49 GB)

| Dimension | Tier | Source |
|---|---|---|
| code | best | Phi-4-mini model card (Microsoft, Feb 2025): HumanEval 74.4, MBPP 65.3, ahead of same-size peers. |
| math | best | Phi-4-mini card: GSM8K 88.6, MATH 64.0. |
| chat, writing, summarize, documents, voice | good | Card: strong instruction following, 128k context; English-centric style. |
| translate | weak | Card: "primarily English" model; non-English performance is lower across the board. |
| en | native | Card. |
| es, fr, de, pt, it | good | Card lists 23 supported languages; multilingual MMLU 49.3 / MGSM 63.9 hold for the large European languages. |
| zh, ja, ko, ru, ar, he | basic | Listed as supported by the card, but the card itself warns of lower quality outside English; Hebrew is on the list, hence basic rather than none. Phi was not in the 20.9 run, so every row here is still a model-card judgement. |
| vision | – | No image input (`vision: false`). |

## Sharp · Hebrew spot check (15.9.2026, round 11b)

Pixel_6_API_33 emulator, 7.6 GB guest RAM, CPU only, Sharp = Qwen3.5-4B Q4_K_M from the local model server, non-thinking mode,
three prompts sent through `Documents/dev-prompt.txt`. Screenshots in `docs/models/fit-check/`.

| Prompt | What came back | Verdict |
|---|---|---|
| A paragraph: כתוב פסקה של כ-100 מילים על החשיבות של שינה טובה לבריאות (`he-paragraph.png`) | On topic, right length, mostly readable. Grammar slips: "מתייצב הורמונים", "המוח מנקות את חומרים", the non-word "לנירמון", the Anglicism "הקונצנטרציה"; the closing sentence is nonsense ("והצבת גיבוי של מקלחת מידע, היא אחד המדעי החשובים"). | Readable, not fluent. |
| A question with a list: מהם היתרונות של לימוד שפה חדשה? ענה ברשימה של חמישה יתרונות (`he-list.png`) | Correct format, five numbered items. Items 1–3 are fine ("מחשבת ביקורתית" should be "חשיבה ביקורתית"); item 4 is nonsense ("הופכת את החיים לקולניים ופונקציונליים יותר"); item 5 ends in a non-word ("האומה המטרתנית"). | 3 of 5. |
| A short translation to Hebrew: "The meeting was moved to Thursday morning because two of the managers are traveling. Please confirm that the new time works for you." (`he-translate.png`) | "האישור עבר למחרת בבוקר מכיוון ששנה מתכנסים נוסעים. אנא תאשר שהזמן החדש מתאים לך." The first sentence changes the meaning (meeting → confirmation, Thursday → the next morning, "two managers" → "a year gathering travellers"); the second is correct. | Wrong meaning in 1 of 2 sentences. |

Speed: 4.5 tok/s, TTFT 6.5–25 s on this emulator (CPU only; a real 8 GB phone runs the 4B faster).

**Verdict: not reliably good.** Sharp is clearly better than Fast in Hebrew (Fast drifts and errs more, Instant is gibberish:
`he-instant-card.png`), but a user who relies on it will get a wrong translation or a garbled sentence in every few replies.
Catalog v3 rates Sharp `he: basic` and Fast `he: none`, so the chat card now offers Sharp rather than Fast, and the vault tag
says "NOTHING ON THIS PHONE IS GOOD AT CHAT IN HEBREW · CLOSEST: SHARP" instead of RECOMMENDED. Re-run this check when a
Hebrew-tuned model (DictaLM-class) or a larger Qwen quant enters the catalog.

## Least certain judgements (for review)

1. **Fast · Arabic `native` while Sharp · Arabic is `good`.** This is the one place where the map now rates Fast *above* Sharp
   for a language, and the measurements say the opposite: Fast scored 2/2/3 and Sharp 2.5/2.5/2.5 (§3.1). Because §7.8 ranks
   language before use, an Arabic user now gets Fast recommended for **code** (where Fast is `weak`) and for **writing**
   (where Sharp is `best`). The upgrade follows the 20.9 finding that Fast's Arabic translation was the best of all 18
   languages, but the coherent pair is either Fast `good` + Sharp `good`, or Fast `native` + Sharp `native`. Decide this
   before Arabic ships; it is the only tier in v3 that changes a recommendation for the worse.
2. Sharp · Hebrew `basic` (spot-checked 15.9 and re-measured 20.9; a native speaker may judge some replies acceptable, but "good" would promise fluency the model does not deliver).
3. Instant · Italian, Russian and Arabic `basic` (not run at this tier on 20.9; carried over from the model-card judgement).
4. Phi · every language (Phi was not in the 20.9 run at all; all four of its rows are model-card judgements).
5. Sharp · math `good` vs Phi `best` (Sharp in thinking mode may beat Phi; the map rates the default, non-thinking answer).
6. `zh-Hans` on Instant (not run; it falls back to the plain `zh: good` tier measured on Traditional only).
