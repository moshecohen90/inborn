# Round 134B · The phone's embeddings no longer skip the previous text's shared prefix

## The bug

`ctx.embedding(text)` in llama.rn 0.12.9 keeps the previous call's tokens (`completion->embd`). `loadPrompt()`
(`cpp/rn-completion.cpp:429`) sets `n_past` to the length of the prefix shared with them, so only the rest is
decoded, and mean pooling covers only that rest. Every text after the first loses at least its BOS token. A question
loses the whole e5 instruction. The same text asked twice keeps only its last token.

**`clearCache(false)` does not fix it for the index model.** It was the first attempt and it was measured
(`sim/2-clearcache-only.txt`): the vectors match main's to 4 decimals. multilingual-e5 is `LLM_ARCH_BERT`.
`llama_model::create_memory` returns `nullptr` for it (`cpp/llama-model.cpp:2058`), so `clearCache`
(`cpp/rn-llama.cpp:865`) returns at "memory not available" before it reaches `completion->embd.clear()`.

Correction to the brief: e5 passages are embedded raw, because `forDocuments` adds no "passage: " prefix for e5.
Passages still lose their BOS and any leading words shared with the passage embedded before them.

## The fix

- `apps/mobile/src/adapters/llamaRn.ts`: `LlamaRnEmbedder` now creates its context with `n_parallel: 1`, calls
  `ctx.parallel.enable({ n_parallel: 1, n_batch: n })`, and embeds each text with `ctx.parallel.embedding(t)`. A slot
  with no state file starts every prompt at `n_past = 0` (`cpp/rn-slot.cpp:255`). No native patch is needed.
  `LlamaRnLM.embed` (the chat engine) calls `clearCache(false)` before each `embedding()`. A chat model has KV memory,
  so the reset works there. The app does not use this path today.
- Re-embedding: `Embedder.revision` (optional) and `indexModelOf(e)` = `embed-e5@2` once a revision is set.
  `indexDocument` and `reembedStored` store that value. `needsReindex(doc, embedder)` compares against it.
  `EmbedLanes` passes the revision through. `relevanceDoors`, `forQuery` and `forDocuments` still key on the catalog
  id `embed-e5`. `LlamaRnEmbedder.revision = 2`. Web and desktop have no revision, so their indexes are not rebuilt.

## Other engines

- Desktop (`apps/desktop/src-tauri/src/engine.rs:302`): each text is a fresh batch at positions from 0, after
  `clear_kv_cache()`. Not affected.
- Web (wllama 3.6.1): wraps llama-server's `server-context`. I did not run wllama itself. Homebrew `llama-server` (build
  10809), with the same Q6_K, `--pooling mean`, `-np 1` and the same text sent twice, matched the Mac truth (1.0000 on
  all 6 texts). This is likely fine but not proven for wllama's own llama.cpp revision. Not touched.

## Proof

Unit tests:
- `apps/mobile/src/adapters/embedPrefix.test.ts`: the index embedder calls only `parallel.embedding`, never `embedding()`.
  It inits with `n_parallel: 1` and carries `revision 2`. The chat engine calls `clearCache(false)` before each
  `embedding()`. Reverting the embedder to `ctx.embedding` turns the first test red.
- `packages/core/test/rag-e5-embedder.test.ts` (r134b case): a doc stored as `embed-e5` needs a reindex under revision
  2. After `indexDocument` through `EmbedLanes`, it stores `embed-e5@2` and no longer needs one.

Simulator setup:
- iPhone 17 Pro, iOS 26.2, created for this run and deleted afterwards.
- The native app is a Release `Inborndev.app` built from main by another round of this batch. No native change was
  made. Its `main.jsbundle` was replaced with an `expo export:embed` + hermesc bundle of main ("before") or of this
  branch ("after"), and the app was re-signed ad hoc.
- Both bundles included the QA-only `embedProbe` bridge op from `embed-probe.patch`, which is not committed in source.
  The op embeds a list of texts one per call through `resolveEmbedder()`, as `EmbedLanes` does.
- Index model: `multilingual-e5-large-instruct-Q6_K.gguf`, the same file as the Mac truth, served by
  `scripts/serve-models.mjs` on port 8796.

(i) and (ii): 52 texts (`scripts/embed-probe.json`), compared with `llama-embedding` on the Mac on the same file
(`scripts/analyze.py`):

| | before (main) | clearCache only | after |
|---|---|---|---|
| same passage twice, cos(1st, 2nd) | 0.7497 | 0.7497 | **1.0000** |
| same question twice, cos(1st, 2nd) | 0.7395 | 0.7395 | **1.0000** |
| phone vs Mac vector, same text (48) | min 0.884, mean 0.958 | same | **min 0.9989, mean 0.9999** |
| 40 questions, mean pairwise cos (Mac 0.7525) | 0.7847 | 0.7847 | 0.7519 |
| max \|phone − fixture\| over 38 (question, passage) pairs of `one-term-e5.json` | 0.0801 | 0.0801 | **0.0052** |

(c) End to end. Fixture: `../r132-doc-summary/fixtures/constitution-9pages.pdf`. Question: "Who can veto a bill?"
- Before (`scripts/e1-old-index.json`, `e2-ask-before.json`, `sim/4-rag-log-before.txt`):
  - The first `[rag]` line has cos 0.821 / 0.805 / 0.793 / 0.791, with 4 kept.
  - The next four lines (the 2nd half of turn 1, both asks of turn 2, and the Documents → Ask sheet) all show
    cos 0.775 / 0.758 / 0.784 / 0.776, with 3 kept.
  - The sheet answered with the Treaty clause of Article I (`sim/e2-sheet.png`).
- Relaunch on the after build (`e3-relaunch.json`): the stale index was re-embedded on launch, logged as
  `[documents] constitution-9pages.pdf: indexed · 9/9 pages · 45 chunks · 56233 ms`. Document details show "Index model
  embed-e5@2" (`sim/e3-details.png`).
- After (`e4-ask-after.json`, `sim/5-rag-log-after.txt`): all five `[rag]` lines (two asks in one chat, plus the sheet)
  are identical: cos 0.823 / 0.805 / 0.788 / 0.787, with 4 kept. The sheet answers about the veto
  (`sim/e4-sheet.png`). The search takes 231–344 ms, against 33–46 ms before, because the buggy path decoded one token.

## Cost item for a later round (not fixed)

Each chat turn about a file calls `library.ask` twice: `bestPage` (`Chat.tsx:952`) and `buildPrompt` (`Chat.tsx:654`).
That is two query embeddings and two retrievals per turn, about 0.25 s each on the simulator.

## Not proven

- A real iPhone was not used, only the simulator (Apple-silicon Metal). The founder's Build 38 symptom matches the
  "before" numbers.
- wllama (web) was not run. See *Other engines*.
- Android was not run. It uses the same JS and the same llama.rn C++, but a different prebuilt binary.
- Parallel mode on a phone under memory pressure, and `unload()` during an in-flight slot, were not stress-tested. The
  probe loaded and released the context three times without error.
