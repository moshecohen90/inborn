# Round 134J: a memory switch during a photo turn (7.10.2026)

Evidence: build 40 on the founder's iPhone 13 Pro (6 GB, hot), journey J6 (`docs/qa/ios-device-pass-40-2026-10-07.md`
in commit 7e0e1ba5, its `raw/`). Warning 1 (01:28:26) dropped Fast's photo pack and kept Fast, with nothing on screen.
Warning 2 (01:30:20) came during a new photo turn: Fast described the story instead of the photo, the chat moved to
Instant with no line, Instant then said "no photo model installed", and the vault still showed Fast in use.

## What happened in J6 (read from the device's own numbers)

1. **Warning 2 hit while the projector was loading, not during an answer.** The memory samples
   (`raw/mem-0121-0152.txt`) read 739 MB at 01:30:16 and **1,207 MB at 01:30:21** (Fast's 668 MB pack going in),
   then 543 → 460 MB (weights released) → 561 → 641 → 715 MB (Fast loaded again, without a pack).
   The photo turn was inside `enableVision`. `isGenerating()` was false, so there was no stop. The guard ran
   `unloadSession("memory")` and queued the switch to Instant.
2. **The turn loaded Fast again, without its projector.** The old `switchModel` waited for the release, and only then
   set `engine.model = instant`. Meanwhile the photo turn's `generate` called `loadSession()`, which had read
   `engine.model` (still Fast) when it was called. So it reloaded Fast. `devrun-j6-story.json` shows this:
   `loadMs 3346`, no `imageMaxTokens` in `devInfo` (a fresh load with no projector), and `ctxUsed 1176`, which is the
   story with no image tokens. `llamaRn.ts` (wire line, now :125) sends a picture only when `this.vision` is set.
   It dropped the image without any error, and Fast described the lighthouse story. The `memoryEased` drop in
   `visionGate.ts` did not cause this. The new photo was on the last user message, so the gate correctly went to
   "wait" and attached the projector. The guard then released it, together with the weights, under the turn.
3. **The engine then named Instant while Fast stayed resident.** The switch with `load=false` set `engine.model =
   instant` after the turn's Fast load had started. `devrun-j6b-photo-again.json` shows `model: "instant"` with
   `desc "qwen35 2B"` and `sizeMB 1211`, which are the Fast weights. The J6b photo resolved **Instant's** pack
   (`resolveVision(model.id)` with the engine's model). That pack was attached to the 2B context and failed: one
   mmproj fits one embedding width. The gate's wait → refuse fallback (`Chat.tsx`, "Waited, and the projector still
   would not attach") then printed `chat.vision.companionMissing`. Instant's bundled pack was never missing. The
   next turn, "What colour is the wall?", got *"deep, textured red"*. Fast's first answer in that chat already said
   *"red brick wall"*, so that turn does not prove the picture was seen.
4. **The line was retired by the wrong answer.** On the busy → idle edge, the guard credited the finished answer to
   `peekEngine().model.id`, which was already Instant. So the Fast answer that ran across the switch counted as
   "an answer on the model the memory switch moved to" and retired the line at once (`policy.noteAnswered`). The
   thermal row ("Slowing down…") was the only one left.
5. **The vault read the chosen default.** `VaultScreen` marked `vault.activeModel()` (the default, Fast) as
   Loaded/In use. The model sheet read the engine's model (Instant).

## Fixes

1. **The load reads the model after the release, and the switch names the model in the same tick as the unload.**
   `engine.ts:81` `loadSession` reads `engine.model` inside the `.then` after `unloading`. `engine.ts:210`
   `runSwitch` calls `unloadSession("switch")` and sets `engine.model` with no await in between (`:217`), then
   notifies the state listeners. `settledModelId()` (`:229`) lets a turn wait for a switch the guard started.
2. **A picture never goes out blind.** In `engine.ts:404` `withProjector`, run inside the inference turn of every
   guarded `generate`: when the messages carry a picture and the loaded context has no projector, a new picture
   (one on the last user message) gets the projector **of the model whose session answers**, through
   `registerVisionResolver` (`device/boot.ts:15`). Older pictures alone, while the guard has eased memory, are
   left out (134E's rule). If nothing attaches, the turn throws `vision-unavailable` and never answers around the
   picture. `enableVision` (`:373`) now takes the inference queue, so a warning during a 668 MB load cannot release
   the weights under it. `attach` (`:383`) reports false when the session it attached to was unloaded meanwhile.
   `llamaRn.ts:35` makes `unload()` wait for a projector that is still loading, and `:39` does not mark a dead
   context as seeing.
3. **The photo turn the switch interrupted is sent again on the new model.** In `Chat.tsx:570` `switchedUnder`:
   after the photo gate (`:772`), after an empty answer that the guard stopped (`:869`), or on `vision-unavailable`
   (`:957`), the turn waits for the switch. If the model changed, it logs `[chat] memory switch mid-turn: fast →
   instant, the picture goes again` and runs the same turn again on the same row (`:973`). That run is rebuilt
   for the new model: `const model = s.model` (`:542`), so the pack, the system prompt and the thinking flag follow
   it. The pending row takes the answering model's label (`:586`).
4. **The "Ran out of memory · Switched to Instant" line survives that turn.** `guard.ts:203` credits an answer to the
   loaded weights (`getLoadedModelId()`), not to the model the engine names. `guard.ts:254` does not count the
   answer of a turn the chat sent again (`noteCarriedOver`, `engine.ts:243`). The next answer retires the line, as
   in 134E.
5. **The vault shows the loaded model.** `VaultScreen.tsx:82` reads `engineModelId()` (the engine's model, guard
   switch included) and falls back to the default only before the engine exists. The model sheet already read the
   engine's model, and the two now agree.
6. **The first warning is visible.** Chat shows a quiet line `chat.vision.released`: "Photo pack released to free
   memory. A new photo loads it again." (`Chat.tsx:1780`, testID `vision-released`). It shows while the projector
   is eased in a chat with pictures, and it goes away when a new photo loads the projector again. The line is in
   8 locales and pseudo.
7. **One pressure event reported twice is one warning.** On the simulator, UIKit logged "Received memory warning."
   twice, 7 ms apart, for a single event. The second report escalated straight to a switch. In
   `memoryStrikes.ts:8`, a warning within 2 s of an ease is the same warning (`"same"`, ignored in `guard.ts:235`).

## Tests

- `apps/mobile/src/engineSwitch.test.ts` (new, real `engine.ts` with a fake llama.rn). Cases: a load during the
  memory release gets Instant; the vault hears the switched model even with `load=false`; a new picture on a model
  without its projector gets **that model's** pack (`pack-for-instant`) and one picture reaches the adapter; a pack
  that will not attach throws `vision-unavailable` with nothing sent; while eased, an older picture stays out and a
  new one re-attaches; a projector that finishes after its weights were unloaded is not reported attached.
- `memoryGuard.test.ts`: the line holds through an answer on the old weights and through the carried-over answer,
  and the next answer retires it. `emptyAnswer.test.ts`: the double report gives `"same"`.
- **Watched fail** (each fix sabotaged, then restored): without the re-read in `loadSession`, `expected 'fast' to be
  'instant'`. With `withProjector` returning the messages as they are, three engine cases fail (`expected [] to
  deeply equal [ 'pack-for-instant' ]`). Without the notify in `runSwitch`, the vault case fails with `'fast'`.
  Crediting the engine's model, or ignoring `consumeCarriedOver`, gives `expected null to be
  'device.memory.switched'`.
- Gates: `pnpm -r typecheck` clean, `pnpm lint` clean, `pnpm -r --no-bail test` all passed: core 1446 / 4
  skipped, mobile 1459, i18n 24, ui 23.

## Simulator proof (`sim/`)

Simulator `r134j-switch-photo`, iPhone 17 Pro, iOS 26.2. I created it for this run, then shut it down and deleted
it. The app is the QA variant `com.inbornapp.mobile.qa`. I copied the native Release build from another round's
simulator (native code is unchanged at main) and swapped this branch's JS bundle into it with the r130/134E
`expo export:embed` command and `EXPO_PUBLIC_MODELS_BASE_URL=http://localhost:8821/v1`. The models were served by
`scripts/serve-models.mjs` on :8821, and the photo is the repo's café fixture, pushed into Documents as `cafe.jpg`.

**Memory warnings without the Simulator app:** CoreSimulator's "Simulate Memory Warning" writes the device's
`data/var/run/memory_warning_simulation`, and libdispatch watches that file. `echo 1 > <device>/data/var/run/memory_warning_simulation`
gives the real UIKit warning (`(UIKitCore) Received memory warning.` in `sim/app-log.txt`), and only to that
device. Other sessions' booted simulators are untouched.

| Shot | What it shows |
|---|---|
| `01-chat-fast`, `02-pack-card`, `03-photo-answer-fast` | Fast downloaded, then Fast's 668 MB pack downloaded from the card, and the café photo answered (first launch) |
| `04-photo-on-fast` | Fresh launch on Fast, new chat, café photo "What do you see?" answered |
| `05-eased-quiet-line` | **Warning 1** (02:28:07): `[device] memory warning: releasing the picture projector, keeping the model`, chip FAST, the quiet line *"Photo pack released to free memory. A new photo loads it again."*; footprint 1,284 → **486 MB** |
| `06-new-photo-read-on-fast` | A **new photo**, "What drinks are on the menu?": *"…under "Hot Drinks" on the right-hand blackboard: coffee, espresso, tea, and hot chocolate"* on FAST; footprint back to 1,271 MB (projector loaded again), quiet line gone |
| `07-switched-photo-read-on-instant` | Third photo, "What are the opening hours?". **Warning 2** (02:29:55, 108 s after warning 1) hit while it ran: `[chat] memory switch mid-turn: fast → instant, the picture goes again`. The banner reads "Ran out of memory · Switched to Instant · SWITCH BACK", the chip and the answer label read INSTANT, and the answer is *"Monday to Sunday from 8-4:30 AM to 9:30 PM"*. The "8-4:30" is on the board and in no earlier answer of this chat; the rest is Instant's usual guessing. `devrun-s3d-resent.json`: model instant, `desc qwen35 0.8B`, `imageMaxTokens 1024` (Instant's bundled pack attached, no download), `prompt_n 2596` (the pictures are in the prompt) |
| `09-model-sheet` | INSTANT "In use", FAST "Use this model" |
| `10-vault` | FAST "Installed · Use this model", INSTANT "Included with the app · In use" (`result-s3d-*.json`, the two card values) |

`footprint.txt` has the process footprint at each step. Scripts are in `sim/scripts/`: s1 and s2 on the first
launch, then s3a, warning 1, s3b, s3c, warning 2, s3d. The `result-*.json` files of s1/s2 were removed by mistake
before the final run, and their screenshots stay. `08-ledger` was dropped because the ledger toggle opened an
off-screen row.

## Not proven

- **Not on the iPhone.** On the simulator the projector runs on the CPU, so warning 2 landed in the picture prompt
  phase of an answer (the stop came 113 s later, at the end of the image encode). It did not land in the projector
  load as in J6. The J6 path (warning while `enableVision` loads) is covered by the engine tests (cases 1 and 6) and
  the code path at `Chat.tsx:772`, not by a run.
- Instant's answer quality on the café board (the hours were half right).
- The double "Received memory warning" is seen on the simulator. Whether the phone does the same is not known: the
  build 40 archive shows one line per warning.
