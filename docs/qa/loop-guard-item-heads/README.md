# F428 · round 114: an item's head is the item, so a verb listed again with a new gloss is cut

iPhone build 24 on round 113's guard (main 22541224, Instant 0.7) showed "4. sein (to be)" then "5. sein
(to exist/remain)", and in the other try "sein: …" as items 1, 5 and 11 and "haben: …" as items 2 and 12. The Fast web
run (`docs/qa/web-fast-loops.md`) showed "3. gehen – to go" and "20. gehen – to go on a trip". Round 113 counted an
item with a different note as a new item ("Dolphin (bottlenose)" and "Dolphin (river)"), and in the "verb: gloss" form
it compared whole lines.

Files:

- `device-cuts.md`: the two build 24 verbs-de answers, the web answer (stored and as the screen text reads), and build
  24's ko-list, he-list and fr-list at 0.2, each with the round 114 cut marked.
- `replay-r114.txt`: the offline replay, round 113 (main) against round 114, with every new or moved cut listed.
- `replay-r114.test.ts.txt`: the replay harness. To rerun it, copy it to `packages/core/test/`, put main's `loop.ts` at
  `packages/core/src/chat/zz-loop-old.ts`, and run it with vitest. `PASS23` and `PASS24` point at the phone corpora;
  build 24 defaults to the read-only `/Users/moshecohen/dev/inborn-wt/ios-build-24/docs/qa/ios-device-pass-24`.
- `red-r114-main-22541224.txt`: `fixes-r114.test.ts` against main before the fix. The 15 cut tests fail and the 11
  keep tests pass.
