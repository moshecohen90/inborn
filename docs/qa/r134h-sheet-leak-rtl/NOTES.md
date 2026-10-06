# Round 134H · The Ask sheet never shows its own instructions; Hebrew bubbles checked

Build 39 iPhone pass (`docs/qa/ios-device-pass-39-2026-10-06.md`, findings 3 and 4).

## 1. Prompt leak in Documents → Ask (J9-20)

On Fast, the turbine report and "Who wrote this report?" gave *"Your documents don't mention this. If you do not know the
answer for sure, stop after that sentence."*

**Cause.** The sentence comes from `startWith` in `packages/core/src/rag/prompt.ts`. The no-passage system prompt was
`Start with "<opener>" <files line> If you do not know the answer for sure, stop after that sentence.`, so the instructions
came straight after the quoted sentence and a small model kept copying. The chat checks answers against the system prompt
(`checkedAnswer` in `answerCheck.ts`), but only on picture turns. The sheet had no check at all.

**What changed.**
- `prompt.ts`: the rule now ends on the quote: `<files line> If you do not know the answer for sure, say only the opening
  sentence. Start with "<opener>"`. "were searched" (F449) is kept, and "then answer the question" is still not there.
- `packages/core/src/rag/echo.ts` (new): `withoutEchoedInstructions(answer, system, { streaming })` drops every sentence
  that repeats 5 words in a row of the system prompt (`ECHO_WORDS`, the same threshold the chat's `checkedAnswer` uses).
  Quoted text inside the instructions does not count, so the opener stays. While streaming, an unfinished sentence is
  held back as long as its words so far match the instructions. `systemOf(messages)` returns the system prompt.
- `AskDocuments.tsx`: both the streamed text and the finished answer go through it, before `withoutEchoedLabels` and
  before the chips read the reply.
- Tests: `packages/core/test/fixes-r134h-sheet-leak.test.ts` (7). It covers the exact leaked text under the old and new
  rules, the whole-rule echo seen on the simulator, every streaming prefix of the leak, and answers that must stay
  unchanged. `apps/mobile/test/fixes-r134h-sheet-leak-rtl.test.ts` (2). The rule-text pins in `fixes-r124`,
  `fixes-r130-grounding` and `fixes-r126` were updated.

**Measured on the simulator** (script `h6-probe`, six no-match questions: three on the turbine report, three on the
constitution, Fast, guard **off**, so this is the model's raw output):

| Rule | Runs | Answers that repeat the rule | Other meta text |
|---|---|---|---|
| old (`Start with … stop after that sentence.`) | 2 × 6 | **2** (both the whole rule after the opener: "constitution, moon landing" and "constitution, who wrote") | 2 ("I do not have access…", "I do not know the answer for sure and cannot…") |
| new (quote last) | 2 × 6 | **0** | 0. Twice the opener came after a one-line answer ("Paris is the capital of France. Your documents don't mention this.") |

With the guard on, Fast's six answers had no instruction text. Instant had no instruction text under either rule.

**Committed screenshots (Instant, final code):** `sim/03-turbine-who-wrote.png` (the leaked question: only "Your
documents don't mention this." and the none-matched line), `sim/04a-constitution-who-wrote.png`,
`sim/04b-constitution-moon.png` (same), `sim/04c-constitution-veto.png` (a real question still searches: 4 passages, answer
with [1]).

## 2. Hebrew chat bubbles (J9-23, J9-24)

**No code change. The bubbles were already right.** `UserMessage`, `AssistantMessage`/`Markdown` and the reasoning text
already set `writingDirection` and `textAlign` from `directionOf(content)` (QA F234). Code blocks and tables stay LTR.
In J9-23/24 the Hebrew lines are right-aligned and the "?" sits at the left end. In right-to-left text that is where a
sentence ends, so the screenshots show correct RTL and the finding misread them. An LTR paragraph would be left-aligned,
with the "?" to the right of the Hebrew. `directionOf` uses the first strong character: "פריז is the capital" is RTL and
"Paris היא הבירה" is LTR. Digits and punctuation do not count ("12:45 בערך" is RTL). The unit tests pin this, and the
mobile test pins the bubble styles.

Simulator, Instant, the first chat with no file (`h5`): `sim/05a-hebrew-question.png` "מה בירת צרפת?" is right-aligned
in its bubble, with the "?" at the sentence end (left). The Hebrew answer is right-aligned. In `05b-hebrew-thanks.png` the
thanks and its reply are RTL. In `05c-english-question.png` "What is the capital of Italy?" is LTR in the same chat
(Instant answered it in Hebrew; that is the model, not the layout).

## Run

- Gates in the worktree: `pnpm -r typecheck` 0, `pnpm lint` 0, `pnpm -r --no-bail test` 0 (mobile 1448, core 1420 + 4
  skipped, i18n 24, ui 23). An earlier full run timed out on `fixes-r114` "25 distinct verbs" under load; alone it passed 27/27.
- iOS Simulator `r134h-sheet-leak-rtl` (iPhone 17 Pro, iOS 26.2), created for this run and deleted afterwards. QA
  variant `com.inbornapp.mobile.qa` (the native Release build from round 134E), with this branch's JS embedded:
  `INBORN_PACKS=instant`, `EXPO_PUBLIC_QA=1`, `EXPO_PUBLIC_AUTOPROMPT=file`, `EXPO_PUBLIC_AUTOINSTALL=file`,
  `EXPO_PUBLIC_MODELS_BASE_URL=http://localhost:8813/v1` (`scripts/serve-models.mjs`, PORT=8813). The shell copied
  `../r132-doc-summary/fixtures/constitution-9pages.pdf` and `../acceptance/fixtures/turbine-report-3pages.pdf` into the
  app's Documents and wrote `install embed-e5` (later `install fast`, `use fast`, `use instant`) to `dev-vault.txt`.
- Order: h1, h5, h2, h3, h4, then h6 once per variant. The shell replaced `DOCID_T`/`DOCID_C` with the ids from h2's
  dump. `node scripts/ios-qa.mjs <script> --out docs/qa/r134h-sheet-leak-rtl/sim --simulator --device <udid> --bundle com.inbornapp.mobile.qa`.
  Every step passed.

## Not proven

- Not run on a real phone. The leak was seen on the iPhone; on the simulator it was reproduced with Fast and the old rule.
- The chat's document turns go through `checkedAnswer` only for pictures. Round 134G owns the chat path, so it was not
  changed here.
- Not run on Android or web. Non-English openers were covered only in the unit tests.
