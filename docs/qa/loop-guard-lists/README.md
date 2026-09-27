# F423 · round 111: lists that repeat, phrases split by markup, clean cuts, worked sums and the Continue seam

iPhone build 22 (`docs/qa/ios-device-pass-22-2026-09-27.md`, F422) and round 110's web trials
(`docs/qa/web-guard-verify.md`) showed what the round-107 guard still got wrong, on Instant at the app's own settings:

- **list30-animals 0.7 #2 (phone).** Items 21–30 repeat items 11–20 word for word. The shipped guard saw nothing,
  because each line carries its own number.
- **he-explain 0.7 #2 (phone).** "האם צריך פטין מלאכותי? כולם אומרים:" appears twice back to back, and the first copy is
  inside `**…**`. The back-to-back rule compared the text with the markers, so the two copies differed.
- **list30-animals under a 0.2 persona (phone).** Jellyfish, Clownfish, Octopus and Starfish cycle as items 11–30.
- **math-long-div 0.7 #1 (phone).** A correct long-division step multiplies by 2 again. The echo rule read it as a
  copy, took back 113 characters, and the retry went on with wrong arithmetic.
- **es-list A#4 and he-explain B#4 (web).** The cut kept "18. La única" and "*   **הגשה", so the retry joined a
  half item: the list went on as prose, and "**הגשה ### סכנות…" showed raw markup.
- **Continue (phone).** "…like Christopher Columbus's fleet," went on "Christopher Columbus's fleet discovered…".

## The fix, in `packages/core/src/chat/loop.ts`

- `normalize()` reads the answer without markup before every rule. It drops list markers at a line start (`1.`, `1)`,
  `(1)`, `-`, `*`, `•`, `1、`, `א.`, `(א)`, `一、`, `①`), heading marks, emphasis (`**`, `__`, `*`, `_`, `~~`), inline
  code and quotation marks. Each normalized code point keeps its input start and end, so a cut maps back to the input.
- **The item rule.** An item of two words or more, or of 8 code points, that the same answer already listed is a loop
  on its second copy. The cut is at that item's line, or where a restarted block of items begins ("1. Apple … 5.
  Elderberry" said again). Items listed again are allowed in these cases:
  - labels that end in a colon ("**Advantages:**");
  - data lines, and lines with arithmetic ("$123 \times 2 = 246$" comes back in long division);
  - asked repetition;
  - a user's own list that lists an item twice.
- **Clean boundaries.** A copy that starts inside a sentence or an item takes that sentence or item with it. A copy
  that starts inside a word of a new item keeps that item whole ("13. Asian Elephant"). The kept text never ends with a
  bare item number, an open `**`, an opening bracket or a half word, and it keeps a closing quote its line opened. When
  the kept text ends with a list item, a line break follows, so the retry starts on a new line.
- **Worked steps.** Ten repeated words are not an echo when the run crosses a number that changed and holds
  arithmetic. The same step with the same numbers is still a loop.
- **A copy counts only where its word ends.** "Photosynthesis\nPhotosynthesis is…" and "Sea Basslet" after "Sea
  Bass" are not a phrase said twice.
- **The Continue seam.** `seamOverlap()` drops the start of a continuation that repeats the last three words or more of
  the stopped sentence. The chat passes the text on screen as `prefix`, and the silent retry uses the same check.
- `packages/core/src/chat/length.ts`: "Do not repeat yourself unless the request asks for repetition, and do not pad."

## Files

- `device-cuts.md`: the phone and web answers with `⟦CUT⟧` where the round-111 guard cuts them and `⟦SHIPPED CUT⟧`
  where the shipped guard did (built by `device-cuts.test.ts.txt`). The math and web texts are reconstructed where the
  logs kept only a prefix; each reconstruction reproduces the logged kept length and unit on the shipped guard.
- `replay-r111.txt`: every stored answer through the shipped guard (origin/main fd8b0201, rounds 107 and 110) and the
  round-111 guard. It has one line for every answer where the new guard cuts where the shipped one did not, or cuts
  somewhere else (built by `replay-r111.test.ts.txt`).
- `red-r111.txt` and `red-r111-main-fd8b0201.txt`: `fixes-r111.test.ts` against `loop.ts` and `length.ts` of the
  base b5bd2758 and of main fd8b0201.
