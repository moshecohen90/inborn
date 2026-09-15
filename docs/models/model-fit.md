# Model fit map: sources and judgements

The `fit` block of every chat model in `packages/core/src/catalog/manifest.json` (catalog v2, 15.9.2026) is what the
chat card and the vault's "Best for" recommend from (spec §6.1 fit map, §7.8 recommendation rule). Every value below is a
judgement about the exact GGUF the catalog ships (Q4_K_M, the sizes in §6.1), not about the full-precision model, and it is
deliberately conservative: a tier says what a user can rely on, not what a benchmark peak shows.

Tiers. Uses: `best` (a strong choice for this task on a phone), `good` (usable, expect the odd miss), `weak` (do not rely on
it). Languages: `native` (trained at scale, fluent), `good` (fluent with occasional errors), `basic` (understands, answers
with mistakes or drifts to English), `none` (unusable, gibberish or wrong script). `goodLanguages` is derived: native + good.

Schema: `packages/core/src/catalog/types.ts` (`ModelFit`), checked by `packages/core/test/catalog-fit.test.ts`; any edit
here needs `node scripts/sign-catalog.mjs`.

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
| en, zh | native | Qwen pretraining corpus is English + Chinese dominant (Qwen3/3.5 technical reports). |
| es, fr, de, pt | good | Qwen3.5 lists 201 languages; the large European languages hold at 0.8B in our spot checks, with occasional English drift. |
| it, ja, ko, ru, ar | basic | Held at 2B (below) but at 0.8B Q4 the answers mix scripts or drop to English; Japanese and Korean were downgraded from the v1 list on that basis. |
| he | none | Hebrew on Instant is gibberish (the reason the §7 language hint exists; QA run 3 observation, Chat.tsx comment before this round). |

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
| en, zh | native | As Instant. |
| es, fr, de, pt, it, ja, ko, ru, ar | good | Qwen3.5 card multilingual table (MMMLU / INCLUDE family): 2B holds these; Arabic and Russian kept from the v1 list. Arabic is the least certain of the nine. |
| he | basic | Hebrew answers are in Hebrew and on topic at 2B but with grammar errors and English drift on long turns. |

## Sharp · Qwen3.5-4B Q4_K_M (2.74 GB, two shards)

| Dimension | Tier | Source |
|---|---|---|
| chat, writing, summarize, translate, documents, voice | best | Qwen3.5 card: 4B is on par with Qwen3-8B on general, writing and multilingual evals; the best generalist the catalog carries. |
| code | good | Qwen3.5-4B coding scores are solid but below Phi-4-mini's HumanEval/MBPP at the same size (Phi-4-mini card, Feb 2025). |
| math | good | Strong only in thinking mode (Qwen3.5 card AIME/MATH split); non-thinking is good, not best. |
| en, zh | native | As above. |
| es, fr, de, pt, it, ja, ko, ru, ar | good | Qwen3.5 card multilingual table for 4B. |
| he | basic | **Downgraded from good on 15.9.2026** after the on-device spot check below: better than Fast (on topic, mostly readable) but not fluent; every one of three prompts had a garbled clause or a wrong meaning. No catalog model is `good` at Hebrew until a dedicated one (spec §7.8 names DictaLM) enters the catalog. |

## Sharp (Phi) · Phi-4-mini-instruct Q4_K_M (2.49 GB)

| Dimension | Tier | Source |
|---|---|---|
| code | best | Phi-4-mini model card (Microsoft, Feb 2025): HumanEval 74.4, MBPP 65.3, ahead of same-size peers. |
| math | best | Phi-4-mini card: GSM8K 88.6, MATH 64.0. |
| chat, writing, summarize, documents, voice | good | Card: strong instruction following, 128k context; English-centric style. |
| translate | weak | Card: "primarily English" model; non-English performance is lower across the board. |
| en | native | Card. |
| es, fr, de, pt, it | good | Card lists 23 supported languages; multilingual MMLU 49.3 / MGSM 63.9 hold for the large European languages. |
| zh, ja, ko, ru, ar, he | basic | Listed as supported by the card, but the card itself warns of lower quality outside English; Hebrew is on the list, hence basic rather than none. |
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
Catalog v2 therefore rates Sharp `he: basic`, the chat card says "FAST handles Hebrew better than INSTANT, but not fluently."
and the vault tag says "NOTHING ON THIS PHONE IS GOOD AT CHAT IN HEBREW · CLOSEST: FAST" instead of RECOMMENDED. Re-run
this check when a Hebrew-tuned model (DictaLM-class) or a larger Qwen quant enters the catalog.

## Least certain judgements (for review)

1. Sharp · Hebrew `basic` (spot-checked above; a native speaker may judge some replies acceptable, but "good" would promise fluency the model does not deliver).
2. Fast · Arabic `good` (borderline with basic at Q4).
3. Instant · Japanese and Korean `basic` (downgraded from the v1 "good" list; a native speaker should confirm).
4. Phi · European languages `good` (the card's multilingual numbers are aggregates, not per language).
5. Phi · Hebrew `basic` (the card lists it; not spot-checked on device).
6. Sharp · math `good` vs Phi `best` (Sharp in thinking mode may beat Phi; the map rates the default, non-thinking answer).
