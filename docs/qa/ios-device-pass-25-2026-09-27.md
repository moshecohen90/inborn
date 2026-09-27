# iPhone 13 Pro device pass on build 1.0.0 (25): round 114's loop guard on the phone — 27.9.2026

Build 25 carries round 114's loop guard to Moshe's iPhone (`docs/qa/ios-build-25-2026-09-27.md`). Moshe's ruling is
that repetition must never reach the screen. This pass re-ran pass 24's rows unchanged, with the same prompts, the same
persona and the same scripts. Evidence is in `docs/qa/ios-device-pass-25/`:

- `screens/` holds the screenshots. `sm-*` are 500 px copies of every shot, and full-size copies are kept for every
  row except the stress answers with no guard action and nothing to discuss.
- `raw/` holds each run's `result-*.json` and driver log, `loop-rows.json` (pass 22's yardstick), `cut-check.json`
  (pass 23's seam check), `extra-check.json` and `continue-seams.json` (pass 24's), `end-check.json` (new), the
  container listings, the gates and the archive checks. `raw/wipe-try1/` holds the first wipe (see *(e) Delete
  everything*).
- `scripts/` holds pass 24's scripts, byte-identical except the eight `l02-*.json`, which `make-scripts.py` wrote again
  with this twin's persona id (the only line that differs). `end-check.py` is new.

**No store upload.** Nothing went to TestFlight, App Store Connect or Play.

## The rows

| row | result | what the phone showed | evidence |
|---|---|---|---|
| store app **1.0.0 (25)** | **pass** | About reads `1.0.0 (25) · 8b5f43fa2056`. The byte copy was taken before the install, and all six files are byte-identical after it | `S01-store-about-25`, `raw/install25.txt` |
| (a) first answer, tokens/s | **pass** | *"A lighthouse lights navigation for ships at sea, guiding them safely to destinations."* Ledger: **31.8 tok/s**, first token 827 ms, 207 + 15 tokens, 31 ms per token, 1.3 s | `A01`, `A02`, `result-a-first-answer.json` |
| (b) loop guard, 24 answers | **fail** | **2 of 24 answers show a repeat on screen**, one at 0.7 and one under the 0.2 persona, both of a kind no rule reads (below). Pass 24's five did not recur: no head said again with a new gloss, no inline list said again, no suffix block, no item said again with a tail. No broken seam at any of the 15 retries and cuts, no bare marker at any answer's end, and no notice on a budget end. 9 silent retries, 7 notices | tables below |
| (c) asked repetition | **pass for the guard** (five lines in 0 of 3) | *"Repeat exactly this sentence five times, each on its own line: The quick brown fox jumps over the lazy dog."* Tries 1 and 3 gave the sentence once, and try 2 answered with the request itself, once. None logged a retry, a cut or a notice, so the one-line answers are the model's own. The guard's asked-count trim keeps five copies and could not leave one | `C01`–`C03`, `result-c-asked-repeat.json` |
| (d) Continue after Stop | **pass, 3 of 3** | No try restated the stopped clause, and each continued text starts with the stopped text byte for byte. Try 1's join reads *"…capitals,. These ventures"*. Tries 2 and 3 leave the stopped sentence without its end and start a new one, as pass 24's try 1 did. No retry, cut or notice fired | `K01`, `K02` (+ `-try2`, `-try3`), `result-d-continue.json`, `result-d2-continue-again.json`, `continue-seams.json` |
| (e) Delete everything | **pass** | Chats 2.17 MB and Documents 253 B before. After the two-step sheet: the Welcome screen with **no "could not be opened" banner**. The container holds the new `inborn.db` (4 KB, `-wal` 125 KB, `-shm`) and **no `.corrupt` file**, and `documents/`, `documents.json` and the attached file are gone. A cold relaunch opened onboarding with no `banner-repair` and still no `.corrupt` | `E01`–`E03`, `raw/container-*.txt`, `result-e2-cold-relaunch.json` |
| (f) Documents size | **pass** | greenhouse-notes.txt attached: Privacy & storage reads **Documents 253 B**, the Documents screen *"1 document · 253 B on this device"*. Chats 4.19 MB, Models 0 B | `F01`, `F02`, `result-f-documents.json` |

As in passes 22 to 24, the strip *"Slowing down to keep the phone cool"* is on screen from the stress answers on. It is
round 109's thermal line, with no action, on a phone answering back to back while charging.

## (b) The loop guard, answer by answer

The prompts, the persona "Assistant 0.2" and the sampling are pass 22's, written by the same `make-scripts.py`.
`analyze.py` (pass 22), `cut-check.py` (pass 23) and `extra-check.py` (pass 24) are unchanged. `end-check.py` adds what
round 114 claims and they do not measure:

- a bare list marker at the end of the answer (a lone next number, a lone dash, a bold-wrapped marker)
- text shown and taken back in an answer that logged no retry, since the quiet budget-end trim writes no log line
- an item head said twice within one run of items, the head cut where round 114 cuts it: before the first " (", ": ",
  " – ", " — ", " - ", " → ", ", " or "·". Items of a one-line numbered list are read one by one.

Run on pass 24's results, it flags four of that pass's five repeats and its two bare budget ends ("21" and "-"), and
nothing else in the stress answers. The fifth, he-list's suffix block, is `extra-check.py`'s. Every answer was also
read in full, because one of the two repeats below is of a kind none of the scripts reads.

| answer | chars | repeat on screen | item named twice | shown, then taken back (chars) | silent retries | notice | the seam on screen |
|---|---|---|---|---|---|---|---|
| ja-nenji 0.7 #1 | 1,158 | – | – | – | 0 | – | – |
| ja-nenji 0.7 #2 | 889 | – | – | – | 0 | – | – |
| he-explain 0.7 #1 | 583 | – | – | – | 0 | – | – |
| he-explain 0.7 #2 | 2,100 | – (review mark below) | – | – | 0 | – | – (**ends mid-word** at the token budget) |
| list30-animals 0.7 #1 | 172 | – | – ("Whales", then "Blue Whales") | – | 1 | – | clean: the retry kept 8 items and went on *"9. Crabs"* to *"15. Mussels"* |
| list30-animals 0.7 #2 | 198 | – | – | – | 1 | yes | clean: 18 distinct animals, ends after *"18. Boar"* |
| es-list 0.7 #1 | 1,927 | – | – | – | 0 | – | – (**ends mid-item 25** at the token budget) |
| es-list 0.7 #2 | 2,831 | – | – | – | 0 | – | – (20 items, then *"¿Estás listo para continuar…?"*) |
| fr-list 0.7 #1 | 794 | – | – | – | 0 | – | – (ends after item 11 of 30) |
| fr-list 0.7 #2 | 903 | – | – | – | 0 | – | – (**ends mid-item**: *"11. Des objets liés à des"*) |
| poem-refrainless 0.7 #1 | 1,183 | – | – | – | 0 | – | – |
| poem-refrainless 0.7 #2 | 2,198 | – | – | – | 0 | – | – |
| list25-verbs-de 0.7 #1 | 238 | – | – | – | 0 | – | – (the model answered in one sentence, no list) |
| list25-verbs-de 0.7 #2 | 336 | – | – | 2 (*"13"*) | 1 | yes | clean: ends after *"12. zu machen (to make)"* |
| math-long-div 0.7 #1 | 1,174 | – | – | – | 0 | – | – |
| **math-long-div 0.7 #2** | 729 | **the line "- 123000000" and the rule "--------" 16 times** in a fenced code block, a new number between each pair | – | – | 0 | – | – (**ends inside the unclosed code block** at the token budget) |
| **he-list 0.2** | 475 | **items 23–29 are items 14 and 18–22 again with the first word misspelled** (*"14. קיבוץ ירושלים"* … *"23. קיבוט ירושלים"*, *"20. קיבוץ רפ"א"* … *"26. קיבוק רפ"א"*) | the same places | 2 (*"14"*) | 1 | – | clean at the retry: *"13. קיבוץ תל אביב"* then *"14. קיבוץ ירושלים"*; ends after *"29. לקוויט ירושלים"* |
| ko-list 0.2 | 133 | – | – | 2 (*"16"*) | 1 | yes | clean: 15 distinct dishes, ends after *"15. 김치찌개"* |
| ja-list-cities 0.2 | 60 | – | – | – | 0 | – | – (one sentence, no list) |
| es-list 0.2 | 1,802 | – (review mark below) | – | 2 (*"28"*) | 1 | yes | clean: ends after item 27 of 30 |
| fr-list 0.2 | 373 | – | – | – | 1 | yes | clean: ends after item 4 of 30 |
| math-long-div 0.2 | 1,077 | – | – | – | 0 | – | – (**ends mid-sentence** at the token budget: *"Divide -174 by 12"*) |
| list30-animals 0.2 | 199 | – | – ("Turtle", then "Sea Turtle") | – | 1 | yes | clean: 16 distinct animals, ends after *"16. Sea Gull"* |
| ja-nenji 0.2 | 832 | – | – | 1 (a line break) | 1 | yes | clean: ends after section 4's *"**目標**"* line |

The fr-list 0.2 run's first push failed with CoreDevice error 7000 (*The connection was interrupted*) and never
reached the phone. It was rerun after the fox and the first Continue, as pass 23 did, so its row is the rerun.

| set | answers | repeat on screen (pass 22's yardstick) | repeat on screen (this pass) | silent retries | retry held, no notice | notices | text taken back | broken seam at a retry or cut |
|---|---|---|---|---|---|---|---|---|
| app temperature 0.7 | 16 | 1 (pass 24: 0) | **1** (pass 24: 2) | 3 | 1 | 2 | 1 answer (2 chars) | 0 |
| persona 0.2 | 8 | 0 (pass 24: 0) | **1** (pass 24: 3) | 6 | 1 | 5 | 4 answers (2, 2, 2, 1 chars) | 0 |

Across the 24 answers there are 0 bare item numbers, 0 open `**`, 0 half items, 0 restart intros, 0 prose lines after a
list cut, 0 numbers going down and 0 instruction echoes at the 15 seams the guard made (9 retries, 6 cuts). Each of
the four bare numbers the phone showed (*"13"*, *"28"*, *"14"*, *"16"*) is in one snapshot and gone by the next, about
0.7 s later, taken back by the retry that followed it.

**Notices.** All 7 notices come after a `[chat] loop retry … x2` line, so each answer had repeated before the guard
stepped in. None is a budget end. In ko-list, the retry wrote only *"16"* and stopped. The list-end check runs before
the bare-end trim (`packages/core/src/chat/loop.ts:1476`, then `1480`), so it read the lone *"16"* as the list's end,
cut it (*"kept 133 of 135 chars, unit 2 cp x1"*, the unit being *"16"*) and showed the notice. That happens whether the
retry ran out of tokens or stopped on its own. The answer had repeated before the retry, so this notice is not on a
clean budget end.

**Budget ends.** Five answers stop at the token budget: es-list 0.7 #1, fr-list 0.7 #2, he-explain 0.7 #2,
math-long-div 0.7 #2 and math-long-div 0.2. None ends on a bare marker, and none shows the notice. No snapshot in
this pass shows a bare marker trimmed at a budget end, so the quiet trim itself was not seen firing. The two French
answers at 0.7 stop short of 30 again. `packages/core/src/chat/length.ts` has not changed since pass 24 found that
*"Donne-moi 30 idées…"* is not read as a count (F427).

### What still reached the screen

1. **A worked sum that repeats a line, inside fenced code.** math-long-div 0.7 #2 opened with *"Performing long
   division of 987654321 by 123 yields a quotient of 8013043 and a remainder of 14:"* and then wrote a code block in
   which every step subtracts the same number:

   ```
     - 123000000
     --------
     612432111
     - 123000000
     --------
     489432111
   ```

   The pair comes 16 times, with a new number between each pair, and the answer ends at the token budget on
   *"--------"* inside the unclosed block (`L07-math-long-div-2`). The numbers are wrong too: 142654321 − 123000000 is
   19654321, and the answer writes 196543211. `packages/core/src/chat/loop.ts:349` exempts fenced code by design
   (*"Fenced code … repeats lines on purpose"*), and round 111 leaves worked sums alone, so the guard logged nothing.
   Pass 22's yardstick flags it: a block of 16 items said again and one item 16 times.
2. **A block said again with a misspelled first word.** Under 0.2, he-list's retry fired after *"13. קיבוץ תל אביב"*
   and took back *"14"*. The retry wrote items 14 to 22 and then said the same places again, each with its first word
   changed: *"14. קיבוץ ירושלים"* as *"23. קיבוט ירושלים"* and *"29. לקוויט ירושלים"*, *"18. קיבוץ מנזילתה"* as
   *"24. קיבוצת מנזיל"*, *"19. קיבוץ אריאל"* as *"25. קיבוצה אריאל"*, *"20. קיבוץ רפ"א"* as *"26. קיבוק רפ"א"*,
   *"21. קיבוץ סלען"* as *"27. קיבוע סלען"* and *"22. קיבוץ גבולות"* as *"28. קיבץ גבולות"* (`L02-he-list`). The
   guard logged nothing after the retry and showed no notice. Round 114's head and prefix rules compare an item from its
   first word, so an item whose first word is new is a new item. Pass 24's suffix block (*"תל אביב-המערב"*) changed the
   end of each item; this one changes the start.

Neither answer was patched here. Both result files are in `raw/`.

### Review marks, not counted

These are close to the bar, and none is a sentence, line, item or head said twice:

- he-explain 0.7 #2 ends by opening an earlier quote again: *"המשתמש מרשם: "אני חברה אחרת (לפני שאנשי הליך), אני צריך
  את זה""* in section 4, and the last line *"המשתמש מרשם: "אני חברה אחרת, אין לי תח"*, where the token budget stops
  it mid-word.
- es-list 0.2 item 18 says a clause twice in itself, *"Tu capacidad para ser es tan grande como tu capacidad para
  ser."*, and item 23 ends on the same clause: *"Tu potencial es tan grande como tu capacidad para serlo."*
- "Whales" then "Blue Whales" (list30-animals 0.7 #1), and "Turtle" then "Sea Turtle" (list30-animals 0.2). Round 114
  keeps these by design, as it keeps "Whale shark" after "Whale": the earlier item is not the new one's head.
- list25-verbs-de 0.7 #2 lists *"9. zu tun (to do)"* and *"11. zu tunen (to run)"*. "tunen" is not the verb it glosses,
  and it is not "tun" either.

## Across a Continue

| try | stopped at | Continue added | on screen |
|---|---|---|---|
| 1 | *"…brought massive quantities of precious metals and exotic items into the continent's capitals,"* | *". These ventures marked a turning point where European powers realized…"* | no restated clause; the join reads *"capitals,. These"* |
| 2 | *"…allowing ships like the Lusitania to carry vast quantities of cinnamon, cloves, and turmeric across the Atlantic"* | *" The Lusitania, a powerful ship commanded by Captain Arthur Phillip of the Royal Navy, set sail…"* | no restated clause; the stopped sentence is left without its end |
| 3 | *"…traders sought exclusive rights to produce these valuable commodities for use by high-ranking officials"* | *" The Roman Empire saw these imports first distributed among wealthy families in Italy and France…"* | no restated clause; the stopped sentence is left without its end |

`seam-check.py` finds no run of the stopped sentence's end in any continuation's first sentence. Try 1's *",."* is what
round 113's Continue rule leaves when the model restates the stopped clause to its end and closes it with a period:
`seamOverlap` in `packages/core/src/chat/loop.ts:1154` drops the restated words and a following comma, colon or
semicolon, but not a period. The rule writes no log line, so whether it fired in try 1 is not visible. A model that
opens its continuation with *". These"* would leave the same join.

## (e) Delete everything

The wipe ran twice. The first ran on the container that (f) left, with the chats of every row so far and one attached
.txt: Privacy & storage read Chats 4.19 MB and Documents 253 B. It landed on Welcome with no banner, and the listings
after the wipe and after the cold relaunch show the new 4 KB `inborn.db` and no `.corrupt` file. The listing before it
failed: `devicectl device info files` returned *"CoreDevice.ActionError error 3 … The system failed to get a list of
files on the remote device"* (`raw/wipe-try1/`).

So the wipe ran again with its listing in place. Pass 24's `e0-setup-2` attached greenhouse-notes.txt on top of the two
chats `d2-continue-again` had just made, and Privacy & storage read Chats 2.17 MB and Documents 253 B (`E01`).
`raw/container-before-wipe.txt` lists 31 entries, among them `documents/`, `documents.json`, `greenhouse-notes.txt` and
the 2.2 MB `-wal`. After *Delete everything* and its second step, the phone showed Welcome with no banner (`E02`).
`container-after-wipe.txt` shows the new 4 KB `inborn.db` (`-wal` 125 KB, `-shm`), no `.corrupt` file, and no
`documents/`, `documents.json` or `greenhouse-notes.txt`. The cold relaunch read the Welcome text with every step green
and no `banner-repair` (`E03`, `result-e2-cold-relaunch.json`). `container-after-relaunch.txt` lists 10 entries and no
`.corrupt` file. `E02` and `E03` are the same pixels: the same static screen in the same minute, 54 s apart, with the
relaunch between them. Pass 24's pair was identical in the same way.

`e-delete-everything` steps 15–17 fail both times, as they did in passes 21–24. After the wipe the shell remounts and
the bridge loses its anchor ("the QA bridge never got a fiber"). The screenshot step still ran, and `e2-cold-relaunch`
read the same screen from a fresh process.

## The harness

Every row was driven through the round-51 bridge on `com.inbornapp.mobile.qa`, built from commit 8b5f43fa, the same
commit as the store archive. The twin carries one `INBORN_QA_BRIDGE_V1`, round 111's length line, round 113's
repeat-marker alternation, round 114's `HEAD_END` and `BARE_END` and both models, byte-exact, and was built with
`EXPO_PUBLIC_AUTOPROMPT=file` (`raw/qa-verify.txt`). It was installed fresh and launched with `--boot 45000`.

It made 35 runs of 33 scripts, in pass 24's order: the first answer, the 16 answers at 0.7, the persona, the 8
answers at 0.2, the fox, the first Continue and Documents, then the wipe, the cold relaunch and the two extra Continue
tries, and then `e0-setup-2`, the second wipe and its cold relaunch. `e0-setup-1` was not needed, because
`d2-continue-again` had already gone through onboarding. The fr-list 0.2 attempt that never reached the phone is not
counted.

Pass 24's ownership trap did not recur. After each `e2-cold-relaunch`, whose `cleanup` step removes `Documents/qa`,
the next run started with `--launch`, so the app made `Documents/qa` before anything was pushed. The one push that hit
CoreDevice 7000 (fr-list 0.2) failed before any file landed, and the runs after it found the inbox as the app made it.

## End state

- The phone keeps `com.inbornapp.mobile` **1.0.0 (25)**, launched with `inborn:///chats` and left on its Chats list
  (`S99-left-on-chats`). The list shows the QA chats earlier passes left in the store app.
- `com.inbornapp.mobile.qa` is uninstalled, and `devicectl device info apps` lists only `com.inbornapp.mobile` 1.0.0
  (25) and the other stream's `com.inbornapp.mobile.uitests.xctrunner`, which was not touched.
- The one `devicectl … --console` launcher still running at the end was the last cold relaunch's, started 23:05:08. It
  was killed by its PID. No devicectl or pymobiledevice3 process is left.
- No simulator was booted, and no XCUITest runner was started.
- The phone was never locked or unlocked, and Settings were not touched.
