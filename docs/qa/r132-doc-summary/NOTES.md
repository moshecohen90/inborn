# Round 132 · "Summarize this file" reads the whole file

## Numbers

Mean hand grade (0/1/2). Four files: the founder's 9-page privacy policy (used locally, numbers only),
constitution (11 p.), federalist-10 (6 p.) and yellow-wallpaper (15 p.). n = 3 per cell, so 12 answers per mean.
Same harness and same llama-server for before (main 4aa9972a) and after (this branch).

| model | question | before | after |
|---|---|---|---|
| Fast | "Summarize this file" | 0.67 | **1.58** |
| Fast | "What are the main points of this file?" | 0.67 | **1.67** |
| Fast | "סכם לי את הקובץ" | 0.00 | 0.25 |
| Fast | "What is this file about?" | 1.58 | 1.83 |
| Instant | "Summarize this file" | 0.50 | 0.83 |
| Instant | main points | 0.33 | 0.75 |
| Instant | "סכם לי את הקובץ" | 0.00 | 0.00 |
| Instant | "What is this file about?" | 1.00 | 1.42 |

The founder's file on Fast: summarize 1.00 → **2.00**, main points 1.00 → **2.00**, about 1.67 → 2.00.
Per-file rows, the rubric and the reason for every grade below 2 are in `results/grades.json`.
The full tables come from `node harness/summary.mjs results`.

### Time for a 9-page file (the founder's), on a phone

Estimated from the measured token counts at iPhone 13 Pro rates (docs/qa/ios-device-pass-32..36: prefill Fast 190–300 tok/s,
Instant 400–630; generation Fast 15–19 tok/s, Instant 32–37).

| model | calls | prompt tokens | generated tokens | phone estimate | before (opening only) |
|---|---|---|---|---|---|
| Fast | 5 (4 notes + summary) | 6,440 | 597 | **≈ 61 s (53–74 s)** | ≈ 11 s (1,593 + 85 tok) |
| Instant | 5 | 6,387 | 444 | **≈ 25 s (22–30 s)** | ≈ 6 s (1,544 + 110 tok) |

15 pages (yellow-wallpaper): Fast ≈ 77 s, Instant ≈ 40 s. The Mac wall time for each row is in the summary.mjs output.
Simulator wall time (Mac CPU, load average 30–50 from other work, so not a phone number): Fast reading 223 s + writing 28 s;
Instant 89 s + 10 s.

## Root cause

`isAboutAttachment` sent every "summarize this file" to the opening route. That route was built for "what is this file
about?" and gives `openingHits(max = 8)`, which is about pages 1–2. The model then summarized two pages and, asked for a
summary, presented them as the whole file. "סכם לי את הקובץ" / "מה כתוב בקובץ" were not seen as about the file at all
(Hebrew prefixes, including bm25's prefix-stripped "תוב"). They went to retrieval, which kept nothing, so the answer was
a refusal or an invention.

## Design

- `packages/core/src/rag/wholeFile.ts` is the reusable step:
  - `fileAsk(question)` returns "summary" or "about" (all 8 locales plus Hebrew).
  - `filePages(chunks)` rebuilds each page from the indexed chunks.
  - `planWholeFile` sends the file whole when it fits the context.
  - Otherwise it makes even sections of ≤ 2,400 tokens. A page longer than that is split and keeps its number, and a
    section never spans two files.
  - `readWholeFile` writes one ≤ 160-token note per section, reports progress, and stops on abort.
  - `wholeFilePrompt` builds the final summary over the notes. Each note is labelled with its pages and carries its
    citation, so SOURCES show `name · p.N`.
- Cap: 24,000 tokens, about 20 pages. A longer file gets "Summary of pages 1–N of M. One summary reads about 20 pages;
  ask about a later part and Inborn searches the whole file."
- Honesty lines under the answer:
  - "Summary of all 9 pages." / "Summary of the whole file (1 page)."
  - On Instant, the answer adds "INSTANT can miss or mix up details of a long file; FAST summarizes files better." The
    existing model-advice card ("Switch to FAST") already shows for documents on Instant. Both are in the sim shots.
- Progress: "Reading page 3 of 9…" / "Reading pages 1–2 of 9…" shows above the chat (testID `reading-pages`). Stop
  aborts the reading and leaves no empty answer.
- "What is this file about?" stays on the opening route. The prompt now says the passages are pages 1–N of M and must
  never be presented as a summary of the whole file.
- Web uses the same `Chat.tsx`, so it gets the same route. AskDocuments (the Documents → Ask sheet) is not wired.

## Proof

- Unit tests:
  - `packages/core/test/rag-whole-file.test.ts`: 44 tests.
  - `apps/mobile/test/fixes-r132-summary.test.ts`: 6 tests.
- Suites:
  - core: 1,333 passed, 1 failed (see below).
  - mobile: 1,394 passed.
  - i18n: 24 passed. ui: 23 passed.
  - `typecheck`, `lint` and `web:build` all exit 0.
- iOS Simulator (iPhone 17 Pro, iOS 26.2, Release build), file `fixtures/constitution-9pages.pdf`:
  - Instant:
    - `sim/03b-about.png`: the framed answer, with the "Switch to FAST" card.
    - `sim/03c-reading.png`: "Reading pages 1–2 of 9…".
    - `sim/03e-summary.png`: the summary with "Summary of all 9 pages." and the Instant line.
  - Fast:
    - `sim/05b-about.png`: the about answer.
    - `sim/05c-reading.png`: the progress line.
    - `sim/05e-summary.png`: bullets with [1]–[4], "Summary of all 9 pages.", and SOURCES p.1/p.3/p.5.
- Harness: `harness/run-summary.mjs` runs the app's own code (bundled by `harness/bundle.mjs`) against llama-server.
  Results are in `results/after-{fast,instant}.jsonl`; the founder's rows keep counts only.

## Not proven / open

- **Hebrew asks on these models.** The route now fires for Hebrew, but the 2B and 0.8B models write broken Hebrew
  (invented words, loops), so it scores 0.25 / 0.00. Asking for the summary in Hebrew of an English file is not solved
  by this round.
- **Phone timings are estimates** from token counts and earlier device rates. This round did not use the iPhone.
- **Instant summaries cover the file but invent details** (0.83). That is why the honesty line and the card are there.
  Instant sometimes copies a note label ("constitution.pdf · p.1 (pages 1–3)") into the answer.
- Fast still gets the plot of a 15-page story wrong (yellow-wallpaper 0.67): invented names and endings.
- The core test `fixes-r114 › 25 distinct verbs` times out (5 s) under the full parallel run. The machine load average
  was 50. It passes alone on this branch and on main (27/27), and it is untouched here.
- The Documents → Ask sheet (AskDocuments.tsx) still answers "summarize" through retrieval.
