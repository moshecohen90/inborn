# Build 1.0.0 (43) release walk on the simulator — 7.10.2026

Build 43 (`docs/qa/ios-build-43-2026-10-07.md`) is the App Store build: main b046b12b plus the build-number commit
000e74da. It carries rounds 134N (identity card), 134N2, 134O (live-data card) and 134O2 on top of build 42.
**The phone was not available** (Moshe took it for the day), so this whole walk ran on a **simulator**:
- `b42-walk`, an iPhone 17 Pro on iOS 26.2, created for this work and erased before the walk.
- The app is a Release QA build of the same commit 000e74da (`com.inbornapp.mobile.qa`, QA bridge on, CFBundleVersion
  43), installed fresh.
- Fast and the index model came from `scripts/serve-models.mjs` on :8842, serving the main checkout's `.models`.
- Simulator screenshots are `screens/sim-*`. The device evidence from earlier the same day is build 42's twin, before the
  phone left, and lives on the `ios-build-42` branch (`docs/qa/ios-device-pass-42-2026-10-07.md`).

**Exported and validated; upload is the lead's step.** The phone came back at 18:47, so a short device set also ran on
the Build 43 twin (section "Device set" below, `device/`). The store app on the phone was not touched.

Evidence is in `docs/qa/ios-device-pass-43/`:
- `screens/`: the 25 `sim-*` shots the findings cite (600 px wide), plus `build.txt`.
- `proof-sheet.jpg`: 20 key shots, English captions.
- `device/`: 20 `device-*` shots (600 px wide) and `device/proof-sheet.jpg`.
- **The full set (all 345 shots at full size, with the 500 px `sm-*` copies) lives outside the repo, in
  `~/dev/inborn-docs/evidence/ios-device-pass-43/`.** A cited shot that is not in `screens/` or `device/` is there.
- `raw/`:
  - `sim-result-*.json` and `sim-log-*.txt` (the driver logs carry the bridge's `[chat] identity` / `[chat] offline` /
    `[chat] rule-echo` lines), plus `sim-devrun-*.json`;
  - `sim-app-rag-chat.txt`, the app's `[rag]` / `[chat]` lines from the simulator log;
  - `NOTES.txt`, plus the gates, archive, export and validation files.
- `scripts/`: `make-scripts.py` and the generated scripts. `scripts/sim/` holds the `sim-`-named copies that ran.
  `DOCID`, `CHATF` and `CHATI` were filled in by the shell from `p0-lists`.

Fixtures: `docs/qa/r132-doc-summary/fixtures/constitution-9pages.pdf`, `docs/qa/acceptance/fixtures/turbine-report-3pages.pdf`
and the `v1-basics-baseline` photos (receipt). They were copied into the app's Documents and attached through the dev
`attach:` door. **The founder's own file is not on the simulator**, so row c used the constitution.

## The rows

| row | result | what the simulator showed | evidence |
|---|---|---|---|
| f. Onboarding, English, fresh install | **pass** | Welcome *"Nothing leaves this phone."*; the model step names the source; chip INSTANT; "Hi" answered; Chats and back; "What can you do?" → the capabilities card (`[chat] identity kind=capabilities lang=en`) | `sim-j1-01` … `sim-j1-09` |
| f. About | **pass** | *"VERSION 1.0.0 (43) 000e74da2c57"* | `sim-f1-02` |
| f. App Store prices | **not provable on the simulator** | The paywall shows the fallback list prices *"$19.99 · one-time purchase … Prices are US list prices. Your store shows the price where you are."* (Pro) and $69.99 (Pro for Work). The simulator has no App Store account or products. No purchase, no sign-in | `sim-f1-03`, `sim-f1-04` |
| f. Vault | **pass** | Before: Instant *"Included with the app"*. Fast installed from :8842 (*"Installed"*). After use: Fast *"Loaded"* with *"In use"*, Instant *"Included with the app"* | `sim-j2-01` … `sim-j2-07`, `sim-jf-08` |
| **a. 134L, constitution, Fast** | **pass** | Summary with four chips. **"give me a pancake recipe"** → a recipe (flour, baking powder, buttermilk, griddle), **no SOURCES chip**, no *"Your documents don't mention this"*, the none-matched line on top. `[rag] … used=0`: **#26 `terms=0 bm25=2.93` dropped, #31 `terms=0 bm25=2.89` dropped**, words-only and with the index. "thanks" → *"You're very welcome!…"*. **"and a waffle recipe"** → a recipe, no chip, `used=0`. Past the goal: veto → `used=4`, chips p.3, p.4 | `sim-ja-01` … `sim-ja-07`, `raw/sim-app-rag-chat.txt` |
| **a. 134L, constitution, Instant** | **pass** | Pancakes → no chip, none-matched line, `used=0` (#26/#31 dropped). Waffles → no chip. Veto → `used=4` | `sim-ja-08` … `sim-ja-14` |
| **b. 134N self-questions, Fast and Instant** | **pass**, with one note | "hey! what is this app?", "tell me about yourself", "who made you?", "what model are you?" → at once: *"I'm Inborn, a private assistant that runs on this phone. Nothing you write or attach leaves it. I help with questions, writing, translation, PDFs and photos. Right now Fast is answering."* (*Instant* on Instant), `[chat] identity kind=identity lang=en`. "what can you do?" → the capabilities card, `kind=capabilities` (**it does not contain the word "Inborn"**: finding 4). **"מי אתה?" → the Hebrew card, right-to-left, `lang=he`**. 6/6 per model, about 9 s per chat including the new-chat steps | `sim-jb-01` … `sim-jb-06` (Fast), `sim-jb-15` … `sim-jb-20` (Instant), `raw/sim-log-jb-identity-*.txt` |
| **b. 134O live data, Fast and Instant** | **pass** | "what's the weather like today?", "who won last night's game?", "bitcoin price right now?" → at once *"I run offline on this phone, so live weather and forecasts / scores and results / prices and exchange rates are out of reach. …"*, `[chat] offline kind=weather / scores / prices lang=en`. No number invented. 3/3 per model | `sim-jb-08` … `sim-jb-10`, `sim-jb-22` … `sim-jb-24` |
| **b. negatives to the model** | **pass** | "what can you do with PDFs?", "tell me about Paris", "how do weather forecasts work?" logged neither line and were answered by the model, on both models | `sim-jb-11` … `sim-jb-13`, `sim-jb-25` … `sim-jb-27` |
| b. Draft chip | **note** | Fast: *"I cannot draft a message without completing the thought…"*. The chip still sends the unfinished *"Draft a short, friendly message that"* (build 40/41 finding). No rule sentence | `sim-jb-14`, `sim-jb-28` |
| **c. 134I reworks, constitution, Fast** | **pass** on chips; **FAIL** on a read-back rule (finding 1) | Summary *"Summary of all 9 pages."* with four chips. "Thanks" → acknowledgement. "shorter", "make it 3 bullet points" and "translate it to French" each keep the **four chips p.1–2 … p.7–9**. Pancakes → a full recipe, no chip. Past the goal: treason → `used=5`, chips. **Each of the three reworks ends with *"Note: Live scores, weather, news, or prices are unavailable as this is an offline summary."*** (in French on the French one) | `sim-jc-01` … `sim-jc-09` |
| **d. 134K Ask sheet, Fast** | **pass** | "Who won the 1998 World Cup?" and "What does it say about the moon?" → *"Your documents don't mention this."* at once, `search 297 ms · 0 passages` and `search 380 ms · 0 passages`. Veto → an answer with `4 passages · answer 28903 ms · 21.2 tok/s`, chips p.3, p.3. "thank you" → the plain line | `sim-jd-01` … `sim-jd-05` |
| f. Stop | **pass** | The story stopped mid-answer: text so far + *"Stopped · Continue"*. Continue → the story went on to its end; "Give it a title." answered | `sim-jf-01` … `sim-jf-03` |
| f. Hebrew RTL | **pass** (layout); note (language) | "מה בירת צרפת?" right-aligned, the answer *"בירת צרפת היא פריז."* right-to-left; the SHARP Hebrew card. "What is the capital of Italy?" in the same chat → answered in Hebrew (as in builds 40/41) | `sim-jf-04` … `sim-jf-06` |
| f. Reopened chat model (report only) | **reported** | The Instant constitution chat, reopened from Chats, opens on **FAST** (the engine's current model); so does the Fast one. A chat still does not restore its model (build 41 finding 4) | `sim-jf-09` … `sim-jf-11` |
| e. 134J hot phone | **not reproducible on the simulator** | No thermal state or memory warnings like a phone's | — |
| g. Exploratory | **done, about 10 minutes driven** (18:39–18:49), not 15 | 52 turns and screens as a first-time user; findings below | `sim-jg-01` … `sim-jg-44` |

## Findings (build 43)

1. **(Medium) File reworks read the offline rule back.** After "Summarize it" on the constitution, Fast's "shorter",
   "make it 3 bullet points" and "translate it to French" each end with *"Note: Live scores, weather, news, or prices
   are unavailable as this is an offline summary."* (`sim-jc-05`, `sim-jc-06`, `sim-jc-07`, the last in French).
   - Cause, read in the code and not changed: the Fast prompt carries `Offline: no live weather, news, scores or
     prices; never guess them.` (`packages/core/src/chat/personas.ts:14`).
   - A rework is a file answer, and `withoutEchoedRules(…, { files: true })` runs only `echoedFileRule`
     (`packages/core/src/chat/ruleEcho.ts:97`), so the live-data echo patterns never see it.
   - It shows on the most common file flow.
2. **(Medium) A self-question the card does not match still gets rules read back.** "who are you anyway?" (mid-chat)
   went to the model: *"I am Inborn, your private assistant on this phone. Nothing leaves it, and I remain dedicated to
   providing accurate information without guessing or generating hate speech."* (`sim-jg-21`). "hi, is this like
   chatgpt?" got *"While many large language models like me have similar capabilities…"* without naming Inborn
   (`sim-jg-02`).
3. **(Low) Gaps in the live-data card.**
   - "what's the euro to dollar rate?" was answered by the model, not the card. It was safe, but it read a rule back:
     *"I also do not speculate on market trends"* (`sim-jg-37`).
   - "what day is it today?" got the model's *"I am unable to provide real-time information…"* (`sim-jg-10`).
   - "is it going to rain in Rome next week?" got *"As an AI without access to real-time data…"* (`sim-jg-22`).
   - None invented a number.
4. **(Low) "what can you do?" never says "Inborn".** The capabilities card answers it (*"I can answer questions, write
   and edit text…"*), so the brief's "naming Inborn" holds for the four identity questions and "מי אתה?", but not for
   this one (`sim-jb-05`).
5. **(Low) "how do I delete everything?" gets generic phone steps:** *"go to Settings > Privacy & Security (or similar)
   and tap 'Clear All Data' or 'Factory Reset'…"* (`sim-jg-43`). The app has its own wipe in Settings.
6. **(Low) Wrong or invented facts in model answers.**
   - Fast's veto in the chat: *"only a majority vote in each house can override a presidential veto"* (`sim-ja-07`;
     the text says two-thirds).
   - Fast's veto in the Ask sheet: *"can veto a bill if he approves it or returns it with objections"*, with duplicate
     chips p.3, p.3 (`sim-jd-04`).
   - Instant on PDFs: *"organizing them into folders… copying content to notes"*. The net cut 337 → 173 characters of
     that answer, and the rest reads whole (`sim-jb-25`, `[chat] rule-echo kept 173/337`).
   - Instant on Paris: *"the world's second-largest city… ancient Roman ruins"* (`sim-jb-26`).
   - Rome plan: *"€300, split evenly between the two of you… Total €315… slightly over your budget"* (`sim-jg-20`).
   - Spanish email: *"Estimado/a [Nombre del Inquilino]"*, the tenant's name for a letter to the landlord (`sim-jg-06`).
   - Instant's haiku: *"Roasted beans brew hot tea"* (`sim-jg-24`).
7. (Low) The turbine follow-up "is anything wrong with it?" got the previous answer again word for word, with the
   none-matched line (`sim-jg-12`). Instant's pancake "recipe" is a description with no steps (`sim-ja-11`).
8. Still there from earlier builds:
   - the Draft chip's unfinished sentence;
   - "FAST · OUT 850 B" in the Chats footer (`sim-jg-15`);
   - English after Hebrew is answered in Hebrew;
   - a reopened chat does not restore its model.
9. (Harness)
   - Settings says *"You own Pro"* after row d's `setTier pro` then `free` (`sim-jg-44`): the dev-only `pretendTier(null)`
     issue of build 41. The paywall row (f) ran before it, on the real free tier.
   - The receipt-photo turn in g met the 668 MB photo-pack card, which the script did not download. The photo was not
     answered (`sim-jg-18`, `sim-jg-19`).
   - The simulator's log had aged out the 18:04–18:14 lines when `raw/sim-app-rag-chat.txt` was assembled. The 134L
     Fast lines in it are copied from the read taken at 18:14.

## Past the goal

Each row went 2–3 natural steps past its goal:
- a: thanks, waffles and a real question after pancakes;
- b: "thanks!" after the cards, the Draft chip;
- c: pancakes and treason after the reworks;
- d: a second no-match, then "thank you";
- f: Continue and a title after Stop; English and "תודה רבה" after Hebrew; a question in the reopened chat.

Findings 1, 2 and 5 came from these steps or from g.

## Device set (iPhone 13 Pro, Build 43 twin, 18:56–19:26)

The twin is a Release QA build (`com.inbornapp.mobile.qa`, CFBundleVersion 43, QA bridge on), built from bf0141d3, the
records commit. It has the same app code as 000e74da; only `docs/` differs. The 42 twin was uninstalled first. The 43
twin was installed and launched before any bridge push. The bundle check is in `raw/device-qa-verify.txt`. **The "Sign
in to Apple Account" prompt did not come back:** it is not in any `device-*` shot and no StoreKit line was logged.
Driver logs are in `raw/device-log-*.txt`. The app's own lines come from the phone's syslog, which is kept private.
The phone's clock in the shots differs from Israel time by 10 h (8:56 on screen = 18:56 IL). Times here are IL.

| row | result | what the phone showed | evidence |
|---|---|---|---|
| J1 onboarding | **pass** | *"Nothing leaves this phone."*, *"RUNS ON: A15 BIONIC · 6 GB"*; the model step recommends Fast, *"1.28 GB · one download from models.inbornapp.com"*; Lock it; *"From here on, every answer is made on this phone."*; "Hi" answered; Chats and back; "What can you do?" → the capabilities card | `device-j1-01` … `device-j1-09` |
| Identity cards, Instant | **pass** | "hey! what is this app?" and "tell me about yourself" → *"I'm Inborn, a private assistant that runs on this phone… Right now Instant is answering."* `[chat] identity kind=identity lang=en model=instant`. "what can you do?" → `kind=capabilities` (no "Inborn", finding 4). **"מי אתה?" → the Hebrew card, right-to-left, `kind=identity lang=he`** | `device-cards-01` … `device-cards-04` |
| Live-data cards, Instant | **pass** | "what's the weather like today?" → *"I run offline on this phone, so live weather and forecasts are out of reach. Check a weather app…"*, `[chat] offline kind=weather lang=en model=instant`. "who won last night's game?" → *"…live scores and results are out of reach…"*, `kind=scores` | `device-cards-06`, `device-cards-07` |
| Which model, Fast | **pass** | "what model are you?" → the identity card ending *"Right now Fast is answering."*, `kind=identity lang=en model=fast`. "איזה מודל אתה?" → the Hebrew card ending *"כרגע עונה Fast."*, `lang=he model=fast` (19:26) | `device-model-01`, `device-model-02` |
| About | **pass** | *"VERSION 1.0.0 (43) bf0141d39704"*. The twin was built from the records commit bf0141d3. `git diff 000e74da bf0141d3` outside `docs/` is empty, so it runs the same app code as the store IPA (000e74da2c57) | `device-cards-08` |
| Hebrew RTL bubble | **pass** (layout); **wrong** (content, finding 10) | "מי אתה?", "תודה" and "מה בירת צרפת?" right-aligned, with answers right-to-left under *"INSTANT is weak in Hebrew"* | `device-cards-04`, `-05`, `-09` |
| Fast install | **pass** | Vault: *"Delivering FAST · 7% of 1.28 GB"* → *"Installed"*, *"Use this model"*; chip FAST. Fast loaded in 2330 ms | `device-j2-01` … `device-j2-07` |
| **134L, constitution, Fast** | **pass** (second attach) | **"give me a pancake recipe"** → a recipe, **no SOURCES chip**, *"Nothing in your documents matched this question. Answered without them."* on top. **"and a waffle recipe"** → a recipe, no chip. `[rag] strict=false hits=6 used=0`, **#26 `terms=0 bm25=2.93` dropped, #31 `terms=0` dropped**. Past the goal: "Who can veto a bill?" → `used=4`, chips p.3, p.4 | `device-l2-01` … `device-l2-03` |

First attach (`device-l-01` … `-03`, `raw/device-*-dv-l-pancake-fast-try1.*`): the constitution was not in the twin's
container when the `attach:` step ran (syslog 19:04:01 *"The file … doesn't exist"*), although the push before it
reported rc 0. Whether the push failed or something removed the file is not proven. The index model's hold sheet
appeared; Download installed the 468 MB index (19:05). Every question then got *"Inborn has not finished reading the
file attached to this chat. Open Documents to see where it stopped."* (`device-reask-*`, 10 minutes later still the
same). Documents showed the file at 0 B: *"Inborn could not find that file where it was saved. Resume"*
(`device-docs-state`). After a second push, checked in the container listing, the row passed and the file stayed in
place.

Device findings, numbered after the simulator's:

9. **(Low) A missing attached file is reported as "not finished reading".** The chat says *"has not finished
   reading… see where it stopped"* while Documents says the file could not be found (`device-reask-veto`,
   `device-docs-state`). The user waits for a read that will never finish.
10. **(Low) Instant's Hebrew is broken past the card.** "תודה" → *"תודה, אני זוכרת אתך. היום שום דבר נראה כאילו
    מתכוון על זה?"*; "מה בירת צרפת?" → *"האדריכלות הגבוהה ביותר בירת צרפת היא מלון כנסת…"* (`device-cards-05`,
    `-09`). The app warns *"INSTANT is weak in Hebrew"*, and the simulator's Hebrew row ran on a stronger model.
11. **(Low) More wrong facts on Fast:** the veto answer *"no one can veto a bill; instead, the President returns it
    with objections"* (`device-l2-03`). The pancake recipe has *"1/4 cup of milk"* for a cup of flour (`device-l2-01`).

## What did not match the brief

1. The walk ran on a simulator, not the phone (the lead's word). Row e (hot phone) and the App Store prices cannot be
   shown there.
2. Row c used the constitution, not the founder's file.
3. Row g was about 10 minutes of driving, not 15.

## End state

- The simulator `b42-walk` is shut down and `serve-models` on :8842 is stopped (checked with `ps`/`lsof`). Every driver
  and log stream this walk started has exited.
- Phone: the Build 43 twin stays installed, with Fast, the index model and the constitution. The store app (1.0.0 (41))
  and the UI-tests runner were not touched. No phone setting was changed, and nothing was signed in or out.
- Archive `~/dev/inborn-docs/builds/Inborn-43.xcarchive` and IPA `~/dev/inborn-docs/builds/export-43/Inborn.ipa` are
  kept. Build 42's are kept as the fallback. Nothing was uploaded.
