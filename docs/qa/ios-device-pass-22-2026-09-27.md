# iPhone 13 Pro device pass on build 1.0.0 (22): round 107's loop guard on the phone — 27.9.2026

Build 22 carries round 107's loop guard and round 109's fixes to Moshe's iPhone (`docs/qa/ios-build-22-2026-09-27.md`).
Moshe's ruling is that repetition must never reach the user. This pass measured that on the phone, and it re-ran a short
sanity set. Evidence is in `docs/qa/ios-device-pass-22/`:

- `screens/` holds the screenshots. `sm-*` are 500 px copies of every shot, and full-size copies are kept only for
  the rows that failed or showed a notice.
- `raw/` holds each run's `result-*.json` and driver log, `loop-rows.json`, the offline replays, the container
  listings, the gates and the archive checks.
- `scripts/` holds the bridge scripts, `make-scripts.py` that writes them, and `analyze.py`, the yardstick.

**No store upload.** Nothing went to TestFlight, App Store Connect or Play.

## The rows

| row | result | what the phone showed | evidence |
|---|---|---|---|
| store app **1.0.0 (22)** | **pass** | About reads `1.0.0 (22) · 6cfd36359cf3`. The update kept Moshe's container: the listing is identical, and three files still match build 20's hashes. The byte copy before the install failed (`ios-build-22-2026-09-27.md`) | `S01-store-about-22`, `raw/install22.txt` |
| (a) first answer, tokens/s | **pass** | *"A lighthouse is a navigational beacon that guides ships through dark seas by illuminating their way, while serving as an important cultural symbol."* Ledger: **34.0 tok/s**, first token 827 ms, 207 + 27 tokens, 29 ms per token, 1.6 s | `A01`, `A02`, `result-a-first-answer.json` |
| (b) loop guard, 24 answers | **fail** | Three answers showed a repeat on screen. At the app's own temperature, a list said items 11–20 again as 21–30, and a Hebrew phrase appeared twice back to back. Under a 0.2 persona, four animals cycled five times. Five silent retries and three notices. One retry cut a correct long-division step | table below |
| (c) asked repetition | **fail, 0 of 3** | *"Repeat exactly this sentence five times, each on its own line: The quick brown fox jumps over the lazy dog."* The answer is the sentence **once**, in all three tries, with no cut, no retry line and no notice. The ledger reads 210 / 4096, which is about 11 answer tokens: the model stopped on its own | `C01`–`C03`, `result-c-asked-repeat.json`, `result-c2-asked-repeat-again.json` |
| (d) Continue after Stop | **pass** | Stopped at *"…European navies like Christopher Columbus's fleet,"*. Continue: *"…fleet, Christopher Columbus's fleet discovered the Americas in 1492…"*, joined with one space. The continued text starts with the stopped text byte for byte (1,173 → 3,961 chars). Instant restarts the phrase, so "Christopher Columbus's fleet" shows twice across the join | `K01`, `K02`, `result-d-continue.json` |
| (e) Delete everything | **pass** | Chats 4.2 MB and Documents 253 B before. After the two-step sheet: the Welcome screen with **no "could not be opened" banner**. The container holds the new `inborn.db` (4 KB, `-wal` 125 KB, `-shm`) and **no `.corrupt` file**, and `documents/` is gone. A cold relaunch opened onboarding with no `banner-repair` and still no `.corrupt` | `E01`–`E03`, `raw/container-*.txt`, `result-e2-cold-relaunch.json` |
| (f) Documents size | **pass** | greenhouse-notes.txt attached: Privacy & storage reads **Documents 253 B**, the Documents screen *"1 document · 253 B on this device"*, and the copy on disk is 253 B. Chats 4.2 MB, Models 0 B. The row needed no download | `F01`, `F02`, `result-f-documents.json` |

The strip *"Slowing down to keep the phone cool"* is on screen from the fourth answer on. It is round 109's thermal
line with no action, on a phone that answered about 30 prompts back to back while charging.

## (b) The loop guard, answer by answer

**Prompts.** Eight prompts from `docs/qa/fix-loops-root/stress-prompts.json` looped at the source on Instant in
`runs/before-instant*.json`. They include one CJK prompt (ja-nenji), one Hebrew prompt (he-explain) and one long
numbered list (list30-animals).

- **The app's own temperature (0.7).** Each prompt ran twice, 16 answers, each in a new chat.
- **A custom persona at 0.2.** Eight prompts ran once each. The persona is "Assistant 0.2", with the built-in
  Assistant's prompt and temperature 0.2. Free keeps up to three custom personas, and 0.2 is where the model loops
  most (`fix-loops-root/before.md`).

**How it was measured.** The bridge read the answer's raw Markdown, which is the `source` prop from this commit,
45 times at about 1-second intervals while it streamed, and once more at the end. `scripts/analyze.py` measures every
snapshot the next one does not simply extend. It is independent of the guard and checks these patterns:

- a phrase of 12 or more code points (6 or more in CJK) twice back to back, also with bold markers removed
- a short unit three times
- a sentence of 24 or more code points said again anywhere
- a run of 3 or more list items said again in the same order, whatever their numbers
- a list item named twice
- text that was on screen and then taken back

Silent retries and cuts are the guard's own `[chat] loop retry` and `[chat] loop cut` lines, which the bridge adds to
the report from this commit on. A notice is the `loop-notice` node on screen.

| answer | chars | repeat on screen at the end | item named twice | shown, then taken back (chars) | silent retries | notice |
|---|---|---|---|---|---|---|
| ja-nenji 0.7 #1 | 567 | 0 | – | – | 0 | – |
| ja-nenji 0.7 #2 | 806 | 0 | – | 26 | 1 | yes |
| he-explain 0.7 #1 | 2,033 | 0 | – | – | 0 | – |
| **he-explain 0.7 #2** | 752 | **phrase ×2** | – | 1 | 1 | yes |
| list30-animals 0.7 #1 | 411 | 0 | jellyfish ×2; dolphin, sea turtle, sea urchin again "(repeated)" | – | 0 | – |
| **list30-animals 0.7 #2** | 399 | **items 11–20 again as 21–30** | eel ×3, clownfish ×3 | – | 0 | – |
| es-list 0.7 #1 | 1,814 | 0 | – | – | 0 | – |
| es-list 0.7 #2 | 1,978 | 0 | – | – | 0 | – |
| fr-list 0.7 #1 | 795 | 0 | – | – | 0 | – |
| fr-list 0.7 #2 | 873 | 0 | – | – | 0 | – |
| poem-refrainless 0.7 #1 | 1,180 | 0 | – | – | 0 | – |
| poem-refrainless 0.7 #2 | 1,956 | 0 | – | – | 0 | – |
| list25-verbs-de 0.7 #1 | 205 | 0 | – | – | 0 | – |
| list25-verbs-de 0.7 #2 | 632 | 0 | – | – | 0 | – |
| math-long-div 0.7 #1 | 1,724 | 0 | – | **113** | 1 (a false cut) | – |
| math-long-div 0.7 #2 | 1,143 | 0 | – | – | 0 | – |
| he-list 0.2 | 325 | 0 | – | – | 0 | – |
| ko-list 0.2 | 259 | 0 | – | – | 0 | – |
| ja-list-cities 0.2 | 42 | 0 (one sentence, no list) | – | – | 0 | – |
| es-list 0.2 | 2,299 | 0 | – | **54** | 1 | – |
| fr-list 0.2 | 662 | 0 | – | 1 | 1 | yes |
| math-long-div 0.2 | 1,981 | 0 | – | – | 0 | – |
| **list30-animals 0.2** | 377 | **Jellyfish, Clownfish, Octopus, Starfish as items 11–30** | jellyfish ×5 | – | 0 | – |
| ja-nenji 0.2 | 661 | 0 | – | – | 0 | – |

| set | answers | repeat on screen | silent retries | retry held (no notice) | notices |
|---|---|---|---|---|---|
| app temperature 0.7 | 16 | **2** | 3 | 1 (the false cut) | 2 |
| persona 0.2 | 8 | **1** | 2 | 1 | 1 |

### What reached the screen

1. **A numbered list that repeats a block** (F422a). In list30-animals 0.7 #2, items 21–30 are items 11–20 word for word:
   *Sea otter, Sea bass, Sea hare, Sea urchin, Hammerhead shark, Tiger shark, Eel, Bluefin tuna, Clownfish, Sea
   lion*. Under 0.2, items 11–30 are *Jellyfish, Clownfish, Octopus, Starfish* five times. Neither answer produced
   a retry or a notice (`L07-list30-animals-2`, `L02-list30-animals`). Each line carries its own number, so no two
   lines match, and the echo rule never finds ten words in the same order. The fourth-listing rule looks for a word
   said back to back with commas (*"beide, beide, beide, beide"*), and here every copy has a different number in
   front of it. Replayed offline through `guardLoops` and `tailLoop(final)` on this commit, both answers pass untouched
   (`raw/offline-guard.txt`).
2. **A phrase split by bold markers** (F422b). In he-explain 0.7 #2, item 4 reads *"**האם צריך פטין מלאכותי?** כולם
   אומרים: האם צריך פטין מלאכותי? כולם אומרים: …"*. The first copy is inside `**…**` and the second is not, so the
   12-code-point back-to-back rule sees two different strings. The answer did loop later: the retry fired, looped
   again, and the notice closed it. The phrase stayed above the cut (`L07-he-explain-2`).
3. **Text shown for about a second, then taken back.** In es-list 0.2, *" te permite ver las cosas desde otra
   perspectiva.\n25. "* was on screen, and the earlier item 18 ends the same way. The silent retry took it back, and
   the list went on to 30 items without a repeat. ja-nenji 0.7 #2 took back 26 characters of a table row.

### A cut that was not a loop

math-long-div 0.7 #1 (F422c). The phone logged `loop retry: kept 1091 chars, unit 169 cp x2` and took back 113
characters it had shown: *"to get a remainder of $28$. Bring down next digit 3: now the number is $283$…"*. That
step is correct. Offline, appending the correct next step to the text the phone showed, *"283? $123 \times 2 = 246$. So
we write **2** and subtract $246$ from 283…"*, reproduces the same hit: unit 169 cp ×2, kept 1,091. The echo rule reads
a second "× 2" step as a copy of the first. The retry then continued with wrong arithmetic (*"add another digit '9' and
multiply by 10"*).

### Across a Continue

Row (d) shows *"Christopher Columbus's fleet, Christopher Columbus's fleet discovered…"*. The guard checks only the new
generation's text, so a continuation that restarts the stopped phrase is not seen as a repeat. Pass 20 already noted
that Instant restarts a sentence on Continue.

## (c) Asked repetition: the model, not the guard

All three tries answered with one sentence, and none logged a retry or a cut. On build 20, the same row gave five
lines, and a second wording gave one line (`ios-device-pass-20/result-p20b.json` steps 46 and 62). In round 107's
llama-server runs, Instant wrote *"I will study every day."* once in all 12 runs of its asked-repetition control
(3 seeds, 0.7 and 0.2, before and after the guard). For this request,
`planAnswerLength` picks *moderate*, whose line in the system prompt ends *"Do not repeat yourself and do not pad."*
That line contradicts the request, and the 0.8B model follows it. No change was made here.

## The harness

Every row was driven through the round-51 bridge on `com.inbornapp.mobile.qa`, built from commit 6cfd3635, the same
commit as the store archive. The twin carries one `INBORN_QA_BRIDGE_V1` and both models, byte-exact, and was built
with `EXPO_PUBLIC_AUTOPROMPT=file` (`raw/qa-verify.txt`). It was installed fresh and launched with `--boot 45000`
(F268). It ran 32 scripts: one run per answer, so each report holds only that answer's loop lines. It was uninstalled
at the end.

`e-delete-everything` steps 15–17 fail, as `d4` did in pass 21. After the wipe, the shell remounts, and the bridge
loses its anchor ("the QA bridge never got a fiber"). The screenshot step still ran (`E02`), and `e2-cold-relaunch` read
the same screen from a fresh process with every step green.

## End state

- The phone keeps `com.inbornapp.mobile` **1.0.0 (22)**, launched and left on its chat root with no banner
  (`S02-store-first-screen-22`).
- `com.inbornapp.mobile.qa` is uninstalled.
- Every `devicectl … --console` launcher this pass started was killed by PID or exited with its app. No devicectl or
  pymobiledevice3 process is left.
- No simulator was booted.
- The phone was never locked or unlocked, and Settings were not touched.
- `com.inbornapp.mobile.uitests.xctrunner` from another stream was not touched.
