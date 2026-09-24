# fix-cjk-floor — the cosine half of the relevance floor, measured (rounds 70 and 70b, F327–F332)

> **Round 70b** asked whether a centred cosine could win back the recall round 70 gave up. It cannot: best case
> 35/57 against a bar of 50/57, and the embedder ranks the answering chunk first for only 3 of 21 on-topic questions
> on a six-chunk document. See **`centering.md`**. The rule below is unchanged.

No phone, no emulator, no browser. The whole round is one measurement and what it forced.

F282 left a Medium open on Play 1.0.0 (22): a one-passage Japanese document, an off-topic Japanese question, and the
passage still came back under `SOURCES`. That round measured the lexical half at zero hits and **deduced** that
`cosine >= 0.5` had carried it, because nothing on the phone prints a cosine. This round measured it.

## What was measured, and how

The embedder the app ships, `nomic-embed-text-v1.5.f16.gguf`, run off-device with
`llama-embedding --pooling mean --embd-normalize 2` and the app's own `search_document: ` / `search_query: `
prefixes, then put through `quantize()` and `cosineQuantized()` from `packages/core/src/rag/vector.ts` — so the
number is the one the phone computes, int8 quantisation included. Measured 24.9.2026. `embed.mjs` reruns the
embedding pass from `fixtures.json`, and `packages/core/test/rag-cosines-measure.test.ts` recomputes the table and
the committed fixture from its output (skipped unless `INBORN_MEASURE_VECTORS` points at it) — the rerun reproduced
the committed numbers exactly.

12 one-passage documents in 9 languages (ja, zh, ko, en, de, es, fr, pt, he), 57 on-topic and 102 off-topic
questions. A one-passage document is the failing case: with a single chunk there is nothing to rank the passage
against, so the floor is the only thing standing between the question and a citation.

The 6T's own F282 turn measures **`cos=0.662, terms=0`**. F282's deduction was right.

## The finding: there is no higher bar

| script | on-topic, no word shared with the passage | off-topic, no word shared | a floor between them |
|---|---|---|---|
| CJK (ja, zh, ko) | 0.431 – 0.726 (12) | 0.395 – 0.716 (52) | none |
| Latin (en, de, es, fr, pt) | 0.510 – 0.689 (14) | 0.338 – 0.655 (40) | none |
| Hebrew | 0.655 – 0.728 (2) | 0.591 – 0.764 (10) | none |

Asked in its own language, a ja/zh/ko/he document scores **every** off-topic question between 0.527 and 0.764. The
number is measuring the language, not the topic. In CJK the worst off-topic question (0.716) outscores **10 of the
12** on-topic questions that share no word with the passage. The single highest score in the whole zero-overlap set
is an off-topic Hebrew question — *"my child has a fever, what do I do?"* against an annual report, **0.764**.

0.5 was calibrated on English, where unrelated text really does sit near 0.4. Even there it has stopped working:
across the five Latin-script languages the off-topic band reaches 0.655.

A calibrated variant was tried before the rule was written — subtracting the query's own similarity to a
twelve-language background corpus, which is the standard way to remove a language offset. Best case it kept 9 of 16
on-topic and still cited 5 of 72 off-topic. It was dropped: a mechanism that needs an extra embedding pass per turn
and still gets both sides wrong is not worth shipping.

## The rule

```
before  cosine >= 0.5 || bm25Terms >= 2 || (bm25Terms >= 1 && bm25 >= 2.0)
after   bm25Terms >= 2 || (bm25Terms >= 1 && (bm25 >= 2.0 || cosine >= 0.5))
```

The embedding may corroborate a shared word. It can no longer replace one. Same in strict mode and out of it — the
floor was already mode-independent. No new constant and no per-language table, because the measurement says there is
no number to put in one.

| | on-topic cited | off-topic cited |
|---|---|---|
| before | 56/57 | **85/102** |
| after | 29/57 | **0/102** |

**The margin is not a cosine, it is a whole word.** All 102 off-topic questions match **0** content terms of their
passage; every on-topic question still cited matches at least **1**. Nothing sits between them.

The cost is real and deliberate. 28 of the 57 on-topic questions were written as paraphrases that share no word with
the passage (*"Wie gross ist die Belegschaft?"* against a passage that says `Personen`). Those lose their citation
and get, outside strict mode, an answer with the strip that says the documents had nothing on the question — and in
strict mode "not found". A missed citation is an honest miss; a citation under an invented answer is the app lying
about the user's own file, which is what the phone kept doing.

## The second defect the measurement uncovered

`STOP` in `packages/core/src/rag/bm25.ts` held English and Hebrew function words only. Against the Spanish,
Portuguese, French and German documents, off-topic questions were matching on `el`, `de`, `la`, `le`, `se`, `von`,
`sich`, `dem` — F278's CJK-glue defect, in four of the eight launch locales, two of them clearing `bm25Terms >= 2`
on articles alone. The launch locales now have their own lists. Words whose spelling is a content word in another
launch locale (de `war`, `die`, `man`, `hat`; es `son`; fr `car`; pt `era`) are left out on purpose, so the list
cannot eat a real term of another language. `lexical-overlap.txt` is every question that still shares a word with
its passage after the change: they are all content words.

## The guards, and the red

| file | what it holds |
|---|---|
| `packages/core/test/fixtures/rag/cjk-cosines.json` | all 159 measured cosines, with their questions and passages, committed so the guard runs on real numbers |
| `packages/core/test/rag-relevance-floor.test.ts` | 9 cases: the 6T's own turn, every off-topic question in all 9 languages in both modes, the hardware-run on-topic turns, and the measured bands pinned from both sides |
| `packages/core/test/rag-cjk.test.ts` | the door F195/F278 could not see: the F278 block repeated with the cosine pinned **above** the floor, in ja/zh/ko/en, on and off topic, strict and not (20 new cases, 41 in the file) |
| `apps/mobile/src/documents/ragLog.test.ts` | the `[rag]` line carries both numbers and is not behind `__DEV__` |

| sabotage | red |
|---|---|
| `guard/red-A-old-floor-restored.txt` | the old floor put back: **12 failed** |
| `guard/red-B-cosine-corroboration-removed.txt` | the corroboration clause removed, so a single shared word no longer counts: **2 failed** |
| `guard/red-C-launch-locale-stopwords-removed.txt` | the de/es/pt/fr stop lists removed: **3 failed** |
| `guard/red-D-rag-line-behind-dev.txt` | the `[rag]` line put behind `__DEV__`: **1 failed** |

Both F195 and F278 stayed green through A, B and C, which is the point of F329.

## Why the tests were blind

Both earlier blocks build their hits with `cosine: DEFAULT_MIN_COSINE - 0.01`. That is what let them prove the
lexical half, and it is exactly why F282 walked past them: a floor with an `||` in it has two doors, and every case
in both blocks held one of them shut. The new file pins nothing — it uses the embedder's own numbers.

## The files

| file | what it is |
|---|---|
| `cosines.md` | the measurement written up: method, the bands per script, the cost table, the per-language breakdown |
| `measurements.txt` | one line per question: cosine, BM25 score, matched content terms |
| `lexical-overlap.txt` | every question that shares a word with its passage, and which words |
| `fixtures.json` | the 12 passages and 159 questions, with the source of each document |
| `embed.mjs` | reruns the embedding pass; needs `llama-embedding` and `.models/nomic-embed-text-v1.5.f16.gguf` |
| `rag-line-samples.txt` | both F282 turns as the new `[rag]` line would have printed them |
| `guard/` | the four reds |

## What this round did not do

**No device run.** The rule is proven on the embedder's real numbers and in unit tests, not on hardware. The next
Android or iOS pass should repeat F282's two Japanese turns and read the `[rag]` line for them: off-topic must print
`terms=0 … dropped` with no `SOURCES`, on-topic must print `KEPT` and cite. That line is the whole reason F328 is in
this round.

**Nothing was measured on a multi-chunk document.** Every fixture has one passage, because that is the case that
failed. *Round 70b measured it:* `multichunk.json`, seven six-chunk documents. The answer is in `centering.md` — the
recall the cosine half used to add there was the floor fencing the whole document, and the embedder ranks the right
chunk first 3 times in 21.
