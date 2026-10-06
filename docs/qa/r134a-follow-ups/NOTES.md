# Round 134A · a short follow-up is applied to the answer, not thanked

Build 38 device pass, finding 3: after a summary, "shorter" got "You're welcome! Feel free to reach out anytime…" and
"And now" got an invented offer. Round 133B sent both kinds of plain chat turn the same small-talk line ("reply in one
or two short, friendly sentences… do not mention the files") and the short plan (224 tokens).

## What changed

- `packages/core/src/chat/smallTalk.ts`: `plainChatKind(text)` returns `"acknowledgement"` (thanks, ok, greetings,
  goodbyes: `isAcknowledgement`), `"follow-up"` (round 133B's ≤3-word follow-up words) or `null` (file route).
  `isPlainChatTurn` is `plainChatKind(text) !== null`, so the hold, the turn plan, the notice and `detectUse` are
  unchanged.
- `packages/core/src/chat/context.ts`: `turnSystemPrompt({ plainChat })` replaces `smallTalk`. An acknowledgement gets
  `SMALL_TALK_LINE` (now only about small talk). A follow-up gets `FOLLOW_UP_LINE`, which says to apply the follow-up
  to the previous answer from the conversation (shorter, longer, continue, translate, rephrase, add detail), not to
  search or describe the files again, and to ask one short question when it is unclear or there is nothing to continue.
- `packages/core/src/chat/length.ts`: `planAnswerLength({ plainChat })`. An acknowledgement keeps the short plan. A
  follow-up gets the long plan (1024 tokens) unless the user names a length. Under the plain plan, the one-word
  counting rule would have clipped "longer" to the short plan.
- `apps/mobile/src/screens/Chat.tsx`: `generate()` computes `plainChat`. `smallTalk = plainChat !== null` still feeds
  the gate, and the kind feeds the length plan and the system prompt.

## Proof

- Unit tests: `packages/core/test/chat-small-talk.test.ts` checks the kind for each phrase in all 9 languages, the two
  lines, the plans, and that "thanks, now shorter" stays a file route. `apps/mobile/test/fixes-r133-ack.test.ts`
  checks the Chat wiring and the computed turn for each kind.
- iOS Simulator (iPhone 17 Pro, iOS 26.2, created for this run and deleted afterwards). One Release build of this
  branch, `com.inbornapp.mobile.qa`, with the same environment as round 133B. Instant, no index model,
  `constitution-9pages.pdf`. Scripts: `scripts/a1-onboard-instant.json` (15/15 passed) and
  `scripts/a2-follow-ups.json` (60/60 passed). On every plain turn the bridge confirmed no `docs-hold` and no
  `none-matched`, and the screenshots show no SOURCES:
  - `sim/02-summary.png`: "Summarize it" gave the whole-file summary with SOURCES, as before.
  - `sim/03-shorter.png`: "shorter" gave a reworded summary of about the same length (one paragraph, slightly
    tighter). No "You're welcome".
  - `sim/04-translate.png`: "translate it" gave the summary again in English, reworded. It did not translate.
  - `sim/05-and-now.png`: "And now" repeated the previous answer word for word. It did not ask a question.
  - `sim/06-thanks.png`: "thank you" gave "Thank you!" followed by the summary again.
  - `sim/07-question-held.png`: "What does it say about treason?" got the 468 MB card, as before.

## Not proven

- Instant (0.8B) does not follow `FOLLOW_UP_LINE`. It echoes the previous answer for "shorter", "translate it" and
  "And now", and it still recaps after "thank you". The routing requirement holds (no card, no sources, no notice) and
  the invented offer and the "You're welcome" are gone, but no follow-up was actually applied. Fast (the founder's
  model) was not run.
- No before run on this simulator. The before state is the Build 38 report.
- Only English was sent on the simulator. The other languages are covered by unit tests only. Not run on a phone.
