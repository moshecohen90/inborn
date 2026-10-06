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

## Follow-up measurements: slot path vs the dummy-call fallback (`sim/6-modes.txt`)

The same simulator setup was used, with a fresh simulator. One bundle carried the probe in four modes
(`embed-probe.patch`, `scripts/embed-modes.json`):
- `plain`: `ctx.embedding`, as on main.
- `slot`: `ctx.parallel.embedding` on a raw context.
- `dummy`: `ctx.embedding` followed by `ctx.embedding("~")`. `"~"` tokenizes to `<s> ' ~' </s>`, so the next real text
  shares only BOS.
- `adapter`: `LlamaRnEmbedder` as shipped.

Each mode embedded the same 52 texts.

| | plain (main) | dummy call (fallback i) | slot (shipped) |
|---|---|---|---|
| same passage twice | 0.7497 | 0.9814 | **1.0000** |
| same question twice | 0.7395 | 1.0000 | **1.0000** |
| vector vs Mac, 48 texts: min / mean | 0.884 / 0.958 | 0.977 / 0.992 | **0.9989 / 0.9999** |
| 38 one-term pair cosines vs Mac: max / mean shift | 0.0796 / 0.0203 | 0.0173 / 0.0047 | **0.0055 / 0.0008** |
| pairs moved > 0.001 | 35 / 38 | 33 / 38 | 10 / 38 |

- **The dummy call fails the bar.** Losing BOS alone moves pair cosines by up to 0.017. That is 7× the 0.0023 margin
  of the alone door.
- **The slot path is exact up to backend numerics.**
  - The same text gives 1.0000 every time.
  - Vectors match the Mac's at 0.9999 on average. The minimum is 0.9989, on a Portuguese passage; everything else
    is at or above 0.9990.
  - The remaining gap is the llama.cpp backend floor. On the same Mac, the same file and the same texts, CPU vs Metal
    gives vectors at min 0.9985 / mean 0.9992 and pair shifts up to 0.0053, with 28/38 pairs over 0.001.
  - A 0.001 bar on pair cosines is therefore tighter than the difference between two llama.cpp backends on one
    machine.
  - The alone door's 0.0023 margin is within that noise on every engine, phone, Mac CPU or Mac Metal. This is a
    separate item for whoever owns the doors.
- **Cost.**
  - A full text costs the same on both paths. Medians in the calmer runs: slot 330–346 ms per text, adapter
    330–339 ms. The dummy mode is a near-full decode plus a 3-token call: 363 ms. `plain`'s first text, which is
    decoded in full, took 325–366 ms.
  - `plain` looks cheaper overall (median 94–183 ms) only because the bug decodes the suffix alone.
  - Several runs read 2–3× slower, in every mode alike: slot up to 764 ms, adapter up to 1134 ms. These ran while the
    Mac's load average was 25–124 with other rounds building, so they are contention, not the path.
  - No mode comes near the 2× limit once contention is excluded. A clean timing needs a quiet machine (night) or a
    real phone.
- **Memory.** The context adds 620 MB of peak RSS with the slot path against 645 MB with `plain` (1 Hz `ps -o rss`
  samples, context held 12 s). Slot mode adds no measurable memory.
- **Decision:** keep the slot path (already merged). Fallback (i) stays out. The native one-line patch, clearing
  `embd` in `llama_rn_context_completion::embedding()` before `loadPrompt`, is not needed for e5.

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
