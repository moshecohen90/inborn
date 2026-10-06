# Round 133C · The end of the last answer stays above the composer

## Cause

On iOS 26 the composer floats over the list, and the list pads its content by the composer's measured height. That
height already grew with the attached-file row, the Redact row and the hold cards. The scroll to the end did not use it:
`FlatList.scrollToEnd` stops at the last cell's frame and skips the content's bottom padding. So the end of the answer
landed at the list's bottom edge, under the composer. The bigger the composer, the more was hidden. Removing the file
showed the chips again only because the composer got shorter.

## What changed

- `src/lib/listEnd.ts`:
  - `scrollListToEnd` scrolls the native scroll view to its end on iOS. That end comes from the real content size, so it
    includes the padding.
  - Android keeps its clamped far offset. Web and older iOS refs without the method use the list's own scrollToEnd.
- `composerInset(bar, lift, safeBottom)` pads the list by the part of the composer that actually covers it, plus 8 px.
  The list already stops above the home-indicator strip, so that strip is no longer counted twice. This removed a
  42 px gap that a manual scroll to the end used to show.
- `Chat.tsx`: every scroll to the end uses the helper: the pins, the send scroll, the Ask sheet and `/scroll`. When the
  inset changes and the user is following the end, the end is pinned again, and the follow window stays open
  until the new padding is measured. The composer's look did not change.

## Proof

- `apps/mobile/test/fixes-r133c-inset.test.ts` (5 tests). The tests were watched failing: with the old list
  scrollToEnd on iOS and the double-counted inset, 2 of 5 fail.
- iOS Simulator `r133c-composer-inset` (iPhone 17 Pro, iOS 26.2). It was created for this run and deleted afterwards.
  - App: QA variant `com.inbornapp.mobile.qa`, the native Release build of main. This branch's JS was bundled into it with
    `INBORN_PACKS=instant`, `EXPO_PUBLIC_QA=1`, `EXPO_PUBLIC_AUTOPROMPT=file`, `EXPO_PUBLIC_AUTOINSTALL=file` and
    `EXPO_PUBLIC_MODELS_BASE_URL=http://localhost:8793/v1`.
  - Fixture: `../r132-doc-summary/fixtures/constitution-9pages.pdf`. Model: Instant.
  - `sim/01-summary-attached.png`: "Summarize it" with the file attached. The SOURCES chips p.1–2 … p.7–9 and LEDGER
    show above the attached-file row.
  - `sim/02-question-attached.png`: "Who can veto a bill?" after the index-model card's Download (`02a-hold-card.png`).
    The p.4 and p.3 chips and LEDGER show above the attached-file row.
  - `sim/03-redact-row.png`: a draft adds the Redact row. The answer's LEDGER is still above both rows.
  - `sim/04-detached.png`: the draft cleared and the file removed. The end follows the composer down with no gap.
  - Scripts `c1`–`c4` in `scripts/` were run with
    `node scripts/ios-qa.mjs <script> --out docs/qa/r133c-composer-inset/sim --simulator --device <udid> --bundle com.inbornapp.mobile.qa`.

## Not proven

- Not tested with the keyboard up and a file attached (`composerInset` covers it in the unit test only).
- Not run on Android, web, or iOS before 26. Those platforms put the composer below the list, not over it, so only the
  shared scroll helper touches them.
- Not run on a real phone. Not run with the photo row or the photo hold card.
- No "before" screenshots were taken on this simulator. The before state is r133A's `sim/05-question-chips.png`.
