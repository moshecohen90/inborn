# docs-index-43: an update rebuilt the whole library and the user's file waited (F465)

## Cause

**What invalidated the index.** Round 134B set `LlamaRnEmbedder.revision = 2` (`apps/mobile/src/adapters/llamaRn.ts:250`).
`needsReindex` (`packages/core/src/rag/indexer.ts:34` on main) compares `embed-e5` with `indexModelOf(e)` = `embed-e5@2`,
so every document was stale. The vectors really did change (134B fixed the shared-prefix bug), so new vectors were needed.
The chunking had not changed. `chunker.ts` and `tokens.ts` have not changed since embed-e5 shipped (6f55f1f0), and
the passages are cut from the catalog's 512 positions. Even so, `DocumentLibrary.reindexStale`
(`apps/mobile/src/documents/library.ts:228-233` on main) sent every document through `reindexFrom` and
`indexDocument` from page 0. Each page was opened, extracted, OCRed again for a scan, cut again and embedded again.
vc24 (00d8b6fe) already contained 134B. On the 6T it was only opened for About/Proof, so the rebuild ran in vc25.
Nothing in `rag/` or `documents/` changed between vc24 and vc25.

**Why the attached file waited.** `enqueue` put a fresh read ahead of the rebuilds that were still *waiting*. It did
not touch the rebuild that was *running*. That job held the queue for the whole 40-page document. `indexDocument`
checked the abort signal only between batches of 8 texts, and `EmbedLanes` never looked at it at all.

**Why 46.5 s/page.** The time goes to the model. On this Mac, 98 % of a page's time is the embedding call
(table below). The 40-page Federalist PDF gives 231 passages (5.8 per page), averaging 751 characters and
173 real tokens. The time outside the model is extraction (0.026 s/page) and the store (~0). No passage repeats in
this file. The 60-token overlap the spec asks for (§5.5) re-embeds about 24 % of the text (173 k characters embedded
for 140 k of text). That is a retrieval decision and is left unchanged. On the 6T, 46.5 s/page ÷ 5.8 ≈ 8 s per
passage, at thermal status 3, while the chat model was answering. A CPU-only run on this Mac (`-ngl 0 -t 4`) came out
between 1.3 and 4.6 s per passage. The Mac had a load average of about 136 from other agents, so that figure is not
reliable.

## Change

core (`packages/core/src/rag`):
1. `rebuildKind(doc, embedder, chunking)` → `none | vectors | full` (`indexer.ts:65`).
   - Same model and same cut → `none`.
   - Same model id with another revision (or a word index), same cut, document fully read → `vectors`.
   - Anything else (another model, another cut, a partly read file) → `full`, as before.
   - A row written before the cut was stored counts as today's cut when it came from the same model id.
2. `chunkingOf(opts)` = `v1:212/53/40` and `CHUNKER_VERSION` (`chunker.ts`). The version is bumped when a boundary
   moves. `indexDocument` stores the cut on the record.
3. `reembedStored` now works page by page (`indexer.ts:99`). It re-embeds the stored passages and commits each page.
   `vectorPages` records how far it got, so a kill or a yield resumes there. `vectorsValidUpTo` uses it, so a question
   meanwhile gets the new vectors up to that page and searches by words past it. Every passage stays searchable.
4. `embedTexts` (`indexer.ts:79`): a passage repeated within a run (running header pages, empty forms) is embedded
   once (bounded memo of 256). Used by both paths.
5. `Embedder.embed(texts, signal?)`. `EmbedLanes` drops an aborted call before its next text, so a rebuild stops
   within one passage.
6. Store migration (`sql.ts`): new columns `vector_pages INTEGER` and `chunking TEXT`, added with `ALTER TABLE`
   on open, following the `reindex_from` pattern. Old rows read back with both columns unset and stay valid.

mobile (`apps/mobile/src/documents/library.ts`):
1. `reindexStale` queues `reembedFrom(doc)` for `vectors` and `reindexFrom(doc)` for `full`. A vectors rebuild does
   not OCR a scan again. `runJob` routes a document with `vectorPages` to `reembed` (no extractor is opened). "Run
   OCR" still re-reads the whole file.
2. Priority:
   - The queue is ordered reads → rebuilds of the documents a question or attachment is about (`urgent`) → other
     rebuilds.
   - A read enqueued while a rebuild runs makes that rebuild yield (`yieldRebuild`). It goes back to the front of
     the rebuilds and resumes at its committed page. Its record shows "queued", never "cancelled".
   - `ask` with `docIds` and `attach` call `prioritize` for documents still rebuilding.
3. Prompt assembly and retrieval are unchanged (`buildRagPrompt`, `Retriever`, doors, prefixes).

## Numbers (Mac, real model)

40-page PDF made by `scripts/make-pdf.sh` (The Federalist Papers, Gutenberg #1404, public domain; sha256 of the PDF
`b4dbc69a…3d5021`, not committed). The model is `multilingual-e5-large-instruct-Q6_K.gguf` in `llama-server`
(Metal, `-c 512 -b 512 -ub 512 -np 1 --pooling mean`), called with one text per request as the phone does, through
`EmbedLanes`. Harness: `packages/core/test/rag-index-speed-measure.test.ts`. Raw output: `measure-metal.txt`.

| run | s/page | extract | embed | store | texts |
|---|---|---|---|---|---|
| fresh read | 0.252 | 0.026 | 0.225 | 0.000 | 231 |
| update rebuild, **before** (read + cut + embed every page again) | **0.259** | 0.030 | 0.227 | 0.000 | 231 |
| update rebuild, **after** (stored passages, vectors only) | **0.218** | 0 | 0.217 | 0 | 231 |

The update rebuild is 16 % faster per page on this text PDF. The saving is the extraction, plus OCR for a scan, which
this run did not measure. For the 6T case, the larger change is that the rebuild no longer blocks anything:
- The attached file is read at once. It used to wait more than 10 minutes.
- The rebuild yields within one passage (about 8 s on the 6T).
- A question about a document being rebuilt moves that document to the front.

A fresh read is unchanged per page: the model's time per passage cannot be reduced without re-cutting the passages,
and re-cutting would change retrieval. Future updates rebuild nothing unless the embedder revision or the cut changes.
When only the revision changes, they re-embed without reading the files.

## Tests

- core `test/fixes-f465-rebuild.test.ts` (10):
  - `rebuildKind` cases, including legacy rows and word indexes.
  - Page-by-page `reembedStored`: cancel at page 2, resume, every passage embedded exactly once.
  - A repeated passage is embedded once, in both paths.
  - The stored cut.
  - `EmbedLanes` abort.
  - Opening a database with the previous schema keeps its rows and round-trips `vectorPages` and `chunking`.
- mobile `src/documents/f465-rebuild.test.ts` (6, real `DocumentLibrary`):
  - A revision bump re-embeds 40 pages without opening the file; a second launch does nothing.
  - Same build: nothing. Another cut: read again.
  - A killed rebuild resumes at page 7.
  - A file attached mid-rebuild is indexed while the 40-page rebuild is still unfinished. The rebuild then completes
    with 40 unique passages and at most one re-embedded.
  - A question's document is rebuilt before an untouched one.
  - Against main's `library.ts`, 5 of the 6 fail (`red-main-library.txt`).
- mobile `filePersist.web.test.ts`: the F399 case now expects the word-indexed file **not** to be opened again (only
  its vectors are made). It still checks that the file is never marked damaged and that its answer comes from its
  passages.
- Totals:
  - core 1566 → 1576 passed. The measure file is skipped without its env.
  - mobile 1494 → 1500 passed, 0 failed.
  - The retrieval guards are unchanged and green: `fixes-r134l-lexical-door`, `rag-e5-embedder` (r134b),
    `embedPrefix.test.ts`.
- Typecheck: core and mobile clean. eslint: clean.

## Not verified

- Nothing ran on a phone, emulator or simulator. The 6T seconds per passage and the extraction cost of pdfbox-android
  are taken from the vc25 log, not measured here.
- A CPU-only Mac run was stopped: the load average was about 136 from other agents, so its numbers are not usable.
- If the embedder revision changes again while a vectors-only rebuild is part-way through, the pages already done
  keep the intermediate revision's vectors.
- The chat model's generation still shares the CPU with a running rebuild. Pausing rebuilds while an answer is being
  generated would need a hook in the chat code, which belongs to answers-43, so it was not done.
