# F426 · round 113: short items listed again, the retry's instruction echoed, retried lists that turn to prose, and Continue restating the stopped clause

iPhone build 23 at the app's own settings (Instant 0.7, "List 30 animals that live in the ocean, one per line,
numbered.") and the Fast web run (`docs/qa/web-fast-loops.md`) showed what round 111's guard (main 98722df7) still let
through:

- **A one-word item listed again.** "Octopus" as items 8 and 21, "Dolphin" as items 2 and 6, "Sponges" twice. Round
  111 only compared items of two words or 8 code points, to keep answer keys safe.
- **A retry that restarted the numbering.** The silent retry kept "…21. Octopus\n22. Sponges\n" and the model went on
  "10. Sponges\n11. Shrimp\n12. Crayfish…". The screen showed "22. Sponges" then "10. Sponges".
- **An item the model marked as a repeat.** "27. Clownfish (again, as listed before but distinct species…)" repeats
  item 8. Round 111 compared it with its note, so it counted as new.
- **The retry's instruction on screen.** Fast's retry wrote "…To strictly follow "Continue exactly where you stopped"
  without repeating…" and four paragraphs of planning, about 1,700 characters.
- **A retried list that went on as prose.** ko-list's "다음은 다음 단계입니다." under item 15, fr-list's restarted intro
  "Voici une autre sélection de 30 idées…" inside item 8, and he-list ending ",." after a retry that wrote only ".".
- **Continue restating the stopped clause after a new subject** ("…treaties like the" + "British colonial powers
  established control … through treaties like the Indian Ocean Treaty").

The work started as round 112 (F425) and ships as round 113 (F426). The first half's test file and fixture keep their
names, `packages/core/test/fixes-r112.test.ts` and `fixtures/r112-device-answers.json`. The second half is
`fixes-r113.test.ts`.

Files:

- `device-cuts.md`: both build 23 list30 answers as the phone showed them, and as the round 113 guard shows them with
  and without the phone's own retry continuation.
- `replay-r113.txt`: the offline replay, round 111 (main) against round 113, with every new or moved cut listed.
- `replay-r113.test.ts.txt`: the replay harness. To rerun it, copy it to `packages/core/test/`, put main's `loop.ts` at
  `packages/core/src/chat/zz-loop-old.ts`, and run it with vitest and `PASS23=<main>/docs/qa/ios-device-pass-23`.
- `red-r112-main-98722df7.txt`: `fixes-r112.test.ts` against main before the fix. 16 of 22 fail, including the three
  answer-key fixtures that main cuts. `fixes-r113.test.ts` failed 9 of 14 before the round 113 code.
