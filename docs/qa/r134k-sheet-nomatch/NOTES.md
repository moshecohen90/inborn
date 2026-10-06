# Round 134K · The Ask sheet says "Your documents don't mention this." at once when no passage matched

Build 40 iPhone pass (`docs/qa/ios-device-pass-40-2026-10-07.md`, J4): after 134H the sheet no longer echoed its
instructions, but 3 of 16 no-match answers were more than the opener. One began "I do not have access to the user's
files…", and "Who won the 1998 World Cup?" on the constitution got a general answer with wrong facts three times.

## Decision

The sheet is "Ask about N documents" and keeps no history. When the search keeps no passage the model has nothing to
add, so the sheet no longer calls it, in strict **and** non-strict mode. This replaces F416 (round 108, 27.9) for the
sheet only: F416 let a non-strict sheet answer from general knowledge under "Answered without them". The chat is
unchanged and still answers generally outside strict mode.

## What changed

- `apps/mobile/src/lib/docsGate.ts`: `askSheetRoute({ noAnswer, usedPassages })` is `not-found` when strict found
  nothing **or** no passage was kept. `sheetNotFoundLine(t, droppedForBudget)` returns the opener the model was told to
  start with: `documents.opener.nothingRelevant` ("Your documents don't mention this."), or `nothingFits` when passages
  matched but none fit the context. Both strings already exist in every locale.
- `AskDocuments.tsx`: on that route the sheet shows the line under `ask-not-found`, the stats line
  `search N ms · 0 passages` (Pro), no chips, no none-matched notice, and returns before `engine.generate`. `onResult`
  gets `notFound: true`, `used: []`, `answer` = the line. A summary (132C) never takes this route; a thanks or a
  follow-up (134D) still returns earlier with its plain line. With passages the flow is unchanged, and a model
  NOT_FOUND reply still shows `documents.notFound`.
- Strict mode's line changes from "Inborn could not find that in your documents." to the same opener, so both modes
  read the same.
- `packages/core/src/rag/prompt.ts` is untouched (the chat shares it).
- Tests: `apps/mobile/test/fixes-r134k-sheet-nomatch.test.ts` (6): real `buildRagPrompt` with no hits routes to
  not-found in both modes, the opener strings, the branch returns before `engine.generate` with the documented
  `onResult` shape, passages still generate, summary still `readWhole`, thanks still the 134D line. The F416 block in
  `apps/mobile/src/documents/grounding.test.ts` now pins the new rule.

## Simulator proof

iPhone 17 Pro, iOS 26.2, created for the run and deleted afterwards. App: the Release `Inborndev.app`
(`com.inbornapp.mobile.qa`) from round 134E with `main.jsbundle` replaced by an `expo export:embed` + hermesc bundle of
this branch, re-signed ad hoc. `scripts/serve-models.mjs` on :8814 served the index model (`install embed-e5`) and Fast.
Fixtures: `../r132-doc-summary/fixtures/constitution-9pages.pdf`, `../acceptance/fixtures/turbine-report-3pages.pdf`.
Scripts `k1`…`k6` (the shell replaced `DOCID_T`/`DOCID_C` with the ids from k2's dump), every step passed.

| Run | Model | Question | Sheet shows | Stats |
|---|---|---|---|---|
| k3 turbine | Instant | 1998 World Cup / the moon / who wrote this report | `03a-c`: "Your documents don't mention this." only | `search 218-357 ms · 0 passages` |
| k4 constitution | Instant | same three | `04a-c`: the opener only | `search 228-408 ms · 0 passages` |
| k4 constitution | Instant | Who can veto a bill? | `04d`: answer + chips p.3, p.4 | `4 passages · answer 13165 ms · 42.0 tok/s` |
| k5 constitution, strict on | Instant | 1998 World Cup | `05`: the same opener | `search 297 ms · 0 passages` |
| k6 constitution | Fast | the three no-match | `06a-c`: the opener only | `search 254-478 ms · 0 passages` |
| k6 constitution | Fast | Who can veto a bill? | `06d`: answer + chips p.3, p.4 | `4 passages · answer 37861 ms · 16.5 tok/s` |

No model call on the no-match turns: the stats line has no `answer … tok/s` part (it is only written after
`engine.generate`), there is no `ask-answer` node, and each question took about 5 s including typing. `sim/rag-log.txt`
is the app's `[rag]` log: `used=0` on every no-match turn, `used=4` on the veto turns.

## Not proven / seen on the way

- Not run on a real phone, Android or web. Non-English openers are covered by the existing locale strings only.
- The model is still loaded before the search (`loadSession` gives the context size the search needs), so on a cold
  sheet the "Loading…" line shows before the opener.
- The veto answers are weak on both models with 4 passages kept: Instant says the President vetoes "if he approves
  it", Fast says "No one can veto a bill". This path is unchanged by this round; it is answer quality, not routing.
