# F421 · the final round-107 loop guard, live on the web (round 110)

Round 107 measured its web trials before the echo rule landed. This run measures the guard that shipped
(`origin/main` 5490c77b) on the web export, with the same prompts and trial counts, plus the two rows the phone pass uses.

## Setup

- Build: `pnpm web:build` of 5490c77b, served from `apps/web/dist` by `scripts/serve-web.mjs` on port 8797 with
  `/Users/moshecohen/dev/inborn/.models`. The bundle carries the final guard (the echo rule's `・` joiner regex).
- Instant (Qwen3.5-0.8B Q4_K_M) through wllama on WASM, as loaded: `threads=6 isolated=true gpuLayers=0 nCtx=4096`.
- Headless Chromium (`chromium_headless_shell-1243`) at 1440×900, first-run onboarding, a fresh chat per trial.
- Harness: `web-guard-verify/trials.mjs`. It uses round 107's yardstick unchanged and samples the screen every 250 ms
  while the answer streams. After each answer it reads the stored answer from IndexedDB, so markdown and cut points
  can be seen. The web engine sets no seed, so "the same trials" means the same prompts, counts and order.
- Evidence: `web-guard-verify/result.json` (38 trials), `result-fix.json` and `result-control.json` (10 fox trials
  each), `shots/`, `red-r110.txt`, `green-r110.txt`.

## The 28 round-107 trials

| Build | Trials | Repeat on screen (round-107 yardstick) | Silent retries | Notices |
|---|---|---|---|---|
| base, round-97 guard | 28 | 4 | – | 0 |
| round 107 before the echo rule | 28 | 0 | 2 | 0 |
| **round 107 final, main 5490c77b** | 28 | **0** | 4 | 0 |

| Prompt | Trials | Retries | What the retry left on screen |
|---|---|---|---|
| ja-nenji | 4 | 0 | – |
| es-list | 4 + 5 | 2 | A#3: kept through item 23, then "La siguiente lista de frases continúa:" and items 24–30. A#4: kept "18. La única", then prose (below). |
| poem | 5 | 0 | – |
| he-explain | 5 | 1 | B#4: kept up to "*   **הגשה", and the continuation joined that line: "**הגשה ### סכנות והתקבלויות…" shows raw `**` and `###`. |
| verbs-de | 5 | 1 | B#2: kept through item 13, then "Here are 26 more German verbs…" and items 14–20. |

- **False cuts: 0.** No retry cut a repetition the user asked for.
- **A retried list went on as prose: 1 of 3.** In es-list A#4 the list stopped at 18 of 30. Item 18 reads "La única El
  éxito no viene del pasado; la próxima vez es tu trabajo propio. Al mismo tiempo…" and runs on as one paragraph
  (`shots/final-A-es-list-4-1440.png`).
- **A cut can land inside an item or a bold span.** The guard keeps text up to where the copy starts, and the
  continuation joins the same line. That produced the half item "18. La única" and the raw `**הגשה ###` above.
  This is not a repeat, but the reader sees broken text.

## The phone-pass rows

"Repeat exactly this sentence five times, each on its own line: The quick brown fox jumps over the lazy dog."

| Build | Trials | Five copies, own lines | Five copies, one line | One copy (the model's answer) | Guard |
|---|---|---|---|---|---|
| main 5490c77b | 5 | 3 | 2 | 0 | 2 silent retries, 0 notices, 0 false cuts |
| main 5490c77b, control run | 10 | 4 | 1 | 4, plus 1 "… dog. (5x)" | no guard action |
| this branch (F421) | 10 | 5 | 2 | 3 | 0 retries, 0 notices, 0 false cuts |

- **On main the asked repetition was never cut: 5 of 5 answers show exactly five copies.** In 2 of 5 the model wrote
  the copies on one line and began a sixth. The guard kept the five, which is right. Its silent retry then continued an
  answer that was already complete and invented text. Trial 1 added "The next line begins: 'The lazy cat barks at the
  swift owl.' This does not match any known real-world scenario…" (`shots/final-C-fox-5-1-1440.png`). Trial 4 added
  "The quick brown fox still manages to jump higher than the lazy dog because…".
- **Round 97 kept the five and ended with the notice; round 107 invents a sentence.** So this is a regression of the
  silent retry, and F421 fixes it in `guardLoops`. A tail-rule hit whose kept copies are the ones the user asked for
  ends the answer there, with no retry and no notice. Red first: `red-r110.txt` (2 of 3 failing on main). Green:
  `green-r110.txt`, core 1,033 and mobile 1,180 tests.
- **Live after the fix, 10 trials:** both over-counts (trials 5 and 10) end at exactly five copies, with nothing after
  them and no retry (`shots/fix-D-fox-5-5-1440.png`).
- **A one-copy answer is the model's own.** Instant stops after one sentence in about 0.5 s with no guard line in the
  log. It did so 4 of 10 times on main's bundle and 3 of 10 on the fixed one. The guard allows five copies for this
  ask and cannot cut below that.
- Writing the five copies on one line is the model's format, not a cut.

"List 40 animals, one per line, numbered." (main 5490c77b, 5 trials): 0 retries, 0 notices, and 0 repeats by the
yardstick. Yet trial 2 lists items 1–19 (Cat … Duck) and then the same 19 again as items 21–39. Trial 5 names 7 animals
twice, not as a block. Trial 1 names Zebra twice. Trial 3 switches to Chinese at item 27, and trial 4 lists the letters
A–Z.

**"1.\nLion" is how the page reads, not a cut.** The stored answer is "1. Lion\n2. Eagle…". On screen the number and
the animal share a line ("18. Goose", `shots/final-C-animals-40-2-1440.png`). The markdown list renders the number and
the text as two elements, so `innerText` returns a line break between them. The guard does not do this, and the model
did not write it.

## Same pattern as the device run (Build 22): a numbered block said again with new numbers

The final guard missed this in 3 of the 38 web answers, and the round-107 yardstick does not count it either:

| Trial | Block said again | Markup |
|---|---|---|
| animals-40 #2 | items 1–19 again as 21–39 | plain |
| verbs-de #1 | items 1–8 again as 18–25, and 4–10 as 11–17 | each verb in `**bold**` |
| verbs-de #3 | items 14–17 again as 22–25, glosses reworded | each verb in `*italics*` |

The echo rule reads the item numbers as words, so "1. Cat 2. Dog" never matches "21. Cat 22. Dog". Checked offline
on the stored answers: with each number replaced by a bullet, the final guard catches animals-40 #2 and verbs-de #1.
verbs-de #3 still passes, because the glosses were reworded. Round 111 (`loop-guard-lists`) is fixing this in
`loop.ts`, so it is not changed here.

## Files

- `web-guard-verify/trials.mjs`: the harness (`node trials.mjs <worktree> <port>`, with `SHOTS_DIR` set).
- `web-guard-verify/result.json`: 38 trials with screen text, stored answer, worst repeat on screen, retries (kept
  chars, unit, copies), notices and list shape.
- `web-guard-verify/result-fix.json`, `result-control.json`: the fox row on the fixed bundle and on main's.
- `web-guard-verify/shots/`: `final-*` from main, `fix-*` from this branch, `control-*` from the control run.
