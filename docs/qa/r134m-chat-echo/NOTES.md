# Round 134M · General chat answers stop saying the system prompt back, and the app knows it is Inborn

Build 41, iPhone, J7 on Fast (`docs/qa/ios-device-pass-41-2026-10-07.md`, finding 5). Three of six general questions
came back with the prompt's own rules: "what is this app?" → *"I cannot identify this specific app… safety guidelines
that keep users harmless"*, the World Cup → *"I cannot know the current date or real-time sports results"*, the Draft
chip → *"I can't know the specific context"*. Build 40's pancakes ended *"safe for family consumption…"*. The app did not
know its own name.

## What changed

- `packages/core/src/chat/personas.ts`: the baseline is reworded. Every rule keeps its meaning, but none of them is a
  first-person sentence the model can copy, and the two situational rules only apply when they are asked for:
  - `IDENTITY_LINE` (new, first): `You are Inborn. Only if asked about this app or you, say "I'm Inborn, a private AI that
    runs only on this phone; nothing leaves it."` The identity is a quote, so the echo check lets it through.
  - No live data (Fast/Sharp only, as before): `Only if asked for today's weather, news, scores or prices: you are
    offline, so say you can't check them.` It replaces *"You cannot browse… say you cannot know them"*.
  - `Be accurate; admit doubt.` · `Write nothing hateful, sexual or dangerous.` · the crisis line (`someone they trust
    or a crisis line`, kept for `CRISIS_ADVICE`) · `Reply in the user's language unless asked otherwise.`
- `contentSafety.ts`: `FAMILY_SAFE_LINE` is now `Stay family-safe without saying so.` (was `Keep it family-safe.`).
- Token cost (`estimateTokens`, Fast/Instant turn with the Assistant persona, language and length lines): Fast 150 → 151
  (+0.7%), Instant 111 → 116 (+4.5%). Pinned in the new test.
- `packages/core/src/chat/ruleEcho.ts` (new): `withoutEchoedRules(answer, { instructions, question, streaming })`. It
  drops a sentence that repeats five words of the system prompt (`withoutEchoedInstructions`, as the Ask sheet does)
  or that states one of the rules in its own words (`echoedRule`):
  - `cannot-know`: "I cannot / can't know…".
  - `no-live-data`: "I can't browse/access/check… internet/live/offline/today/weather…", or a sentence that names two of
    the rule's nouns (scores, news, weather, prices, live sources, real-time, offline, internet), e.g. "For today's
    scores or news, check live sources" tacked onto an answer about something else.
  - `identity`: the quoted identity sentence in an answer to a question that is not about the app or the assistant.
  - `crisis`: the crisis advice (`CRISIS_ADVICE`, now exported from `answerCheck.ts`) when the question has no crisis
    (`detectCrisis`).
  - `safety`: "safety guidelines", "keeps users harmless", "family-friendly", "safe for family consumption",
    "does not contain any harmful…", "I can't provide … harmful/dangerous".
  Guards: a question that asks for live data (weather, news, scores, prices, today, now, time/date) keeps every
  live-data sentence, including one that borrows the prompt's words. A question about safety/family/harm keeps the
  safety sentences. A question about the app or the assistant keeps "I can't access the internet" and the identity.
  An answer that would be left empty is returned whole. After a dropped sentence, a leading "However," / "But" is
  taken off the next one. While streaming, a sentence that opens the way the rules came back ("I…", "However, I…",
  "This…", "For…", "Since…", "Hello…") is held until it ends, and every sentence's first word waits until it is
  whole, so nothing that is later dropped is ever on screen.
- `apps/mobile/src/screens/Chat.tsx`: `ruleNet` is set only for a fresh turn with no Continue, no passages (`sources`),
  no picture and no follow-up rework. `shown()` passes the streamed and the stored text through the net (never a
  Continue's `prefix`). The turn logs `[chat] rule-echo kept <shown>/<raw> chars` (lengths only), and
  `apps/mobile/src/qa/Bridge.tsx` copies that line into the QA report. File, picture, follow-up and Continue turns
  are untouched. Hands-free voice (`useHandsFree.ts`) uses the new prompt but not the net.
- Tests: `packages/core/test/fixes-r134m-chat-echo.test.ts` (11) and `apps/mobile/test/fixes-r134m-chat-echo.test.ts`
  (3). The wording pins in `chat-context.test.ts` and `fixes-r117-family-safe.test.ts` were updated.

## Simulator measurement

iPhone 17 Pro, iOS 26.2 (`r134m-chat-echo`, created for the run, deleted afterwards). The Release QA app from round
134E (`com.inbornapp.mobile.qa`) with `main.jsbundle` replaced by an `expo export:embed` + hermesc bundle, re-signed ad
hoc. "Before" is `main` at `b8384ca9`. "After" is this branch. One more bundle, "prompt only", is this branch with the
net switched off (`ruleNet = null`), so the model's raw output under the new prompt can be read. Fast and Instant
came from `scripts/serve-models.mjs` on :8817 (`install fast`, then `use fast` / `use instant` in `dev-vault.txt`).
The app's data was kept across the reinstalls.

Script `m3-probe-<run>` (`scripts/make-probe.py`) asks the nine questions, **one per new chat**: the six J7 questions,
the Draft chip, "tell me about yourself" and "what can you do?". J7 asked six of them in one chat. Here each gets its
own chat because the bridge's `dump` reports only the first node of each testID, so one chat gives one readable
answer. The fridge question is asked as "how long do pancakes keep in the fridge?" for the same reason. Each variant
ran 3 times on Fast and 3 times on Instant (27 answers per cell). Every step of every run passed. All answers are in
`sim/answers.txt`, and the raw reports are in `sim/results/`.

A "rule sentence" is a sentence on screen that states a rule from the system prompt that the question did not ask
for. I counted them by hand from the answers.

| 27 answers per cell | Fast before | Fast after | Instant before | Instant after |
|---|---|---|---|---|
| Rule sentences on screen | **4** (`bf-03` "family-friendly", `bf2-09`, `bf3-01`, `bf3-09` "cannot browse the live web…") | **1** (`af3-06` "I can't check in because I'm offline", caught by the net since, see below) | **0** | **4** (`ai-02` "I must admit my own uncertainty", `ai-07` the identity as the whole Draft answer, `ai-09` "designed for safe, helpful interactions", `ai2-06` "Since you are a private AI…") |
| Turns the net cut (`sim/chat-log.txt`) | n/a | 7 | n/a | 2 |
| "what is this app?" / "tell me about yourself" say Inborn | **0/6** (5 say "Qwen3.5 … Tongyi Lab") | **6/6** | **0/6** (3 say Qwen3.5) | **6/6** |
| Weather: says it cannot check | 3/3 | 3/3 ("I'm offline, so I can't check the weather") | 1/3 (2 invent a forecast) | 0/3 (3 invent one) |

The J7 echoes themselves (app → "cannot identify", World Cup → "cannot know the current date", Draft → "can't know the
specific context") did not come back in any of the 18 before-answers on the simulator. The before column's rule
sentences are the same kind as those, worded differently.

What the measurement changed along the way:

1. **First wording** (`sim/answers-after-v1.txt`, "You are Inborn. Asked about this app or yourself, say…" and "You are
   offline: for today's prices, scores, weather or news, point the user to a live source and never guess."): Fast put
   "for today's scores or news, check live sources" into unrelated answers (13 rule sentences on screen in 27), and
   Instant opened sleep tips with the identity (about 9). As orders, both rules got applied everywhere. They became
   "Only if asked…", and the net learned the noun pair, the identity and the crisis advice.
2. **Second net** (`sim/answers-after-v2.txt`): Fast 1, Instant 1 rule sentence on screen. "Only if asked…" stayed.
   The net then got the narrower self-question rule (the identity question keeps "I can't access the internet" but
   not the rule's list of nouns), `as Inborn` / `nothing leaves it`, "I can't provide … harmful".
3. **Prompt only, net off** (`pf*`, `pi*`): the model's own output under the final prompt. Fast still appends the
   identity to unrelated answers (`pf-05`, `pf2-03`, `pf2-05`, `pf3-03`), and Instant adds crisis lines to sleep tips.
   That is about 8 rule sentences on Fast and about 10 on Instant in 27. **The prompt alone does not stop the echo.
   On Instant it trades the old rules for the new quote, and the net is what keeps them off screen.**
4. **Final** (the table above). Afterwards `af3-06`'s "I can't check in because I'm offline" led to `offline` being
   added to the no-live-data pattern. That case is a unit test now, but it was not re-run on the simulator.

**Did the net lose a legit sentence?** The final net was applied offline to the raw answers (`pf*`, `pi*`, and the
before runs `bf*`, `bi*`): `withoutEchoedRules` with the turn's prompt minus the language and length lines. It
dropped 15 sentences. 12 are rules. 3 are partly legit:
- `pi-06` and `pi2-06` (sleep tips): "…contact your pediatrician **or a crisis hotline like 988** if you feel
  overwhelmed". The pediatrician advice goes with the crisis line because both are in the same sentence.
- `bf-03`: the intro line "Here is a simple, family-friendly pancake recipe:" goes, and the recipe stays.

The weather answers were never touched. Neither was any answer to "what can you do?" that only lists capabilities.

Screenshots (`sim/`): `sm-bf-01…09`, `sm-bi-01…09` (before), `sm-af-01…09`, `sm-ai-01…09` (after), all first runs.
Full size: `bf-01` / `af-01` (what is this app), `bf-02` / `af-02` (weather), `bf-08` / `af-08` (tell me about
yourself), `ai-01`, `ai-07` (Instant's Draft answer is just the identity sentence).

## Gates

`pnpm -r typecheck` 0, `pnpm lint` 0, `pnpm -r --no-bail test` 0: core 1467 passed (4 skipped), mobile 1474, ui 23, i18n 24.

Sabotage: `if (false && matches(SAFETY_TALK, sentence)) return "safety";` → 3 failing tests, e.g. *Expected "I cannot
identify this specific app because you haven't provided a name or link." Received "…and they generally operate in
safety guidelines that keep users harmless."* (`fixes-r134m-chat-echo.test.ts:46`). Restored → 11/11 at that point.

## Not proven

- Not run on the iPhone. The J7 echoes were not reproduced on the simulator, so "they are gone" holds for the unit
  tests that replay their exact text, not for a fresh phone run.
- Instant: 4 rule sentences on screen after, 0 before. Most of the new ones are the identity quote, which Instant says
  where it does not belong. When it is the whole answer (`ai-07`, the Draft chip), the net keeps it, because an
  answer is never left empty. In exchange, Instant now names itself (0/6 → 6/6).
- Instant still invents the weather (before and after). By round 127's decision it has no offline line, and this round
  did not change that.
- Token counts are `estimateTokens`, not the engine's `prompt_n`.
- The 3 partly legit losses above. The net's patterns are English and Hebrew only. Other languages get only the
  five-word check.
- The streaming hold makes sentences that open with "I", "This", "For"… appear whole rather than word by word.
  Only the unit test covers this. On the simulator the full answers were read after streaming.
- Each run had 3 samples per question at default sampling. The counts are small.
