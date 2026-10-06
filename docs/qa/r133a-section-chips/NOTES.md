# Round 133A · A summary's source chips name the pages each section covers

## What changed

- `Citation` has an optional `pageTo`, the last page of a section that was read as one passage. `citationLabel` prints
  it as `p.1–2` (en dash, no spaces). A citation with no `pageTo`, or with `pageTo` equal to `page`, prints as before.
- `wholeFilePrompt` sets `pageTo` from `section.to` when `to > from`. The whole plan has one page per section, so it
  never gets a range. The note label in the prompt carries the same range. The lead line now says "with its file and
  pages". The `HEADER` pattern in `withoutEchoedLabels` accepts `–N`, so a copied ranged label is still taken off.
- `onePerPage` keys on doc + from + to, so `p.1–2` and `p.3–4` stay two chips.
- The locales hold only the page word (`documents.cite.page`). The numbers are written in code, so no string changed.
  German shows `S. 5–7`.

## Proof

- Tests: `packages/core/test/rag-whole-file.test.ts` covers sections carrying their range into the citations, the
  echoed ranged label, and no range in the whole plan. `apps/mobile/test/fixes-r133a-section-chips.test.ts` checks
  `p.1–2`, `p.4`, the de and ja words, and that the dedupe keeps `p.1–2` and `p.3–4` apart.
- iOS Simulator (iPhone 17 Pro, iOS 26.2, created for this run and deleted afterwards). Release build
  `com.inbornapp.mobile.qa` with `INBORN_PACKS=instant`, `EXPO_PUBLIC_QA=1`, `EXPO_PUBLIC_AUTOPROMPT=file`,
  `EXPO_PUBLIC_AUTOINSTALL=file` and `EXPO_PUBLIC_MODELS_BASE_URL=http://localhost:8791/v1`. The port was 8791
  because 8790 was taken by another session's server. Fixture: `../r132-doc-summary/fixtures/constitution-9pages.pdf`.
  - `sim/02b-summary.png`: "Summarize it" on Instant. The answer ends with "Summary of all 9 pages.", followed by the
    chips `constitution-9pages.pdf · p.1–2`, `p.3–4`, `p.5–6` and `p.7–9`.
  - `sim/06-question-chips.png`: "Who can veto a bill?" stays on retrieval. Its chip is the single page
    `constitution-9pages.pdf · p.3`.
  - Scripts: `c1` onboarding, `c2` attach + summary + question, `c3` the index-model download that the question
    waited on, `c4` and `c5` to bring the question's chips into view.

## Not proven

- `dev-vault.txt` ("install embed-e5") did not install the index model in `c2`, and the server log shows no request.
  So the question stopped on the index-model card (`sim/03-question.png`), and `c3` tapped Download on that card.
  The summary needs no index model.
- The chat list did not scroll to the end of the second answer. Its chips stayed under the composer's attached-file
  row (`sim/04-question.png`, `sim/05-question-chips.png`) until `c5` detached the file. This looks like a layout
  issue that predates this round. It was not investigated.
- Instant cited no `[n]`, so the chips shown were the unnumbered ones. A Fast summary with `[n]` marks was not run on
  the simulator. The unit tests cover that path.
- The Ask sheet, Fast, a real phone and non-English locales were not run on screen.
