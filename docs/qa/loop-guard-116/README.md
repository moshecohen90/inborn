# F434 · round 116: an item said again in other words, a head said again in the singular, and three retry seams

iPhone build 26 on round 115's guard (main 4f27a09f) at the 0.2 persona still showed two items said again and three
seam blemishes. The device pass was read from the `ios-build-26` worktree and is committed at 5de58f00
(`docs/qa/ios-device-pass-26/`, branch `ios-build-26`).

- es-list: item 17 "La única forma de ser feliz es hacer cosas buenas y hacer cosas malas." restates item 5, which
  reads "haciendo" in both places. The retry wrote it.
- fr-list: item 11 "Un objet de décoration maison (ex: une" is item 6 "Des objets de décoration maison (…)" in the singular.
- ko-list: the retry after "…15. 파" opened with "16. 오징어" and the join read "15. 파 16. 오징어".
- ja-list-cities: the retry after "…三重、鳥取" opened with prose, and the join read "鳥取これらはすべて…".
- he-list: the tail cut kept "…ברוז, ברוזל", and "ברוזל" is item 6 said again.

Files:

- `device-cuts.md`: the two answers with "✂ cut here", and the three seams before and after.
- `replay-r116.txt`: the offline replay, round 115 (main) against round 116, with every new or moved cut listed.
- `replay-r116.test.ts.txt`: the replay harness. To rerun it, copy it to `packages/core/test/`, put main's `loop.ts` at
  `packages/core/src/chat/zz-loop-old.ts`, and run it with vitest. `PASS23` to `PASS26` point at the phone corpora;
  the harness header says how to extract build 26 from 5de58f00.
- `red-r116-main-4f27a09f.txt`: `fixes-r116.test.ts` against main before the fix. The 8 cut and seam tests fail and the
  6 keep tests pass.
