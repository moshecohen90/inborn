# iPhone 13 Pro device pass on build 1.0.0 (26): round 115's loop guard on the phone, PARTIAL — 27.9.2026

**This pass is partial.** Rows (a) and 21 of the 24 loop answers ran. Then the iPhone locked itself at 00:31, after
another session's UI test, and stayed locked. The lead stopped the pass at 03:45 because round 116 is being written
for what the 0.2 answers below show, and build 27 will carry it. Rows (c) to (f) did not run. The pass began at 23:58
on 27.9.2026 and ran past midnight; its files keep that date.

Build 26 carries round 115's loop guard to Moshe's iPhone (`docs/qa/ios-build-26-2026-09-27.md`). Moshe's ruling is
that repetition must never reach the screen. This pass ran pass 25's rows unchanged, with the same prompts, the same
persona and the same scripts. Evidence is in `docs/qa/ios-device-pass-26/`:

- `screens/` holds the screenshots. `sm-*` are 500 px copies of every shot. Full-size copies are kept for every row
  except the seven stress answers with no guard action and nothing to discuss.
- `raw/` holds each run's `result-*.json` and driver log, `loop-rows.json` (pass 22's yardstick), `cut-check.json`
  (pass 23's seam check), `extra-check.json` (pass 24's), `end-check.json` (pass 25's), `r115-check.json` (new), the
  gates, the archive checks and the install record.
- `scripts/` holds pass 25's scripts, byte-identical except the eight `l02-*.json`, which `make-scripts.py` wrote again
  with this twin's persona id (the only line that differs). `r115-check.py` is new.

**No store upload.** Nothing went to TestFlight, App Store Connect or Play.

## The rows

| row | result | what the phone showed | evidence |
|---|---|---|---|
| store app **1.0.0 (26)** | **pass** | About reads `1.0.0 (26) · 0c9a62a03d53`. The byte copy was taken before the install, and all six files are byte-identical after it | `S01-store-about-26`, `raw/install26.txt` |
| (a) first answer, tokens/s | **pass** | *"A lighthouse illuminates navigation routes in the dark."* Ledger: **30.0 tok/s**, first token 837 ms, 207 + 10 tokens, 33 ms per token, 1.2 s | `A01`, `A02`, `result-a-first-answer.json` |
| (b) loop guard | **fail, 21 of 24 run** | At 0.7, 16 of 16 answers show no repeat. Under the 0.2 persona, **3 of 5 answers show an item said again**, and **2 of 5 have a broken seam** where a silent retry joined. No sentence or line is said twice in any of the 21 answers. 8 retries, 6 notices, each notice after a real `x2` retry, none on a budget end | tables below |
| (b) not run | – | the 0.2 persona answers math-long-div, list30-animals and ja-nenji. See *The harness* | `raw/log-l02-math-long-div.txt`, `raw/log-l02-list30-animals.txt` |
| (c) asked repetition | **not run** | the iPhone locked itself at 00:31 after another session's XCUITest and stayed locked | – |
| (d) Continue after Stop | **not run** | the same. Round 115's ",." fix at the Continue seam is not measured on the phone | – |
| (e) Delete everything | **not run** | the same | – |
| (f) Documents size | **not run** | the same | – |

Neither of round 115's two target answers came back in this pass. Both long-division tries at 0.7 wrote no fenced code
block, and he-list at 0.2 wrote an unnumbered comma list instead of the numbered "קיבוץ" list. So the fence rule and the
misspelt-word rule were not exercised on the phone. Neither answer was cut either.

As in passes 22 to 25, the strip *"Slowing down to keep the phone cool"* shows in the stress answers. It is round 109's
thermal line, with no action, on a phone answering back to back while charging.

## (b) The loop guard, answer by answer

The prompts, the persona "Assistant 0.2" and the sampling are pass 22's, written by the same `make-scripts.py`.
`analyze.py` (pass 22), `cut-check.py` (pass 23), `extra-check.py` (pass 24) and `end-check.py` (pass 25) are
unchanged. `r115-check.py` adds what round 115 claims and they do not measure:

- per fenced block, the line said most often and its count, the longest back-to-back run of a 1 to 3 line unit (a
  number line between copies may change), and whether "```" closes the block on its own line. The same count runs over
  every snapshot, since a copy can be shown and taken back.
- a loop retry fired while the text it kept held an open fence
- two list items whose heads have 2+ words and differ in one word by one edit. This is wider than round 115's rule,
  which needs a word shared by 3+ heads in a list of 5+ distinct heads.
- ",." ";." "，。" or "；。" anywhere in the answer
- the loop notice on an answer whose guard logged no retry and no cut

Run on pass 25's results, it flags exactly that pass's three findings: math-long-div 0.7 #2's fenced block
("- 123000000" 16 times, not closed), he-list 0.2's four misspelt copies, and Continue try 1's *"capitals,. These"*.
On this pass's 21 answers it flags nothing. Every answer was also read in full, because none of the scripts reads the
three items below.

| answer | chars | repeat on screen | item named twice | shown, then taken back (chars) | silent retries | notice | the seam on screen |
|---|---|---|---|---|---|---|---|
| ja-nenji 0.7 #1 | 615 | – | – | – | 0 | – | – |
| ja-nenji 0.7 #2 | 1,329 | – | – | – | 0 | – | – |
| he-explain 0.7 #1 | 260 | – | – | – | 0 | – | – |
| he-explain 0.7 #2 | 1,643 | – (review mark below) | – | – | 0 | – | – |
| list30-animals 0.7 #1 | 124 | – | – ("turtle", then "sea turtle") | – | 1 | yes | clean: 12 distinct animals, ends after *"12. shrimp"* |
| list30-animals 0.7 #2 | 261 | – | – ("Whale", then "Whale shark" and "Blue whale") | – | 1 | yes | clean: 16 items, ends after *"16. Squid"* |
| es-list 0.7 #1 | 2,521 | – (review mark below) | – | – | 0 | – | – (30 items) |
| es-list 0.7 #2 | 1,576 | – | – | – | 0 | – | – (20 items, ends on a full sentence) |
| fr-list 0.7 #1 | 767 | – | – | – | 0 | – | – (**ends mid-item 14**: *"(ou un portrait"*) |
| fr-list 0.7 #2 | 802 | – | – | – | 0 | – | – (ends after item 13 of 30) |
| poem-refrainless 0.7 #1 | 910 | – | – | – | 0 | – | – |
| poem-refrainless 0.7 #2 | 1,331 | – | – | – | 0 | – | – |
| list25-verbs-de 0.7 #1 | 710 | – (review mark below) | – | 1 (*"9"*) | 1 | yes | clean: ends after *"8.  **sich selbst** -> oneself"* |
| list25-verbs-de 0.7 #2 | 545 | – (review mark below) | – | – | 1 | yes | clean: ends after *"24. verlieren (verliefern)"* |
| math-long-div 0.7 #1 | 107 | – | – | – | 0 | – | – (one sentence, no steps and no code block) |
| math-long-div 0.7 #2 | 1,562 | – | – | – | 0 | – | – (prose, no code block; **ends mid-sentence**: *"…98 and 76. Wait"*) |
| **he-list 0.2** | 113 | **"ברוזל" twice**, items 6 and 12 of an unnumbered comma list | the same | – | 1 | yes | clean: the retry wrote nothing, and the answer ends where it began, after *"ברוז, ברוזל"* |
| ko-list 0.2 | 266 | – | – ("고기", then "고기 요리") | 4 (*", 16"*) | 1 | – | **broken**: the retry went on without the comma, *"15. 파 16. 오징어"* |
| ja-list-cities 0.2 | 82 | – | – | – | 1 | – | **broken**: the retry's closing sentence is glued to the list, *"三重、鳥取これらはすべて日本の主要都市です。"* |
| **es-list 0.2** | 1,312 | **item 17 is item 5 again with its verb form changed**, written by the retry | the same | – | 1 | yes | clean at the retry (item 16, then 17) and at the cut after 17 |
| **fr-list 0.2** | 829 | **item 11 opens as item 6 again, in the singular** | the same | – | 0 | – | – (**ends mid-item 11**) |

| set | answers | repeat on screen (pass 22's yardstick) | item said again (this pass) | silent retries | retry held, no notice | notices | text taken back | broken seam at a retry or cut |
|---|---|---|---|---|---|---|---|---|
| app temperature 0.7 | 16 | 0 (pass 25: 1) | **0** (pass 25: 1) | 4 | 0 | 4 | 1 answer (1 char) | 0 |
| persona 0.2 | 5 of 8 | 0 (pass 25: 0) | **3** (pass 25: 1) | 4 | 2 | 2 | 1 answer (4 chars) | **2** |

`cut-check.py` reads 10 seams in the 21 answers. It flags *half-item* at two of them, ko-list's and ja-list-cities',
and nothing else: 0 bare item numbers, 0 open `**`, 0 prose lines after a list cut, 0 numbers going down. `extra-check.py`
finds 0 instruction echoes and 0 restart intros, `end-check.py` 0 bare markers at an answer's end, and `r115-check.py`
0 ",." joins. The two pieces shown and taken back (*"9"* and *", 16"*) are each in one snapshot and gone by the next,
about 0.7 s later.

**Notices.** All 6 notices come after a `[chat] loop retry … x2` line, so each answer had repeated before the guard
stepped in. In he-list the retry wrote nothing, and the guard logged *"loop cut: kept 113 of 113 chars, unit 0 cp x1"*
and showed the notice. No notice sits on a budget end. The three answers that stop
mid-item or mid-sentence (fr-list 0.7 #1, math-long-div 0.7 #2, fr-list 0.2) show none, and none ends on a bare marker.

### What reached the screen

1. **One word listed twice in an unnumbered list.** he-list 0.2 (*"תן לי רשימה של 30 ערים בישראל."*) wrote the whole
   answer on one line: *"הנה רשימה של 30 ערים בישראל: אשדוד, אשנאב, ארצוה, בריאן, ברלין, ברוזל, בורסון, בראגן,
   בראונד, בראינג, ברוז, ברוזל"*. "ברוזל" is the 6th and the 12th name, and "ברוז" before it is one letter short of it
   (`L02-he-list`). A 36-code-point unit said twice set off a retry, and the retry added nothing before the cut. The item
   rules read numbered and bulleted items and numbered one-line lists. This list has no numbers, so its names are not
   items to them.
2. **An item said again with its verb form changed, written by the retry.** es-list 0.2 listed
   *"5. La única forma de ser feliz es haciendo cosas buenas y haciendo cosas malas."*. The retry fired after item 16
   (*"kept 1237 chars, unit 55 cp x2"*) and went on with
   *"17. La única forma de ser feliz es hacer cosas buenas y hacer cosas malas."*. The guard cut the answer one item later
   (*"kept 1312 of 1356 chars, unit 40 cp x2"*) and showed the notice, so item 17 stays on screen (`L02-es-list`). The two
   items differ in two words, "haciendo" and "hacer", so neither the head rule nor round 115's one-edit rule reads them
   as one item.
3. **An item opened again in the singular.** fr-list 0.2 listed
   *"6. Des objets de décoration maison (ex: un tapis de Noël, des lanternes)."* and ended mid-item on
   *"11. Un objet de décoration maison (ex: une"*, with no retry, cut or notice (`L02-fr-list`). The heads differ in two
   words, "Des" against "Un" and "objets" against "objet".

### Seams the retry broke

1. **ko-list 0.2.** The one-line numbered list reached *"… 14. 마늘, 15. 파, 16"*. The retry took back *", 16"*
   (*"kept 131 chars, unit 2 cp x2"*) and went on with *" 16. 오징어, 17. 양파, …"*, so the screen reads
   *"15. 파 16. 오징어"* with no comma between the items (`L02-ko-list`). The list then runs to *"30. 고기 요리"* with no
   notice.
2. **ja-list-cities 0.2.** The retry kept the list up to *"…岐阜、三重、鳥取"* (*"kept 65 chars, unit 3 cp x4"*) and
   wrote only *"これらはすべて日本の主要都市です。"*, so the screen reads *"三重、鳥取これらはすべて日本の主要都市です。"*
   with no full stop between the list and the sentence (`L02-ja-list-cities`). The answer names 17 of the 20 cities it
   announced, with no notice.

Neither the answers nor `loop.ts` were patched here. The five result files are in `raw/`.

### Review marks, not counted

These are close to the bar, and none is a sentence, line or item said twice:

- he-explain 0.7 #2 says the phrase *"להשתמש כחלק מהעולם הפוטוניקלי"* in 6 different sentences, and
  *"ללא תלות נוספת באלמנטים אחרים"* in 2.
- list25-verbs-de 0.7 #1 opens with *"Here are 25 German verbs with their English equivalents."*, and after a German
  paragraph says it again in German: *"Hier sind die 25 deutschen Verben mit ihrer deutschen Bedeutung auf Englisch:"*.
  Its items 6 *"bequem"* and 8 *"sich selbst"* are not verbs.
- list25-verbs-de 0.7 #2 glosses every verb with itself (*"1. sein (sein)"*), and item 24 reads
  *"verlieren (verliefern)"*.
- es-list 0.7 #1: items 5 and 16 end on the same clause, *"haz lo mismo por ti mismo"*, and item 6 says a clause twice in
  itself: *"Las cosas que nos hacen felices son esas que nos hacen más felices."*
- "turtle" then "sea turtle" (list30-animals 0.7 #1), "Whale" then "Whale shark" and "Blue whale" (#2), and "고기" then
  "고기 요리" (ko-list 0.2). The guard keeps these by design: past a space, an earlier item must be 3+ words long to count
  as the new one's head.
- The long division is wrong in both tries. 987654321 ÷ 123 is 8029709 with remainder 114. Try 1 answers in one sentence,
  *"…the result is exactly 80265009."* Try 2 restarts itself three times (*"Wait, let me re-evaluate…"*,
  *"wait, let's look at the full dividend again"*, *"No, let's restart…"*) and stops on *"Wait"*.

## The harness

Every row was driven through the round-51 bridge on `com.inbornapp.mobile.qa`, built from commit 0c9a62a0, the same
commit as the store archive. The twin carries one `INBORN_QA_BRIDGE_V1`, round 111's length line, round 113's
repeat-marker alternation, round 114's `HEAD_END` and `BARE_END`, round 115's five function names and both models,
byte-exact. It was built with `EXPO_PUBLIC_AUTOPROMPT=file` (`raw/qa-verify.txt`), installed fresh at 23:57:55 and
launched with `--boot 45000`.

It completed 23 runs in pass 25's order: the first answer, the 16 answers at 0.7, the persona, and he-list, ko-list,
ja-list-cities, es-list and fr-list at 0.2. Then:

1. **00:16:10, l02-math-long-div.** The driver's first `devicectl device copy to` reported a failure, yet the script
   reached the inbox and the bridge started it: `Documents/qa/out/l02-math-long-div/progress.json` is dated 0:16. The
   driver read the failure as a missing inbox and relaunched the twin with `--terminate-existing`, which killed that run.
   Its second push failed with CoreDevice error 7000, *"The connection was interrupted"* (`raw/log-l02-math-long-div.txt`,
   the device id redacted). This is a new form of pass 23 to 25's 7000 trap: a push can land and still report a failure.
2. **00:16:26, l02-list30-animals.** The push landed in the relaunched twin's inbox, and the bridge never read it. From
   about 00:21 to 00:31, another session ran `xcodebuild test` for a different project's UI tests on the same iPhone.
   The phone showed its home screen, and the twin was in the background. The driver gave up at 00:41:27, *"NO RESULT
   after 1501 s"* (`raw/log-l02-list30-animals.txt`).
3. **00:31:36.** Relaunching the twin failed with *"Unable to launch com.inbornapp.mobile.qa because the device was not,
   or could not be, unlocked"*. The screen was black, and `devicectl device info lockState` read `passcodeRequired: true`
   until 03:42. While locked, the container could not be listed (ActionError 3), and an AFC delete of the stranded
   script found nothing.

ja-nenji 0.2, rows (c) to (f) and the math-long-div rerun were queued behind an unlock and never ran. At 03:45 the lead
stopped the pass, and the queue was killed.

## End state

- The phone keeps `com.inbornapp.mobile` **1.0.0 (26)**. It was last opened by this pass on About at 23:53, and S99 was
  not taken.
- **`com.inbornapp.mobile.qa` 1.0.0 (26) is still installed.** The build-27 pass removes it. Its inbox may still hold
  `l02-list30-animals.json`, which the bridge would run on the twin's next launch, so the twin should be uninstalled
  before it is launched again.
- No devicectl, pymobiledevice3 or driver process of this pass is left. No simulator was booted, and no XCUITest runner
  was started.
- This pass never locked or unlocked the phone, and never touched Settings.
- `com.inbornapp.mobile.uitests.xctrunner` from another stream was not touched.
