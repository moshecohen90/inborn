# Round 134L · one common word is not lexical evidence

Build 41 iPhone pass, j3-08 (`../ios-device-pass-41-2026-10-07.md`, finding 2): in the constitution chat on Fast,
"give me a pancake recipe" logged `[rag] strict=false hits=6 used=2`. Both passages were kept on
`terms=1 bm25=2.93/2.89 cos=0.000`, and the one shared word was "give". Fast then wrote about the Constitution and put
chips p.5 and p.6 under it.

## Cause

`isRelevant` (`packages/core/src/rag/prompt.ts`) keeps a hit that shares one term when its BM25 is at least 2.0
(`minBm25`). The BM25 score cannot tell "give" from "treason". In a 45-chunk file, a word found in only two or three
chunks scores about 2.9 whatever the word is. The fix therefore has to look at which word was shared, not raise the
score door.

## What changed

`packages/core/src/rag/bm25.ts`: `COMMON` / `isCommonWord`, a list of English request verbs (give, make, take, tell,
show, recommend…), filler (time, place, people, thing, way, good, best, like, please, today…) and number words
(one…ten, hundred, thousand). In `Bm25Index.search` a common word is handled like a weak term (a number, year or unit):
- it still adds to the score and the ranking;
- it counts as a shared term only beside a content word.

So "give" alone gives `matched = 0` and the hit has to pass on its cosine. "what information does the president give
to congress" still gives `matched = 3`. Nothing changed in `isRelevant`, the doors or the citation share test.

Measured, not changed: the 2.0 BM25 door. The lowest single content term that keeps a real answer words-only is 2.02
("treason", "bill" p.3). After this change, no off-topic single content term reaches 2.0 on these fixtures.

## Measurement (`table.md`, regenerate with `packages/core/test/rag-lexical-door-measure.test.ts`)

Every question in `questions.json` went through the shipped `Retriever` and door. Each fixture was chunked as the app
chunks it (`chunkFor(512)`, PDF text from `pdftotext` per page) and run twice:
- e5: real `multilingual-e5-large-instruct` vectors from `llama-embedding`;
- words-only: no vectors, the `lexical` doors.

"Before" is `b8384ca9`, "after" is this branch. A cell counts the questions that kept at least one passage.

| fixture | index | on-topic before → after | off-topic before → after |
|---|---|---|---|
| constitution (45 chunks) | e5 | 12/12 → 12/12 | 6/15 → **0/15** |
| constitution | words-only | 12/12 → 12/12 | 7/15 → **1/15** |
| turbine (3 pages) | e5 | 11/11 → 11/11 | 1/13 → 1/13 |
| turbine | words-only | 11/11 → 11/11 | 1/13 → 1/13 |
| greenhouse (.txt) | e5 | 11/11 → 11/11 | 1/12 → 1/12 |
| greenhouse | words-only | 10/11 → 10/11 | 1/12 → 1/12 |

- No on-topic question lost a kept passage. The per-hit kept sets are the same before and after for every on-topic row.
- The off-topic leaks this round closes all came from one common word:
  - give (pancakes, workout plan);
  - like (weather);
  - recommend and good (movie);
  - time (Tokyo);
  - take (screenshot).
- What is left open is pairs of words and real content words. This round's door is for a single shared word.
  - constitution words-only: "How many people live in the state of Texas?" → p.1 on people+state, BM25 5.24.
  - turbine: "Write one line of text about the sea" → line+text, BM25 0.41, both index modes.
  - greenhouse: "What year did the Second World War end?" → year+second, BM25 0.58, both index modes.
  - "year" and "second" are not on the list: "Which crop replaces the tomatoes every second year?" keeps the
    greenhouse note only on those two words (e5 cosine 0.816, under the 0.82 alone door).
- The greenhouse words-only miss ("What time does the irrigation start in the morning?") was a miss before as well:
  one word, BM25 0.29.

## Tests

`packages/core/test/fixes-r134l-lexical-door.test.ts` uses the real constitution chunks in
`test/fixtures/rag/constitution-9pages-chunks.json`. 10 tests:
- pancakes: the "give" passages (pp.5, 6) score above 2.0 but count 0 terms. None is kept, words-only or with the
  cosines e5 gave (0 and 0.703). `buildRagPrompt` uses nothing and carries the "nothing in them matched" rule.
- weather / Tokyo / screenshot / movie / workout plan: nothing kept.
- veto (p.3) and treason (p.7) are kept and cited, words-only and with e5 doors.
- turbine serial (p.1, at least 2 terms) and greenhouse irrigation timer (2 terms, BM25 0.58 < 2.0) are kept words-only.
- a common word beside a content word still counts, and still scores.

Sabotage: the search line went back to `if (isWeakTerm(t)) e.weak.add(t);`. 7 of the 10 tests failed, including the
pancake one (`expected 1 to be +0`); see `red-old-door.txt`. Restored, and 10/10 passed.

## Gates (from this worktree)

- `pnpm -r typecheck`: clean. `pnpm lint`: clean.
- `pnpm -r --no-bail test`:
  - core 1466 passed (5 skipped: the 4 existing plus this round's env-gated measurement);
  - mobile 1471, ui 23, i18n 24.
- `pnpm web:build` then `pnpm web:smoke` (ephemeral port, own `SMOKE_OUT_DIR`): 27 PASS, 0 FAIL, exit 0. This includes
  the words-only `.txt` answer with SOURCES `greenhouse-notes.txt · part 1` and the turbine `.pdf` with p.1–p.3.

## Simulator proof (`sim/`)

Setup:
- iPhone 17 Pro, iOS 26.2, created for the run and deleted after it.
- App: the Release `Inborndev.app` (`com.inbornapp.mobile.qa`) with this branch's `expo export:embed` + hermesc
  bundle, re-signed ad hoc.
- Models: `scripts/serve-models.mjs` on :8833 served the index model and Fast.
- Steps: scripts `l1` onboarding, `l2` install, `l3` Fast, `l4` Instant. Every step passed.
- `rag-log.txt` is the app's own `[rag]` log.

Results:
- **Instant** (`i01`–`i04`):
  - Summary with four chips.
  - "give me a pancake recipe" → a recipe, no chip, and "Nothing in your documents matched this question." The
    `[rag]` line has `used=0`, with `#26 terms=0 bm25=2.93 dropped` and `#31 terms=0 bm25=2.89 dropped`: the same two
    passages the phone kept.
  - "Who can veto a bill?" → `used=4`, chips p.3, p.4.
- **Fast** (`f01`–`f04`, second run):
  - Summary with four chips.
  - Pancakes → "Your documents don't mention this." and then a recipe, no chip, the none-matched line, the same
    `used=0` line.
  - Veto → `used=4`, an answer citing [1] and [3] with chips p.3, p.3.
- **Fast, first run** (`sim/fast-r1/`, log not captured):
  - The pancake turn was the same: no chip, the none-matched line.
  - The veto answer was "no one can veto a bill … the document does not contain information" with no chip. The
    retrieval is the same as in the second run (same chunks, same door: `used=4` in the second run). So that was Fast
    rejecting its passages, and the 134I share test then rightly showed no chip. This is answer quality, not this door;
    it is also what round 134K saw ("Fast says No one can veto a bill").

## Not proven

- English only. The `COMMON` list is English: a German, French, Spanish, Portuguese or Hebrew request verb shared with a
  document in that language ("gib", "donne", "dame") still counts as content. That was not measured.
- Two-word coincidences (people+state, line+text, year+second) still pass the two-term door.
- Not run on a phone or on Android. The web smoke covers the words-only path on the web.
- On Fast, the veto answer's quality varies from run to run (see the first run above).
