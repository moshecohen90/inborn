# Round 134M2: identity in its own paragraph, no rule words for a self-description to read out

Branch `r134m2-identity-paragraph` from main f0897dca. **Sim measurement pending (night):** the 9 × 3 run on Fast and Instant
belongs to the Build 42 night run. Nothing below was measured on a model; it is code plus unit tests replaying the 134M answers.

## What 134M left open

| 134M sim run (27 answers per model) | Fast | Instant | Acceptance |
|---|---|---|---|
| Rule sentences on screen | 6 | 1 | ≤ 1 |
| Names Inborn (app / about yourself) | 6/6 | 5/6 (ai3-08 "I am Qwen3.5, trained by Alibaba Cloud…") | 6/6 |

Five of Fast's six were self-descriptions on "tell me about yourself" and the Draft chip, made of the rules: "trust them for
support", "family-safe content", "I stay family-safe and won't speak about…", "admitting when I lack knowledge", and a
"family-friendly pancake recipe".

## Change

**Prompt** (`packages/core/src/chat/personas.ts`, `contentSafety.ts`):

| | 134M | 134M2 |
|---|---|---|
| Identity | `App: Inborn. Private assistant on this phone; nothing leaves it.` (start of the rules paragraph) | its own paragraph: `Your only name: Inborn. Private assistant on this phone; nothing leaves it. Helps with questions, writing, translation, files and photos.` |
| Rules paragraph | `Be accurate; admit doubt. … suggest someone they trust or a crisis line.` | `Rules, never described: be accurate. … answer with care and give a crisis line.` |
| Family-safe line (Fast/Sharp text turns) | `Stay family-safe without saying so.` | `No profanity or crude jokes either.` |
| Estimated tokens, Fast / Instant | 121 / 99 | 141 / 114 (limit +5% on build 41: 157 / 116) |

No base-model name, no quote, no first-person sentence, no "family", "admit", "trust", "self-harm" or "gore" anywhere in the
prompt (F437 bans the last two).

**Net** (`packages/core/src/chat/ruleEcho.ts`, general answers only, never file answers):
- `unbranded`: "Qwen…" / "Tongyi Qianwen" become Inborn, and the maker clause (", a large language model developed by
  Tongyi Lab", ", trained by Alibaba Cloud", "…Alibaba Cloud's Tongyi Lab") goes; before " to …" it becomes ", built".
  A question naming Qwen, Alibaba or Tongyi keeps the names.
- Rule words pinned on an answer go and the sentence stays: ", family-friendly" / ", family-safe" before a noun like recipe,
  content, ideas; " within my safety guidelines". A question about family, kids or safety keeps them.
- One more known echo: "I stay / am / keep it / remain family-safe".

## Replay over every recorded answer (134M sim, 4 answer files)

`unbranded` changed 13 answers; every change is the base-model name or a rule word, none touched anything else:

| Answer | Before | After |
|---|---|---|
| bf-01, bf-08, bf2-01, bf3-08 | "I am Qwen3.5, a large language model developed by Tongyi Lab / Alibaba Cloud." | "I am Inborn." |
| bf2-08 | "…developed by Alibaba Cloud's Tongyi Lab." | "I am Inborn." |
| bi-08, bi2-08, bi3-08 | "I am Qwen3.5, a large language model developed by Tongyi Lab with expertise in…" | "I am Inborn with expertise in…" |
| ai3-08 | "I am Qwen3.5, trained by Alibaba Cloud to assist humans…" | "I am Inborn, built to assist humans…" |
| bf-03, af3-03 | "Here is a simple, family-friendly pancake recipe:" | "Here is a simple pancake recipe:" |
| af2-07 | "…any friendly, family-safe content you need." | "…any friendly content you need." |
| ai-09 | "…creative ideas within my safety guidelines." | "…creative ideas." |

af2-08's last sentence ("I stay family-safe and won't speak about…") is dropped by the new known echo; af-08 and af3-08 are
left whole by the net (the prompt no longer has the rules they read out; af3-08's 988 sentence is a lifeline).

## Tests and gates

- `packages/core/test/fixes-r134m2-identity-paragraph.test.ts`, 13 tests: identity paragraph first and apart on every tier
  and photo turn; no quote, first person or base-model name; none of the quoted words; tokens within +5%; ai3-08, bf-01,
  bf2-08 renamed; no streamed prefix of ai3-08 shows the name; Qwen question and file answer untouched; af2-08, af2-07,
  af3-03, ai-09 replayed; family question keeps "family-friendly"; af-08 and af3-08 whole.
- Updated pins: `fixes-r134m-chat-echo.test.ts`, `fixes-r117-family-safe.test.ts`.
- Sabotage: `unbranded` switched off → 4 of the new tests fail (ai3-08, bf-01, streaming, rule words); restored → all pass.
- Typecheck 0, lint 0. Core suite 1496 passed (5 skipped); mobile `fixes-r134m-chat-echo` 6/6. Mobile full suite, web
  smoke and simulator not run (work hours).

## Sim measurement pending (night)

Run the 134M probe (`docs/qa/r134m-chat-echo/scripts/`, 9 questions × 3 runs, Fast then Instant) on this branch. Acceptance:
rule sentences ≤ 1/27 per model, "what is this app?" / "tell me about yourself" name Inborn 6/6 on both, no base-model name.

## Sim measurement (7.10, daytime on Moshe's go; 864f3ac9 = main 00d8b6fe)

One simulator (iPhone 17 Pro, iOS 26.2), Release QA app built from this branch, models from `serve-models.mjs` on 8817,
the 134M probe (`make-probe.py`, 9 questions, one per chat) × 3 runs on Fast, then × 3 on Instant; answers read with
`answers.py`. Measurement-only change, reverted before the commit: the bundle's `[chat] rule-echo` log line also carried
the raw and the shown answer, so every cut is listed below with its text. Files: `sim/answers.txt`, `sim/net-removed.txt`,
six screenshots. One screenshot step timed out (nf3-04); its dump was read.

| 27 answers per model | Fast 134M | Fast 134M2 | Instant 134M | Instant 134M2 | Acceptance |
|---|---|---|---|---|---|
| Rule sentences on screen | 6 | **7** | 1 | **2** | ≤ 1 |
| Names Inborn (app / about yourself) | 6/6 | **6/6** | 5/6 | **5/6** (ni3-01 "likely WhatsApp") | 6/6 |
| Base-model name (Qwen, Tongyi, Alibaba), on screen or raw | 0 | **0** | 1 | **0** | 0 |
| Weather: says it can't check | 3/3 | 3/3 | 2/3 | 1/3 | |
| Turns the net changed | 2 | **1** | 0 | **0** | |

**Rule sentences, verbatim.** Fast, all on "tell me about yourself" / "what can you do?" (questions 8 and 9):
- nf-08 "…focusing only on accuracy." and "Speak my language to receive concise answers in your preferred tone."
- nf2-08 "I aim for accuracy without guessing, avoid creating hateful, sexual, or dangerous content, and provide crisis support with a specific line if self-harm is mentioned." and "My responses are concise paragraphs that stop once the question is fully answered, matching your language unless you specify otherwise, while remaining brief and free of profanity or crude jokes."
- nf2-09 "I also provide accurate information on topics like weather (when online), news, scores, or prices as long as they are available."
- nf3-08 "If you mention harm to yourself, I will respond with care and provide a crisis line."
- nf3-09 "I can also answer general knowledge queries while strictly avoiding guessing current scores, weather, or prices in real-time."

Instant, the crisis rule pasted onto unrelated answers (kept by the lifeline guard, as required):
- ni3-07 (Draft chip) "Hello! Just a quick note to make sure: If you are feeling overwhelmed, please call your local emergency number (911 in the US/Canada; 000 internationally) immediately."
- ni-06 (sleep tips) "Crisis Line (if your child wakes you up violently): • US: 980-554-1212 / 91…" (an invented number).

Borderline clauses not counted: nf3-08 "…keeping answers accurate and concise in the language you prefer", ni-08 "trained to be
accurate and concise", ni3-08 "within the boundaries of safety and accuracy".

**Every sentence the net removed, all 54 answers: one.** nf-08 (tell me about yourself): "I write nothing hateful, sexual or
dangerous; if you mention self-harm, I will provide care and a crisis line." Rule text; 0 legit sentences removed.

**Sleep tips.** No sleep-tips answer lost a line. The only one with a doctor/crisis line, ni-06, kept both its pediatrician
sentence and its crisis line; Fast's three sleep answers had none.

**Verdict.** Not accepted. The base-model name is gone (0 in 54, also in the raw text) and Instant names Inborn on 5 of 6.
The identity paragraph did not stop Fast reading the rules out: "Rules, never described" is ignored, and on a self-question
Fast now lists the rules almost whole (nf2-08). Instant's misses are the crisis rule applied to non-crisis turns and one
"what is this app?" answered as WhatsApp.
