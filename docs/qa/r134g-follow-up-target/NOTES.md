# Round 134G · a follow-up reworks the last real answer

Build 39 iPhone pass (J3): after "Summarize it" → "Thanks" → "You're welcome", "shorter" got "You're welcome! Enjoy
your day." and "more" got "You're welcome!" or a menu. The follow-up was applied to the last assistant message, which
was the reply to the thanks. Also "make it 3 bullet points" and "translate it to French" took the file route (the
3-word follow-up rule missed them) and got the 468 MB index card or a search.

## What changed

- `packages/core/src/chat/context.ts`: `followUpWindow(messages)` drops the thanks/greeting turns (`isAcknowledgement`)
  after the last real answer, with their replies, so the last assistant message the model sees is the answer it
  reworks. It keeps system rows and a turn that carries a picture. If nothing real was answered yet, it returns the
  messages unchanged. `FOLLOW_UP_LINE` now says "apply this to your previous answer" and lists "turn it into a list".
- `packages/core/src/chat/smallTalk.ts`: `plainChatKind` adds a second follow-up pattern. It matches a rework of up to
  8 words (`REWORK_MAX_WORDS`): an imperative transformation verb (make, turn, rewrite, translate, shorten, put,
  convert…) with it / that / this, in en, de, es, fr, pt-BR, ja, ko, zh-Hant and he. In es, fr and pt the pronoun can
  be glued to the verb ("tradúcelo", "rends-le", "transforma-o"). A target after it is allowed, digits included ("3
  bullet points", "to French", "in one line"). A rework never matches with "?", a file word, "tl;dr" / "resum", or when
  `fileAsk` reads it as a summary ask: "Summarize it" and "summarize it in 3 bullets" still read the whole file. 箇条書き
  and 條列 no longer count as the file word 条/條.
- `apps/mobile/src/screens/Chat.tsx`: for a follow-up turn, the prompt is built from `followUpWindow(history)`. Every
  plain chat turn logs `[chat] plain=<kind> window=<sent>/<history> maxTokens=<n>` (counts only, no text).
  `apps/mobile/src/qa/Bridge.tsx` (QA builds only) copies that line into the run report.
- No change was needed in `detectUse`/`recommend.ts` or `docsGate.ts`: they read `isPlainChatTurn`, so the wider
  follow-up kind gets no card, no search and no "none matched" notice there. The length plan stays long (1024).

## Deviation from the brief

The brief said a rework should be excluded when `fileAsk` returns "about". It is excluded only for "summary".
`fileAsk` reads CJK reworks such as "それを3つの箇条書きにして" as "about", because it finds no content word in
them. A rework verb is a subject of its own, and real "about" asks ("what is this") have no rework verb, so they still
do not match.

## Proof

- Unit tests: `packages/core/test/chat-follow-up-target.test.ts` covers reworks in all 9 locales (≥4 each) and
  negatives in all 9 ("What does it say about X?", "summarize it", "translate the document", "make a plan for the
  trip", file words). It also covers the 8-word limit, the detectUse/length/line flow, and `followUpWindow` (thanks +
  reply + "shorter", two acknowledgements plus a greeting, no plain chat tail, system rows, picture turn, nothing
  answered yet). `apps/mobile/test/fixes-r134g-follow-up.test.ts` covers the Chat wiring, the built prompt ending with
  the summary and then "shorter", and the hold, turn and notice for the reworks.
- Gates: `pnpm -r typecheck` and `pnpm lint` are clean. `pnpm -r --no-bail test`: core 1439 passed (4 skipped), mobile
  1449, ui 23, i18n 24.
- iOS Simulator (iPhone 17 Pro, iOS 26.2, created for the run and deleted afterwards). The app was the Release
  `Inborndev.app` (`com.inbornapp.mobile.qa`) from this batch, with `main.jsbundle` replaced by an `expo export:embed`
  of this branch and re-signed ad hoc. No index model was installed. Fixture: `../r132-doc-summary/fixtures/constitution-9pages.pdf`.
  Scripts: `a1-onboard-instant` (15/15), `a2-follow-up-target` (Instant, 70/70), `f1-install-fast` + `f2-use-fast-new-chat`
  (Fast served by `scripts/serve-models.mjs` on :8798), `a3-follow-up-target-fast` (Fast, 70/70). On every plain chat
  turn the bridge confirmed no `docs-hold` and no `none-matched`. The bridge log is the same on both models:

  ```
  [chat] plain=acknowledgement window=3/3 maxTokens=224    Thanks
  [chat] plain=follow-up window=3/5 maxTokens=1024         shorter: Thanks + reply dropped, summary is the last answer
  [chat] plain=follow-up window=7/7 maxTokens=1024         more
  [chat] plain=follow-up window=9/9 maxTokens=1024         make it 3 bullet points
  [chat] plain=follow-up window=11/11 maxTokens=1024       translate it to French
  ```

  - **Fast** (`sim/f*.png`): `f03`: "Thanks" → "You're very welcome!…". `f04`: "shorter" → a one-paragraph summary of
    the Constitution, with no thanks. `f05`: "more" → the summary plus "Key provisions" bullets (Treason, State
    Admissions, Federalism). `f06`: "make it 3 bullet points" → "…summarized in three bullet points" with 3 bullets.
    `f07`: "translate it to French" → "Voici le résumé… traduit en français" with the 3 bullets in French.
    `f08`: "What does it say about treason?" → the 468 MB card, as before.
  - **Instant** (`sim/0*.png`): `04`: "shorter" → a one-paragraph summary, no thanks. `05`: "more" repeats that
    paragraph (known echo limit). `06`: "make it 3 bullet points" → 3 bullets of the summary. `07`: "translate it to
    French" → the summary in French. `08`: treason → the card.

## Not proven / seen on the way

- Fast copies the summary's citation markers ([2][3]) into its reworks, and those reworks have no SOURCES under them.
  Fast's French has one mistranslation ("trépas" for treason). Both are model output; neither was changed here.
- On Instant, the reply to "Thanks" was "No further summary is needed for this context…". In the first run, before
  the bundle was rebuilt, it was "Your documents don't mention this." The acknowledgement path is unchanged from
  round 133B.
- "more" after a thanks that is not at the tail (window 7/7) still shows the model the earlier Thanks exchange in the
  middle. Only the trailing exchanges are dropped.
- Only English was sent on the simulator. The other 8 locales are unit tests only. Not run on a phone.
