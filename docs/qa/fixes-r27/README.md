# Fixes round 32 — evidence (stream `fixes-r27`, 23.9.2026)

Finding F97, filed by `android-vc18` off the phone. Static run: no device, no emulator, no browser beyond the headless
`web:smoke` harness.

| file | what it proves |
|---|---|
| `red.txt` | `apps/mobile/test/legal-texts.test.ts` with `legalBody.ts` holding a stub that returns main's screen text unchanged (`meta: []`, body from the first `##`): **8 fail, 40 pass**. The eight are the new F97 assertions; the 40 that stay green include every file-level assertion F96 added, which is exactly why the defect shipped. |
| `green.txt` | the same command on the fixed tree: **48/48**, verbose, each assertion named. |
| `f97-rendered-after.txt` | the counts `android-vc18/f97-legalbody-proof.txt` took, re-taken by importing the shipping `legalBody.ts`. Terms: `Cohen Apps` rendered 0→1, `+1-440-847-8502` 0→1, `Effective date` 0→1. Privacy: `Effective date` 0→1. Each line also shows how many of those hits are in the metadata block itself. |
| `tests.txt` | the whole suite: **1,000 passed** (core 616, mobile 362, i18n 11, ui 11). Mobile is +8, the new assertions. |

Gates after the fix, all clean: `pn typecheck`, `pn lint`, `pn test`, `pn web:build`,
`MODELS_DIR=/Users/moshecohen/dev/inborn/.models pn web:smoke` (6/6 PASS).

**Not done:** the screens were not re-read on the OnePlus 6T or in a simulator — this stream touches no device, so the
metadata block is proven by the rendered string the screen is handed, not by a photograph of it.
