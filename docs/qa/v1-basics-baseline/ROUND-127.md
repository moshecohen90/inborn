# Round 127: prompt-layer fixes, measured on tuning and held-out sets

Same harness, models, sampler and n as the baseline (`README.md`): Instant 3, Fast 3, Sharp 2 samples per prompt.
Tuning sets: A, B, C. Held-out sets: A2 (12 new English prompts plus 4 new native prompts per language) and B2 (one new
question per image). Both held-out sets were written and sampled on the old code before any change, and were not opened
again until the final run. Grades are 0/1/2.

**Grading.** A, B and C after the change were graded the way round 1 was: rubric first, then I read every answer
(`harness/overrides-after.json`). A2 and B2, before and after together, were graded blind by two Sonnet graders. The
rows were shuffled with no before/after label (pack and key map in the session scratchpad), and B2 Fast/Sharp got a
second blind pass after the photo rerun. Treat ±0.3 on a cell of n ≤ 3 as noise. English photo turns got a byte-identical
prompt before and after, yet still moved by ±0.15 on the headline, so that is the noise floor.

## Headline (mean grade)

| Set | Instant | Fast | Sharp |
|---|---|---|---|
| A tuning, all 40 prompts | 0.47 → 0.50 | **1.03 → 1.35** | **1.52 → 1.73** |
| A tuning, native 28 | 0.38 → 0.36 | **0.92 → 1.26** | **1.36 → 1.66** |
| B tuning, photos | 1.11 → 1.21 | 1.60 → 1.48 | 1.57 → 1.74 |
| C tuning, files | 1.54 → 1.54 | 1.75 → 1.62 | 2.00 → 1.94 |
| **A2 held-out, all 40** | 0.48 → 0.47 | **0.87 → 1.26** | 1.54 → 1.49 |
| A2 held-out, native 28 | 0.39 → 0.38 | **0.68 → 1.12** | 1.43 → 1.38 |
| **B2 held-out, photos** | 1.10 → 1.10 | 1.33 → 1.52 | 1.71 → 1.57 |

The targets the brief named, before → after:

- **Wrong language.** English answers to es/pt/fr/de questions, on A + A2: 1/192 → 0/192. Simplified answers to zh-Hant
  questions: 4/64 → 0/64.
- **Fast writes code** (`def`/`function` present and correct): A 0/3 → 3/3, A2 3/3 → 3/3.
- **Cannot-know, native languages.** Fast tuning 0.62 → 1.71, held-out 0.62 → 1.86. Sharp tuning 0.71 → 2.00, held-out
  1.86 → 2.00. Instant stays near 0.

## Changes (all in `packages/core` unless marked)

1. **No internet.** `src/chat/personas.ts:11-17` adds one sentence to the baseline. `src/chat/context.ts:71` leaves it out
   for Instant and for photo turns (`PLAIN_SAFETY_BASELINE`). Tests: `test/chat-context.test.ts` ("the no-internet sentence").
2. **Language hint.** `src/chat/language.ts:51` names every detected language, with "Traditional/Simplified Chinese"
   for the two scripts. `language.ts:43`: kana anywhere means Japanese (「日本で一番高い山は何ですか」 was read as Chinese).
   `language.ts:68`: 36 more Simplified/Traditional pairs (誰贏賽 …). `src/chat/detectLanguage.ts:29-43,66`: question
   words, plus letters one language owns (¿ñ, ãõ, äöüß, elision), so short questions decide.
   Tests: `test/chat-language-hint.test.ts`, `test/chat-detect-language.test.ts`.
3. **detectUse and length.** `src/chat/length.ts:50` is the root cause of Fast writing no code: "checks if **a word** is
   a palindrome" was parsed as "answer in about 1 word", so the turn got *"Answer in one to three sentences … about 1
   words"*. Now "a/an" counts only after "in". `src/catalog/recommend.ts:181,195`: "write … function/script/code" is code
   in 8 languages. `recommend.ts:198` and `length.ts:81,136`: polite/rewrite/reword/fix-my-email is writing (moderate plan since 127b).
   `length.ts:84,136`: plans, itineraries and step lists get the long plan. Tests: `test/fixes-r127.test.ts`.
4. **Pro-only advice.** `src/catalog/recommend.ts:103` (`offerOf`, used by `adviseModel` and `betterForLanguage`): the
   offer is the best model the user can get without paying, and a Pro-only top pick rides along only as `best`.
   `apps/mobile/src/screens/Chat.tsx:1115,1167` pass `pro: tier !== "free"`. `Chat.tsx:1504` adds `bestLocked`, and
   `apps/mobile/src/components/chat/ModelAdvice.tsx:52` puts the existing PRO chip (`vault.pro`) on the best line.
   `Chat.tsx:1511`: the best line now opens the model it names, not `better`. No new strings.

**Fix 6 evidence.** The 28.9 tester was on the free tier (`docs/qa/ios-device-pass-31-2026-09-28.md`: "set the tier to
Pro and back"). The card said "Install SHARP · 2.74 GB", its only offer, for a Pro-only model, so it was wrong. Tests:
`test/catalog-recommend.test.ts:161` (free, 6 GB, documents on Instant → better = Fast, best = Sharp PRO; Pro → Sharp)
and `apps/mobile/src/components/chat/modelAdvice.test.ts`, which renders the card. I watched it fail with the filter
removed (1 failed), then pass.

## Wording experiments (tuning set only; files in `results/experiments/f1-*`, `f2-*`)

| Fix | Variants (n per variant) | Result | Decision |
|---|---|---|---|
| 1 no internet | N0 none, N1 long, N2 "cannot browse … say you cannot know them", N3 conditional, N4 "when a question depends on…" (24 cannot-know per model; 21 Instant hello/fact/feel) | Fast clean refusals 13, 14, **22**, 19, 15 of 24. Instant 0, 4, 4, 1, 0 of 24. Instant leaks into hello 0, 5, 2, 2, 0 of 21 | **N2**, not on Instant (no gain there, and it leaks) |
| 2 hint wording | English hint vs English + native sentence (56 per model) | Fast 1.75 vs 1.71, wrong language 2 vs 2. Instant 1.25 vs 1.18, 2 vs 0 | English hint (no gain from the native line) |
| 3 Fast no-code cause | old "1 words" line, same without persona, new long line, without persona, without length line, length before persona (20 each, Fast, use=code) | code 1, 3, **20, 20, 20, 20** of 20 | Cause is the "1 words" line. Persona and order are irrelevant |
| 4 rewrite framing | R0 none, R1 "quoted text is the user's own message…", R2 "user wrote it, will send it" (24 polite, 8 languages) | usable user-voice rewrites (my reading): Fast 13.5 / 14 / 10, Instant 13 / 9 / 9 | **Rejected**: no gain on Fast, worse on Instant |
| 5 photo line | P0 none, P1 "copy numbers as printed, no unshown currency", P2 variant (en 24, es 16, ja 16, describe 14) | Fast es 1.75 → 1.38 / 1.25. Instant es 1.62 → 1.50 / 1.00. en and ja up | **Rejected**: worse in Spanish in both variants and models |

**Rejected after the full run: the no-internet line on photo turns.** In the first after-run it also went to photos. It
leaked "I cannot browse the internet…" into answers: tuning B, Fast and Sharp, 0 → 5 of 180; held-out B2 0 → 5 of 70.
B2 fell (Fast 1.40 → 1.29, Sharp 1.71 → 1.54). Photos now get the plain baseline, and B and B2 were rerun on Fast and
Sharp. The first run is kept in `results/after/v1-line-on-photos/`. The decision rests on the tuning-B leak. B2 confirmed it.

## Cells that dropped by more than 0.3

Almost all of these are n = 2–3, one sample flipping.

- **Chat:**
  - A: Instant en-fact 2.00 → 1.33; Fast en-explain 2.00 → 1.67, en-plan 0.67 → 0.33, en-polite 1.33 → 1.00,
    en-summary 1.67 → 1.33; Sharp en-money 2.00 → 1.00.
  - A2: Instant en-hello 1.33 → 1.00, en-followup 1.33 → 1.00, en-plan 1.67 → 0.33; Fast en-translate 1.67 → 0.67;
    Sharp en-hello 2.00 → 1.50, en-money 1.00 → 0.00, **ja 1.88 → 1.00 (n 8)**.
    - The Sharp ja drop: the polite rewrite is now "writing", so it gets the long plan. Sharp answered with a menu of
      patterns, once role-reversed, once with stray Chinese. The fact item also wobbled (利根川).
    - Sharp en-hello: Sharp now mentions it has no live data when asked what it can do.
- **Photos** (no prompt change in English):
  - B: Fast counting 1.17 → 0.50 (three dogs instead of four, four cookies), es 1.58 → 1.17 (currency added in 3/3 of
    one cell), chart 1.33 → 1.00, object 1.67 → 1.33, screenshot 2.00 → 1.33, receipt-clean 1.58 → 1.25, receipt-de
    2.00 → 1.67; Sharp handwriting 1.25 → 0.75; Instant menu 0.67 → 0.33, screenshot 1.17 → 0.83.
  - B2: one-cell flips of 2.00 → 1.00–1.67 on several images, all n 2–3.
- **Files (C)**, unchanged except the turn's system prompt:
  - Fast cross-lang 2.00 → 1.33 (one answer in French), date, name and two-sections 2.00/1.67 → 1.67/1.33.
  - Instant german 1.67 → 1.00, not-there 1.67 → 1.00.
  - Sharp summary 2.00 → 1.50.

## Tier corrections backed by both sets (after the fixes; not applied, catalog untouched)

| Model | Field | Now | Should be | Tuning / held-out |
|---|---|---|---|---|
| Instant | ja, ko | basic | none | ja 0.25 / 0.08, ko 0.25 / 0.08 |
| Instant | pt, zh-Hant | good | basic | pt 0.08 / 0.42, zh-Hant 0.42 / 0.58 |
| Instant | summarize | good | weak | en-summary 1.00 / 0.67 |
| Fast | ja | good | basic | 1.00 / 0.67 |
| Fast | zh-Hant | native | good | 1.67 / 1.33 |
| Fast | code | weak | good | en-code 2.00 / 2.00 (one prompt per set) |
| Sharp | ja, ko | native | good | ja 1.38 / 1.00, ko 1.62 / 1.00 |

## Remaining failures that are plain model limits

- **Instant invents recent results under every wording** (0–4 of 24 clean). It also places Asakusa in Kyoto, gives wrong
  heights and areas, and cannot shorten "the second one".
- **Role reversal in rewrites, all models outside English.** No framing helped (fix 4). Held-out native polite: Fast 0.24,
  Sharp 0.86.
- **Counting** (dogs, cookies) swings between runs on Fast and Sharp. **Handwriting and chalk** need more image tokens
  (E4, out of scope here).
- **Currency** is added to receipts that print none, on and off at the same prompt.

## 127b: the length plan for rewrites

The Sharp A2 ja drop came from rewrites getting the long plan. Tuning polite cells, all 8 languages, Fast n 3 (24 per
variant) and Sharp n 2 (16), graded blind by one Sonnet grader (pack and key in the session scratchpad). Variants: **L**
the round-127 long plan (1024 tokens), **M** the moderate plan rewrites had before round 127 (512), **W1** "Return one
rewritten version only, about as long as the original, with no options, no list and no commentary." and **W2** "Reply
with only the rewritten message itself: a single version, about the same length as the original. Do not offer
alternatives, explain the changes or add notes.", both capped at 3x the quoted text's tokens (floor 128, ceiling 512).
Usable = one version, the user's voice, right language, the ask and the date kept, nothing invented. Files and unblinded grades: `results/experiments/g1-*`.

| Variant | Fast usable | menus | reversals | commentary | Sharp usable | Sharp ja | Sharp reversals |
|---|---|---|---|---|---|---|---|
| L long | 5 / 24 | 8 | 7 | 18 | 12 / 16 | 0 / 2 | 1 |
| M moderate | 5 / 24 | 1 | 10 | 5 | **15 / 16** | **2 / 2** | 0 |
| W1 | 3 / 24 | 0 | 8 | 1 | 11 / 16 | 0 / 2 | 0 |
| W2 | 3 / 24 | 0 | 8 | 1 | 12 / 16 | 0 / 2 | 2 |

Single version in the user's voice and language, ignoring content: Fast 13 / 13 / 15 / 15, Sharp 13 / 16 / 15 / 14.
Both rewrite wordings remove menus and commentary but do not raise Sharp ja on tuning, and Fast drops 5 → 3 (most Fast
failures under every plan are role reversals and invented deadlines, a model limit). **Decision: rewrites go back to the
moderate plan** (`length.ts`, rewrite branch). It equals L on Fast, is best on Sharp, and nearly ends menus. Translate
answers were single lines in every after-run sample, so translate keeps the long plan.

**A2 ja on Sharp (8 answers, blind):** before round 127 1.88, round 127 1.00, **127b moderate 1.25**. Fact,
cannot-know and follow-up are back near 2. The polite item is still 0 / 2, both role-reversed (the seller apologizing).
W1 and W2 were sampled in the same session (1.62 and 1.50, polite 1 / 2 each) but held-out numbers did not choose the plan.

Tests: `test/fixes-r127.test.ts` (rewrites in 8 languages get the moderate plan; an explicit "detailed", "continue"
and spoken still win). Removing the branch fails 2 tests.
