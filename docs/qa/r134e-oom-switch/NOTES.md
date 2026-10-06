# Round 134E: a memory switch left a dead turn (6.10.2026)

Evidence: build 38 on the founder's iPhone 13 Pro (6 GB, hot). After a photo turn on Fast, a text turn got "Ran out of
memory · Switched to Instant" in 1.3 s and stopped after one word (X6-01). Continue added two words and stopped again
(X6-02). The next message got no reply at all: Instant, 160 prompt tokens, 0 generated, no row, no error line (X6-04,
`devrun-x6-stop-plus.json`). The message after that worked (X6-06). The banner then stayed on every screen.

## (b) Why the turn after the switch died

Not a stale session and not a prompt built for the old model. The guard kept killing every new answer.

1. A memory warning sets the policy's status to `memory` (`packages/core/src/device/policy.ts` classify). On a phone,
   `render` gives that status `stopGeneration: true` and `unloadAfterMs: 0` on every evaluation, the switched branch
   included (`policy.ts`, `case "memory"`).
2. The status lasts much longer than the warning. Raw pressure clears only after `MEMORY_RECOVERY_MS` = 30 s with a
   healthy snapshot (`apps/mobile/src/device/guard.ts` `tick`, `signals.ts:24`). Then the policy holds `memory` for
   another `recoveryHoldMs` = 20 s (`policy.ts` `update`). That is 50 s or more, and longer while the phone stays hot.
3. The guard evaluates on every activity edge (debounced 250 ms) and on a 5 s ticker. Each evaluation ran
   `if (rec.stopGeneration && isGenerating()) stopGeneration()` and
   `if (rec.unloadAfterMs === 0 && state !== "unloaded") unloadSession("memory")` (old `guard.ts` `apply`).
4. So the next message loaded Instant (`engine.ts` guarded `generate` → `loadSession`). It evaluated the prompt
   (260 ms, the 160 tokens) and was aborted and unloaded about 250 ms after it went busy, before the first token. That
   is the `elapsedMs 725`, `predicted_n 0` in the devrun. Continue on X6-01 died the same way after two words.
5. `Chat.tsx` then removed an assistant row that had no text and was stopped (old line 874,
   `if (!reply && !reasoning && stopped && !savedId)`). The user's bubble just sat there. That row removal exists for
   the user's own Stop. The guard's stop went through the same branch.

The message after recovered because the 50 s window had closed by then.

Fix:
- `guard.ts` `apply` + `device/memoryStrikes.ts`: stop and unload for `memory` once per warning. The next warning is
  acted on again. Thermal and the background pause are unchanged.
- `Chat.tsx` `generate`: the turn awaits `loadSession()` first. It takes the model, `nCtx`, the tier and the thinking
  flag from the session that will answer. Before this, the turn used the values captured at render time.
- `lib/emptyAnswer.ts` `emptyTurn` used in `Chat.tsx`: a turn that ends with no words, and was not stopped by the
  user, is saved as a system stop. The user sees the existing "The system stopped generation · Continue" line
  (`AssistantMessage.tsx`). An empty bubble or a vanished row cannot happen now. Continue on an empty row regenerates
  (`continueRow`). An empty assistant row never goes back into the prompt (`wire`). A `[chat] empty answer: …` line is
  logged outside `__DEV__`. This also covers finding 1 of the pass (30 min in, every turn `prompt_n 1`, 0 tokens). Its
  trigger is still unknown, but it now shows as that line with a way to retry.
- `Chat.tsx` picture check: a guard stop counts as cancelled (`cancelled: () => ac.signal.aborted || wasStoppedByGuard()`),
  so a stopped picture-history turn is not silently started again.

## (a) What a picture turn leaves resident, and the cheaper release

llama.rn 0.12.9 (`cpp/rn-mtmd.hpp`): bitmaps and input chunks are freed after each call. Only their hashes stay, for
KV reuse. The KV cache is allocated once at `n_ctx`, so picture tokens only occupy slots that exist anyway. What
stays is the projector, `mtmd_ctx`: its weights (Fast's pack is 668 MB F16, Instant's 205 MB) plus the vision
compute buffers. Device: `mem-j5c.txt` sits at ~236 MB before the photo turn and ~962 MB after it, flat. Simulator
(this run, Instant, `footprint`): 353 MB before, 766-776 MB after the photo answer, **492 MB after the release**. One more
thing matters: every later turn in that chat sends the picture again (history), so the text turn after a photo runs
the vision encoder too (simulator: a 10 s prompt phase on the story turn).

So the guard now acts in two steps on a phone (`guard.ts` `patch`/`ease`, `MemoryStrikes.warn`):
- **First warning with a projector attached:** stop the answer, release the projector (`engine.releaseVision` →
  `ctx.releaseMultimodal()`), keep the model. There is no switch and no banner, and the row shows "The system stopped
  generation · Continue". Until memory recovers, a turn whose picture sits only in older messages leaves it out
  instead of loading the projector again (`visionGate.ts` `memoryEased`). A new photo still loads the projector and is
  answered as before.
- **A second warning within 120 s, a critical level, or no projector attached:** the old path, switch to the smaller
  model.

The release takes the inference queue first. Without that, the simulator segfaulted in `mtmd_tokenize`: a completion
and `releaseMultimodal` run on separate llama.rn workers (crash report `Inborndev-2026-10-06-175459.ips`, first run of
this round). `llamaRn.ts` also sends the stop again on the first token after an abort, because `rewind()` clears the
native stop flag when the worker starts.

## (c) The banner

`policy.noteAnswered(tier)`: an answer that finishes with tokens on the model a memory switch moved to retires the
line (`memoryLineRetired`), and memoryBack is marked offered. Switch back stays available in the model sheet. A fresh
warning brings the line back (`noteMemoryWarning`). Switch back on the line clears it as before.

## Tests

- `apps/mobile/src/device/memoryGuard.test.ts`: the real `DeviceGuard`, with the engine and signals mocked. A warning
  during an answer gives one stop, one unload and the switch. The next answer, inside the hold, runs 6 s untouched.
  Its finish retires the line, and a second warning acts again. Second case: the projector is released on the first
  warning, the model is kept, and a second warning switches. **Watched fail:** with `const owed = true` the first case
  fails with `expected 3 to be 1` (the next answer stopped twice). With the `noteAnswered` call removed it fails with
  `expected 'device.memory.switched' to be null`.
- `apps/mobile/src/lib/emptyAnswer.test.ts`: `emptyTurn`, the QA seam, `MemoryStrikes`, and the vision gate's
  `memoryEased` drop.
- `packages/core/test/device-policy.test.ts`: one test for retire and re-show.

Gates: `pnpm -r typecheck` clean, `pnpm lint` clean, `pnpm -r --no-bail test`: core 1412 passed / 4 skipped, mobile
1435 passed, i18n 24, ui 23. (`fixes-r111`, `fixes-r114`, `web-badges-persist-r106` timed out once at load 322 and
passed when rerun alone.)

## Simulator proof (`sim/`)

Simulator `r134e-oom-switch`, iPhone 17 Pro, iOS 26.2. I created it for this run and deleted it afterwards. The app is
the QA variant `com.inbornapp.mobile.qa`, one native Release build for the simulator (the r130 recipe, with models
served by `scripts/serve-models.mjs` on :8811). Two JS bundles were swapped in: this branch, and this branch with
`EXPO_PUBLIC_DEV_EMPTY_ANSWER=1`. Memory warnings are the real `UIApplication` warning, from Simulator ›
Debug › Simulate Memory Warning, clicked from the shell while the answer streams. Driver:
`node scripts/ios-qa.mjs <script> --out docs/qa/r134e-oom-switch/sim --simulator --device <udid> --bundle com.inbornapp.mobile.qa`.

| Shot | What it shows |
|---|---|
| `01-chat-fast` | Fast downloaded from the local server (`s1-onboard-fast` up to the download, then `s1c-start`) |
| `02-story-streaming` | "Write a long story about a lighthouse keeper." streaming on Fast |
| `03-stopped-switched` | Warning while it streams. The story stops with "The system stopped generation · Continue", and the line shows "Ran out of memory · Switched to Instant · SWITCH BACK" |
| `04-next-answered` | **15 s after the warning**, well inside the old 50 s kill window: "Give it a title." is answered on Instant (*"The Keeper's Watch"*), and the out-of-memory line is gone |
| `05-photo-answer` | New chat on Instant (photo pack inside the app): the red-circle photo, "What do you see?", answered |
| `06-eased-stopped` | Warning during the story in that chat. The answer stops with "The system stopped generation · Continue", there is **no** out-of-memory line, and the chip stays INSTANT. The story had produced no words yet (the stop came in its picture prompt phase), and the row stays with the system line |
| `07-continued` | Continue: the story is written in full, with the old photo left out (no projector reload) |
| `08-forced-empty` | `EXPO_PUBLIC_DEV_EMPTY_ANSWER=1` bundle, new chat, one message: "The system stopped generation · Continue" under the model label, not an empty bubble |

Process footprint, final bundle (`footprint`, Mac): before the photo turn 353 MB; photo answered 766 MB; story
streaming 773 MB; 16 s after the warning (once the stopped turn freed the queue) **492 MB**; after Continue 507 MB.

## Not proven

- Not on the iPhone. A real jetsam-level warning on a hot 6 GB phone, and whether dropping the projector (~700 MB for
  Fast's pack) is enough there to avoid the second warning and the switch, are not shown.
- Fast's own photo pack was not used on the simulator. The ease was proven with Instant's 205 MB projector.
- The 30-minute `prompt_n 1` failure (finding 1): its cause is not found. Only its symptom is handled (the system
  line with Continue).
- Stop latency inside the native picture prompt phase. llama.rn does not check the stop flag while it encodes an
  image, so the stop lands after that phase (simulator: ~10 s at high load).
