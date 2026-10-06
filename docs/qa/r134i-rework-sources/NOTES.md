# Round 134I · reworks keep their sources; an answer that uses no passage shows none

Build 40 iPhone pass: on the founder's file, "shorter" after "Thanks" came back as "Your documents don't mention this.";
a rework kept a `[4]` with no SOURCES under it (J9-24); a pancake recipe in the constitution chat came with
`[1] constitution-9pages.pdf · p.6` (J9-25).

## Causes (read in the code)

1. `Chat.tsx` replaces a reply with `documents.opener.nothingRelevant` when files are attached, no passage stood behind
   it and `claimsFileContent` matches ("the document states / outlines…"). A follow-up rework never retrieves, so a
   rework that said "The document outlines…" about the summary it restated was replaced.
2. A rework had no citations of its own, so a `[n]` the model copied from the summary had no chip to open.
3. `groundedCitations` keeps a passage when the answer shares one content word with it that the question lacks. The
   pancake answer shares `require`, `make`, `two`, `place` with page 6 ("make Treaties", "two thirds", "such Place");
   the model also wrote `[1]`, so the chip showed as cited.

## What changed

- `packages/core/src/chat/context.ts`: `reworkedAnswer(messages)`, the last answer of the follow-up window (past any
  thanks), or null.
- `packages/core/src/rag/citations.ts`:
  - `groundedCitations` first asks whether the answer was taken from the passages at all: at least a third
    (`MIN_SOURCE_SHARE`) of the answer's own content words (not in the question, not in the file's name) must occur in
    the same-script passages. Then the per-passage rule runs as before. Measured on the constitution: real answers
    0.68–0.94, the pancake recipe 0.12, Fast's "the document only contains legal text about the Constitution" refusal
    0.27 (0.31 with the file's name counted, which is why the name is excluded).
  - `inheritedCitations(rework, reworked)`: a follow-up carries the reworked answer's citations when it restates it
    (the same share test against the reworked text) or is it in another language (translation). "Great! Let's make it
    even shorter. What do you want to add?" inherits nothing.
  - `withoutStrayMarkers(answer, citations)`: drops `[n]` marks that open no chip ("[2, 5]" → "[2]").
- `apps/mobile/src/screens/Chat.tsx` (answer/citation path only): a follow-up finds its reworked row and saves the
  inherited citations on the rework row; on a fresh turn with files attached, marks that open no chip are removed;
  the file-claim guard now fires only when there is neither a passage nor a source (`!ragUsed.length && !citations?.length`).
  Acknowledgements inherit nothing (`plainChat === "follow-up"` only). Continue is untouched.

## Proof

- Unit tests: `packages/core/test/chat-rework-sources.test.ts` (reworked answer past the thanks; shorter, bullets and
  French inherit; a non-restating reply and a source-less answer inherit nothing; stray marks; the pancake recipe with
  and without `[1]` and Fast's refusal get no chip over pages 2 and 6; a real answer keeps `[2]` → page 2).
  `apps/mobile/test/fixes-r134i-rework-sources.test.ts` (Chat wiring, guard order, "The document says … [4]" as a
  rework: a file claim that inherits the summary's chips and opens page 3). `fixes-r130-grounding` updated to the new
  guard condition.
- Gates: `pnpm -r typecheck` and `pnpm lint` clean. `pnpm -r --no-bail test`: core 1453 passed (4 skipped), mobile
  1456, ui 23, i18n 24. `fixes-r114` timed out once under load and passed alone.
- iOS Simulator (iPhone 17 Pro, iOS 26.2, created for the run, deleted after). Release `Inborndev.app` with this
  branch's `expo export:embed` bundle, ad-hoc signed; Fast and the index model (embed-e5) installed from
  `scripts/serve-models.mjs`. Fixture `../r132-doc-summary/fixtures/constitution-9pages.pdf`. Scripts in `scripts/`
  (`a1`, `v1`, `b1` Instant, `b2` Fast), all steps passed. `[chat]` windows: thanks 3/3, shorter 3/5, bullets 7/7.
  - Fast (`sim/f*.png`): `f04` "shorter" → one paragraph with the four summary chips p.1–2 … p.7–9; `f05` 3 bullets with
    the four chips; `f06` pancakes → a recipe, no chips, the "Nothing in your documents matched" line.
  - Instant (`sim/i*.png`): `i04` shorter and `i05` 3 bullets with the four chips; `i06` pancakes → no chips.
  - `sim/run1-share-0.25/`: the first run with a 0.25 share and the file name counted. Fast's pancake reply was a
    refusal ("the document … contains only legal text regarding the United States Constitution") with chips p.6, p.5;
    that led to the third and the name exclusion above. Its reworks already carried resolving `[1]`…`[4]` chips (`f04`, `f05`).

## Not proven

- A rework that opens "The document says…" did not come up on the simulator (the user's words cannot force it: "shorter,
  start with 'The document'" is not read as a follow-up). Covered by the unit test only.
- Release JS logs do not reach the simulator's log, so the pancake turn's `[rag] used=` count was not read; the chip
  decision is proven by the unit test built from the device case.
- English only; not run on a phone.
