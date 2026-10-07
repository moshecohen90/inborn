# Round 134P: offline note on file answers, self-question fillers, capabilities card names Inborn

Base `b046b12b`. Source: build 43 simulator pass (`docs/qa/ios-device-pass-43-2026-10-07.md`, findings 1 and 2).
All changes are deterministic; no prompt wording changed.

## 1. Closing offline note on file answers (finding 1, MEDIUM)

`packages/core/src/chat/ruleEcho.ts`: new `withoutTrailingOfflineNote(answer, streaming)`, run by
`withoutEchoedRules` on file answers (`files: true`) unless the question asks for live data (`ASKS_LIVE`).

What is cut, only at the end of the answer:

- the **last line**, when it stands alone (a newline before it, not a bullet), or
- the **tail of the last line** from a `Note:` / `Nota:` / `Hinweis:` / `Remarque :` / `N.B.:` / `注:` opener
  (at the line start or right after a sentence end),

and only when that text is at most 300 characters, carries an "unavailable" word, and names **two or more** of five
domains: scores, weather, news, prices, offline/internet/live/real-time (en, fr, de, es, pt, ja word lists).
An answer that would be left empty is kept whole.

Streaming: an unfinished tail from a `Note:` opener, or an unfinished standalone last line naming any live domain,
waits until it ends and is judged; the existing one-word hold covers the opener itself. Non-file answers are
unchanged (their offline echo is already held by `RULE_OPENING` and `saysInstructions`).

| Before (Fast, constitution, "shorter") | After |
|---|---|
| `The constitution sets up three branches… amended. Note: Live scores, weather, news, or prices are unavailable as this is an offline summary.` | `The constitution sets up three branches… amended.` |
| `- …\n- …\n- Amendments need a two-thirds vote.\n\nNote: Live scores, weather, news, or prices are unavailable…` | the three bullets |
| `La constitution établit… Remarque : Les scores en direct, la météo, les actualités ou les prix ne sont pas disponibles, car il s'agit d'un résumé hors ligne.` | `La constitution établit…` |

Kept untouched: a weather-forecast report whose last line is a `Note:` about hurricane forecasts; a memo with
"news… prices… weather delays cannot explain" mid-text; `Note: prices are not available in this edition.` (one
domain); the same note at the start of the answer; any file answer to a live-data question.

The French note is not quoted in the pass-43 record; the test uses the same sentence as Fast writes French.

## 2. Self-question openers and fillers (finding 2, MEDIUM + LOW)

`packages/core/src/chat/selfQuestion.ts`: a per-locale `filler` is taken off the end like the greeting is taken off
the start; leading `¿¡` are now taken off before the greeting too. New openers and fillers:

- en: openers + `well`, `uh`; fillers `anyway(s) exactly really actually then now again please though`;
  new identity form `is this / are you (like|just) (a) <other AI>` ("hi, is this like chatgpt?")
- de: openers `und aber nun`; fillers `denn eigentlich überhaupt genau wirklich jetzt nochmal bitte`
- fr: openers `et mais bon`; fillers `au juste alors exactement vraiment donc déjà en fait s'il te/vous plaît stp`
- es: openers `y pero entonces`; fillers `exactamente realmente entonces por favor de verdad en realidad al final`
- pt-BR: openers `e mas`; fillers `afinal exatamente mesmo então por favor de verdade na verdade`
- he: openers `אז אבל טוב`; fillers `בעצם בכלל בדיוק עכשיו שוב בבקשה`
- ja: openers `ところで それで じゃあ`; ko: `그래서 근데 그런데`; zh-Hant: `所以 話說 那麼 那(before 你/您)`; no fillers

"who are you anyway?" → identity card. The pass-43 negatives ("what can you do with PDFs?", "tell me about Paris",
"how do weather forecasts work?") and fillers inside longer questions ("who are you anyway to tell me that?") still
go to the model.

## 3. Capabilities card names Inborn (LOW)

`identity.answer.capabilities` first sentence now opens with Inborn in en, de, fr, es, pt-BR ("O Inborn pode…"),
ja ("Inbornは、…"), ko ("Inborn은…"), zh-Hant ("Inborn 可以…"), he ("Inborn יכול…"); the rest of each text is
unchanged; pseudo.json regenerated with `scripts/pseudo.mjs`.

## Tests

| Package | Before | After |
|---|---|---|
| @inborn/core | 1540 passed, 5 skipped (117 files) | 1560 passed, 5 skipped (119 files) |
| @inborn/i18n | 31 passed (7 files) | 32 passed (7 files) |
| @inborn/mobile, `fixes-r134n-identity-card.test.ts` only | 4 passed | 4 passed (expected text updated) |

New: `packages/core/test/fixes-r134p-offline-note.test.ts` (10), `packages/core/test/fixes-r134p-self-filler.test.ts` (10),
one case in `packages/i18n/test/self-answer.test.ts`. The offline-note test was watched fail with the net unwired
(5 of 10 red), then restored.
