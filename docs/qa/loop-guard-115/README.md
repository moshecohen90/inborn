# F431 · round 115: a line pair said again in a code block, a shared word misspelt, and no ",." at a Continue seam

iPhone build 25 on round 114's guard (main 6312e769) still showed two repeats and one seam blemish. The device pass is
read-only at `/Users/moshecohen/dev/inborn-wt/ios-build-25/docs/qa/ios-device-pass-25/`
(`ios-device-pass-25-2026-09-27.md`).

- math-long-div 0.7 #2 wrote "- 123000000" / "--------" 16 times in a fenced block, with a new number between each pair,
  and ran to the token budget inside the block.
- he-list 0.2 said items 14 and 18–22 again as 23–28, with the first word "קיבוץ" misspelt by one letter.
- Continue try 1 joined "…capitals," and ". These ventures" as "capitals,. These".

Files:

- `device-cuts.md`: the two answers with the round 115 cut marked, and the seam before and after.
- `replay-r115.txt`: the offline replay, round 114 (main) against round 115, with every new or moved cut listed.
- `replay-r115.test.ts.txt`: the replay harness. To rerun it, copy it to `packages/core/test/`, put main's `loop.ts` at
  `packages/core/src/chat/zz-loop-old.ts`, and run it with vitest. `PASS23`, `PASS24` and `PASS25` point at the phone
  corpora; build 25 defaults to the read-only device-pass worktree above.
- `red-r115-main-6312e769.txt`: `fixes-r115.test.ts` against main before the fix. The 8 cut and seam tests fail and the
  9 keep tests pass.
