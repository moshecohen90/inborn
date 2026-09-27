# iPhone 13 Pro device pass on build 1.0.0 (23): round 111's loop guard on the phone — 27.9.2026

Build 23 carries round 111's loop guard to Moshe's iPhone (`docs/qa/ios-build-23-2026-09-27.md`). Moshe's ruling is
that repetition must never reach the screen. This pass re-ran pass 22's rows unchanged, with the same prompts, the
same persona and the same yardstick. Evidence is in `docs/qa/ios-device-pass-23/`:

- `screens/` holds the screenshots. `sm-*` are 500 px copies of every shot, and full-size copies are kept for every
  row except the clean stress answers.
- `raw/` holds each run's `result-*.json` and driver log, `loop-rows.json` (the yardstick), `cut-check.json` (the seam
  check), the container listings, the gates and the archive checks.
- `scripts/` holds the bridge scripts, `make-scripts.py`, `analyze.py` (pass 22's yardstick, unchanged) and the new
  `cut-check.py`.

**No store upload.** Nothing went to TestFlight, App Store Connect or Play.

## The rows

| row | result | what the phone showed | evidence |
|---|---|---|---|
| store app **1.0.0 (23)** | **pass** | About reads `1.0.0 (23) · ede6da76a99f`. The byte copy before the install worked this time, and all six files are byte-identical after it | `S01-store-about-23`, `raw/install23.txt` |
| (a) first answer, tokens/s | **pass** | *"A lighthouse is primarily used for guiding ships safely through dark waters, warning of approaching hazards and illuminating the way home."* Ledger: **33.8 tok/s**, first token 841 ms, 207 + 24 tokens, 30 ms per token, 1.6 s | `A01`, `A02`, `result-a-first-answer.json` |
| (b) loop guard, 24 answers | **fail** | No numbered block, bold-split phrase or sentence repeated on screen, where pass 22 had three. Two answers at 0.7 still named a one-word item twice on screen, one of them back to back (*"22. Sponges / 23. Sponges"*). Three seams were visibly broken. 11 silent retries and 7 notices | tables below |
| (c) asked repetition | **fail, 1 of 3** | *"Repeat exactly this sentence five times, each on its own line: The quick brown fox jumps over the lazy dog."* Try 2 gave the five lines. Tries 1 and 3 gave the sentence once. None logged a retry, a cut or a notice, so the guard left the asked copies alone. The model stopped on its own | `C01`–`C03`, `result-c-asked-repeat.json` |
| (d) Continue after Stop | **fail, 1 of 3 clean** | Try 1: *"…previously thought unreachable In the 14th century…"*, no restart. Tries 2 and 3 repeated the stopped clause across the join (below). The continued text starts with the stopped text byte for byte in all three | `K01`, `K02` (+ `-try2`, `-try3`), `result-d-continue.json`, `result-d2-continue-again.json` |
| (e) Delete everything | **pass** | Chats 4.23 MB and Documents 253 B before. After the two-step sheet: the Welcome screen with **no "could not be opened" banner**. The container holds the new `inborn.db` (4 KB, `-wal` 125 KB, `-shm`) and **no `.corrupt` file**, and `documents/` is gone. A cold relaunch opened onboarding with no `banner-repair` and still no `.corrupt` | `E01`–`E03`, `raw/container-*.txt`, `result-e2-cold-relaunch.json` |
| (f) Documents size | **pass** | greenhouse-notes.txt attached: Privacy & storage reads **Documents 253 B**, the Documents screen *"1 document · 253 B on this device"*. Chats 4.23 MB, Models 0 B | `F01`, `F02`, `result-f-documents.json` |

The strip *"Slowing down to keep the phone cool"* is on screen from the first loop answer on, as in pass 22: round
109's thermal line with no action, on a phone answering back to back while charging.

## (b) The loop guard, answer by answer

The prompts, the persona "Assistant 0.2" and the sampling are pass 22's (`ios-device-pass-22-2026-09-27.md`), written by
the same `make-scripts.py`. The first try of math-long-div at 0.7 never started: `devicectl device copy to` failed with
CoreDevice error 7000, "The connection was interrupted". It was rerun after the other 0.7 answers, so its row is the
rerun.

`analyze.py` is pass 22's yardstick, unchanged. `cut-check.py` is new, and it looks at every seam the guard made on
the text the phone showed last. A seam is a snapshot taken back, a `loop retry: kept N chars` line (placed by that
N, so a retry no snapshot saw still counts), or the end of an answer under a notice. It flags five things:

- a bare item number at the end of the kept text
- an open `**` on the seam's line
- a retry that goes on inside a line the kept text left without a sentence end
- a list that goes on as prose after a retry
- an item number that goes down ("22. Sponges" then "10. Sponges"), the mark a retry leaves when it restarts a list

On pass 22's results it flags four seams. The Spanish item 24 runs into item 25 on one line
(*"24. La perseverancia 25. La única…"*). The Japanese table is left with an open `**`. The Hebrew retry goes on after
the bold-split phrase. And the false math cut runs on mid-sentence.

| answer | chars | repeat on screen at the end | item named twice | shown, then taken back (chars) | silent retries | notice | the seam on screen |
|---|---|---|---|---|---|---|---|
| ja-nenji 0.7 #1 | 484 | 0 | – | – | 0 | – | – |
| ja-nenji 0.7 #2 | 748 | 0 | – | – | 0 | – | – |
| he-explain 0.7 #1 | 1,116 | 0 | – | – | 0 | – | – |
| he-explain 0.7 #2 | 1,698 | 0 | – | – | 0 | – | – |
| **list30-animals 0.7 #1** | 352 | 0 | **Sponges back to back (22, 23); Octopus (8, 21)** | – | 1 | yes | the retry restarted the numbering at 10 in the Markdown; the list renders 23–26 |
| **list30-animals 0.7 #2** | 559 | 0 | **Dolphin (2, 6); "27. Clownfish (again, as listed before but distinct species…)"** | – | 1 | – | clean; the answer stops at 27 of 30 |
| es-list 0.7 #1 | 2,931 | 0 | – | – | 0 | – | – |
| es-list 0.7 #2 | 2,002 | 0 | – | 32 | 1 | – | clean: *"12. Lo más difícil es empezar; n"* taken back, item 12 restarts on a new line |
| fr-list 0.7 #1 | 856 | 0 | – | – | 0 | – | – |
| **fr-list 0.7 #2** | 795 | 0 | – | 2 | 1 | yes | **broken**: the model restarted the list, and the new intro *"Voici une autre sélection de 30 idées…"* stays, rendered inside item 8 |
| poem-refrainless 0.7 #1 | 1,015 | 0 | – | – | 0 | – | – |
| poem-refrainless 0.7 #2 | 1,779 | 0 | – | – | 0 | – | – |
| list25-verbs-de 0.7 #1 | 502 | 0 | – | – | 0 | – | – |
| list25-verbs-de 0.7 #2 | 225 | 0 | – | – | 0 | – | – |
| math-long-div 0.7 #1 | 285 | 0 | – | – | 0 | – | – (the rerun) |
| math-long-div 0.7 #2 | 950 | 0 | – | – | 0 | – | – |
| **he-list 0.2** | 165 | 0 | – | – | 1 | – | **broken end**: the retry added only "." after *"דרשינה,"*, so 18 of 30 names end on ",." with no notice |
| **ko-list 0.2** | 287 | 0 | – | – | 1 | yes | **list went on as prose**: *"다음은 다음 단계입니다."* ("Here is the next step.") under item 15, then the cut |
| ja-list-cities 0.2 | 14 | 0 | – | **89** | 1 | yes | clean boundary, but the whole city line was taken back (29 names, 長野 and 福井 twice). The screen keeps *"日本の都市を20個挙げます。"* and the notice |
| es-list 0.2 | 1,159 | 0 | – | – | 1 | yes | clean: ends after item 12 |
| fr-list 0.2 | 403 | 0 | – | 1 | 1 | yes | clean: ends after item 5 |
| math-long-div 0.2 | 2,749 | 0 | – | – | 1 | – | the retry kept *"…The number becomes 35."* and went on *" 354 divided by 123…"*. No snapshot saw the dropped text, so whether it was a copy is not known |
| list30-animals 0.2 | 173 | 0 | – | 1 | 1 | yes | clean: ends after "14. Sea Oyster" |
| ja-nenji 0.2 | 612 | 0 | – | – | 0 | – | – |

| set | answers | repeat on screen (pass 22's yardstick) | an item named twice on screen | silent retries | retry held, no notice | notices | text taken back | broken seam on screen |
|---|---|---|---|---|---|---|---|---|
| app temperature 0.7 | 16 | **0** (pass 22: 2) | **2** | 4 | 2 | 2 | 2 answers (32, 2 chars) | 1 |
| persona 0.2 | 8 | **0** (pass 22: 1) | 0 | 7 | 2 | 5 | 3 answers (89, 1, 1 chars) | 2 |

Across the 24 answers, the broken seams are 0 bare item numbers, 0 open `**` and 1 half-finished end (he-list's
",."). Two lists went on as prose after a retry: fr-list #2 with a restarted intro, and ko-list with a stray line.

### What still reached the screen

1. **A one-word item named again.** Round 111 cuts a repeated item only when it has 2 or more words or 8 or more code
   points, so answer keys such as True/False stay. "Octopus", "Sponges" and "Dolphin" are under that line. In
   list30-animals 0.7 #1, the guard's retry kept *"…21. Octopus\n22. Sponges\n"*. The retry's own text began
   *"10. Sponges\n11. Shrimp\n12. Crayfish\n13. Mollusk (Coral Reefs)"*, and the cut and notice came after that. The
   renderer numbers the list on, so the phone shows *"22. Sponges / 23. Sponges / 24. Shrimp…"*
   (`L07-list30-animals-1`). In #2, the retry fired after *"6. Dolphin"* and kept it, so Dolphin is items 2 and 6. The
   model then marked its own copy, *"27. Clownfish (again, as listed before but distinct species: Carcharodon)"*, and
   stopped with no notice (`L07-list30-animals-2`). Round 111 lists both as open.
2. **A restarted list keeps its new intro.** fr-list 0.7 #2 listed 8 gift ideas and then began again with *"Voici une
   autre sélection de 30 idées, conçue pour aller au-delà des cadeaux…"*. The cut came at the restarted "1.", so the
   intro stays with no blank line before it, and Markdown renders it as part of item 8 (`L07-fr-list-2`).
3. **A retry that writes prose or nothing.** Under 0.2, ko-list's retry wrote one sentence, *"다음은 다음 단계입니다."*,
   under item 15, and the cut followed. he-list's retry wrote only ".", so the answer ends *"…דריכה, דרשינה,."*
   (`L02-ko-list`, `L02-he-list`).

### Across a Continue

| try | stopped at | Continue added | on screen |
|---|---|---|---|
| 1 | *"…enabling sailors to cross oceanic territories previously thought unreachable"* | *"In the 14th century, maritime navigation improved drastically…"* | no restart |
| 2 | *"…established control over key spice routes in India and China through treaties like the"* | *"British colonial powers established control over key spice routes in India and China through treaties like the Indian Ocean Treaty of 1809…"* | **the clause twice** |
| 3 | *"…This necessitated the development of complex maritime navigation"* | *"The logistical challenges inherent in moving heavy commodities across rough seas necessitated the development of complex maritime navigation…"* | **the clause twice** |

Round 111's seam rule drops an overlap only when the continuation opens with the last three or more words of the
stopped sentence. In tries 2 and 3, Instant writes a new subject first and then restates the stopped clause, so about
60–85 characters repeat across the join. No retry, cut or notice fired in any try. The Columbus case from pass 22,
where the continuation opens with the overlap, did not recur in these three tries.

## The harness

Every row was driven through the round-51 bridge on `com.inbornapp.mobile.qa`, built from commit ede6da76, the same
commit as the store archive. The twin carries one `INBORN_QA_BRIDGE_V1`, round 111's length line and both models,
byte-exact, and was built with `EXPO_PUBLIC_AUTOPROMPT=file` (`raw/qa-verify.txt`). It was installed fresh and launched
with `--boot 45000`. It ran 32 scripts: one run per stress answer, one for the three fox tries, and one for the two
extra Continue tries, which start from onboarding after the wipe. It was uninstalled at the end.

`e-delete-everything` steps 15–17 fail, as they did in passes 21 and 22. After the wipe, the shell remounts and the
bridge loses its anchor ("the QA bridge never got a fiber"). The screenshot step still ran (`E02`), and
`e2-cold-relaunch` read the same screen from a fresh process with every step green.

## End state

- The phone keeps `com.inbornapp.mobile` **1.0.0 (23)**, launched and left on its chat root with no banner
  (`S02-store-first-screen-23`).
- `com.inbornapp.mobile.qa` is uninstalled.
- Every `devicectl … --console` launcher this pass started was killed by PID or ended when the next launch replaced
  it. No devicectl or pymobiledevice3 process is left.
- No simulator was booted. `apps/mobile/ios/build` was deleted.
- The phone was never locked or unlocked, and Settings were not touched.
- `com.inbornapp.mobile.uitests.xctrunner` from another stream was not touched.
