# Photo crash on Snapdragon 8 Gen 2: proof on a physical device (Firebase Test Lab, 12.10.2026)

The founder's OnePlus 11 (Snapdragon 8 Gen 2, SM8550) crashed natively when a photo was attached in chat and he asked what
the model sees: `SIGSEGV` in `clip_image_batch_encode` inside `librnllama_v8_2_dotprod_i8mm_hexagon_opencl.so`, the
llama.rn variant loaded on every arm64 device with dotprod + i8mm + a Qualcomm SoC (`RNLlama.java`, `Build.SOC_MODEL`).
Adreno's OpenCL backend covers Q4_0 / Q6_K only; the F16 projector segfaults there. Fix 7998cb7f: the projector runs on
the CPU on Android (`src/adapters/projectorGpu.ts`). The OnePlus 6T and the emulators load CPU variants and cannot
reproduce, so the proof had to run on Snapdragon-class hardware.

## Device

Test Lab's OnePlus 11 5G (model id `CPH2449`, API 34) is listed with `DEVICE_CAPACITY_LOW`: two matrices submitted on
it at 03:22 were still `PENDING` at 05:30 (`matrix-3cx87qy9ly1bn` = fix, `matrix-xhw1cotfrjb4a` = control; if they ever
run, their artifacts land in the results bucket under `testlab-44-runA2/` and `testlab-44-runB/`). The proof therefore
ran on **Samsung Galaxy S23 Ultra (model id `dm3q`, API 34, `DEVICE_CAPACITY_HIGH`)**: the same SoC
(`soc=SM8550`, logged by the harness), so llama.rn loads the same `hexagon_opencl` library. Run A landed on an
`SM-S918U1`, run B on an `SM-S918B`; both are SM8550.

## Builds

Code `3837997e` (main at the time; the projector fix is in it, the later pack-release fix def2e36d does not touch this
path), `INBORN_VERSION_CODE=32`, `INBORN_PACKS=instant,vision`, release signing. Two APKs from the same tree:

- **A (fix, as shipped):** `projectorOnGpu = os === "ios" && isDevice` → `initMultimodal({ use_gpu: false })` on Android.
- **B (negative control):** the single-line local patch `(os === "ios" || os === "android") && isDevice`, so the
  projector goes to OpenCL as before 7998cb7f. The Hermes bundles differ (1.6 M byte positions); the source was restored
  after the build (`git status` clean).

Play delivery was reproduced with bundletool's local-testing mode (`--local-testing`, manifest meta-data
`local_testing_dir=local_testing`): the two pack slices `inborn_model-master.apk` (Qwen3.5-0.8B-Q4_K_M, 532 MB) and
`inborn_model_vision-master.apk` (mmproj-Qwen3.5-0.8B-F16, 205 MB) are pushed with `--other-files` to
`/sdcard/Download`, the harness moves them into `/sdcard/Android/data/com.inbornapp.mobile/files/local_testing/`, and
the app's own vault code (`PlayDelivery` → `adoptInto` → `removePack`) takes it from there; nothing in the app knows it
is under test.

## Harness

`testlab/PhotoWalkTest.kt` (androidTest, uiautomator 2.3.0, `testBuildType "release"`), run as an instrumentation test
so a native crash of the app ends the test itself. Steps: packs into local_testing → first run (welcome → model
screen → `model-option-instant` → `download-model` ("Download Instant · 738 MB", served locally) → `start-chatting`)
→ attach → photo from the library (first thumbnail of the system picker) → "What do you see in this photo?" → send
→ wait for `assistant-text`; then the same from the camera (`attach-camera`, Samsung camera shutter + OK). Logs under
tag `InbornWalk`, window dumps and screenshots to `/sdcard/Download/walk` (pulled with `--directories-to-pull`),
video with `--record-video`. Submission + polling: `testlab/tl-run.sh` (`gcloud firebase test android run … --async`,
then the Testing API; a gcloud killed in the foreground cancels its matrix, which is what ended the first attempt
`matrix-23gp4wk7klgja` as `inconclusive / abortedByUser` after 44 minutes in the queue).

## Run B · control (projector on OpenCL) · `matrix-25d6rz3rq406c` · outcome FAILURE = process crashed

```
19:27:09.319 InbornWalk START build=32 pid=21784 model=SM-S918B sdk=34 soc=SM8550
19:27:26.684 InbornWalk CHAT_READY after 17s
19:27:27.399 InbornWalk attach sheet: photo row enabled
19:27:32.234 InbornWalk picker: back in app
19:27:34.159 InbornWalk library: SEND pid=21784 answers=0
19:27:37.113 RNLlama llama_rn_context_mtmd:753 Multimodal context initialized successfully with mmproj: …/mmproj-Qwen3.5-0.8B-F16.gguf
19:27:37.160 RNLlama tokenizeWithMedia:403 [DEBUG] Chunk 1: type=IMAGE, n_tokens=576, n_pos=32
19:27:38.186 RNLlama processMedia:642 [DEBUG] Evaluating chunk 1: n_past=131, chunk_pos=131
19:27:38.189 libc  Fatal signal 11 (SIGSEGV), code 1 (SEGV_MAPERR), fault addr 0x0 in tid 22265 (mqt_v_native), pid 21784 (nbornapp.mobile)
```

Tombstone (`SYSTEM_TOMBSTONE_1_com_inbornapp_mobile.txt`): `signal 11 (SIGSEGV), code 1 (SEGV_MAPERR), fault addr
0x0000000000000000`, backtrace `#00 lm_ggml_gallocr_alloc_graph+1772 ← #01 lm_ggml_backend_sched_alloc_graph+260 ←
#02 clip_image_batch_encode(…)+312 ← #04 mtmd_helper_eval_chunk_single+280 ← #06
rnllama::llama_rn_context_completion::processMedia+400 ← #07 loadPrompt+104`, all in
`base.apk!librnllama_v8_2_dotprod_i8mm_hexagon_opencl.so`. Identical to the founder's crash. Instrumentation:
`shortMsg=Process crashed.` Video 38 s: chat, photo attached ("Free: one photo per message"), send, app gone.

## Run A · fix as shipped · `matrix-1pi6f1uzfhdxl` · 0 crashes, two answers

```
19:27:14.719 InbornWalk START build=32 pid=8992 model=SM-S918U1 sdk=34 soc=SM8550
19:27:40.725 InbornWalk CHAT_READY after 26s
19:27:48.152 InbornWalk library: SEND pid=8992 answers=0
19:27:51.263 ReactNativeJS [inborn] llama.rn loaded model INSTANT (instant) from …/Qwen3.5-0.8B-Q4_K_M.gguf in 11958 ms
19:27:51.702 RNLlama llama_rn_context_mtmd:753 Multimodal context initialized successfully with mmproj: …/mmproj-Qwen3.5-0.8B-F16.gguf
19:27:51.741 RNLlama tokenizeWithMedia:403 [DEBUG] Chunk 1: type=IMAGE, n_tokens=480, n_pos=32
19:27:52.705 RNLlama processMedia:642 [DEBUG] Evaluating chunk 1: n_past=131, chunk_pos=131
19:28:19.169 RNLlama processMedia:642 [DEBUG] Evaluating chunk 2: n_past=163, chunk_pos=163
19:28:19.506 RNLlama loadPrompt:580 [DEBUG] Input processed: n_past=182, embd.size=182, num_prompt_tokens=182, has_media=1
19:34:31.854 InbornWalk camera: SEND pid=8992 answers=0
19:34:32.276 RNLlama tokenizeWithMedia:403 [DEBUG] Chunk 1: type=IMAGE, n_tokens=768, n_pos=32
```

The image chunk that killed run B is encoded here on the CPU in 26.5 s (480 tokens) and the model answers; the same
process (pid 8992) then takes a camera photo and answers again. Window dumps at the end of each step
(`dump-library-answer.xml`, `dump-camera-answer.xml`) contain `assistant-text` with, respectively, "I am an AI
assistant designed to be helpful and accurate. I cannot access or interpret images unless …" (the picker's first
thumbnail was a blank white screenshot, see `shot-library-answer.png`: the 0.8B model's answer to an empty image) and
"The image is extremely dark and lacks any discernible content or detail. It appears to be a very low-light photograph
of an empty space …" (the camera in Test Lab's rig). No tombstone, no `data_app_native_crash`, `pid` unchanged through
both tests; videos 397 s + 403 s.

Test Lab shows run A as FAILURE only because the harness's `allText(assistant-text)` (UiObject2 text traversal of the
Markdown view) returned an empty string, so it hit its 6-minute wait twice ("no answer in 6 min (last='')") while the
answer was on screen and in the dump. Next version of the harness should read the answer from the window dump.

## Verdict

On the founder's SoC and library, the shipped code attaches a photo and answers from it (library and camera), while the
pre-fix path crashes 3 ms into the image encode with his exact stack. The projector stays on the CPU on Android.

Evidence (private, `inborn-docs/qa/android-vc32-testlab/`): `runA-dm3q/` and `runB-dm3q/` — `logcat`, `video.mp4`
(+ per-test `test_cases/000N.mp4` and logcat for run A), `instrumentation.results`, `test_result_1.xml`,
`artifacts/sdcard/Download/walk/{dump,shot}-*`, run B's tombstone and `data_app_native_crash_0_*.txt`. Physical-device
minutes used: 2 runs (≈ 14 + 1 min).
