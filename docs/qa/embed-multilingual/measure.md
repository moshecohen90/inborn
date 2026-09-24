# Every multilingual embedder llama.rn can run, measured (F333)

Same two fixture sets, same scorer, same quantized cosine as round 70 (`docs/qa/fix-cjk-floor`): 14 one-passage
documents with 89 on-topic and 143 off-topic questions, and 8 six-chunk documents with 27 and 54. Each model runs
with the prefixes and pooling its authors trained it with, through llama.cpp's `llama-embedding`, then through
`quantize()`/`cosineQuantized()` from `packages/core/src/rag/vector.ts`, so the cosine is the phone's cosine.
Regenerate: `node docs/qa/embed-multilingual/embed-candidates.mjs /tmp/multi` then the env-gated
`packages/core/test/rag-multilingual-measure.test.ts`.

Since round 81 (F363) the German, French, Spanish and Portuguese documents and questions are typed with their accents,
the round-70 accent-less questions are kept as typing variants (columns marked "(no accents)"), and zh-Hant, the
launch locale, has its own documents beside the Simplified ones. The 22-candidate comparison that picked the embedder
was measured on the round-70 set and is kept as it was in `measure-f333.md`.

## The bar

Ranks the answering chunk first for at least 24 of 27, **and** some cosine threshold T gives at least 79 of 89
on-topic questions a citation with 0 of 143 off-topic ones. Nothing below that ships.

## Multi-chunk ranking — the measurement that decides it

For how many of the 27 on-topic questions is the chunk that answers the question the embedder's top chunk?

| candidate | pooling | answering chunk first | de | de (no accents) | en | fr | fr (no accents) | he | ja | ko | zh | zh-Hant |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| nomic-v1.5 | mean | **3/27** | 0/3 | 0/2 | 2/3 | 0/3 | 0/1 | 0/3 | 1/3 | 0/3 | 0/3 | 0/3 |
| e5-large-inst-q6 | mean | **25/27** | 3/3 | 2/2 | 3/3 | 3/3 | 1/1 | 3/3 | 3/3 | 3/3 | 2/3 | 2/3 |

## The relevance door, one-passage documents

`rule 70` is what ships: the cosine may only corroborate a shared word. `cos ≥ T` re-opens the cosine-alone branch
at the highest T no off-topic question reaches, so the extra recall costs no false citation by construction; `margin`
is the gap between T and the lowest on-topic cosine it lets through.

| candidate | rule 70 on | rule 70 off | T | +cos>T on | +cos>T off | margin |
|---|---|---|---|---|---|---|
| nomic-v1.5 | 45/89 | 0/143 | 0.7642 | **45/89** | 0/143 | 0 |
| e5-large-inst-q6 | 45/89 | 0/143 | 0.8177 | **83/89** | 0/143 | 0.0006 |

## The threshold that could actually ship

The table above picks T on the one-passage set alone, which is how the round-72 bar is written. But the phone runs
one door over every document, and a six-chunk document offers the same question six cosines instead of one, so a T
tuned on one-passage documents lets off-topic questions through on multi-chunk ones. `T joint` is the highest
threshold that cites **nothing** off-topic in either set — the only one that could be shipped.

| candidate | T joint | on-topic 1-passage | off | multi-chunk on-topic | right | wrong only | multi off |
|---|---|---|---|---|---|---|---|
| nomic-v1.5 | 0.7643 | **45/89** | 0/143 | 5/27 | 4 | 1 | 3/54 |
| e5-large-inst-q6 | 0.8177 | **83/89** | 0/143 | 25/27 | 25 | 0 | 3/54 |

## Per language, on-topic cited under `rule 70 OR cos > T joint`

| candidate | de | de (no accents) | en | es | es (no accents) | fr | fr (no accents) | he | ja | ko | pt | pt (no accents) | zh | zh-Hant |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| nomic-v1.5 | 0/5 | 2/4 | 4/10 | 1/5 | 2/4 | 1/6 | 1/2 | 3/5 | 8/14 | 3/6 | 3/5 | 2/3 | 7/10 | 8/10 |
| e5-large-inst-q6 | 5/5 | 4/4 | 8/10 | 4/5 | 3/4 | 6/6 | 1/2 | 5/5 | 13/14 | 6/6 | 5/5 | 3/3 | 10/10 | 10/10 |

## Per language, on-topic cited by the lexical rule alone (`rule 70`)

The half of the door the word index decides, so a change to the tokenizer shows here and nowhere else. Since round 84
(F367) accents are folded on both sides, and each de/fr/es/pt document has one accent-less question whose only shared
word is accented in the passage. Since round 85 (F368) an umlaut typed as ae/oe/ue and a word behind an elided article
("d'Aoba") are found too; de-report and fr-report each have one question whose only shared word is spelled that way.

| candidate | de | de (no accents) | en | es | es (no accents) | fr | fr (no accents) | he | ja | ko | pt | pt (no accents) | zh | zh-Hant |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| nomic-v1.5 | 0/5 | 2/4 | 4/10 | 1/5 | 2/4 | 1/6 | 1/2 | 3/5 | 8/14 | 3/6 | 3/5 | 2/3 | 7/10 | 8/10 |
| e5-large-inst-q6 | 0/5 | 2/4 | 4/10 | 1/5 | 2/4 | 1/6 | 1/2 | 3/5 | 8/14 | 3/6 | 3/5 | 2/3 | 7/10 | 8/10 |

## Size, licence and cost

`ms/text` is wall clock on this Mac (M-series, Metal) over the whole 375-text pass including model load, a proxy
for the phone, not a phone number.

| candidate | family | arch | params | dim | file | licence | ms/text | source |
|---|---|---|---|---|---|---|---|---|
| nomic-v1.5 | nomic-embed-text-v1.5 | nomic-bert | 137M | 768 | 274 MB | Apache-2.0 | 4.3 | `nomic-ai/nomic-embed-text-v1.5-GGUF` |
| e5-large-inst-q6 | multilingual-e5-large-instruct | bert | 560M | 1024 | 468 MB | MIT | 14.2 | `Ralriki/multilingual-e5-large-instruct-GGUF/multilingual-e5-large-instruct-q6_k.gguf` |

## What passes the bar

| candidate | answering chunk first | on-topic | off-topic | wrong-only citations | file |
|---|---|---|---|---|---|
| e5-large-inst-q6 | 25/27 | 83/89 | 0/143 | 0 | 468 MB |

## Everything at the shipped threshold, cos > 0.82

A round number, chosen above the highest off-topic cosine of **both** quantizations of the winner, so a requant
cannot move it under the door. This is the row the guard asserts.

| candidate | on-topic | off-topic | multi-chunk on-topic | right | wrong only | multi off-topic |
|---|---|---|---|---|---|---|
| nomic-v1.5 | **45/89** | 0/143 | 5/27 | 4 | 1 | 3/54 |
| e5-large-inst-q6 | **81/89** | 0/143 | 25/27 | 25 | 0 | 3/54 |

## Headroom above the fitted threshold

`T joint` is fitted at the highest off-topic cosine in 197 questions, so it has **no** headroom by construction:
one unseen off-topic question above it would be cited. This is what buying headroom costs the passing candidates.

| candidate | T+0 | T+0.01 | T+0.02 | T+0.03 | T+0.05 |
|---|---|---|---|---|---|
| e5-large-inst-q6 | 83/89, 0 off | 77/89, 0 off | 73/89, 0 off | 67/89, 0 off | 53/89, 0 off |

## What this changes

The per-language table is the answer to round 81: the accented columns are what a user with a proper keyboard types,
the "(no accents)" columns are the same questions typed the way round 70 typed them, and zh-Hant is the launch locale.

Since round 84 (F367) the word index folds accents on both sides, so an accent-less question meets its accented passage;
the lexical-only table is where that shows. The "sieges" question still waits on its cosine, because its passage says "bureaux".
Since round 85 (F368) German typed with ae/oe/ue meets ä/ö/ü and French/Italian/Catalan elided articles are glue;
the rejected German option, a query-side fold, is measured in `docs/qa/fix-elision-umlaut/options.md`.

For e5-large-inst-q6, the highest off-topic cosine the lexical rule does not already cite is 0.8177 over 197
off-topic questions, 0.0023 under the shipped door of 0.82, so the door stays where it is.
3 of the 54 off-topic multi-chunk questions are cited; `rag-multilingual-guard.test.ts` asserts every one
is cited by the lexical half, never by the cosine.

