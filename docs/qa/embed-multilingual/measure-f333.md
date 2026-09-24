# Every multilingual embedder llama.rn can run, measured (F333) — round-70 fixture set, frozen

Kept as measured in round 72. Since round 81 (F363) the fixtures carry accented de/fr/es/pt and zh-Hant documents; the shipped
embedder and the nomic baseline are re-measured on that set in `measure.md`. The other 20 candidates were not re-run.

Same two fixture sets, same scorer, same quantized cosine as round 70 (`docs/qa/fix-cjk-floor`): 12 one-passage
documents with 57 on-topic and 102 off-topic questions, and 7 six-chunk documents with 21 and 42. Each model runs
with the prefixes and pooling its authors trained it with, through llama.cpp's `llama-embedding`, then through
`quantize()`/`cosineQuantized()` from `packages/core/src/rag/vector.ts`, so the cosine is the phone's cosine.
Regenerate: `node docs/qa/embed-multilingual/embed-candidates.mjs /tmp/multi` then the env-gated
`packages/core/test/rag-multilingual-measure.test.ts`.

## The bar

Ranks the answering chunk first for at least 18 of 21, **and** some cosine threshold T gives at least 50 of 57
on-topic questions a citation with 0 of 102 off-topic ones. Nothing below that ships.

## Multi-chunk ranking — the measurement that decides it

For how many of the 21 on-topic questions is the chunk that answers the question the embedder's top chunk?

| candidate | pooling | answering chunk first | de | en | fr | he | ja | ko | zh |
|---|---|---|---|---|---|---|---|---|---|
| nomic-v1.5 | mean | **3/21** | 0/3 | 2/3 | 0/3 | 0/3 | 1/3 | 0/3 | 0/3 |
| e5-small | mean | **0/21** | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 |
| pmini | mean | **12/21** | 2/3 | 2/3 | 1/3 | 2/3 | 1/3 | 1/3 | 3/3 |
| e5-base | mean | **15/21** | 3/3 | 3/3 | 2/3 | 2/3 | 2/3 | 1/3 | 2/3 |
| nomic-v2-moe | mean | **17/21** | 3/3 | 2/3 | 1/3 | 3/3 | 2/3 | 3/3 | 3/3 |
| nomic-v2-moe-q4 | mean | **18/21** | 3/3 | 2/3 | 1/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| qwen3-emb+last | last | **17/21** | 3/3 | 1/3 | 3/3 | 3/3 | 3/3 | 2/3 | 2/3 |
| qwen3-emb+mean | mean | **15/21** | 3/3 | 0/3 | 3/3 | 0/3 | 3/3 | 3/3 | 3/3 |
| bge-m3+cls | cls | **7/21** | 1/3 | 2/3 | 0/3 | 1/3 | 2/3 | 0/3 | 1/3 |
| bge-m3+mean | mean | **15/21** | 3/3 | 1/3 | 2/3 | 3/3 | 3/3 | 1/3 | 2/3 |
| bge-m3-q4 | cls | **6/21** | 2/3 | 1/3 | 0/3 | 1/3 | 1/3 | 0/3 | 1/3 |
| granite-278m+cls | cls | **18/21** | 3/3 | 3/3 | 3/3 | 3/3 | 2/3 | 1/3 | 3/3 |
| granite-278m+mean | mean | **17/21** | 2/3 | 2/3 | 3/3 | 2/3 | 3/3 | 2/3 | 3/3 |
| granite-278m-q8 | cls | **18/21** | 3/3 | 3/3 | 3/3 | 3/3 | 2/3 | 1/3 | 3/3 |
| e5-large | mean | **19/21** | 3/3 | 3/3 | 3/3 | 3/3 | 2/3 | 3/3 | 2/3 |
| arctic-l-v2+cls | cls | **15/21** | 2/3 | 2/3 | 2/3 | 3/3 | 2/3 | 2/3 | 2/3 |
| arctic-l-v2+mean | mean | **14/21** | 2/3 | 1/3 | 2/3 | 3/3 | 2/3 | 2/3 | 2/3 |
| embgemma | mean | **14/21** | 2/3 | 2/3 | 1/3 | 2/3 | 2/3 | 2/3 | 3/3 |
| bge-m3-f16 | mean | **15/21** | 3/3 | 1/3 | 2/3 | 3/3 | 3/3 | 1/3 | 2/3 |
| e5-large-inst | mean | **20/21** | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 2/3 |
| e5-large-inst-q6 | mean | **20/21** | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 2/3 |
| e5-large-inst-q4 | mean | **19/21** | 3/3 | 3/3 | 2/3 | 3/3 | 3/3 | 2/3 | 3/3 |

## The relevance door, one-passage documents

`rule 70` is what ships: the cosine may only corroborate a shared word. `cos ≥ T` re-opens the cosine-alone branch
at the highest T no off-topic question reaches, so the extra recall costs no false citation by construction; `margin`
is the gap between T and the lowest on-topic cosine it lets through.

| candidate | rule 70 on | rule 70 off | T | +cos>T on | +cos>T off | margin |
|---|---|---|---|---|---|---|
| nomic-v1.5 | 29/57 | 0/102 | 0.764 | **29/57** | 0/102 | 0 |
| e5-small | 29/57 | 0/102 | 0.9491 | **30/57** | 0/102 | 0.0024 |
| pmini | 19/57 | 0/102 | 0.3955 | **36/57** | 0/102 | 0.0072 |
| e5-base | 29/57 | 0/102 | 0.8206 | **36/57** | 0/102 | 0.006 |
| nomic-v2-moe | 17/57 | 0/102 | 0.2826 | **47/57** | 0/102 | 0.0033 |
| nomic-v2-moe-q4 | 17/57 | 0/102 | 0.2853 | **45/57** | 0/102 | 0.0118 |
| qwen3-emb+last | 21/57 | 0/102 | 0.4076 | **46/57** | 0/102 | 0.0111 |
| qwen3-emb+mean | 29/57 | 0/102 | 0.6654 | **30/57** | 0/102 | 0.035 |
| bge-m3+cls | 24/57 | 0/102 | 0.4009 | **51/57** | 0/102 | 0.0169 |
| bge-m3+mean | 29/57 | 0/102 | 0.6623 | **55/57** | 0/102 | 0.0141 |
| bge-m3-q4 | 25/57 | 0/102 | 0.4136 | **53/57** | 0/102 | 0.0032 |
| granite-278m+cls | 29/57 | 0/102 | 0.7494 | **35/57** | 0/102 | 0.0021 |
| granite-278m+mean | 29/57 | 0/102 | 0.7345 | **33/57** | 0/102 | 0.0066 |
| granite-278m-q8 | 29/57 | 0/102 | 0.7495 | **35/57** | 0/102 | 0.0021 |
| e5-large | 29/57 | 0/102 | 0.8151 | **38/57** | 0/102 | 0.0001 |
| arctic-l-v2+cls | 16/57 | 0/102 | 0.2577 | **40/57** | 0/102 | 0.006 |
| arctic-l-v2+mean | 15/57 | 0/102 | 0.3692 | **26/57** | 0/102 | 0.0011 |
| embgemma | 18/57 | 0/102 | 0.2351 | **52/57** | 0/102 | 0.0018 |
| bge-m3-f16 | 29/57 | 0/102 | 0.6629 | **55/57** | 0/102 | 0.0126 |
| e5-large-inst | 29/57 | 0/102 | 0.8164 | **52/57** | 0/102 | 0.0036 |
| e5-large-inst-q6 | 29/57 | 0/102 | 0.8176 | **52/57** | 0/102 | 0.0004 |
| e5-large-inst-q4 | 29/57 | 0/102 | 0.8466 | **47/57** | 0/102 | 0.0025 |

## The threshold that could actually ship

The table above picks T on the one-passage set alone, which is how the round-72 bar is written. But the phone runs
one door over every document, and a six-chunk document offers the same question six cosines instead of one, so a T
tuned on one-passage documents lets off-topic questions through on multi-chunk ones. `T joint` is the highest
threshold that cites **nothing** off-topic in either set — the only one that could be shipped.

| candidate | T joint | on-topic 1-passage | off | multi-chunk on-topic | right | wrong only | multi off |
|---|---|---|---|---|---|---|---|
| nomic-v1.5 | 0.7645 | **29/57** | 0/102 | 4/21 | 3 | 1 | 3/42 |
| e5-small | 0.9491 | **30/57** | 0/102 | 5/21 | 4 | 1 | 3/42 |
| pmini | 0.3955 | **36/57** | 0/102 | 9/21 | 7 | 2 | 0/42 |
| e5-base | 0.8206 | **36/57** | 0/102 | 8/21 | 7 | 1 | 3/42 |
| nomic-v2-moe | 0.2826 | **47/57** | 0/102 | 14/21 | 14 | 0 | 0/42 |
| nomic-v2-moe-q4 | 0.2853 | **45/57** | 0/102 | 15/21 | 14 | 1 | 0/42 |
| qwen3-emb+last | 0.4077 | **46/57** | 0/102 | 14/21 | 12 | 2 | 0/42 |
| qwen3-emb+mean | 0.6753 | **30/57** | 0/102 | 4/21 | 3 | 1 | 2/42 |
| bge-m3+cls | 0.4119 | **51/57** | 0/102 | 17/21 | 14 | 3 | 0/42 |
| bge-m3+mean | 0.6788 | **54/57** | 0/102 | 20/21 | 19 | 1 | 3/42 |
| bge-m3-q4 | 0.4357 | **49/57** | 0/102 | 16/21 | 12 | 4 | 0/42 |
| granite-278m+cls | 0.7495 | **35/57** | 0/102 | 5/21 | 4 | 1 | 2/42 |
| granite-278m+mean | 0.7345 | **33/57** | 0/102 | 4/21 | 3 | 1 | 3/42 |
| granite-278m-q8 | 0.7497 | **35/57** | 0/102 | 5/21 | 4 | 1 | 2/42 |
| e5-large | 0.8151 | **38/57** | 0/102 | 9/21 | 8 | 1 | 3/42 |
| arctic-l-v2+cls | 0.2577 | **40/57** | 0/102 | 8/21 | 8 | 0 | 0/42 |
| arctic-l-v2+mean | 0.3692 | **26/57** | 0/102 | 3/21 | 3 | 0 | 0/42 |
| embgemma | 0.2823 | **46/57** | 0/102 | 11/21 | 10 | 1 | 0/42 |
| bge-m3-f16 | 0.6798 | **54/57** | 0/102 | 20/21 | 19 | 1 | 3/42 |
| e5-large-inst | 0.8164 | **52/57** | 0/102 | 18/21 | 18 | 0 | 3/42 |
| e5-large-inst-q6 | 0.8176 | **52/57** | 0/102 | 19/21 | 19 | 0 | 3/42 |
| e5-large-inst-q4 | 0.8466 | **47/57** | 0/102 | 15/21 | 15 | 0 | 3/42 |

## Per language, on-topic cited under `rule 70 OR cos > T joint`

| candidate | de | en | es | fr | he | ja | ko | pt | zh |
|---|---|---|---|---|---|---|---|---|---|
| nomic-v1.5 | 0/3 | 4/10 | 2/3 | 0/3 | 3/5 | 8/14 | 3/6 | 2/3 | 7/10 |
| e5-small | 0/3 | 4/10 | 2/3 | 0/3 | 3/5 | 8/14 | 4/6 | 2/3 | 7/10 |
| pmini | 0/3 | 3/10 | 0/3 | 1/3 | 5/5 | 12/14 | 3/6 | 2/3 | 10/10 |
| e5-base | 0/3 | 4/10 | 2/3 | 1/3 | 4/5 | 10/14 | 3/6 | 2/3 | 10/10 |
| nomic-v2-moe | 2/3 | 6/10 | 1/3 | 1/3 | 5/5 | 13/14 | 6/6 | 3/3 | 10/10 |
| nomic-v2-moe-q4 | 2/3 | 6/10 | 1/3 | 1/3 | 5/5 | 13/14 | 6/6 | 2/3 | 9/10 |
| qwen3-emb+last | 2/3 | 9/10 | 2/3 | 2/3 | 4/5 | 11/14 | 4/6 | 2/3 | 10/10 |
| qwen3-emb+mean | 0/3 | 4/10 | 2/3 | 0/3 | 3/5 | 9/14 | 3/6 | 2/3 | 7/10 |
| bge-m3+cls | 2/3 | 9/10 | 2/3 | 2/3 | 5/5 | 13/14 | 5/6 | 3/3 | 10/10 |
| bge-m3+mean | 3/3 | 10/10 | 2/3 | 2/3 | 5/5 | 14/14 | 5/6 | 3/3 | 10/10 |
| bge-m3-q4 | 2/3 | 8/10 | 2/3 | 2/3 | 5/5 | 12/14 | 5/6 | 3/3 | 10/10 |
| granite-278m+cls | 0/3 | 4/10 | 2/3 | 1/3 | 3/5 | 11/14 | 3/6 | 2/3 | 9/10 |
| granite-278m+mean | 0/3 | 4/10 | 2/3 | 0/3 | 3/5 | 11/14 | 3/6 | 2/3 | 8/10 |
| granite-278m-q8 | 0/3 | 4/10 | 2/3 | 1/3 | 3/5 | 11/14 | 3/6 | 2/3 | 9/10 |
| e5-large | 1/3 | 5/10 | 2/3 | 1/3 | 4/5 | 10/14 | 3/6 | 2/3 | 10/10 |
| arctic-l-v2+cls | 1/3 | 6/10 | 1/3 | 1/3 | 4/5 | 12/14 | 4/6 | 1/3 | 10/10 |
| arctic-l-v2+mean | 0/3 | 4/10 | 0/3 | 0/3 | 3/5 | 10/14 | 2/6 | 1/3 | 6/10 |
| embgemma | 1/3 | 9/10 | 1/3 | 1/3 | 4/5 | 12/14 | 5/6 | 3/3 | 10/10 |
| bge-m3-f16 | 3/3 | 10/10 | 2/3 | 2/3 | 5/5 | 14/14 | 5/6 | 3/3 | 10/10 |
| e5-large-inst | 3/3 | 9/10 | 2/3 | 1/3 | 5/5 | 13/14 | 6/6 | 3/3 | 10/10 |
| e5-large-inst-q6 | 3/3 | 8/10 | 2/3 | 2/3 | 5/5 | 13/14 | 6/6 | 3/3 | 10/10 |
| e5-large-inst-q4 | 2/3 | 7/10 | 2/3 | 1/3 | 5/5 | 12/14 | 6/6 | 2/3 | 10/10 |

## Size, licence and cost

`ms/text` is wall clock on this Mac (M-series, Metal) over the whole 400-text pass including model load, a proxy
for the phone, not a phone number.

| candidate | family | arch | params | dim | file | licence | ms/text | source |
|---|---|---|---|---|---|---|---|---|
| nomic-v1.5 | nomic-embed-text-v1.5 | nomic-bert | 137M | 768 | 274 MB | Apache-2.0 | 3.63 | `nomic-ai/nomic-embed-text-v1.5-GGUF` |
| e5-small | multilingual-e5-small | bert | 118M | 384 | 242 MB | MIT | 4.11 | `keisuke-miyako/multilingual-e5-small-gguf-f16/multilingual-e5-small-F16.gguf` |
| pmini | paraphrase-multilingual-MiniLM-L12-v2 | bert | 118M | 384 | 242 MB | Apache-2.0 | 5.58 | `mykor/paraphrase-multilingual-MiniLM-L12-v2.gguf/paraphrase-multilingual-MiniLM-L12-118M-v2-F16.gguf` |
| e5-base | multilingual-e5-base | bert | 278M | 768 | 563 MB | MIT | 7.12 | `yixuan-chia/multilingual-e5-base-gguf/multilingual-e5-base-F16.gguf` |
| nomic-v2-moe | nomic-embed-text-v2-moe | nomic-bert-moe | 475M (305M active) | 768 | 512 MB | Apache-2.0 | 7.28 | `nomic-ai/nomic-embed-text-v2-moe-GGUF/nomic-embed-text-v2-moe.Q8_0.gguf` |
| nomic-v2-moe-q4 | nomic-embed-text-v2-moe | nomic-bert-moe | 475M (305M active) | 768 | 344 MB | Apache-2.0 | 7.24 | `nomic-ai/nomic-embed-text-v2-moe-GGUF/nomic-embed-text-v2-moe.Q4_K_M.gguf` |
| qwen3-emb+last | Qwen3-Embedding-0.6B | qwen3 | 596M | 1024 | 639 MB | Apache-2.0 | 11.27 | `Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf` |
| qwen3-emb+mean | Qwen3-Embedding-0.6B | qwen3 | 596M | 1024 | 639 MB | Apache-2.0 | 10.13 | `Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf` |
| bge-m3+cls | bge-m3 | bert | 568M | 1024 | 635 MB | MIT | 8.95 | `gpustack/bge-m3-GGUF/bge-m3-Q8_0.gguf` |
| bge-m3+mean | bge-m3 | bert | 568M | 1024 | 635 MB | MIT | 8.22 | `gpustack/bge-m3-GGUF/bge-m3-Q8_0.gguf` |
| bge-m3-q4 | bge-m3 | bert | 568M | 1024 | 438 MB | MIT | 9.36 | `gpustack/bge-m3-GGUF/bge-m3-Q4_K_M.gguf` |
| granite-278m+cls | granite-embedding-278m-multilingual | bert | 278M | 768 | 563 MB | Apache-2.0 | 20.43 | `bartowski/granite-embedding-278m-multilingual-GGUF/granite-embedding-278m-multilingual-f16.gguf` |
| granite-278m+mean | granite-embedding-278m-multilingual | bert | 278M | 768 | 563 MB | Apache-2.0 | 15.88 | `bartowski/granite-embedding-278m-multilingual-GGUF/granite-embedding-278m-multilingual-f16.gguf` |
| granite-278m-q8 | granite-embedding-278m-multilingual | bert | 278M | 768 | 303 MB | Apache-2.0 | 17.36 | `bartowski/granite-embedding-278m-multilingual-GGUF/granite-embedding-278m-multilingual-Q8_0.gguf` |
| e5-large | multilingual-e5-large | bert | 560M | 1024 | 1126 MB | MIT | 18.03 | `phate334/multilingual-e5-large-gguf/multilingual-e5-large-f16.gguf` |
| arctic-l-v2+cls | snowflake-arctic-embed-l-v2.0 | bert | 568M | 1024 | 635 MB | Apache-2.0 | 18.86 | `Casual-Autopsy/snowflake-arctic-embed-l-v2.0-gguf/snowflake-arctic-embed-l-v2.0-q8_0.gguf` |
| arctic-l-v2+mean | snowflake-arctic-embed-l-v2.0 | bert | 568M | 1024 | 635 MB | Apache-2.0 | 17.19 | `Casual-Autopsy/snowflake-arctic-embed-l-v2.0-gguf/snowflake-arctic-embed-l-v2.0-q8_0.gguf` |
| embgemma | EmbeddingGemma-300M | gemma-embedding | 308M | 768 | 334 MB | Gemma Terms of Use (NOT Apache/MIT — cannot ship) | 14.56 | `ggml-org/embeddinggemma-300M-GGUF/embeddinggemma-300M-Q8_0.gguf` |
| bge-m3-f16 | bge-m3 | bert | 568M | 1024 | 1158 MB | MIT | 29.73 | `gpustack/bge-m3-GGUF/bge-m3-FP16.gguf` |
| e5-large-inst | multilingual-e5-large-instruct | bert | 560M | 1024 | 603 MB | MIT | 22.51 | `Ralriki/multilingual-e5-large-instruct-GGUF/multilingual-e5-large-instruct-q8_0.gguf` |
| e5-large-inst-q6 | multilingual-e5-large-instruct | bert | 560M | 1024 | 468 MB | MIT | 38.99 | `Ralriki/multilingual-e5-large-instruct-GGUF/multilingual-e5-large-instruct-q6_k.gguf` |
| e5-large-inst-q4 | multilingual-e5-large-instruct | bert | 560M | 1024 | 406 MB | MIT | 48.27 | `Ralriki/multilingual-e5-large-instruct-GGUF/multilingual-e5-large-instruct-q4_k_m.gguf` |

## What passes the bar

| candidate | answering chunk first | on-topic | off-topic | wrong-only citations | file |
|---|---|---|---|---|---|
| e5-large-inst | 20/21 | 52/57 | 0/102 | 0 | 603 MB |
| e5-large-inst-q6 | 20/21 | 52/57 | 0/102 | 0 | 468 MB |

## Everything at the shipped threshold, cos > 0.82

A round number, chosen above the highest off-topic cosine of **both** quantizations of the winner, so a requant
cannot move it under the door. This is the row the guard asserts.

| candidate | on-topic | off-topic | multi-chunk on-topic | right | wrong only | multi off-topic |
|---|---|---|---|---|---|---|
| nomic-v1.5 | **29/57** | 0/102 | 4/21 | 3 | 1 | 3/42 |
| e5-small | **56/57** | 100/102 | 21/21 | 21 | 0 | 42/42 |
| pmini | **19/57** | 0/102 | 2/21 | 2 | 0 | 0/42 |
| e5-base | **36/57** | 1/102 | 8/21 | 7 | 1 | 3/42 |
| nomic-v2-moe | **17/57** | 0/102 | 1/21 | 1 | 0 | 0/42 |
| nomic-v2-moe-q4 | **17/57** | 0/102 | 1/21 | 1 | 0 | 0/42 |
| qwen3-emb+last | **21/57** | 0/102 | 2/21 | 2 | 0 | 0/42 |
| qwen3-emb+mean | **29/57** | 0/102 | 4/21 | 3 | 1 | 2/42 |
| bge-m3+cls | **24/57** | 0/102 | 2/21 | 2 | 0 | 0/42 |
| bge-m3+mean | **30/57** | 0/102 | 4/21 | 3 | 1 | 3/42 |
| bge-m3-q4 | **25/57** | 0/102 | 2/21 | 2 | 0 | 0/42 |
| granite-278m+cls | **30/57** | 0/102 | 4/21 | 3 | 1 | 2/42 |
| granite-278m+mean | **29/57** | 0/102 | 4/21 | 3 | 1 | 3/42 |
| granite-278m-q8 | **30/57** | 0/102 | 4/21 | 3 | 1 | 2/42 |
| e5-large | **37/57** | 0/102 | 8/21 | 6 | 2 | 3/42 |
| arctic-l-v2+cls | **16/57** | 0/102 | 1/21 | 1 | 0 | 0/42 |
| arctic-l-v2+mean | **15/57** | 0/102 | 1/21 | 1 | 0 | 0/42 |
| embgemma | **18/57** | 0/102 | 2/21 | 2 | 0 | 0/42 |
| bge-m3-f16 | **30/57** | 0/102 | 4/21 | 3 | 1 | 3/42 |
| e5-large-inst | **51/57** | 0/102 | 17/21 | 17 | 0 | 3/42 |
| e5-large-inst-q6 | **51/57** | 0/102 | 18/21 | 18 | 0 | 3/42 |
| e5-large-inst-q4 | **54/57** | 6/102 | 19/21 | 19 | 0 | 9/42 |

## Headroom above the fitted threshold

`T joint` is fitted at the highest off-topic cosine in 144 questions, so it has **no** headroom by construction:
one unseen off-topic question above it would be cited. This is what buying headroom costs the passing candidates.

| candidate | T+0 | T+0.01 | T+0.02 | T+0.03 | T+0.05 |
|---|---|---|---|---|---|
| e5-large-inst | 52/57, 0 off | 49/57, 0 off | 46/57, 0 off | 42/57, 0 off | 35/57, 0 off |
| e5-large-inst-q6 | 52/57, 0 off | 49/57, 0 off | 46/57, 0 off | 43/57, 0 off | 35/57, 0 off |

## What this changes

The shipped embedder answers document questions in English and, outside it, measures the language rather than the
topic. That is the whole of round 70 and round 70b: German 0/3, French 0/3, and the answering chunk ranked first for
3 of 21 questions. It is not a floor that can be tuned — `nomic-embed-text-v1.5` is Nomic's **English** model.

An embedder trained on 100 languages fixes it at the source. The winner ranks the answering chunk first for 20 of 21
questions, 3/3 in German, French, Hebrew, Japanese and Korean, and **never** cites a wrong chunk while citing no
right one. The cosine can stand on its own again, which is what round 70 had to give up.

Two things this does not fix, both pre-existing and unchanged by the swap:

1. Three of the 42 off-topic multi-chunk questions are still cited. Every one is cited by the **lexical** half —
   an off-topic question that happens to share two content words with a chunk of the same company report. The
   shipped embedder cites the same three. The cosine door adds none.
2. The threshold is fitted, not derived. It sits above the highest off-topic cosine in 144 questions with a few
   thousandths of headroom, and the table above prices more.

