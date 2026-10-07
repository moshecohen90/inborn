# Round 134I2 · the source share counts a reworded word as found

The `web:smoke` gate (gates199) failed on `scripts/fixtures/attach/greenhouse-notes.txt`: Instant answered "This document
details greenhouse maintenance for a heated climate-controlled facility, noting irrigation schedules and bean rotation on
specific beds.", `[rag] … used=1 KEPT`, yet the chat showed the none-matched line and no chip.

## Cause

Round 134I's share test (`groundedCitations` → `takenFrom`, `MIN_SOURCE_SHARE = 1/3`) compared exact tokens. Of the
answer's 14 own words ("greenhouse" is in the file name, so it is not counted) only maintenance, heated, irrigation and
beds matched: 0.29, under the bar. "bean"/beans, "rotation"/rotated, "noting"/notes are the file's own words reworded.
gates197/198 passed with the same code because the model worded the answer differently.

## Change

`packages/core/src/rag/citations.ts`: `sourceShare(said, sources)` (exported) counts a word as found when it is a source
word, when both reduce to the same stem (one trailing `ing`, `ion`, `ed`, `es`, `er`, `e` or `s` removed, at least three
letters left; Latin letters only), or when one stem of 5+ letters is a prefix of the other ("president"/"presidential").
`takenFrom` uses it, so `groundedCitations` and `inheritedCitations` both get it. The per-passage rule after the share
test is unchanged (exact). `MIN_SOURCE_SHARE` stays 1/3: grounded answers measure 0.50 and up, unrelated ones 0.27 and down.

## Measured shares (exact → stems)

| Case | Words | Exact | Stems |
|---|---|---|---|
| a. greenhouse, the gates199 answer | 14 | 0.29 | **0.50** |
| a. paraphrase "maintenance notes … tomato beds rotated with beans" | 12 | 1.00 | 1.00 |
| a. paraphrase "looking after the Lindqvist greenhouse" | 2 | 0.50 | 0.50 |
| b. Fast summary (134I sim `result-b2…` f02) vs the 9 pages | 128 | 0.62 | 0.78 |
| b. Instant summary (134I sim `result-b1…` i02) vs the 9 pages | 104 | 0.64 | 0.77 |
| b. 134I test's real answer vs P2+P6 | 13 | 0.69 | 0.77 |
| c. pancake recipe vs P2+P6 (134I test) | 36 | 0.11 | 0.11 |
| c. pancake recipe vs full pages 5+6 | 36 | 0.22 | 0.22 |
| d. Fast's refusal vs P2+P6 | 15 | 0.07 | 0.20 |
| d. Fast's refusal vs full pages 2+6 / 5+6 | 15 | 0.27 | 0.27 |
| e. Build 41 `j3-08` (Succession … State of the Union) vs full pages 5+6, for information | 50 | 0.60 | 0.72 |

Pages are `pdftotext` per page of `docs/qa/r132-doc-summary/fixtures/constitution-9pages.pdf` (whole pages, not the
app's chunks). Case e's text is read off the `j3-08` screenshot (its top may be cut). That answer is written from the
passages, so the share test keeps it either way; it is retrieval's case (round 134L), not this one.

## Proof

- `packages/core/test/fixes-r134i2-share-stems.test.ts`: the gates199 answer and both paraphrases keep the greenhouse
  chip; reworded words count, unrelated ones do not; a pancake answer over the notes gets no chip. The 134I tests
  (pancake with and without `[1]`, Fast's refusal, the real answer) pass unchanged.
- Sabotage: with exact matching back, "the smoke's answer keeps the greenhouse chip" fails (`expected [] to deeply equal
  [ 'greenhouse-notes.txt' ]`); restored, it passes.
- `pnpm -r typecheck` and `pnpm lint` clean; `pnpm -r --no-bail test`: core 1456 passed (4 skipped), mobile 1471, ui 23,
  i18n 24. `web:build` + `web:smoke` from this worktree: 27 PASS, 0 FAIL; the greenhouse answers on both visits carried
  "greenhouse-notes.txt · part 1".

## Not proven

- One smoke run; the model's wording varies, and an answer made mostly of words the file does not hold (e.g. "details",
  "facility", "schedules") can still fall under the bar.
- The stemmer is English-shaped; other Latin languages get only what the shared suffixes and the 5-letter prefix give.
- Fast's refusal sits at 0.27 on full pages, 0.06 under the bar, as before this change.
