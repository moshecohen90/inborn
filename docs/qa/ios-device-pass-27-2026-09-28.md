# iPhone 13 Pro device pass on build 1.0.0 (27): rounds 115 and 116's loop guard on the phone — 28.9.2026

Build 27 carries rounds 115 and 116's loop guard to Moshe's iPhone (`docs/qa/ios-build-27-2026-09-28.md`). Moshe's
ruling is that repetition must never reach the screen. This pass ran pass 25's rows unchanged, with the same prompts,
the same persona and the same scripts, and it ran all of them, where pass 26 stopped at 21 of the 24 loop answers.
Evidence is in `docs/qa/ios-device-pass-27/`:

- `screens/` holds the screenshots. `sm-*` are 500 px copies of every shot. Full-size copies are kept for every row
  except the ten stress answers with no guard action and nothing to discuss.
- `raw/` holds each run's `result-*.json` and driver log, `loop-rows.json` (pass 22's yardstick), `cut-check.json`
  (pass 23's seam check), `extra-check.json` and `continue-seams.json` (pass 24's), `end-check.json` (pass 25's),
  `r115-check.json` (pass 26's), `r116-check.json` (new), the container listings, the gates, the archive checks, the
  install record, `NOTES.txt` (the run's log, step by step) and `diag-twin-0920.png` (see *The harness*).
- `scripts/` holds pass 26's scripts, byte-identical except the eight `l02-*.json`, which `make-scripts.py` wrote again
  with this twin's persona id (the only line that differs). `r116-check.py` is new.

**No store upload.** Nothing went to TestFlight, App Store Connect or Play.

## The rows

| row | result | what the phone showed | evidence |
|---|---|---|---|
| store app **1.0.0 (27)** | **pass** | About reads `1.0.0 (27) · a233a44b8b57`. The byte copy was taken before the install, and all six files are byte-identical after it | `S01-store-about-27`, `raw/install27.txt` |
| (a) first answer, tokens/s | **pass** | *"A lighthouse is a beacon of light used for navigation, guiding ships through dark ocean waters."* Ledger: **32.9 tok/s**, first token 834 ms, 207 + 18 tokens, 30 ms per token, 1.4 s | `A01`, `A02`, `result-a-first-answer.json` |
| (b) loop guard, 24 answers | **fail** | **4 of 24 answers show an item or a line said again** in their final text: three at 0.7 and one under the 0.2 persona. Two more showed a copy for 0.7 to 1.4 s before the retry took it back. **1 broken seam**, where a retry glued a bold title to the last verse line. No notice on a budget end. 11 silent retries, 9 notices | tables below |
| (c) asked repetition | **pass** (five lines in 1 of 3) | *"Repeat exactly this sentence five times, each on its own line: The quick brown fox jumps over the lazy dog."* Try 1 gave the five lines. Tries 2 and 3 gave the sentence once. None logged a retry, a cut or a notice | `C01`–`C03`, `result-c-asked-repeat.json` |
| (d) Continue after Stop | **fail, 2 of 3** | Each continued text starts with the stopped text byte for byte, and no try restated the stopped clause. **Try 2's continuation said the whole paragraph before the stop again**, 701 characters identical but for one capital letter, before going on. Try 1 joins *"…for control over The Portuguese Empire, led by…"*. No join reads ",." or ";." | `K01`, `K02` (+ `-try2`, `-try3`), `result-d-continue.json`, `result-d2-continue-again.json`, `continue-seams.json` |
| (e) Delete everything | **pass** | Chats 4.19 MB and Documents 253 B before. After the two-step sheet: the Welcome screen with **no "could not be opened" banner**. The container holds the new `inborn.db` (4 KB, `-wal` 125 KB, `-shm`) and **no `.corrupt` file**, and `documents/`, `documents.json` and the attached file are gone. A cold relaunch opened onboarding with no `banner-repair` and still no `.corrupt` | `E01`–`E03`, `raw/container-*.txt`, `result-e2-cold-relaunch.json` |
| (f) Documents size | **pass** | greenhouse-notes.txt attached: Privacy & storage reads **Documents 253 B**, the Documents screen *"1 document · 253 B on this device"*. Chats 4.19 MB, Models 0 B | `F01`, `F02`, `result-f-documents.json` |

As in passes 22 to 26, the strip *"Slowing down to keep the phone cool"* shows on some screenshots, `E02` among them.
It is round 109's thermal line, with no action, on a phone answering back to back while charging.

## What rounds 115 and 116 claim, on the phone

| claim | on the phone |
|---|---|
| a fenced block whose line pair recurs is cut at two copies, the fence closed, with a notice and no retry into it | **not exercised.** math-long-div 0.7 #2 wrote one closed fenced block with no line said twice (`r115-check.json`: most said line 1×). Try 1 and the 0.2 answer wrote no block |
| an item said again with a one-letter misspelling or in another grammatical form is cut at the second copy (es *"haciendo → hacer"*, fr *"Des objets → Un objet"*) | **not exercised as such.** Both lists came back without that kind of copy. fr-list 0.2 said item 4 again in another way that no rule reads (below) |
| an inline comma list's cut ends before the repeated word (he-list *"…ברוז"*) | **not exercised.** he-list 0.2 wrote a numbered list, and its retry and cut are clean |
| an inline numbered retry keeps its ", " (ko-list *"15. 파, 16. 오징어"*) | **not exercised.** ko-list 0.2 answered in one sentence with no retry |
| a CJK list running into prose gets "。" | **holds.** ja-list-cities 0.2 reads *"…山口、鳥取。これ以上は続けます。"* after its retry |
| the Continue join is never ",." or ";." | **holds, not exercised on a comma.** No try stopped after a comma or semicolon, and no answer holds ",." ";." "，。" or "；。" |
| a correct long division is not falsely cut | **holds.** Neither 0.7 try drew a guard action. The 0.2 cut removed a 51-code-point run said twice (below) |
| asked repetition is left alone | **holds.** Five lines in try 1, no guard action |
| a budget end shows no notice | **holds.** fr-list 0.7 #1 and #2 and math-long-div 0.7 #2 stop at the token budget with no notice |

## (b) The loop guard, answer by answer

The prompts, the persona "Assistant 0.2" and the sampling are pass 22's, written by the same `make-scripts.py`.
`analyze.py` (pass 22), `cut-check.py` (pass 23), `extra-check.py` (pass 24), `end-check.py` (pass 25) and
`r115-check.py` (pass 26) are unchanged. `r116-check.py` adds what round 116 claims and they do not measure, reading the
final answer and, where marked, every snapshot:

- two list items of 5+ words whose 5-letter word stems match at 70% or more (every snapshot);
- two item heads that match once one leading article is dropped and each word loses a plural ending (every snapshot);
- a word or phrase said twice in one unnumbered inline list (every snapshot);
- two numbered items of one inline list with no separator between them;
- an inline list whose last part is a sentence twice as long as its longest item, with no full stop between them.

Run on pass 26's results, it flags exactly that pass's five findings and nothing else, and on pass 25's results it
flags nothing. Every answer was also read in full, because three of the four repeats below are of a kind no script reads.

| answer | chars | repeat on screen | item named twice | shown, then taken back (chars) | silent retries | notice | the seam on screen |
|---|---|---|---|---|---|---|---|
| ja-nenji 0.7 #1 | 1,165 | – | – | – | 0 | – | – |
| ja-nenji 0.7 #2 | 530 | – | – | – | 0 | – | – |
| he-explain 0.7 #1 | 1,232 | – (review mark below) | – | **47**, a copy of item 2's sentence, in 2 snapshots | 1 | yes | clean: ends on item 5's bold question, *"5. **מה זה אומר אם לא מתאימה למשמעות?**"*, with no text under it |
| he-explain 0.7 #2 | 595 | – | – ("אנדרוארלוקס", then "אנדרוארלוקס מקטעני") | – | 0 | – | – |
| **list30-animals 0.7 #1** | 387 | **item 23 names item 8 again**: *"8. Octopus"*, then *"23. Octocephalus (Octopus)"* | the same ("Whale", then "Whale Shark", kept by design) | – | 1 | – | clean: the retry kept 15 items and went on *"16. Cormorant"* to *"30. Sea Otter"* |
| list30-animals 0.7 #2 | 307 | – | – ("Whales", then "Blue whale", "Whale sharks" and "Whale toothfish") | – | 1 | yes | clean: 22 animals, ends after *"22. Pufferfish"* |
| es-list 0.7 #1 | 2,336 | – | – | – | 0 | – | – (20 items, then a question) |
| es-list 0.7 #2 | 1,473 | – | – | – | 0 | – | – (20 items, then a question) |
| fr-list 0.7 #1 | 918 | – | – | – | 0 | – | – (**ends mid-item 11** at the token budget: *"11. Des accessoires de cuisine uniques"*) |
| fr-list 0.7 #2 | 916 | – | – | – | 0 | – | – (**ends mid-item 14**: *"14. Des objets de qualité et dur"*) |
| **poem-refrainless 0.7 #1** | 1,231 | **the poem's title said again**, *"**The Silent Lagoon of Blackstone (continued)**"*, written by the retry | – | – | 1 | yes | **broken**: the title is glued to the last verse line, *"…quiet, slow, strange things. **The Silent Lagoon of Blackstone (continued)**"* |
| poem-refrainless 0.7 #2 | 883 | – | – | – | 0 | – | – |
| list25-verbs-de 0.7 #1 | 540 | – | – | – | 1 | yes | clean: ends after *"18. zu glauben (to believe)"* |
| **list25-verbs-de 0.7 #2** | 395 | **items 20–24 are five earlier verbs again with an object or adverb added**: *"8. to drink"* … *"20. to drink water"*, *"5. to eat"* … *"21. to eat cake"*, *"6. to work"* … *"22. to work hard"*, *"7. to walk"* … *"23. to walk fast"*, *"19. to talk"* … *"24. to talk loudly"* | the same | – | 1 | yes | clean: ends after *"24. to talk loudly"* |
| math-long-div 0.7 #1 | 732 | – | – | – | 0 | – | – (one paragraph of prose, no steps and no code block) |
| math-long-div 0.7 #2 | 1,367 | – (review mark below) | – | – | 0 | – | – (a closed code block, then steps; **ends mid-step** at the token budget: *"- $72 / 123"*) |
| he-list 0.2 | 168 | – | – | 2 (*"14"*) | 1 | yes | clean: 13 names, ends after *"13. רמת גן"* |
| ko-list 0.2 | 90 | – | – | – | 0 | – | – (one sentence with an unnumbered inline list) |
| ja-list-cities 0.2 | 89 | – (shown and taken back) | – | **3**, *"、鳥取"*: the line read *"…山口、鳥取、鳥取"* in 1 snapshot | 1 | – | clean: *"…山口、鳥取。これ以上は続けます。"*, with round 116's "。" |
| es-list 0.2 | 1,388 | – (review mark below) | – | – | 0 | – | – (20 items) |
| **fr-list 0.2** | 753 | **item 10 is item 4 again**, with *"unique"* dropped and examples added, written by the retry | the same | 2 (*"10"*) | 1 | yes | clean at the retry (item 9, then 10) and at the cut after 10 |
| math-long-div 0.2 | 813 | – (review mark below) | – | – | 1 | yes | clean: the retry went on inside step 6's sentence (below) |
| list30-animals 0.2 | 243 | – | – ("Turtle", then "Sea Turtle", kept by design) | – | 1 | yes | clean: 19 animals, ends after *"19. Sea Snail"* |
| ja-nenji 0.2 | 606 | – | – | – | 0 | – | – |

| set | answers | repeat on screen (pass 22's yardstick) | repeat on screen (this pass) | silent retries | retry held, no notice | notices | text taken back | broken seam at a retry or cut |
|---|---|---|---|---|---|---|---|---|
| app temperature 0.7 | 16 | 0 (pass 26: 0) | **3** (pass 26: 0) | 6 | 1 | 5 | 1 answer (47 chars) | **1** |
| persona 0.2 | 8 | 0 (pass 26: 0 of 5) | **1** (pass 26: 3 of 5) | 5 | 1 | 4 | 3 answers (2, 3, 2 chars) | 0 |

`cut-check.py` reads 17 seams in the 24 answers. It flags *half-item* at ja-list-cities' retry and *list-to-prose* at
math-long-div 0.2's retry, and nothing else: 0 bare item numbers, 0 open `**`, 0 numbers going down. Both flags are
false. At the first, the kept text ended on a city name and the retry went on in the same line with "。", which is how
round 116 ends an inline list before a sentence. At the second, the retry went on inside step 6, which is not prose
after a list. The one broken seam, poem-refrainless 0.7 #1, is one `cut-check.py` does not read: a bold line joined to
a verse line with a space. `extra-check.py` finds 0 instruction echoes and 0 restart intros, and `end-check.py` 0 bare
markers at an answer's end. Both flag one item head said again, *"Bring down the next digit"* in steps 2 to 6 of
math-long-div 0.2, a review mark below. `r115-check.py` finds 0 ",." joins and 0 fenced lines said twice, and its
*misspelt* flags are the two review marks below. `r116-check.py` flags *commaTwiceShown* at ja-list-cities (the
snapshot above), *listIntoProse* at ko-list, whose last clause *"야채 요리 등 다양한 종류가 있습니다."* is the model's own sentence
with no retry, and *nearItem* at math-long-div 0.7 #2's steps. It also flags *commaTwiceShown* at the second Continue
run, which is try 2's paragraph said twice (see *Across a Continue*). None of the four repeats in the final answers of
(b) is flagged by any script.

**Notices.** All 9 notices come after a `[chat] loop retry … x2` line, so each answer had repeated before the guard
stepped in. None is on a budget end. The three answers that stop mid-item or mid-step at the token budget (fr-list 0.7
#1 and #2, math-long-div 0.7 #2) show none, and none ends on a bare marker.

### What still reached the screen

1. **fr-list 0.2: item 10 is item 4 said again in other words.** The list reads
   *"4. Une expérience culinaire unique avec un chef local."* and then
   *"9. Une expérience culinaire avec une cuisine maison."*. The retry fired after item 9
   (*"kept 661 chars, unit 69 cp x2"*), took back *"10"*, and wrote
   *"10. Une expérience culinaire avec un chef local (ex: cuisine maison, repas à la française)."*. The guard cut the
   answer after it (*"kept 753 of 805 chars, unit 48 cp x2"*) and showed the notice, so item 10 stays on screen
   (`L02-fr-list`). **Verdict: a repeat on screen.** Item 10's head (cut at " (") is item 4 without *"unique"*. Round
   116's stem rule keeps the pair, because the words only one side has, *"unique"* in item 4 and the examples in item
   10, are not short words. Round 114's head rule does not read it either, because the heads differ by a word.
2. **poem-refrainless 0.7 #1: the title said again, on the last verse line.** The retry fired after
   *"…For here lies my home in a world of quiet, slow, strange things."* (*"kept 1183 chars, unit 51 cp x2"*) and wrote
   *" **The Silent Lagoon of Blackstone (continued)**"*, the poem's first line with *"(continued)"* added, as a second
   start of the poem. The guard cut what followed (*"kept 1231 of 1279 chars, unit 46 cp x2"*) and showed the notice.
   The screen reads *"…quiet, slow, strange things. **The Silent Lagoon of Blackstone (continued)**"* on one line
   (`L07-poem-refrainless-1`). **Verdict: a repeat on screen and a broken seam.** The title is a line said again, and
   the retry's new block is glued to the verse line with a space.
3. **list25-verbs-de 0.7 #2: five verbs said again with a word added.** Asked for 25 German verbs, the model listed
   English ones. Items 20 to 24 are items 8, 5, 6, 7 and 19 again with an object or an adverb: *"to drink water"*,
   *"to eat cake"*, *"to work hard"*, *"to walk fast"*, *"to talk loudly"*. Items 15 and 16, *"to run away"* and
   *"to sleep on"*, follow items 1 and 4 the same way, though each is a phrasal verb of its own. The retry fired after
   item 24 and the cut came with the notice (`L07-list25-verbs-de-2`). Round 114's `goesOnFrom` keeps an item that goes
   on past a space from an earlier item of fewer than 3 words, as it keeps *"Whale shark"* after *"Whale"*. Here the
   earlier item is the same verb.
4. **list30-animals 0.7 #1: an animal named again under an invented name.** *"8. Octopus"*, and the retry's
   *"23. Octocephalus (Octopus)"* (`L07-list30-animals-1`). The head is a word that names no animal, and its gloss is
   item 8. No rule reads a gloss as an item.

**Shown, then taken back.** Two answers showed a copy that the next retry took back:

- ja-list-cities 0.2 showed *"…佐賀、山口、鳥取、鳥取"* in one snapshot, then *"、鳥取"* was gone, about 0.7 s later.
  The retry's log reads *"unit 3 cp x4"*.
- he-explain 0.7 #1 showed *"   פוטוסינתזה היא רק סוג של מוצר; המצבים האופטי"* under item 5's heading in two snapshots,
  about 1.4 s, then the retry took it back (*"kept 1232 chars, unit 73 cp x2"*). It is the start of item 2's sentence
  again (*"ייתכן שהפוטוסינתזה היא רק סוג של מוצר ציבורי … המצבים האופטי-האלקטרוניים"*). The retry wrote one
  character, the guard cut it (*"kept 1232 of 1233 chars, unit 1 cp x1"*), and item 5's heading ends the answer
  with nothing under it.

The bare numbers *"14"* (he-list) and *"10"* (fr-list) were each in one snapshot and gone by the next.

**math-long-div 0.2: the cut is not false.** The answer reads *"6. Bring down the next digit (6), making the number
543. Divide 543 by 123: 123 × 4 = 492 and 123 × 5 = 615. 123 × 4 = 492, so the quotient at this position is 004."*
The retry fired after *"615."* (*"kept 756 chars, unit 51 cp x2"*), and the cut came after *"004."*
(*"kept 813 of 864 chars, unit 51 cp x2"*). Both lines name a 51-code-point run said twice back to back, and neither
run was ever shown: the snapshots go from 317 characters to the 756 the retry kept. The kept step is right (543 = 4 ×
123 + 51), and saying *"123 × 4 = 492"* once as a candidate and once as the choice is how a worked step reads. The
steps before it are wrong from step 1: the first three digits are 987, not 98, and 76, 54 and 43 are not partial
dividends. So the answer stops at step 6 without a quotient, under the notice. The true quotient is 8029709, remainder 114.

Neither the answers nor `loop.ts` were patched here. The result files are in `raw/`.

### Review marks, not counted

These are close to the bar, and none is a sentence, line or item said twice:

- he-explain 0.7 #1 says *"המצבים האופטי-האלקטרוניים והחשמליים"* in items 1 and 2 and *"נותנת זמני רגעיים"* in both
  bullets of item 3.
- poem-refrainless 0.7 #1 says *"the horizon line where waves meet the land below"* in stanza 3 and
  *"the horizon line where waves meet land"* in stanza 4. Its lines *"No ship sails here; no boat breaks the silence"*
  and *"No boat sinks here; no ship crashes into these silent shores"* mirror each other.
- es-list 0.2 item 13 says a clause twice in itself: *"Tu capacidad de aprender es tan grande como tu capacidad de
  hacer algo."*
- math-long-div 0.7 #2's steps say *"$N / 123 = 0$. Remainder N. Bring down k → M."* six times, the number brought
  down falling from 78 to 72, which is not long division, and the answer stops at the token budget on the seventh.
  math-long-div 0.2 opens steps 2 to 6 with *"Bring down the next digit"*, each with its own digit and number, which
  `extra-check.py` and `end-check.py` flag as an item head said again. Round 111 leaves worked sums alone.
- "Whale" then "Whale Shark" (list30-animals 0.7 #1), "Whales" then "Blue whale" and "Whale sharks" (#2), "Turtle"
  then "Sea Turtle" (0.2), and "אנדרוארלוקס" then "אנדרוארלוקס מקטעני" (he-explain 0.7 #2) are kept by design.
- `r115-check.py`'s *misspelt* flags *"zu leben (to live)"* and *"zu lieben (to love)"*, and *"to walk"* and
  *"to talk"*. Each pair is two different verbs.

## Across a Continue

| try | stopped at | Continue added | on screen |
|---|---|---|---|
| 1 | *"…it ignited an intense competition among European powers for control over"* | *" The Portuguese Empire, led by figures like Vasco da Gama and Ferdinand Magellan, finally secured…"* | no restated clause; the stopped sentence is left without its end |
| 2 | *"…establishing vast colonies along the eastern coast of Asia and surrounding oceans that defined early European"* | *" The Maritime routes that facilitated this movement were built upon…"*, the whole paragraph again to *"…that defined early European"*, then *" economies by the 16th century."* | **the paragraph before the stop said twice**, 701 characters, identical but for *"maritime"* now capitalised |
| 3 | *"…This method allowed for the slow accumulation of wealth"* | *" The medieval overland caravan system became the dominant mode of trade…"* | no restated clause; the stopped sentence is left without its end |

`seam-check.py` finds no run of the stopped sentence's end in any continuation's first sentence, and each continued
text starts with the stopped text byte for byte. It does not see try 2, because the continuation opens with the start
of the paragraph, not with the stopped clause. `r116-check.py` sees it, as five phrases said twice in one line. The
Continue rule in `loop.ts` (`seamOverlap`, rounds 111 and 113) reads only the stopped sentence: it drops an overlap
with its end, or a restatement of it in the continuation's first sentence. A paragraph said again before the stopped
sentence is outside it, so it stays. The run logged one silent retry, *"kept 1369 chars, unit 66 cp x2"*. The Continue
scripts read the answer only after Stop and after Continue, so the retry's try is not visible. No try stopped after a
comma or a semicolon, so round 115's ",." fix was not exercised, and no join reads ",." or ";.".

## (e) Delete everything

The wipe ran once, on the container that (f) left, with the chats of every row so far and one attached .txt: Privacy &
storage read Chats 4.19 MB and Documents 253 B (`E01`). `raw/container-before-wipe.txt` lists 170 entries, among them
`documents/`, `documents.json`, `greenhouse-notes.txt` and the 4 MB `-wal`. After *Delete everything* and its second
step, the phone showed Welcome with no banner (`E02`). `container-after-wipe.txt` shows the new 4 KB `inborn.db`
(`-wal` 125 KB, `-shm`), no `.corrupt` file, and no `documents/`, `documents.json` or `greenhouse-notes.txt`. The cold
relaunch read the Welcome text with no `banner-repair` (`E03`, `result-e2-cold-relaunch.json`), and
`container-after-relaunch.txt` lists 10 entries and no `.corrupt` file. All three listings were taken on the first try,
so the second wipe pass 25 needed was not run.

`e-delete-everything` steps 15–17 fail, as they did in passes 21–25. After the wipe the shell remounts and the bridge
loses its anchor ("the QA bridge never got a fiber"). `E02` was taken at step 14, before them, and `e2-cold-relaunch`
read the same screen from a fresh process.

## The harness

Every row was driven through the round-51 bridge on `com.inbornapp.mobile.qa`, built from commit a233a44b, the same
commit as the store archive. The twin carries one `INBORN_QA_BRIDGE_V1`, rounds 111 to 116's markers as the store
bundle does, and both models, byte-exact. It was built with `EXPO_PUBLIC_AUTOPROMPT=file` (`raw/qa-verify.txt`). Build
26's twin was uninstalled first, at 04:18, and the new one installed at 04:43. The phone was passcode-locked from
00:31 until Moshe unlocked it at 08:20, and the store install, the stale twin's removal and the twin's install all
ran while it was locked.

1. **08:20 to 09:25, no row ran.** A chain started when the phone unlocked. It launched the store app on About and
   then launched the twin with `--launch --boot 45000`. The twin's bridge booted at 08:21:00 (`Documents/qa/boot.json`:
   `fiber: true`), and the first script was pushed to its inbox at 08:21:41. The bridge never read it. `a-first-answer`
   and `l07-ja-nenji-1` each ended *"NO RESULT after 1500 s"*, and `l07-ja-nenji-2` was killed at 09:25. The cause, from
   `pymobiledevice3 developer dvt proclist`: the twin was alive but not in the foreground, and the store app, started
   by the About launch, was (`raw/diag-twin-0920.png` shows it on a new chat). The bridge does not read its inbox in
   the background. The inbox then held all three scripts, never swept. Those three logs are not kept.
2. **09:27, recovery.** The twin was uninstalled, which dropped the stale inbox, installed again from the same build,
   and launched with `--launch --boot 45000`. `a-first-answer` passed 37 of 37 at 09:29. From then on each run had a
   watchdog: no `progress.json` within 180 s of the push stops the run, and a stop or a *NO RESULT* stops the chain.
   Neither fired.
3. **09:29 to 09:54, 32 runs in pass 25's order**: the 16 answers at 0.7, the persona, the 8 answers at 0.2, the fox,
   the first Continue and Documents, then the wipe, the cold relaunch and the two extra Continue tries. No push hit
   CoreDevice 7000.
4. **10:18, the end.** `devicectl device uninstall` hung for 5 minutes, and every `devicectl device` call timed out
   or failed (*"Timed out waiting for CoreDeviceService to fully initialize"*) while usbmux still answered, the wedge of
   F357. The twin was uninstalled through `pymobiledevice3 apps uninstall` at 10:25:55. CoreDevice answered again at
   10:29, and the store app's About (`S01`) and Chats (`S99`) were taken with `devicectl`.

## End state

- The phone keeps `com.inbornapp.mobile` **1.0.0 (27)**, launched with `inborn:///chats` and left on its Chats list
  (`S99-left-on-chats`). The list holds the store app's older chats.
- `com.inbornapp.mobile.qa` is uninstalled, and `devicectl device info apps` lists only `com.inbornapp.mobile` 1.0.0
  (27) and the other stream's `com.inbornapp.mobile.uitests.xctrunner`, which was not touched.
- Every launcher, driver and chain process this pass started was killed by its PID. No devicectl, pymobiledevice3 or
  driver process of this pass is left.
- No simulator was booted, and no XCUITest runner was started.
- The phone was never locked or unlocked by this pass, and Settings were not touched.
