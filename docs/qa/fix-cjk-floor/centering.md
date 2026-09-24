# Can a centred cosine win the recall back? No (F330–F332)

Round 70 closed the cosine-only door and cost 28 of 57 on-topic questions their citation, German and French all
three. Round 70b was asked to give the cosine a topic signal instead of an absolute threshold: centre it against a
per-script bank of neutral sentences, or against the document's own chunk distribution. The bar was **≥ 50/57
on-topic with 0/102 off-topic, and a stated margin**.

Neither works. The best variant reaches **35/57**. And the measurement turned up the reason, which is not the floor.

## (a) Centring against a per-script null bank

Ninety neutral sentences, ten per language, written for this measurement (`nullbank.json`) — each says as little as a
grammatical sentence can, so a question's similarity to them measures language affinity and nothing else. They are
embedded with the document prefix, since they stand in for a passage. Banks are grouped by script the way a shipped
bank would be: `ja`, `zh`, `ko`, `he`, and one `latin` bank of the five Latin-script launch locales.

Scores, on the 28 on-topic and 102 off-topic questions that share no word with their passage:

| score | highest off-topic | T that cites no off-topic question | on-topic kept at that T | margin |
|---|---|---|---|---|
| raw cosine | 0.764 | > 0.764 | **0 / 28** | — |
| cos − mean(bank of the script) | 0.209 | > 0.209 | **0 / 28** | — |
| the same, z-scored by the bank's spread | 5.482 | > 5.482 | **6 / 28** | +0.466 z |
| cos − mean(bank of the language) | 0.145 | > 0.145 | 5 / 28 | +0.016 |
| cos − max(bank of the script) | 0.093 | > 0.093 | 4 / 28 | +0.003 |
| cos − mean(all 90) | 0.272 | > 0.272 | 1 / 28 | +0.002 |

Also tried, and worse: choosing the bank by which one the passage itself is closest to (the embedder picking its own
script, 2/28 — and it picks `ja` for the English, German, Spanish, French and Portuguese passages); removing the
bank's mean direction from both vectors before the cosine (3/28); removing the bank's first, or first two, principal
directions (0/28, i.e. no better than raw). The full per-question numbers are in `centering-measurements.txt`.

**The one variant with a real margin, the z-score, takes the rule from 29/57 to 35/57.** Fifteen on-topic questions
short of the bar, so no T was picked and the round-70 rule stands.

## (b) Centring within the document

Seven six-chunk documents (`multichunk.json`), one per language, each chunk a different aspect of the same company
report so that exactly one chunk answers each on-topic question and five are same-language distractors. 21 on-topic
and 42 off-topic questions.

| score | on-topic kept with no off-topic cited |
|---|---|
| top chunk's cosine | 0 / 18 |
| top minus the document's median | **0 / 18** |
| z of the top within the document | **0 / 18** |
| top minus second | **0 / 18** |

## Why, and this is the finding that settles it

**On a six-chunk document the embedder ranks the answering chunk first for 3 of the 21 on-topic questions.** Not
"ranks it a little low" — it prefers a different chunk of the same document:

| question | chunk the embedder ranks first | the chunk that answers it |
|---|---|---|
| *Wie gross ist die Belegschaft?* | turnover | headcount |
| *Combien de gens y travaillent?* | product ranges | headcount |
| *כמה אנשים מועסקים שם?* | product ranges | headcount |
| *종업원은 모두 몇 사람인가요?* | environment 2030 | headcount |
| *公司一共有多少人在工作？* | environment 2030 | headcount |
| *What is the total headcount?* | turnover | headcount |

German 0/3, French 0/3, Hebrew 0/3, Korean 0/3, Chinese 0/3, Japanese 1/3, English 2/3.

So the 28 citations round 70 gave up were not citations of the right passage waiting to be let through. Handing
those questions back to the cosine cites the **wrong** chunk. Sweeping the extra door over this set:

| rule | on-topic cited | of those, the right chunk | only wrong chunks | off-topic cited |
|---|---|---|---|---|
| round 69 (cosine door open) | 21/21 | 21 | 0 | 37/42 |
| **round 70 (shipped)** | 4/21 | 3 | 1 | **3/42** |
| round 70 OR cos ≥ 0.70 | 8/21 | 5 | 3 | 11/42 |
| round 70 OR cos ≥ 0.75 | 5/21 | 3 | 2 | 5/42 |
| round 70 OR cos ≥ 0.80 | 4/21 | 3 | 1 | 3/42 |

Round 69's 21/21 is not retrieval working. Its floor fenced **5.48 of the 6 chunks per question on average, the whole
document on 17 of 21 on-topic questions and on 33 of 42 off-topic ones** — the right chunk was "cited" because
everything was. Spec §10.4 #30 forbids exactly that. Round 70 fences 0.29 chunks per question.

## The root cause is the embedder, not the floor

`packages/core/src/catalog/manifest.json` ships one embedding model, `embed-nomic` —
**`nomic-embed-text-v1.5`, 274 MB, which is Nomic's English model.** Nomic's multilingual embedder is a different
model (`nomic-embed-text-v2-moe`). The app asks an English text-embedding model to do document retrieval in eight
launch locales, five of them not English, plus Hebrew. Every number in round 70 and round 70b is that one fact:

- unrelated English text sits near 0.4 and related English text at 0.6+, which is where the 0.5 floor came from;
- in ja/zh/ko/he *any* two texts of the same language sit at 0.53–0.76, so the number measures the language;
- and within one document in those languages the ranking of chunks is close to arbitrary for a paraphrase question.

Two ways out, neither in this round's scope:

1. **Ship a multilingual embedder.** The catalog and the delivery mechanism already handle a second embedding pack;
   this is a model swap plus a re-index, and it is the only change that makes the semantic half mean anything outside
   English. It should be measured on exactly these fixtures before it ships.
2. **Expand the question instead.** The lexical half is the half that works — it separated on-topic from off-topic
   perfectly on 159 questions. Having the chat model rewrite the question into a few content words in the document's
   language, before the lexical index sees it, would recover the paraphrase questions (`Belegschaft` → `Personen`,
   `営業額` → `収益`) without touching the floor. It extends the mechanism that is already reliable.

## Files

| file | what it is |
|---|---|
| `nullbank.json` | the 90 neutral sentences, 10 per language, written for this measurement |
| `multichunk.json` | the 7 six-chunk documents and their 63 questions |
| `centering-measurements.txt` | every question, both halves: cosine, centred, z, terms; and the top chunk per multi-chunk question |
| `embed-centering.mjs` | reruns this embedding pass |
| `packages/core/test/fixtures/rag/centering.json` | the numbers the guard reads |
| `packages/core/test/rag-centering-negative.test.ts` | the guard: sweeps the thresholds and asserts the bar is unmet |
| `guard/red-E-centering-claimed-to-work.txt` | the off-topic z-scores lowered so centring "separates": 2 failed |
| `guard/red-F-top-chunk-claimed-right.txt` | the top chunk claimed to be the answering chunk: 2 failed |
