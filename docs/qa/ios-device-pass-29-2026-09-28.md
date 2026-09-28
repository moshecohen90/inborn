# iPhone 13 Pro device pass on build 1.0.0 (29): Continue after Stop resumes the same answer on the phone — 28.9.2026

Build 29 carries rounds 119 to 123 to Moshe's iPhone (`docs/qa/ios-build-29-2026-09-28.md`). Round 121 (F443) makes
Continue go on inside the same assistant turn: on the phone, llama.rn gets the rendered history plus the answer so far
as a raw prompt and generates from there. Build 28's pass failed J2 because Continue said the stopped clause again
(F440). This pass walked J1, J2 and J3 on the `.qa` twin built from the same commit, 8fb33348, then removed the twin and
opened the store app. Evidence is in `docs/qa/ios-device-pass-29/`:

- `screens/` holds every screenshot at full size, and `sm-*` are 500 px copies.
- `raw/` holds each run's `result-*.json` and driver log, `j2-joins.txt` (the format of
  `docs/qa/continue-prefill/joins.txt`) and `j2-joins.json`, the gates, the archive checks, the install record and
  `NOTES.txt` (the run's log, step by step).
- `scripts/` holds the bridge scripts, `make-scripts.py` (writes them) and `joins29.py` (writes the joins files).
  `photos/red-circle-cat.png` is the repo's `scripts/fixtures/photo/red-circle-cat.png`, byte for byte.

**No store upload.** Nothing went to TestFlight, App Store Connect or Play.

## The rows

| row | result | what the phone showed | evidence |
|---|---|---|---|
| store app **1.0.0 (29)** | **pass** | Opened only after the twin was uninstalled. About reads `1.0.0 (29) · 8fb33348c2c6`. The byte copy was taken before the install, and all six files are byte-identical after it | `S01-store-about-29`, `raw/install29.txt` |
| J1 first answer, tokens/s | **pass** | *"A lighthouse serves as a beacon guiding ships safely through dark waters or illuminating darkness to guide ships safely."* Ledger: **33.5 tok/s**, first token **776 ms**, 156 + 21 tokens, 30 ms per token, 1.4 s, on Instant | `J1-01`, `J1-02`, `result-j1-first-answer.json` |
| J2 run 1, tacking | **pass** (the cut fell at a sentence end) | Stopped after *"…a series of heeling waves forms from the bow and stern."*; Continue went on *" These waves create a rolling motion…"*. The stopped text is kept byte for byte, nothing is said twice | `J2-1*`, `result-j2-continue-1.json` |
| J2 run 2, study habits | **pass** | *"…practicing problem-solving skills, journaling findings,⟦ using active recall, connecting with peers for discussion, and maintaining consistent sleep hygiene.⟧"* | `J2-2*`, `result-j2-continue-2.json` |
| J2 run 3, knight | **pass** | *"…only of night itself, which swallowed him whole⟦ before he could speak a word. His armor…⟧"* | `J2-3*`, `result-j2-continue-3.json` |
| J2 run 4, tacking again | **pass** | *"…perpendicular to the direction of travel when moving forward at high⟦ speed. As the hull turns…⟧"* | `J2-4*`, `result-j2-continue-4.json` |
| J3 the CAT photo on Instant | **pass** (one misread) | No card, no *"photo pack"* text, none of the six banned phrases. *"The red circle represents a 'C' and the black letters below represent an 'A'. The full word is CAT."* 35.3 tok/s, first token 1,544 ms | `J3-cat-*`, `result-j3-photo-cat.json` |

## J2: Stop, then Continue

Each run opened a new chat on Instant, asked, pressed Stop 1.0 s after the answer text appeared, pressed Continue and
read the whole answer when it ended. The bridge has no step that waits for a number of characters, so the stop is timed:
pass 28's 1.5 s gave 278 and 316 characters, and 1.0 s gave 176 to 265 here. A run passes when the final text starts
with the stopped text unchanged and the continuation goes on from the cut: no word said twice, no clause said again, no
new sentence that starts the topic over, and no bare number at the join.

Run 1's Stop landed exactly at a sentence end, so it tests no mid-sentence cut. Run 4 repeats run 1's prompt and steps;
only its screenshot names differ (`scripts/make-scripts.py`).

| run | stopped at, chars | first 8 words after the cut | kept | after Continue: first token, tokens | verdict |
|---|---|---|---|---|---|
| 1 tacking | 229, *"…forms from the bow and stern."* | These waves create a rolling motion that propels | true | 39 ms, 214 + 125 | pass, at a sentence end |
| 2 study habits | 265, *"…journaling findings,"* | using active recall, connecting with peers for discussion, | true | 38 ms, 189 + 16 | pass |
| 3 knight | 176, *"…which swallowed him whole"* | before he could speak a word. His armor | true | 37 ms, 187 + 91 | pass |
| 4 tacking | 209, *"…moving forward at high"* | speed. As the hull turns, water hits one | true | 40 ms, 205 + 156 | pass |

The final texts, verbatim from the screen; ⟦…⟧ is what Continue added:

> **1.** A sailing ship faces the wind by its sail catching it, causing the hull to roll forward. This motion shifts the
> boat's center of gravity slightly ahead. As the vessel moves, a series of heeling waves forms from the bow and
> stern.⟦ These waves create a rolling motion that propels the ship forward through water. The wind pushes against the
> sails, generating rotational force that turns the boat. This torque accelerates the vessel as it navigates across the
> sea. A strong wind provides sufficient lift to overcome resistance and speed up the sail. Without this upward push from
> the air, the engine power would not be effective enough. The interaction between the moving hull and the rising water
> creates a continuous cycle of motion. Each wave adds energy to the system, gradually increasing the ship's velocity
> over time. This dynamic exchange ensures that the boat maintains its course despite changing weather conditions.⟧

> **2.** A 10-item study list includes a structured daily routine covering waking up early, creating a dedicated space
> for focus, utilizing spaced repetition, reviewing notes before bed, taking breaks between sessions, practicing
> problem-solving skills, journaling findings,⟦ using active recall, connecting with peers for discussion, and maintaining
> consistent sleep hygiene.⟧

> **3.** The knight, Kaelen, stood before the darkness he feared most—not in a room, but inside his own chest. He was not
> afraid of dark, only of night itself, which swallowed him whole⟦ before he could speak a word. His armor gleamed with
> oil, but his heart hammered against his ribs like a trapped bird. The only light was the torch of dawn that hummed
> softly around him; it did not hurt to see the dark, yet Kaelan knew that if he let himself go, he would burn with fire
> in one place and cold blood in another, leaving nothing behind but a hollow heart and a nameless grief for days.⟧

> **4.** A sailing ship tacks against the wind by rotating its hull around a fixed axis. The crew applies power to rotate
> the sails, which align them perpendicular to the direction of travel when moving forward at high⟦ speed. As the hull
> turns, water hits one side of the ship and pushes it sideways into the wind direction. This lateral force creates a
> counter-torque that balances the rotational momentum of the sails. The engine provides thrust while the powerboat
> rotates, allowing the entire structure to move with the wind. Eventually, the boat reaches maximum speed, at which
> point it will tuck in when turning left or right. If the wind shifts too drastically, the ship may lose grip and spin
> uncontrollably if not stabilized properly. Adjusting rudder angle helps align the hull's heading directly opposite the
> wind direction. This maneuver is essential for maintaining course while maximizing speed against prevailing
> conditions. Ultimately, a tacked sailboat follows a predictable path determined by initial wind angle and engine power
> output.⟧

Build 28's failure does not come back in these four runs. Runs 2, 3 and 4 were cut mid-sentence, and each continuation
finishes that sentence with the next words. In run 2 the answer had named 7 habits when it was stopped and names 10 when
it ends, the number asked for.

**The console line.** The twin is a Release build, so `__DEV__` is false, and `apps/mobile/src/adapters/llamaRn.ts`
logs no line for a continuation. The bridge therefore exposes no prefill length or cached and evaluated counts. The
ledger of the resumed turn is the closest evidence: its first token came 37 to 40 ms after Continue in all four runs,
against 776 ms for J1's 156-token prompt. The ledger's prompt count is llama.rn's `tokens_evaluated`, 187 to 214 here, so
it does not say how many of those tokens came from the cache. The first-token times fit llama.rn reusing the stopped
turn's cache, and this pass does not prove it.

**What the model wrote, apart from the join.** Runs 1 and 4 have 11 and 10 sentences for the 8 asked. No unstopped
answer to that prompt was run on this phone, so this pass does not say whether Continue changes the count. Run 2 is one
sentence, not a numbered list. Run 3 spells the knight *"Kaelen"* and later *"Kaelan"*. Run 4 gives a sailing ship an
engine. These are the 0.8B model's own answers; none of them is at a join.

## J3: the CAT photo on Instant

The photo went in through the bridge's `image:` line with pass 28's question, *"What colour is the shape in this photo,
what shape is it, and what word is written under it?"*. The run asserted that no `vision-hold` card was mounted 3 s after
Send and after the answer, and that *"photo pack"* was not on screen. None of *"The request specifies"*, *"I will
focus"*, *"as an AI"*, *"family-safe"*, *"violence"* or *"self-harm"* is in the answer, and *"red"*, *"circle"* and
*"CAT"* are. All 45 steps passed. The answer, verbatim:

> The red circle represents a 'C' and the black letters below represent an 'A'. The full word is CAT.

It names the colour, the shape and the word. It also calls the circle a *"C"* and the three letters under it an *"A"*,
which is wrong. Ledger: **35.3 tok/s**, first token 1,544 ms, 185 + 24 tokens, 2.2 s, on Instant with the bundled pack
(`J3-cat-c-ledger`). The bubble shows the whole photo with *"CAT"* under the circle (`J3-cat-b-answer`).

## The harness

1. **The twin.** `com.inbornapp.mobile.qa` was built 15:48:27 to 15:51:31 from 8fb33348, the store archive's commit. It
   carries one `INBORN_QA_BRIDGE_V1`, the same round 117 to 121 markers as the store bundle, and Instant and its pack
   byte-identical to the archive's (`raw/qa-verify.txt`). It was installed fresh at 15:52:14, so its container started
   empty, and J1 launched it with `--launch --boot 45000`.
2. **The chain** ran detached from 15:52:19 to 15:55:53: J1, the CAT photo pushed, J2 runs 1 to 3, then J3. Each script
   went through pass 28's watchdog, which stops a run with no progress 180 s after its push. No run stalled, no push hit
   CoreDevice 7000, and no step failed. Run 4 ran at 15:56:08 to 15:56:29, with the twin still in the foreground.
3. **The ledger reads** set the tier to Pro and back with the bridge's `setTier`. Pass 28 found that the licence state
   then stays Pro in the QA runtime. No row here depends on the tier.
4. **Processes.** J1's `--console` launcher for the twin (pid 14017, started 15:52:20) was killed by its PID after the
   rows, and so was the `tail` of my own progress file (pid 14139). No memory sampler ran in this pass.

## End state

- The phone keeps `com.inbornapp.mobile` **1.0.0 (29)**. After the twin was gone it was launched on About (`S01`,
  15:57:30) and then with `inborn:///chats`, and left on its Chats list (`S99-left-on-chats`). The list holds the store
  app's older chats.
- `com.inbornapp.mobile.qa` was uninstalled at 15:57:07, rc 0. `devicectl device info apps` then lists only
  `com.inbornapp.mobile` 1.0.0 (29) and the other session's `com.inbornapp.mobile.uitests.xctrunner`, which was not
  touched.
- The phone was unlocked at the install, at the twin's install and after the rows (`lockState`: `passcodeRequired`
  false), and no run met a lock. It was never locked or unlocked by this pass, and Settings, Control Center and Face ID
  were not touched.
- Every chain, driver, watchdog and launcher this pass started has exited or was killed by its PID. No simulator was
  booted, no XCUITest runner was started, and port 8787 was not touched.
