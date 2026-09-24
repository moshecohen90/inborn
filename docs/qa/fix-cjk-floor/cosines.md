# The cosine half of the relevance floor, measured (F327)

Every number here comes from the embedder the app ships, `nomic-embed-text-v1.5.f16.gguf`, run off-device with
`llama-embedding --pooling mean --embd-normalize 2` and the app's own `search_document: ` / `search_query: `
prefixes, then put through `quantize()` and `cosineQuantized()` from `packages/core/src/rag/vector.ts`, so the
cosine is the one the phone computes. Measured 24.9.2026. `embed.mjs` reruns the embedding pass and
`packages/core/test/rag-cosines-measure.test.ts` (env-gated) recomputes this table and the committed fixture from it;
`fixtures.json` holds the texts.

12 one-passage documents, 9 languages, 57 on-topic and 102 off-topic questions. A one-passage document is the
case that fails: with a single chunk there is nothing to rank the passage against.

## Why no cosine floor was chosen

Only the questions that share **no** word with the passage are shown: those are the ones the cosine decides alone.

| script | on-topic, no shared word | off-topic, no shared word | a floor that separates them |
|---|---|---|---|
| CJK (ja, zh, ko) | 0.431 – 0.726 (12) | 0.395 – 0.716 (52) | none: the bands overlap |
| Latin (en, de, es, fr, pt) | 0.510 – 0.689 (14) | 0.338 – 0.655 (40) | none: the bands overlap |
| Hebrew | 0.655 – 0.728 (2) | 0.591 – 0.764 (10) | none: the bands overlap |

The 0.5 floor was calibrated on English, where unrelated text really does sit near 0.4. Asked in its own language,
a ja/zh/ko/he document scores every off-topic question between 0.527 and 0.764, so the number is measuring
the language and not the topic. There is no threshold to raise it to: in CJK the worst off-topic question outscores
10 of the 12 on-topic ones, and the single highest score in the whole zero-overlap set is an off-topic Hebrew question (0.764,
*"my child has a fever, what do I do?"* against a Hebrew annual report).

So the cosine became a corroborating bar: it can back a single shared word, it can no longer stand alone.

## What the change costs and buys

| | on-topic questions cited | off-topic questions cited |
|---|---|---|
| before (`cos >= 0.5 \|\| terms >= 2 \|\| (terms >= 1 && bm25 >= 2)`) | 56/57 | **85/102** |
| after (`terms >= 2 \|\| (terms >= 1 && (bm25 >= 2 \|\| cos >= 0.5))`) | 29/57 | **0/102** |

**Margin.** Not a cosine: a whole word. Every one of the 102 off-topic questions matches **0** content words of
its passage; every on-topic question that is still cited matches at least **1**. Nothing sits between them.

The on-topic set is adversarial on purpose — 28 of the 57 questions were written as paraphrases that share no
word with the passage (*"Wie gross ist die Belegschaft?"* against a passage that says `Personen`), which is why
the kept figure is what it is. Those questions now get an answer with the strip that says the documents had
nothing on them, instead of an invented answer under a citation.

## Per language

| language | on-topic cited | off-topic cited | documents |
|---|---|---|---|
| de | 0/3 | 0/6 | de-report |
| en | 4/10 | 0/16 | en-lease, en-report |
| es | 2/3 | 0/6 | es-report |
| fr | 0/3 | 0/6 | fr-report |
| he | 3/5 | 0/10 | he-report |
| ja | 8/14 | 0/24 | ja-device, ja-f278 |
| ko | 3/6 | 0/10 | ko-report |
| pt | 2/3 | 0/6 | pt-report |
| zh | 7/10 | 0/18 | zh-f195, zh-f278 |

## The second defect this uncovered

`STOP` in `packages/core/src/rag/bm25.ts` held English and Hebrew function words only. Against the Spanish,
Portuguese, French and German documents, off-topic questions were matching on `el`, `de`, `la`, `le`, `se`,
`von`, `sich`, `dem` — the same defect F278 fixed for CJK glue, in four of the eight launch locales. Two of them
cleared `bm25Terms >= 2` on articles alone. The launch locales now have their own lists; words whose spelling is
a content word in another launch locale (de `war`, `die`, `man`, `hat`; es `son`; fr `car`; pt `era`) are left
out on purpose. `lexical-overlap.txt` is every question that still shares a word with its passage.

## The full table

`measurements.txt`, one line per question: cosine, BM25 score, matched content terms.
