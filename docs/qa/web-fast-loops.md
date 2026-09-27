# Round 111's loop guard on the web with Fast (Qwen3.5-2B), live

MosheAI asked: round 110 measured the web guard on Instant, but a desktop browser downloads Fast. This run measures the
round-111 guard (`origin/main` 98722df7) on the web export with Fast.

## Setup

- Build: `pnpm web:build` of 98722df7, served from `apps/web/dist` by `scripts/serve-web.mjs` on port 8798 with
  `/Users/moshecohen/dev/inborn/.models`. The bundle carries round 111's length line ("Do not repeat yourself unless…").
- Fast is the Model step's own pick on this Mac: "Download Fast to this browser · RECOMMENDED FOR THIS BROWSER ·
  1.28 GB · ~4-15 tok/s" (`web-fast-loops/shots/model-step-1440.png`). The harness pressed Download without changing it.
- Engine as loaded: `[wllama] loaded fast · threads=6 isolated=true gpuLayers=0 nCtx=4096`, WASM, no WebGPU.
- Headless Chromium (`chromium_headless_shell`) at 1440×900, first-run onboarding, a fresh chat per prompt, the app's
  own answer limits.
- Harness: `web-fast-loops/trials.mjs`, a copy of round 110's `web-guard-verify/trials.mjs`. It keeps Fast at the Model
  step and reads tok/s from the stored message. It also applies round 111's item rule to the final screen text and the
  stored answer: an item of two words or more, or of 8 code points, listed again.
- The web engine sets no seed. One trial per prompt is a small sample, so list30-animals ran 3 more times.

## The 10 prompts, once each (16:03–16:08 UTC)

| Prompt | Chars | tok/s | Repeat on screen | Silent retries | Notices | Broken cut | List goes on as prose |
|---|---|---|---|---|---|---|---|
| ja-nenji | 852 | 18.0 | 0 | 0 | 0 | no | no |
| he-explain | 987 | 17.6 | 0 | 0 | 0 | no | no |
| list30-animals | 175 | 15.7 | 0 | 1 | **1** | no | no, the list stops at 12 of 30 |
| es-list | 1,664 | 17.3 | 0 | 0 | 0 | no | no, 30 of 30 |
| fr-list | 249 | 19.2 | 0 | 0 | 0 | no | not a list (the model's own answer) |
| poem-refrainless | 1,834 | 17.9 | 0 | 0 | 0 | no | – |
| list25-verbs-de | 694 | 18.3 | 0 (2 verbs named again with a new gloss) | 0 | 0 | no | no, 25 of 25 |
| math-long-div | 1,115 | 16.3 | 0 | 0 | 0 | not by the guard: the 512-token limit ends it on "8. Bring down **1" | no |
| animals-40 | 424 | 17.3 | 0 | 0 | 0 | no | 40 distinct animals on one line |
| fox ×1 | 224 | 17.8 | 5 copies, as asked | 0 | 0 | no | – |

**Totals: 10 answers, 0 loops on screen, 1 silent retry, 1 notice, 0 broken cuts by the guard, 0 lists turned to prose.**

- **list30-animals ends at item 12 with the notice.** The guard kept "1. Shark … 12. Sea Bass" and retried. The retry
  looped too, so the answer ends with "The model started repeating itself, so the answer was cut short. Try again."
  (`shots/S-list30-animals-1-1440.png`). The log reads `loop retry: kept 175 chars, unit 8 cp x2`, then
  `loop cut: kept 175 of 205 chars, unit 9 cp x2`. Nothing of the retry stayed on screen.
- **Fox:** exactly five copies, each on its own line, with no guard action. The asked repetition was not cut.
- **list25-verbs-de:** "3. gehen – to go" and "20. gehen – to go on a trip", "4. kommen – to come" and "21. kommen –
  to arrive". One word under 8 code points with a different gloss is not a repeat under round 111's rule. The guard let
  it through, which matches the rule (`shots/S-list25-verbs-de-1-1440.png`).
- **math-long-div:** the steps are correct through step 7 (quotient digits 8 0 2 9 7 0). The answer used all 512 tokens
  and stops inside step 8, so the reader sees a raw `**1` (`shots/S-math-long-div-1-1440.png`). No guard line was logged.
- **fr-list is the model's answer, not a cut:** one sentence listing gift categories, then "Cela fait 2017." (60 tokens,
  no guard line).
- **animals-40:** "1. Tiger 2. Lion … 40. Partridge" on one line, all distinct. The one-per-line format was ignored by
  the model; the guard did nothing.

## list30-animals run 3 more times

Every list30 answer on Fast ended the same way: a silent retry, then a second loop and the notice.

| Rerun | Chars | tok/s | Retry kept | Items on screen | Name listed again | Notice | List goes on as prose |
|---|---|---|---|---|---|---|---|
| 1 | 401 | 19.9 | 1–28 (unit 19 cp x2) | 29 of 30 | "27. Octopus (octopuses)", "28. Squid (squids)" repeat 5 and 18 | 1 | no |
| 2 | 1,976 | 15.8 | 1–15 (unit 9 cp x2) | 21, then prose | "13. Shark", "14. Dolphin" repeat 2 and 4 | 1 | **yes, about 1,700 chars** |
| 3 | 444 | 15.1 | 1–19 (unit 28 cp x2) | 24 of 30 | "22. Crab (Lobster)…" repeats 13 | 1 | **item 22 is a sentence** |

- **The silent retry leaks the model's talk about the retry instruction (2 of 3).** The retry sends "Continue exactly
  where you stopped. Do not repeat what you already wrote." (`apps/mobile/src/screens/Chat.tsx:189`). In rerun 2 the
  continuation on screen reads: "22. Sea Snake (Jellyfish) - wait, that's a jellyfish above. Let me correct: 21. Sea
  Urchin / 23. Crab Crab Crab... no. I need to list new ones … To strictly follow "Continue exactly where you stopped"
  without repeating what *already wrote* means I must add more…". Then come four paragraphs of planning, and the answer
  ends with the notice (`shots/rerun-list30-animals-2-1440.png`). In rerun 3 item 22 reads "Crab (Lobster) host species
  - *Cannabis Sativa* is a plant, so I will list 3 more distinct animals here:".
- **Single-word animals listed again reach the screen.** "Shark", "Dolphin", "Octopus" and "Squid" are under 8 code
  points. "Octopus (octopuses)" differs from "Octopus" by its bracket. Round 111's item rule counts neither case, so the
  yardstick shows 0 repeats. The reader still sees the same animal twice.
- **The cuts themselves are clean.** Every kept text ends on a whole item and a line break ("12. Sea Bass\n",
  "28. Squid (squids)\n", "15. Sea Turtle\n", "19. Starfish\n"). In reruns 1 and 3 the longest screen text sampled while
  streaming held only the next number ("29. Sea bass / 30▍", "24. Octopus / 25▍"). No copy of a looped item was shown
  and then taken back.

## Files

- `web-fast-loops/trials.mjs`: the harness (`SHOTS_DIR=… DEADLINE=<epoch ms> node trials.mjs <worktree> <port>`;
  `ONLY=<id> REPEAT=<n> RESULT=<file>` runs one prompt n times).
- `web-fast-loops/result.json`: the 10 prompts, with screen text, stored answer, usage, guard lines, list shape and the
  item rule on screen and stored text.
- `web-fast-loops/result-list30-rerun.json`: the 3 list30 reruns, with the longest screen text seen while streaming.
- `web-fast-loops/shots/`: the Model step, every answer with a retry or notice, the fox, verbs-de, math and animals-40.
