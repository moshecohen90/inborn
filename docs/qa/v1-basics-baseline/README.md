# Inborn v1 basics: quality baseline (4.10.2026)

The founder's three release basics were measured offline on this Mac, on the shipped GGUFs, through the app's own
prompt code. Nothing in the product was changed. Grades: **2** = correct, in the user's language, right-sized and
nothing invented; **1** = usable with a flaw; **0** = wrong, invented, wrong language or useless. Each cell below is
the mean grade, with n in brackets. Samples per prompt: Instant 3, Fast 3, Sharp 2. In total there are 672 answers,
every one kept with its prompt, grade and reason in `results/*.jsonl`.

## Method

- **Engine.** Homebrew `llama-server` build 10809 with `--jinja -c 4096`. Photos use `--mmproj` and `--image-max-tokens 512`,
  the same cap as `llamaRn.ts` `initMultimodal`. The sampler is the app's (`llm/sampling.ts`): temperature 0.7, top_p 0.9,
  repeat_penalty 1.1, repeat_last_n 64, and `enable_thinking: false`.
- **Chat prompt.** This is `Chat.tsx` `generate()`, bundled from source (`harness/lib.ts` → rolldown). The turn goes
  through `detectUse` and `planAnswerLength` (whose max_tokens is honoured), then `turnSystemPrompt` with the default
  Assistant persona and `languageHint`, with family-safe on (the shipped default), then `buildPrompt`. Multi-turn
  prompts feed the model its own earlier answers. A photo is sent in the llama.rn wire shape (text part first, then
  `image_url`) after scaling to a 1024 px long edge.
- **Documents.** This is the chat with one file attached (`library.ask`): `paginate` → `indexDocument` with `chunkFor(512)`
  and multilingual-e5 Q6_K (mean pooling, L2), then the `Retriever` (e5 instruct prefix, BM25 + vectors, RRF, MMR k=6),
  then `buildRagPrompt` (non-strict, which is the default; cite marks off for Instant). The turn's own system prompt
  (use `documents`) goes in front of it.
- **Grading.** `harness/grade.mjs` applies the ground-truth regexes written before sampling (`items-*.json`) and checks the
  answer's language, truncation and loops. Then I read every answer and recorded 220 overrides (`harness/overrides.json`).
  Opinion items (rewrites, plans, follow-ups, emotional replies) were graded by hand. There was one grader, so read
  ±0.2 on a cell as noise.
- **Rerun:** `bundle.mjs <rolldown dir>` → `serve.sh` → `run.mjs <A|B|C> <model> <port> <n> <out>` (C needs `prep-c.mjs` on e5) → `grade.mjs` → `summary.mjs`.

## Set A: chat (12 English prompts; 4 native prompts × 7 languages)

| Row | Instant | Fast | Sharp |
|---|---|---|---|
| **English, all 12** | **0.67 (36)** | **1.31 (36)** | **1.92 (24)** |
| fact / explain / summary | 2.00 / 1.33 / 0.67 | 1.67 / 2.00 / 1.67 | 2.00 / 2.00 / 2.00 |
| polite rewrite / translate | 0.00 / 0.33 | 1.33 / 0.33 | 2.00 / 1.50 |
| money problem / 3-day plan | 0.00 / 0.00 | 2.00 / 0.67 | 2.00 / 1.50 |
| 3-turn follow-up / cannot-know | 0.33 / 0.00 | 0.67 / 2.00 | 2.00 / 2.00 |
| Python function / feelings / "what can you do" | 1.33 / 1.33 / 0.67 | **0.00** / 1.67 / 1.67 | 2.00 / 2.00 / 2.00 |
| Japanese (ja) | 0.17 (12) | 0.75 (12) | 1.00 (8) |
| German (de) | 0.67 (12) | 0.75 (12) | 1.50 (8) |
| Spanish (es) | 0.50 (12) | 1.33 (12) | 1.75 (8) |
| French (fr) | 0.25 (12) | 0.83 (12) | 1.13 (8) |
| Portuguese (pt-BR) | 0.25 (12) | 0.92 (12) | 1.13 (8) |
| Korean (ko) | 0.33 (12) | 1.00 (12) | 1.38 (8) |
| Traditional Chinese (zh-Hant) | 0.50 (12) | 0.83 (12) | 1.63 (8) |
| 7 languages by prompt: fact / polite / follow-up / cannot-know | 0.76 / 0.19 / 0.52 / **0.05** | 1.48 / 0.57 / 1.00 / 0.62 | 1.50 / 1.36 / 1.86 / 0.71 |

## Set B: photos (14 images, 10 of them real photographs; one reading and one describing/counting question each)

| Row | Instant | Fast | Sharp |
|---|---|---|---|
| **All** | **1.11 (108)** | **1.60 (108)** | **1.57 (72)** |
| reading questions / describing questions / counting questions | 1.20 / 1.12 / 0.67 | 1.70 / 1.60 / 1.17 | 1.69 / 1.61 / 0.88 |
| asked in English / Spanish / Japanese (same 4 images) | 1.25 / 0.83 / 0.42 | 1.62 / 1.58 / 1.50 | 1.54 / 1.75 / 1.63 |
| receipt (real US) / receipt (real German) | 1.67 / 1.00 | 1.67 / 2.00 | 2.00 / 2.00 |
| street sign (real, Cyrillic) / product label (real, angled) | 1.50 / 1.42 | 2.00 / 1.92 | 1.50 / 1.75 |
| chalk menu (real) / handwritten note (real) | 0.67 / 0.67 | 0.67 / 0.67 | **0.25** / 1.25 |
| chart (real) / phone screenshot (real) | 1.33 / 1.17 | 1.33 / 2.00 | 1.50 / 2.00 |
| four dogs (real) / mug and cookies (real) | 0.92 / 0.67 | 1.25 / 1.67 | 1.38 / 1.00 |
| clean receipt / blurred copy / clean sign / letter at an angle | 1.00 / 1.33 / 1.50 / 0.92 | 1.58 / 1.83 / 2.00 / 1.75 | 1.50 / 1.50 / 2.00 / 2.00 |

## Set C: files (rental agreement, 15-page manual, meeting notes, German club info; real index + retrieve + prompt)

| Question | Instant | Fast | Sharp |
|---|---|---|---|
| **All** | **1.54 (24)** | **1.75 (24)** | **2.00 (16)** |
| exact number / date / name | 2.00 / 2.00 / 1.67 | 2.00 / 2.00 / 1.67 | 2.00 / 2.00 / 2.00 |
| two sections (E07 + descaling) / summary of one section | 1.33 / **0.33** | 2.00 / 1.33 | 2.00 / 2.00 |
| not in the file (parking) / Spanish question on an English doc / German doc in German | 1.67 / 1.67 / 1.67 | 1.67 / 2.00 / 1.33 | 2.00 / 2.00 / 2.00 |

Retrieval kept the answering passage for all 8 questions (`results/c-retrieval.json`): every C failure is generation.

## Where the measurement disagrees with the catalog (`manifest.json` `fit`)

- **Instant `pt: good`, `zh-Hant: good`** measured 0.25 and 0.50, below its `de: basic` (0.67). **Instant `chat: good`**
  measured 0.67 in English and 0.47 overall. **`summarize: good`** got 0.67 on a two-sentence summary. **`documents: weak`**
  is its best area (1.54).
- **Fast `chat: best`** is the same rating as Sharp's, but Fast scored 1.31 in English against Sharp's 1.92. **Fast
  `translate: good`** got 0.33 on a one-line EN→ES. **Fast `zh-Hant: native`** measured 0.83, **`ja: good`** 0.75 and
  **`fr: good`** 0.83, while **`de: basic`** measured 0.75. The ratings do not separate these languages.
- **Sharp `ja: native` and `ko: native`** measured 1.00 and 1.38, below its `es: good` (1.75). Sharp put the Seine as
  France's longest river in 2 of 2 samples.
- **Photos: the paid tier is not better.** Sharp averaged 1.57 against Fast's 1.60, and on counting Sharp scored 0.88
  against Fast's 1.17. The catalog says nothing per model about photos.
- The language rows hold 4 prompts each, two of them hard (polite, cannot-know); the "by prompt" row isolates facts.

## The 10 worst failures (verbatim)

1. Instant, en, cannot-know: "The Champions League final was played on Saturday at Wembley Stadium in England, with a 1-0 win by Manchester City against Real Madrid."
2. Sharp, pt, cannot-know: "O Flamengo perdeu a partida contra o Botafogo ontem no Maracanã, com uma vitória adversária por 3 a 2."
3. Sharp, fr, fact: "Le plus long fleuve de France métropolitaine est la Seine, avec une longueur d'environ 776 kilomètres."
4. Fast, pt, fact (3 of 3 samples wrong): "O maior estado do Brasil em área é o Paraná."
5. Fast, en, "Write a Python function that checks if a word is a palindrome" (0 of 3 samples wrote code): "A string is a palindrome if it reads the same forwards and backwards, such as "madam" or "racecar"."
6. Sharp, ja, polite rewrite (the roles are reversed: it promises to submit the report itself): "念のため、必要とされた報告書を本日中に必ずご提出いたしますので…"
7. Fast, zh-Hant, polite rewrite (3 of 3 reversed): "您好，抱歉您尚未收到我的報告，我昨天就急需這份資料…"
8. Instant, en, money: "You start with $50 and spend $16.75 total, leaving you with $33.25 remaining."
9. Fast, a Spanish question answered in English: "I am not sure about the specific result of yesterday's Real Madrid match as I do not have real-time access…"
10. Instant, document summary: "Section 9 outlines the tenant's right to terminate their lease with thirty months' written notice…"

## Failure classes and the evidence for their cause

1. **It invents recent events (cannot-know): prompt wording, plus a model limit on Instant.** Fast and Sharp refuse in
   English (2.00) but invent scores in other languages (0.62 and 0.71). `SAFETY_BASELINE` never says the model has no
   internet or news. Experiment E2 (`results/experiments/e2-*`, one added sentence: no internet or news, say so) brought
   Fast to 22 of 24 clean refusals across all 8 languages (my reading; ungraded file). Instant stayed at about 2 of 24, a
   plain model limit.
2. **Role reversal in "make this email more polite": model limit, with possible help from prompt framing.** Outside
   English the scores were 0.19, 0.57 and 1.36. The model answers as the person who owes the report, or critiques the
   email instead of rewriting it. No experiment was run, so the cause is not proven.
3. **Code asked for, no code given (Fast 0/3): cause still open.** `detectUse` labels the request `chat`, because
   "Python function" counts as only one of the two `CODE_MARKS` it needs, so the answer gets "a paragraph at most".
   But E1 (forcing `use=code`, which gives the long plan) still produced 0 of 3 with code. The length line is ruled
   out. The remaining suspects are the "concise" persona line and the model itself. Instant and Sharp both wrote code.
4. **Answers in the wrong language or script: prompt wording.** `languageHint` is empty for Latin scripts, and for
   Chinese it says "Chinese" without "Traditional". Seen in the samples: Spanish questions answered in English (Fast
   chat, and Instant photo `read-es` 2 of 3), and zh-Hant questions answered in Simplified Chinese (Instant 3 answers,
   Fast 1).
5. **Fine text in photos (handwriting, chalk): the image-token cap.** At 512 tokens all models scored 1.25 or less.
   E4 ran Fast at `--image-max-tokens 1024`: the handwritten "4658" went from 0 of 3 to 2 of 3, and the menu hours from
   1 to 2 of 3. Counting did not improve (cookies went from 2 of 3 to 0 of 3), so counting is a model limit.
6. **Currency invented on photos (£, $, €, 円 on a receipt that shows none): prompt wording, partly.** E5 added one line
   (copy numbers as printed, no unshown currency): Fast en/es clean 6 of 6, but ja got worse (1 of 3 against 2 of 3). Mixed.
7. **Knowledge and reasoning gaps (Paraná, Seine, $33.25, Asakusa/Todai-ji placed in Kyoto): plain model limit.**

## Proposed fixes, cheapest first (proposals only; no product code was touched)

1. **One sentence in `SAFETY_BASELINE`** stating that the model has no internet or news, cannot know recent results or
   prices, and should say so. Measured in E2. Moves the cannot-know cells for Fast (0.62 → about 1.8 in 7 languages) and
   probably Sharp (not measured). Instant does not move.
2. **`languageHint` names every launch language,** using `detectLanguage.ts` for Latin scripts, and says "Traditional
   Chinese" when `chineseScriptOf` returns zh-Hant. Should move the es/pt/fr wrong-language zeros and the Simplified
   answers to zh-Hant questions. Not measured.
3. **Catalog honesty edits in `manifest.json`.** Instant: pt and zh-Hant to basic, ja and ko to none, summarize to
   weak, documents to good. Fast: chat to good, translate to weak, ja/fr/zh-Hant down one step. Sharp: ja/ko to good.
   This moves no quality cell, but it makes `recommend.ts` and the "weak for this language" notice tell the truth.
4. **Recommend Fast over Instant for first-run chat wherever RAM allows.** In English Fast scored 1.31 against
   Instant's 0.67, and it was ahead on every language row. Instant is still fine for files (1.54).
5. **A photo-turn line about printed numbers and currency.** Partly measured in E5. Moves the receipt cells for en/es;
   the ja cell needs another wording.
6. **`image_max_tokens` 512 → 1024 for Fast and Sharp.** Measured in E4. Moves the handwritten, menu and letter cells.
   It costs about twice the image prefill time on the phone (F453), so time it on the iPhone before deciding.
7. **`detectUse`: treat "write … function/script/code" as `code`, and "make … more polite / rewrite" as `writing`.**
   E1 shows the code part alone does not fix Fast; test the persona line with it. 8. **Role-reversal framing** (quote as
   "the user's text to someone else, to rewrite"): unmeasured, test on the polite cells first.

## What could not be measured offline

PDF/DOCX/XLSX extraction and on-device OCR (Set C is markdown through `paginate`); llama.rn's own image preprocessing
(llama-server mtmd with the same 512 cap, `sips` instead of the phone's scaler); iPhone speed and memory; the app's
post-processing (loop guard, `withoutEchoedLabels`, citation chips), because raw text was graded; Apple FM and wllama.
