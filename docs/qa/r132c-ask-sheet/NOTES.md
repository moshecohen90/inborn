# Round 132C · The Ask sheet reads the whole file for a summary

## What changed

- `apps/mobile/src/screens/documents/AskDocuments.tsx` (Documents → select → Ask) now takes the chat's round-132 route
  when `fileAsk(text) === "summary"`:
  - It reads the selected files whole with `library.readWhole`, using the chat's options: `nCtx`, the "summarize"
    length plan as the system prompt, `citeMarkers`, `signal`, `complete` = `engine.generate` at temperature 0.3, and
    `onSection`. While it reads, `onSection` shows "Reading pages 1–2 of 9…" in the sheet (testID `ask-reading-pages`).
  - The final answer streams from the whole-file prompt exactly as before: `withoutEchoedLabels`, then the citations
    from `library.citationsFor`.
  - The answer ends with the `summaryScope` line. On Instant it adds the line with the chip labels (INSTANT / FAST).
  - The stats line says what was read. The new string `documents.ask.read` is "read 87584 ms · 9 of 9 pages · answer …",
    added to all 8 locales and to pseudo.
  - "Not found" and "none matched" never show under a summary. Strict mode does not refuse a summary, because no
    search runs.
  - Stop, while reading or while writing, leaves the sheet idle with no answer and no stats.
  - `onResult` keeps its shape. `used` lists every page read (cosine and bm25 are 0).
  - If `readWhole` returns null with no Stop (nothing searchable), the sheet falls back to `library.ask`.
- "What is this file about?" and every other question keep the retrieval route.
- No shared helper was added. The ~15-line `readWhole` wrapper mirrors `Chat.tsx:498`. Chat.tsx and core are untouched.

## Proof

- `apps/mobile/test/fixes-r132-sheet.test.ts`: 6 tests. Sabotaging the Stop branch turns one of them red.
- iOS Simulator (iPhone 17 Pro, iOS 26.2, created for this run and deleted afterwards). One Release build
  `com.inbornapp.mobile.qa` of this branch, Instant, index model `embed-e5` installed from `scripts/serve-models.mjs`.
  File: `../r132-doc-summary/fixtures/constitution-9pages.pdf`.
  - Scripts: `scripts/k1-onboard-instant.json`, `scripts/k2-index-and-import.json` and `scripts/k3-sheet-ask.json`.
    In k3 the shell replaces DOCID with the id from k2's dump.
  - `sim/03b-reading.png`: "Reading pages 1–2 of 9…" in the sheet.
  - `sim/03c-summary.png`: the summary, then "Summary of all 9 pages. INSTANT can miss or mix up details of a long
    file; FAST summarizes files better.", then SOURCES. Stats from the dump: `read 87584 ms · 9 of 9 pages · answer
    12893 ms`. The assertions found no none-matched notice and no not-found notice.
  - `sim/04-stopped.png`: the same ask with Stop pressed while it read. The sheet is empty, with no answer and no
    stats, and the send button is back.
  - `sim/05-question.png`: "Who can veto a bill?" is still on retrieval: `search 271 ms · 4 passages`, with sources
    p.3 and p.4.
  - `sim/06-about.png`: "What is this file about?" is still on retrieval: `search 5 ms · 8 passages`, with no scope line.
  - The run passed 45 of 46 steps. The failed step was a `scrollTo ask-stats` that the bridge cannot do for this
    sheet. It is removed from the committed script, and its screenshot is dropped.

## Not proven

- Fast was not run in the sheet. Only Instant was.
- The quality of the summary was not graded. The Instant summary in `03c` is one dense paragraph rather than bullets,
  and it cites only p.1. Round 132A already reported this weakness of Instant.
- Stop during the final writing phase is covered by the unit test only. On the simulator, Stop was pressed while the
  sheet was reading.
- A real phone, Hebrew asks, and files longer than about 20 pages (the "cut" scope line) were not run in the sheet.
