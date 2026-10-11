# vc30 on the founder's phone, 11.10.2026: photo crash and an unasked Play download

Phone: OnePlus 11, Android 16, 16 GB, Snapdragon 8 Gen 2 (Adreno 740). Fresh Play install of 1.0.0 (30) at 17:05:59
(firstInstallTime = lastUpdateTime, installer com.android.vending, allowBackup off). Logs were pulled read-only.

## Photo turn crash: a GPU-path crash, not a memory kill

- Three identical native crashes (17:08:05, 17:10:09, 17:10:35), `SIGSEGV SEGV_MAPERR fault addr 0x0`, thread
  `mqt_v_native`, library `librnllama_v8_2_dotprod_i8mm_hexagon_opencl.so`:
  `lm_ggml_gallocr_alloc_graph` ← `lm_ggml_backend_sched_alloc_graph` ← `clip_image_batch_encode` ←
  `mtmd_helper_eval_chunk_single` ← `llama_rn_context_completion::processMedia` ← `loadPrompt`.
- Cause: `initMultimodal` got `use_gpu: true` on every Android phone. llama.rn's OpenCL backend covers Adreno for
  Q4_0 / Q6_K only; the projector is F16. llama.rn loads the OpenCL variant only on phones with dotprod + i8mm +
  Hexagon + Adreno, so the OnePlus 6T and the emulators (CPU variant) never reproduce it.
- Play vitals (Reporting API) held no error report for Oct 1-11. Emulator (Pixel 6 API 33, local-testing packs):
  three photo turns, no crash, peak RSS 1.87 GB.
- Fix: the projector runs on the CPU on Android (`src/adapters/projectorGpu.ts`); the chat model keeps
  `n_gpu_layers 99`, which served text on the same phone. Not yet walked on an OpenCL-variant phone.

## The 1.94 GB Play screen

- Play's screen: 1.94 GB = Fast 1,280,835,840 B + its photo pack 668,227,264 B. After it, app data held 2029 MB =
  Instant + its photo pack + Fast; Fast's photo pack is not on the phone.
- Not proven. On a fresh install the vault has no record, so the boot re-request should not have asked for both. The
  photo card's "Switch to Fast · 1.95 GB" (one tap, no confirm sheet) is the only other code that asks for that pair,
  but it asks for Fast first and its photo pack only after Fast lands, so Play's dialog would have shown Fast alone.
  The photo plan offers that card with Instant selected only when Instant's own photo pack cannot be delivered. A
  release build writes no JS logs, so the logs cannot say which request Play saw.
- Fixes: chat cards start more than 200 MB only through the vault's confirm sheet; no install without a tap that
  named the size; Play's dialog opens only after every other pack waiting for it is cancelled; a boot re-request
  happens only for a pack Play reports COMPLETED, silently.
