# Round 133B · "And now" and "thank you" are not questions for the file

Build 37, fresh install, no index model: the founder attached a 9-page PDF, asked "Summarize it" (answered by the
whole-file route), then typed "And now" (on Fast) and "Thanks", and got the 468 MB document index card. With a file
attached and no index model, every turn that was not a summary ask was held, and it would also have searched the file,
counted as a documents question for the model advice card, and could show "Nothing in your documents matched".

## What changed

- `packages/core/src/chat/smallTalk.ts`:
  - `isAcknowledgement(text)`: the whole message is thanks / ok / great / got it / perfect / bye / good night /
    greetings, in en, ja, de, es, fr, pt-BR, ko, zh-Hant and Hebrew (תודה, תודה רבה, אוקיי, סבבה, מעולה, הבנתי, יופי,
    שלום…), plus a few softeners ("so much", "again", "ממש", "네"…). Never with "?", never above 6 words.
  - `isPlainChatTurn(text)`, the one signal the app uses: an acknowledgement, or a turn of at most 3 words (Han and kana
    count 3 characters as a word) in which every word is a follow-up word: and, now, next, more, again, continue,
    shorter, simpler, translate, explain, repeat, also, please, it, this, in, a language name, ok… and their
    equivalents in the 8 locales and Hebrew (ועכשיו, עוד, שוב, תמשיך, יותר קצר, תתרגם, תסביר, בבקשה, את זה; a glued ו
    counts). "And now", "shorter", "translate it", "תסביר שוב" are plain chat. A "?", a digit ("page 3", "article 2"), a
    file word (page, file, document, pdf, section, article, chapter… עמוד/קובץ/מסמך/סעיף/פרק…), a summary ask, "tl;dr"
    / "resúmelo", or any other word ("treason clause", "refund policy", "serial number", "סעיף הבגידה") keeps today's
    file route.
- `detectUse` (core, `catalog/recommend.ts`): with documents attached, a plain chat turn is not "documents", so the
  "FAST is better at documents" card does not fire on it.
- `turnSystemPrompt({ smallTalk })` (core, `chat/context.ts`) adds `SMALL_TALK_LINE`: "The user's last message is small
  talk or a short follow-up about the conversation, not a question about the files: reply in one or two short, friendly
  sentences from the conversation and do not describe or mention the files." `planAnswerLength({ smallTalk })` takes
  the short plan (224 tokens).
- `apps/mobile/src/lib/docsGate.ts`: a `smallTalk` input on `planIndexHold` (send, no card), `planDocsTurn` (model,
  before every other route, strict mode included) and `saysNoneMatched` (quiet).
- `Chat.tsx`: `submit()` computes it from the typed text when no photo is in the composer, skips the page-picture plan
  for it, and passes it to the hold. `generate()` computes it for a fresh turn whose message carries no picture and no
  photo text, and passes it to the turn plan, the notice, the length plan and the system prompt. Continue, photo turns
  and every other text are unchanged.
- Documents → Ask (`AskDocuments.tsx`) is untouched.

## Proof

- `packages/core/test/chat-small-talk.test.ts`: acknowledgements and plain chat turns, positives and negatives for each
  of the 9 languages, `detectUse` cases, the system-prompt line and the short plan.
- `apps/mobile/test/fixes-r133-ack.test.ts`: the hold ("And now", "thank you", "shorter" send; the treason and turbine
  questions and "and page 3" hold; the summary still skips the hold), the turn plan across file states, the notice,
  and Chat wiring the same signal everywhere.
- Full run: core 1376 passed (4 skipped), mobile 1417, ui 23, i18n 24; typecheck and lint clean.
- iOS Simulator (iPhone 17 Pro, iOS 26.2, created for the run and deleted afterwards), one Release build of this branch,
  `com.inbornapp.mobile.qa`, the final JS bundle put in with `expo export:embed`, Instant (bundled), **no index model
  installed**, `../r132-doc-summary/fixtures/constitution-9pages.pdf` copied into Documents. Scripts
  `scripts/a1-onboard-instant.json` and `scripts/a2-summary-thanks-question.json`, 38 of 38 steps passed:
  - `sim/02-summary.png`: "Summarize it" answered with no card, "Summary of all 9 pages…", SOURCES.
  - `sim/06-and-now.png`: "And now" answered by the model with no card; the bridge confirmed no `docs-hold` and no
    `none-matched`.
  - `sim/07-thanks.png`: "thank you" the same way.
  - `sim/08-and-now-thanks-full.png`: the end of the "And now" reply, then "thank you" → "Thanks! That summary covers
    the key points from your conversation about federal structure, including the powers of Congress and the President.
    Is there anything else you'd like to discuss?", each followed by LEDGER only: no SOURCES, no notice, no card. Taken
    by hand (idb) after the run, after Cancel on the card from step 04.
  - `sim/04-question-held.png`: "What does it say about treason?" gets the 468 MB card as before.

## Not proven

- Instant only half follows the small-talk line. "And now" got one paragraph of about five sentences ("Here is a brief
  summary of the next steps: The President approves bills…"), inside the 224-token cap but longer than one or two
  sentences, and it describes the file's content from the conversation. "thank you" got two sentences that still
  recap the summary. Fast (the founder's model) was not run.
- No before run on this simulator: the before state is the founder's Build 37 report.
- Strict mode ("answer only from my documents") now answers these turns from the model instead of "not found"; covered
  by the unit test only.
- Only English was sent on the simulator; the other languages are unit tests. Not run on a phone or on Android.
