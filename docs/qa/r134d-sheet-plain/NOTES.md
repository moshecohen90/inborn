# Round 134D · A thanks or a follow-up in the Ask sheet gets one plain line

Build 38 device pass, "Past the goal" (`X4-02`, `X4-03`): in Documents → select → Ask, "And now" returned a random
passage and "thank you" returned "Your documents don't mention this." with "Nothing in your documents matched". The
sheet keeps no history (each answer replaces the last), so a follow-up has nothing to apply to.

## What changed

- `apps/mobile/src/lib/docsGate.ts`: `sheetPlainLine(t, text)` uses `plainChatKind` from `@inborn/core` (round 134A).
  An acknowledgement gets `documents.ask.thanks`, a follow-up gets `documents.ask.oneQuestion`, anything else gets null.
- `apps/mobile/src/screens/documents/AskDocuments.tsx`: when `sheetPlainLine` returns a line, `ask` shows it
  (testID `ask-plain`) and returns before `loadSession`, `readWhole`, `library.ask` and `engine.generate`. There are no
  SOURCES, no not-found or none-matched notice, and no stats line. `onResult` reports `notFound: false` and `used: []`.
  "Summarize it" (132C) and real questions take the same routes as before.
- Two strings in all 8 locales and pseudo. Each locale's example ask is one that `fileAsk` reads as a summary in that
  language (the unit test checks this).

## Proof

- `apps/mobile/test/fixes-r134d-sheet.test.ts`: 5 tests. Removing the `return` from the plain branch turns one red.
- Gates in the worktree: `pnpm -r typecheck` 0, `pnpm lint` 0, `pnpm -r --no-bail test` 0 (mobile 1434, core 1411,
  i18n 24, ui 23).
- iOS Simulator (iPhone 17 Pro, iOS 26.2, created for this run and deleted afterwards). One Release build
  `com.inbornapp.mobile.qa` of this branch, Instant, index model `embed-e5` from `scripts/serve-models.mjs`.
  File: `../r132-doc-summary/fixtures/constitution-9pages.pdf`. Scripts `k1`, `k2` are round 132C's; `k3-sheet-plain`
  is new (the shell replaces DOCID with the id from k2's dump). 37 of 37 steps passed.
  - `sim/03b-thanks.png`: "thank you" → "You're welcome. Ask another question about these documents." No answer, no
    notice, no stats.
  - `sim/03c-and-now.png`: "And now" → "This sheet answers one question at a time: ask the full question (for example,
    "Summarize it in three lines")." No answer, no notice, no stats.
  - `sim/04-question.png`: "Who can veto a bill?" still searches: `search 296 ms · 4 passages`, answer with source p.3.

## Item 11 ("Who wrote this report?" → "none matched")

- Retrieval was not changed. The sheet and the chat use the same copy for the same conditions: `documents.notFound`
  when the reply is a not-found reply, and `documents.noneMatched` under `saysNoneMatched` with no grounded passage.
  The two do not differ, so nothing was changed there. The chat has one extra guard the sheet lacks:
  `claimsFileContent` swaps an answer that claims file content with no passage for `documents.opener.nothingRelevant`.
- Found on the way, not changed (core is outside this round): `fileAsk("Resúmelo")` and `fileAsk("Resúmelo en tres
  líneas")` return null, as do the other non-English "in three lines" forms, so they go to retrieval instead of the
  whole-file summary. The Spanish example in the sheet line is "Resume esto", which `fileAsk` reads as a summary.

## Not proven

- Fast was not run, only Instant. Non-English plain turns were run only in the unit test. No real phone.
