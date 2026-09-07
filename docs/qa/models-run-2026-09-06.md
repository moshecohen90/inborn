# Models run 2026-09-06/07 — every catalog entry on the OnePlus 6T

Run by the models-verify stream on branch `models-verify` (worktree of `main` at 4992f67 after the merge; measurements taken on cbb3810 + this branch's fixes).
Device: OnePlus 6T (ONEPLUS A6013, Snapdragon 845, Android 11, 7,818,096 kB RAM = the 8 GB model, `adb -s REDACTED-6T`, taps ignored, driven with key events + two dev file hooks, see "Method").
Build: `APP_VARIANT=development` debug APK (arm64-v8a) + Metro on a private port over `adb reverse`. The lead's Play release build (1.0.0, Instant asset pack) was reinstalled from `scratchpad/apks/inborn.apks` at the end and left running.
Evidence: `/private/tmp/claude-501/-Users-moshecohen-dev-bibleapps/e1fec2dd-3831-49ec-a78e-d650b5c0d26b/scratchpad/models-verify/` (screenshots `*.png`, per-prompt `*.json` = `Documents/dev-run.json`, `phi-crash.txt`). Copy before the session directory is cleaned.

## Result in one line

All 7 catalog entries install through the vault with SHA-256 verification, load and answer on the 6T; an external GGUF imports and chats. Sharp-class models work but are slow (TTFT 20–100 s, 1.3–2.9 tok/s) and were **crashing the app** through a false thermal-critical unload (fixed on this branch). 6 defects fixed here, 10 listed for other streams.

## Per-model table

Three prompts per chat model: P1 factual one-liner ("capital of Australia, when founded"), P2 markdown table (5 planets), P3 "כתוב פסקה של כ-60 מילים בעברית על הים התיכון". Load = llama.rn load of the model file; TTFT = first token after send (prompt processing included); tok/s = `predicted_per_second`; PSS = max `dumpsys meminfo` TOTAL PSS during the answer; CPU = hottest `cpu*-gold-usr` zone after the answer (battery stayed 24 °C throughout, phone on AC).

| Model | File / size | Install (vault, HTTPS from the Mac) | Load | P1 TTFT / tok/s | P2 TTFT / tok/s | P3 TTFT / tok/s | PSS | CPU | Result | Screenshot |
|---|---|---|---|---|---|---|---|---|---|---|
| Instant · Qwen3.5 0.8B Q4_K_M | 532,517,120 B (508 MB) | bundled stand-in (`Documents/instant.gguf`) | 1,833 ms | 3,680 ms / 15.5 | 2,237 ms / 12.0 | 10,273 ms / 12.0 | 1.28 GB | 66 °C | P1 fluent but wrong date (1859); P2 table renders as a real table, 3rd column clipped (D9), mixed units; P3 Hebrew is gibberish (expected: `he` not in goodLanguages) | `instant-23.png` |
| Fast · Qwen3.5 2B Q4_K_M | 1,280,835,840 B (1.2 GB) | 67 s (download ≈50 s + hash) | 1,837–2,570 ms | 9,569 ms / 5.0 | 3,289 ms / 5.8 | 23,592 ms / 5.3 | 2.16 GB | 63 °C | P1 correct (1913); P2 correct table; P3 Hebrew grammatical but semantically nonsense (`he` not in goodLanguages, correct) | `fast-123.png` |
| Sharp · Qwen3.5 4B Q4_K_M (2 shards) | 1,401,058,176 + 1,339,879,904 B (2.6 GB) | both shards, each hashed (part of a 6.4 GB five-model batch, 403 s) | 12,503 ms | 29,047 ms / 2.3 | 20,138 ms / 2.5 | 102,518 ms / 1.3 | 3.6 GB (free RAM fell to 853 MB) | 70 °C | All three coherent; Hebrew paragraph good. Prompt processing 3.2–3.9 tok/s. Lost after relaunch before fix D3 | `sharp-23.png` |
| Sharp · Phi-4-mini 3.8B Q4_K_M | 2,491,874,272 B (2.4 GB) | same batch | 12,011 ms | 24,170 ms / 2.9 | 8,193 ms / 2.6 | 52,185 ms / 2.2 | 3.57 GB | 62 °C | P1 correct; P2 correct table (Jupiter 79 moons, footnote); P3 flowery but coherent Hebrew. Crashed the app on the 4th prompt (D1+D2, fixed) | `phi-crash.txt`, `import-remove.png` (guard banner) |
| Companion · nomic-embed-text v1.5 f16 | 274,290,560 B | same batch | embedder ready at index time | — | — | — | 1.55 GB | — | `sample.pdf` indexed in 3.2 s (1 page, 1 chunk); question over it: retrieval 364 ms, answer 20.4 s at 14.0 tok/s on the 0.8B, **correct** ("128 concrete piles", "Dr. Miriam Osei"), two SOURCES chips `sample.pdf · p.1` | `final-strip.png` (left) |
| Companion · whisper base (ggml-base.bin) | 147,951,465 B | same batch (its hash waited behind the big downloads, ready after 268 s) | 469 ms | — | — | — | — | — | en.wav (Samantha, 4 s): exact transcript in 7.0 s; he.wav (Carmit): "שלום, קוראים לידנו ואני גרה בחיפה ליד הים" (one word merged) in 7.7 s; TTS started in 561 ms | `voice.json` |
| Companion · vision mmproj Qwen3.5-0.8B F16 | 204,987,232 B | same batch | multimodal init at first image | 61,517 ms (589 prompt tokens incl. image) / 10.7 | — | — | 1.52 GB | 61 °C | Sonoma wallpaper described correctly ("stylized, abstract landscape featuring rolling hills with smooth gradients of green, orange, and blue") | `vision-import.png` (left) |
| Import · Qwen3.5-0.8B-Q4_K_M.gguf (external file) | 532,517,120 B | vault import from `/data/local/tmp` (header parsed: qwen35, 0.8B, Q4_K_M, ctx 262144) | 128 ms (warm) / 2,137 ms | 3,526 ms / 16.0 | — | — | 1.55 GB | — | Correct sentence (date 1909, wrong as with Instant). A PDF handed to the same import path is rejected (not-gguf). Recorded SHA was wrong before fix D5 | `final-strip.png` (2nd) |

Also verified:

- **Model switching mid-session**: "Use this model" from the vault (via the hook = the button's handler) resets the engine, starts a fresh chat and lands on it with the new model (Fast: loaded in 7.0 s from a Sharp chat). Per-chat switching does not exist: the chat-settings sheet shows the model as a read-only chip. Switching while an answer streams is prevented by the guard's `isGenerating` check added in D4.
- **Device guard with Sharp on this 8 GB / SD845 phone**: memory pressure never fired (`availMem` 3.5 GB at load, `lowMemory` false) although free RAM fell below 1 GB and the mmap'd weights were evicted (P3 prompt processing dropped to 3.2 tok/s, generation to 1.3 tok/s). Thermal: the phone reports `THERMAL_STATUS_SHUTDOWN` permanently; after one sub-SEVERE reading the guard trusted it and went **critical** at 24 °C battery → "Stopped to protect the phone · Continue when cool", answer cut, model unloaded, native crash (D1, D2). Fixed. After the fix the guard stays `normal` through all runs (`[device] normal … unknown/normal`).
- **Remove**: `remove sharp-phi` deleted the 2.49 GB file and the record (files/models 7.66 GB → 5.06 GB by `du`, header "7.1 GB in the vault" → "4.8 GB in the vault · 14 GB free", `df` 13.8 GB free). Numbers match (GiB).
- **Storage header**: "1.2 GB in the vault · 17 GB free" after Fast; "6.7 GB · 12 GB free" after the batch; bundled/stand-in Instant is not counted (by design).
- **Install batch**: five parallel HTTPS installs (6.4 GB) finished in 403 s with every shard hashed; the vault banner switched to "Delivering SHARP · 100 % of 2.55 GB" while it was verifying (D13).

## Defects

Fixed on this branch (all covered by the gates below; D1/D6/D7 with new unit tests):

| # | Sev | Where | What happened on the 6T | Fix |
|---|---|---|---|---|
| D1 | High | `packages/core/src/device/android.ts` | Thermal status stuck at SHUTDOWN; after one low reading (`seenCool`) the guard reported **critical** with the battery at 24 °C: answer stopped, "Continue when cool" banner, model unloaded after 60 s. Repro: relaunch, ask anything on Phi/Instant. | A battery reading below the critical threshold now vetoes "critical" (→ "serious"); headroom alone no longer promotes it. Tests updated. |
| D2 | High | `apps/mobile/src/adapters/llamaRn.ts` | The critical unload released the llama context while the native loop was still computing (`nextToken … Decoding Interrupted` → SIGSEGV in `librnllama_jni`; second crash inside `lm_ggml_vec_dot_f16` while an image chunk was being evaluated). App died twice. | `unload()` awaits the in-flight completion before `release()`. |
| D3 | High | `apps/mobile/src/vault/store.ts` | Sharp (two shards) was forgotten on relaunch: the rescan compared the record's total bytes with the first shard's size, so "use sharp" fell back to Fast. | `onDiskBytes()` sums every shard next to the first one. |
| D4 | Medium | `apps/mobile/src/services/AppServices.tsx` | After Fast finished installing the vault showed it "In use · Loaded" but the chat kept answering with Instant (`[stats] model: instant`); only "Use this model" reloaded. | The vault subscription reloads the engine whenever the active model differs from the loaded one and nothing is generating. |
| D5 | Medium | `apps/mobile/src/vault/store.ts` | Import hashed a half-written copy: `File.copy()` returned with 341 MB of 508 MB on disk, the record got sha `cfac8ce0…` while the file is `bd258782…` (= catalog Instant). | Import waits until the copy reaches the source size (2 min cap) before hashing; short copy → `copy-failed`. |
| D6 | Medium | `packages/core/src/catalog/speed.ts`, `apps/mobile/src/vault/device.ts` | RAM-only chip class rated the 2018 SD845 as "android-high" (Pixel 9 row): estimates 18–28 / 10–14 / 8–14 tok/s vs measured 12–15 / 5–6 / 1.3–2.5. | `chipClassFor` takes the marketing chip name; pre-2022 flagships (Snapdragon 6xx/7xx/8xx, 8 Gen 1, Tensor G1/G2, Exynos 9xx/20xx/21xx, Kirin, Helio, Dimensity < 10000) cap at "android-mid". The vault now shows "ANDROID-MID · 8 GB", 12–20 / 8–12 / 5–8. |
| D7 | Low | `packages/core/src/device/chip.ts` | Onboarding said "RUNS ON: SNAPDRAGON 845 · 7 GB" while the vault said "8 GB" (`ramLabel` rounded 7.46 GiB down, the vault uses marketing steps). | `ramLabel` uses the same marketing steps (5.6e9 → "6 GB", 7.46 GiB → "8 GB"). |
| D8 | Dev | `apps/mobile/src/vault/store.ts` | Debug APKs cannot bind Play Core, so on Android the vault could only fail ("Asset Pack Download Error -100/-15") and `EXPO_PUBLIC_MODELS_BASE_URL` had no effect. | A dev bundle with a models base URL uses the HTTPS delivery on Android too; `Documents/instant.gguf` is adopted as the bundled stand-in so vault and engine agree. Release builds unchanged. |

Not fixed (other streams / product decisions), with repro:

| # | Sev | Where | Repro on the 6T | Suggested fix |
|---|---|---|---|---|
| D9 | Medium | Chat markdown table (`components/chat/Markdown.tsx`) | Ask for a 3-column table: the third column is cut at the screen edge ("Nu…", values clipped), no horizontal scroll. `instant-23.png`, `sharp-23.png`. | Wrap tables in a horizontal `ScrollView` or shrink column widths to the viewport. |
| D10 | Medium | Shell / `app/vault.tsx` | Chat → vault → "Use this model": logcat shows the new model loaded **twice** (`llama.rn loaded … 2129 ms` + `1837 ms`; 12 s each for Sharp) — `router.replace("/")` leaves the previous chat screen mounted under the new one; a hook-submitted prompt sometimes rendered in the hidden screen. | Pop back to the existing chat and remount it (`router.back()` + key bump) instead of pushing a second `/`. |
| D11 | Medium | Guard memory signal (`modules/device-guard`, §6.5) | Sharp on 8 GB: free RAM < 1 GB, weights evicted, generation 2.4 → 1.3 tok/s, TTFT 102 s; `memoryPressure` stayed `normal` (Android only calls `onTrimMemory` for the foreground app late). | Poll `availMem` against the loaded model size (e.g. warn when `availMem < 0.5 × modelBytes`) and rate Sharp "fits slowly" on ≤ 8 GB pre-2022 chips (`recommendedRamGB` 8 currently says "fits well"). |
| D12 | Low | Chat header chip (`lib/models.ts` `modelLabel`) | Imported model shows "IMPORT:QWEN3.5-0.8B-Q4_K_M.GGUF", pushing "SEALED" off the bar (`final-strip.png`). | Label imports by their GGUF name ("Qwen3.5-0.8B"). |
| D13 | Low | Vault banner (`AppServices` delivery state) | While a finished download is hashing the banner reads "Delivering SHARP · 100 % of 2.55 GB" (`35-all-s.png`). | Say "Verifying SHARP" for `verifying`. |
| D14 | Low | Vault install queue | Five parallel installs: the 148 MB whisper file finished downloading first but was marked ready only after 268 s (its hash queued behind the multi-GB files). | Verify small companions before large chat models, or hash on download completion in parallel. |
| D15 | Low | Documents ask | The 0.8B answer had no inline `[1]` markers (`cited: false`) although the right chunk was retrieved and shown as SOURCES chips. | Expected for a 0.8B; consider showing chips only (already the case) and dropping the `cited` gate for Instant. |
| D16 | Low | Documents import | Re-importing the same PDF creates a second document ("Searching 2 documents: sample.pdf, sample.pdf"). | De-duplicate by content hash. |
| D17 | Info | Language routing | Hebrew: Instant gibberish, Fast nonsense with correct grammar, Sharp/Phi fine — matches `goodLanguages`. | When the user writes Hebrew on Instant/Fast and Sharp is installable, offer it (the `wrongScript` hint exists for script mismatch only). |
| D18 | Info | Catalog | `sharp-phi` has only an HTTPS delivery: on Android release (no INTERNET) it is import-only; the vault still lists it. | Decide: Play pack for Phi, or hide it on Android release. |

Dev-only noise seen: the RN LogBox "Open debugger to view warnings" toast (`new NativeEventEmitter()` from an Expo module) sits over the composer in every screenshot.

## Method (so the next run is faster)

- Taps are ignored on this phone; screens are keyboard-navigable (`input keyevent KEYCODE_TAB` / `KEYCODE_DPAD_CENTER`), but Enter never sends. Two bundle-time dev hooks were added for USB-only phones: `EXPO_PUBLIC_AUTOPROMPT=file` (Chat consumes `Documents/dev-prompt.txt`: text = send, `image:<name>` = attach, `/scroll` = scroll to end) and `EXPO_PUBLIC_AUTOINSTALL=file` (vault consumes `Documents/dev-vault.txt`: `install|use|remove <id>`, `import <uri>`). Both are `__DEV__`-only and off in store builds. Files are pushed with `adb push … /data/local/tmp` + `run-as com.inbornapp.mobile cp` (`exec-in cat` truncates large files; `adb push` into `Android/data` fails on Android 11).
- Metrics come from the dev `[stats]` logcat line / `Documents/dev-run.json`; PSS from `dumpsys meminfo`; zones from `/sys/class/thermal`. The 6T drops off USB every few minutes under load: every adb call needs a retry + `adb reconnect` + re-adding `adb reverse` (see `lib.sh` in the evidence dir), and Metro must be restarted after editing files (no watchman).
- Models were served from the Mac with `scripts/serve-models.mjs` on `localhost:8790` through `adb reverse`; the manifest signature is verified before the dev base URL is applied.

## Gates on this branch (after merging `main` 4992f67)

`pnpm install` · `pnpm typecheck` PASS · `pnpm test` PASS (core 329, mobile 82, i18n 4, ui 11) · `pnpm lint` PASS · `pnpm --filter @inborn/mobile export:web` PASS.
