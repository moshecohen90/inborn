# iPhone 13 Pro device pass on build 1.0.0 (24): round 113's loop guard on the phone — 27.9.2026

Build 24 carries round 113's loop guard to Moshe's iPhone (`docs/qa/ios-build-24-2026-09-27.md`). Moshe's ruling is
that repetition must never reach the screen. This pass re-ran pass 23's rows unchanged, with the same prompts, the same
persona and the same scripts. Evidence is in `docs/qa/ios-device-pass-24/`:

- `screens/` holds the screenshots. `sm-*` are 500 px copies of every shot, and full-size copies are kept for every
  row except the stress answers with no guard action and no finding.
- `raw/` holds each run's `result-*.json` and driver log, `loop-rows.json` (pass 22's yardstick), `cut-check.json`
  (pass 23's seam check), `extra-check.json` and `continue-seams.json` (both new), the container listings, the gates
  and the archive checks.
- `scripts/` holds the bridge scripts, `make-scripts.py`, `analyze.py` and `cut-check.py`, all byte-identical to
  pass 23's. `extra-check.py` and `seam-check.py` are new, and so are `e0-setup-1.json` and `e0-setup-2.json`
  (see *The harness*).

**No store upload.** Nothing went to TestFlight, App Store Connect or Play.

## The rows

| row | result | what the phone showed | evidence |
|---|---|---|---|
| store app **1.0.0 (24)** | **pass** | About reads `1.0.0 (24) · bca4fe6132e6`. The byte copy was taken before the install, and all six files are byte-identical after it | `S01-store-about-24`, `raw/install24.txt` |
| (a) first answer, tokens/s | **pass** | *"A lighthouse illuminates distant points of light for navigation, guiding ships and people to safe waters."* Ledger: **33.2 tok/s**, first token 829 ms, 207 + 19 tokens, 30 ms per token, 1.4 s | `A01`, `A02`, `result-a-first-answer.json` |
| (b) loop guard, 24 answers | **fail** | **5 of 24 answers show a repeat on screen**: 2 of 16 at 0.7 and 3 of 8 under the 0.2 persona. Pass 22's yardstick scores all 24 as 0, because every repeat carries a new number, gloss, suffix or tail. No broken seam at any retry or cut, no instruction echo, and no restarted numbering. 8 silent retries, 7 notices | tables below |
| (c) asked repetition | **pass** (five lines in 1 of 3) | *"Repeat exactly this sentence five times, each on its own line: The quick brown fox jumps over the lazy dog."* Try 3 gave the five lines. Try 1 answered with the request itself, once, and try 2 gave the sentence once. None logged a retry, a cut or a notice, so the one-line answers are the model's own | `C01`–`C03`, `result-c-asked-repeat.json` |
| (d) Continue after Stop | **pass, 3 of 3** | No try restated the stopped clause. Tries 2 and 3 go on inside the stopped word group (*"…turning"* + *" point…"*). Try 1 leaves *"…transporting silk"* unfinished and starts a new sentence, as pass 23's try 1 did. No retry, cut or notice fired, and each continued text starts with the stopped text byte for byte | `K01`, `K02` (+ `-try2`, `-try3`), `result-d-continue.json`, `result-d2-continue-again.json`, `continue-seams.json` |
| (e) Delete everything | **pass** | Chats 350 KB and Documents 253 B before. After the two-step sheet: the Welcome screen with **no "could not be opened" banner**. The container holds the new `inborn.db` (4 KB, `-wal` 125 KB, `-shm`) and **no `.corrupt` file**, and `documents/`, `documents.json` and the attached file are gone. A cold relaunch opened onboarding with no `banner-repair` and still no `.corrupt` | `E01`–`E03`, `raw/container-*.txt`, `result-e2-cold-relaunch.json` |
| (f) Documents size | **pass** | greenhouse-notes.txt attached: Privacy & storage reads **Documents 253 B**, the Documents screen *"1 document · 253 B on this device"*. Chats 4.22 MB, Models 0 B | `F01`, `F02`, `result-f-documents.json` |

As in passes 22 and 23, the strip *"Slowing down to keep the phone cool"* is on screen from the stress answers on. It
is round 109's thermal line, with no action, on a phone answering back to back while charging.

## (b) The loop guard, answer by answer

The prompts, the persona "Assistant 0.2" and the sampling are pass 22's, written by the same `make-scripts.py`.
`analyze.py` (pass 22's yardstick) and `cut-check.py` (pass 23's seam check) are unchanged. They miss every repeat this
pass found, so `extra-check.py` adds what round 113 claims to fix and what they do not measure:

- an item said again once its parenthesis or its gloss after a colon is dropped ("sein (to be)" and "sein (to
  exist/remain)")
- an item of an inline numbered list said again, since `analyze.py` reads only line items
- a block of 3+ items said again with the same few characters added ("תל אביב" … then "תל אביב-המערב" …)
- an earlier item of 3+ words said whole again with a tail added
- a numbered list whose numbers go down across other lines (a restarted list with its intro)
- a line after a list under a cut or notice (prose after a list cut)
- four words in a row of the retry instruction in any snapshot (instruction self-talk)

Run on pass 23's results, it flags that pass's known findings and nothing new except one Hebrew sub-bullet that repeats
its parent's heading. That flag is left as a review mark.

| answer | chars | repeat on screen | shown, then taken back (chars) | silent retries | notice | the seam on screen |
|---|---|---|---|---|---|---|
| ja-nenji 0.7 #1 | 753 | – | 2 | 1 | yes | clean: ends on the line *"> **年次報告書（概要）**"*, the title of section 5, with nothing under it |
| ja-nenji 0.7 #2 | 827 | – | – | 0 | – | – |
| he-explain 0.7 #1 | 1,327 | – | – | 0 | – | – |
| he-explain 0.7 #2 | 508 | – | – | 0 | – | – |
| list30-animals 0.7 #1 | 257 | – | – | 1 | yes | clean: 22 distinct animals, ends after *"22. Whale Shark"* |
| list30-animals 0.7 #2 | 237 | – | – | 0 | – | – (the model answered in one prose sentence) |
| es-list 0.7 #1 | 2,361 | – | – | 0 | – | – (30 items) |
| es-list 0.7 #2 | 2,424 | – | – | 0 | – | – (30 items) |
| fr-list 0.7 #1 | 812 | – | – | 0 | – | **ends on a bare "-"** under *"5. **Société & Économie**"*: the answer's token budget, not the guard |
| fr-list 0.7 #2 | 840 | – | – | 0 | – | **ends mid-item** (*"Une paire de chaussettes en cuir noir avec des"*): the token budget, not the guard |
| poem-refrainless 0.7 #1 | 1,643 | – | – | 0 | – | – |
| poem-refrainless 0.7 #2 | 2,763 | – | – | 0 | – | – |
| **list25-verbs-de 0.7 #1** | 514 | **"sein" as items 1, 5 and 11; "haben" as 2 and 12**, each with a new gloss (*"1. sein: zu begehren, zu verlangen"*, *"5. sein: zu führen, zu begleiten"*) | – | 1 | yes | clean: ends after item 12 |
| **list25-verbs-de 0.7 #2** | 187 | **"4. sein (to be)" / "5. sein (to exist/remain)" back to back; "werden" as 6 and 8** | 1 | 1 | yes | clean: ends after *"8. werden (to happen)"* |
| math-long-div 0.7 #1 | 319 | – | – | 0 | – | – |
| math-long-div 0.7 #2 | 900 | – | – | 0 | – | – |
| **he-list 0.2** | 314 | **items 11–20 are items 1–10 again with "-המערב" added** (*"תל אביב-המערב"*, *"ירושלים-המערב"* …) | – | 0 | – | **ends on a bare "21"**: the token budget, with no guard action and no notice |
| **ko-list 0.2** | 269 | **an inline list: "김치찌개, 간장찌개, 고기국, 돼지국, 닭고기국" as items 14–18 and again as 24–28; "돼지국" as 7, 17 and 27** | – | 0 | – | – (ends at *"29. 생선"*, the token budget) |
| ja-list-cities 0.2 | 33 | – | – | 0 | – | – (one sentence, no list: *"日本には20個の都市があります。例えば、東京、大阪、京都などです。"*) |
| es-list 0.2 | 3,294 | – | 2 | 1 | yes | clean: ends after item 29 of 30 |
| **fr-list 0.2** | 1,039 | **item 4 said again as item 11 with a tail** (*"Un gadget portable (smartwatch, bracelet) pour suivre vos passions"* + *"et les événements importants."*); **item 7 again as 12** (+ *"pour créer des moments uniques avec vous."*) | 2 | 1 | yes | clean: ends after item 13 |
| math-long-div 0.2 | 1,212 | – | 10 (*" Since 765"*) | 1 | – | clean: *"…making the number 765."* then *" 765 divided by 123…"* |
| list30-animals 0.2 | 234 | – | – | 1 | yes | clean: 19 distinct animals, ends after *"19. Sea Eagle"* |
| ja-nenji 0.2 | 638 | – | – | 0 | – | – |

| set | answers | repeat on screen (pass 22's yardstick) | repeat on screen (this pass) | silent retries | retry held, no notice | notices | text taken back | broken seam at a retry or cut |
|---|---|---|---|---|---|---|---|---|
| app temperature 0.7 | 16 | 0 (pass 23: 0) | **2** (pass 23: 2) | 4 | 0 | 4 | 2 answers (2, 1 chars) | 0 |
| persona 0.2 | 8 | 0 (pass 23: 0) | **3** (pass 23: 0) | 4 | 1 | 3 | 3 answers (2, 2, 10 chars) | 0 |

Across the 24 answers there are 0 bare item numbers, 0 open `**`, 0 restart intros, 0 prose lines after a list cut, 0
numbers going down and 0 instruction echoes at any seam the guard made. Round 113's seam fixes hold on the phone:
pass 23 had three broken seams and two lists that restarted or went on as prose.

### What still reached the screen

1. **The same word again, with a different note.** Round 113 cuts a short item listed again, but
   `packages/core/src/chat/loop.ts:610` counts an earlier item as the same only when one of the two has no note, the
   notes are equal, or the new one says "again". "sein (to be)" and "sein (to exist/remain)" carry two different notes,
   so they are two items by design, the way "Dolphin (bottlenose)" and "Dolphin (river)" are. In the "verb: gloss"
   form, the whole line is the key. The guard's retry and cut came later, on other units, so the earlier copies stay.
   In pass 23 the model refused this prompt both times, so this is new exposure, not a regression.
2. **An inline numbered list.** ko-list wrote all 29 items on one line. The block *"김치찌개, 간장찌개, 고기국, 돼지국,
   닭고기국"* comes back ten numbers later, and the guard logged nothing: no retry, no cut, no notice.
3. **A block said again with a suffix.** he-list wrote ten place names and then the same ten with "-המערב" ("West")
   added, and stopped on a bare "21" at the token budget. Each line is new text, so no rule fired.
4. **An item said again with a tail.** fr-list 0.2 restated items 4 and 7 as items 11 and 12, each with a clause added.
   The guard did retry and cut this answer, but after item 13, so both restatements stay.

The two French answers at 0.7 that end mid-item are not the guard: *"Donne-moi 30 idées…"* is not read as a count by
`packages/core/src/chat/length.ts`, so the answer gets a short budget and stops where the budget ends, with no notice.
Pass 23's first French answer ended the same way (*"11. Une belle table ronde en"*).

## Across a Continue

| try | stopped at | Continue added | on screen |
|---|---|---|---|
| 1 | *"…Chinese merchants expanded further into Europe through the Manila Galleon trade, transporting silk"* | *"The Manila Galleon trade, a maritime artery that connected the Malacca Strait to China's southern ports…"* | no restated clause; the stopped sentence is left without its end |
| 2 | *"…eastward along the coast of India itself.\n\nThe pivotal turning"* | *"point marked the fall of the Ottoman Empire to the Dutch Republic in 1642…"* | clean |
| 3 | *"…without compromising safety or speed.\n\nThe medieval era marked a turning"* | *"point where the primary driver of trade shifted from direct ocean voyages…"* | clean |

`seam-check.py` finds the longest run of the stopped sentence's last words inside the continuation's first sentence.
On pass 23's tries 2 and 3 it finds the 14- and 7-word restatements that pass reported, and on these three it finds
none. Try 1 names "the Manila Galleon trade" again as the new sentence's subject. That is not the end of the stopped
sentence ("transporting silk"), so round 113's rule (5 words or 24 code points of that end) leaves it alone. The rule
writes no log line, so whether it dropped anything in these tries is not visible. What the screen shows has no restated
clause.

## (e) Delete everything

The wipe ran on a fresh twin (see *The harness*), with one chat and one attached .txt: Privacy & storage read Chats
350 KB and Documents 253 B (`E01`). After *Delete everything* and its second step, the phone showed Welcome with no
banner (`E02`). `raw/container-before-wipe.txt`, `container-after-wipe.txt` and `container-after-relaunch.txt` show
the new 4 KB `inborn.db`, no `.corrupt` file, and no `documents/`, `documents.json` or `greenhouse-notes.txt`. The
cold relaunch read the Welcome text with every step green and no `banner-repair` (`E03`, `result-e2-cold-relaunch.json`).

`e-delete-everything` steps 15–17 fail, as they did in passes 21–23. After the wipe the shell remounts and the bridge
loses its anchor ("the QA bridge never got a fiber"). The screenshot step still ran, and `e2-cold-relaunch` read the
same screen from a fresh process.

## The harness

Every row was driven through the round-51 bridge on `com.inbornapp.mobile.qa`, built from commit bca4fe61, the same
commit as the store archive. The twin carries one `INBORN_QA_BRIDGE_V1`, round 111's length line, round 113's
repeat-marker alternation and both models, byte-exact, and was built with `EXPO_PUBLIC_AUTOPROMPT=file`
(`raw/qa-verify.txt`). It was installed fresh and launched with `--boot 45000`.

It ran 34 scripts: one per stress answer, the persona, the fox and the first Continue, Documents, and then the wipe,
the cold relaunch and the two extra Continue tries. The order and the scripts are pass 23's, with two setup scripts
added before the wipe.

The wipe needed a fresh container:

1. The first `e-delete-everything` never reached the phone. `devicectl device copy to` failed with CoreDevice error
   7000, "The connection was interrupted", the error pass 23 also hit once. So `e2-cold-relaunch` found the chat and not
   Welcome, and its `cleanup` step removed `Documents/qa` as designed.
2. `d2-continue-again` was then pushed without a launch. `devicectl` recreated `Documents/qa/in` itself, and the app
   cannot write inside a folder `devicectl` made (the same folder also refused an AFC delete with status 10). From then
   on, the bridge died at start in every launch.
3. The twin was uninstalled and installed again from the same build. `e0-setup-1` (onboarding and one answer) and
   `e0-setup-2` (one attached .txt) gave the wipe something to delete, and every run after a sweep started with
   `--launch`, so the app made `Documents/qa` before anything was pushed. The failed attempts' logs stay in the
   scratch folder. Rows (a)–(c) and (f) and the first Continue ran before this and are unaffected.

The driver's log of `a-first-answer` holds only its launch line. Its `result-a-first-answer.json` has all 37 steps
green, and the ledger values above come from it.

## End state

- The phone keeps `com.inbornapp.mobile` **1.0.0 (24)**, launched and left on its chat root with no banner but the
  thermal strip (`S02-store-first-screen-24`).
- `com.inbornapp.mobile.qa` is uninstalled.
- Every `devicectl … --console` launcher this pass started was killed by PID or ended when the next launch replaced
  it. No devicectl or pymobiledevice3 process is left.
- No simulator was booted. `apps/mobile/ios/build` was deleted.
- The phone was never locked or unlocked, and Settings were not touched.
- `com.inbornapp.mobile.uitests.xctrunner` from another stream was not touched.
