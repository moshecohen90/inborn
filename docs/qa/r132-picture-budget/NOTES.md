# Round 132B: Instant's picture budget, and image-only PDFs (6.10.2026)

## Numbers first

### Memory: what 1024 image tokens cost Instant

Measured with Homebrew `llama-mtmd-cli` (build 10809) on an M2 Max, the app's GGUFs from `.models`, `-c 4096 -b 512
-ub 512`, the five pictures as the app sends them (long edge 1024 px, JPEG 0.85). `harness/mem.sh`; every run is in
`results/memory-runs.txt` (the founder's page rows left out; its numbers sit inside the ranges below).

| | Instant 512 | Instant 1024 | Fast 512 | Fast 1024 |
|---|---|---|---|---|
| Image tokens of the 5 pictures | 480–494 | 576–768 | 480–494 | 576–768 |
| Vision encoder compute buffer, reserved at projector load | 161.3 MiB GPU + 24.9 MiB CPU | **the same** | 223.3 + 24.9 MiB | **the same** |
| KV cache (4096 cells, 6 attention layers of 24) + recurrent state | 48 + 19.3 MiB | **the same** | | |
| Peak footprint, GPU path (the iPhone's: model and projector on Metal) | 487–497 MB | 495–519 MB | 930–939 MB | 888–956 MB |
| Peak footprint, CPU path (every buffer in the process heap) | 1,049–1,061 MB | 1,058–1,087 MB | 2,265 MB (one run) | not run |

- **The extra cost is about 25 MB at most** (+8 to +27 MB GPU path, +0 to +28 MB CPU path, growing with the image's
  tokens), not the encoder buffer. llama.cpp reserves the vision encoder's compute buffer for a fixed warm-up picture
  of 46×46 merged tokens (2,116) whatever `image_max_tokens` says: Homebrew logs `warmup with image size = 1472 x 1472`
  for both caps, and llama.rn 0.12.9 has the same line (`clip.cpp`, `PROJECTOR_TYPE_QWEN3VL`:
  `set_warmup_n_tokens(46*46)`). A 1024-token picture (4,096 patches) fits inside that reservation.
- **The KV cache does not grow**: it is allocated for the whole context at load (`n_ctx` cells), and the extra image
  tokens take cells that were already there.
- Against the app's limit: on iOS the app treats `os_proc_available_memory()` ≤ 150 MB as this app's memory pressure
  (`IOS_HEADROOM_BYTES`). Instant with its pack is about 0.5 GB on the GPU path; +25 MB does not come near that line on
  a 6 GB iPhone, and would not on a 4 GB one either.

### Context: the real limit per device class

The phone's context comes from the device class (`policy.ts`: `contextCap` = 2048 under 6 GB, else 4096), and the
prompt reserves a picture's full cap plus the answer ceiling (1024):

| Class | Context | Picture at 512 | Picture at 1024 |
|---|---|---|---|
| 6 GB and up (iPhone 13 Pro and later) | 4096 | 4096 − 512 − 1024 = 2560 left | 4096 − 1024 − 1024 = **2048 left** |
| under 6 GB (4 GB iPhones, 3–5 GB Androids; Instant only) | 2048 | 2048 − 512 − 1024 = **512 left** | 2048 − 1024 − 1024 = **0 left** |

### Decision

- **6 GB and up: Instant reads pictures at 1024 image tokens**, like Fast and Sharp.
- **Under 6 GB: 512**, as before. Memory would allow 1024 there; the 2048-token context would not (nothing left for
  the system prompt and the question, and a second picture in the chat would not fit at all).

One rule in `adapters/imageTokens.ts`: a picture may take at most a quarter of the loaded context, so the model's cap
(1024 for Instant, Fast and Sharp) becomes 512 in a 2048 context. The projector (`llamaRn.ts`) and the prompt budget
(`Chat.tsx`) read the same session context, so they cannot disagree.

### Time

Prompt tokens of the "What do you see?" turn in the harness: **~650 at 512** (the 13 Pro measured 653–666 in pass 36)
and **742–934 at 1024** (+83 to +281: visual page and slide +83, the founder's page +218, receipt and café +274/+281).
On the 13 Pro, Instant's cold picture turn was 1.57–1.92 s engine time to the first token for ~655 tokens. The CPU
runs show the encoder growing about in line with the image tokens (9.2–10.3 s at ~490 tokens, 11.3 s at 576,
14.4–14.8 s at 768), so the phone's first token should come at about **1.8–2.7 s** instead of 1.6–1.9 s (estimate,
scaled from the Mac; not measured on a phone).

### Answers: the round 131 harness, Instant 512 vs 1024

`docs/qa/r131-picture-answers/harness/run-picture.mjs`, `ROUTE=after` (this round's main), Homebrew `llama-server`
build 10809, n=4, the four committed fixtures plus the café photo and the founder's page (from its local path, outputs
outside the repo). Both budgets ran the same day with the same code; only `--image-max-tokens` differed. Graded by hand
with the round 131 rubric, by the same grader in one sitting (not blind: the answers were read by budget). Per answer:
`results/grades.json`; answers without the founder's rows: `results/after-instant-{512,1024}.jsonl`.

| Page | English 512 | English 1024 | Hebrew 512 | Hebrew 1024 |
|---|---|---|---|---|
| founder's page | 0.50 | 0.75 | 0.00 | 0.25 |
| visual-page | 0.38 | 0.75 | 0.25 | 0.00 |
| slide-chart | 1.38 | 1.38 | 0.25 | 0.25 |
| receipt-photo | 1.00 | **1.50** | 0.25 | 0.00 |
| café photo | 0.25 | 1.00 | 0.00 | 0.00 |
| **all** | **0.70** | **1.08** | 0.15 | 0.10 |

- English goes from 0.70 to 1.08 (n=40 each). Where it moves is invented detail: at 512 three of the four "What do you
  see?" answers about the receipt gave a total of $94 or $39.95 and the fourth added "two Domino's Confections for $50
  each"; at 1024 all four read $39.99; the café went from
  "WILL THE CAPES/CAPEHONE COURT", "energy drinks", "concerts and sports" to "a chalkboard menu on a brick wall",
  bacon and toast, the £3 membership; the shop page from "a pet store in Bethsaida" and "dog adoption" to the dogs, the
  coffee and the checkout.
- Hebrew stays poor at both (0.15 / 0.10, n=20 each): garbled sentences either way; not a budget problem.
- The honest line showed 2 times at 512 and once at 1024 (both Hebrew); 3 silent retries each.
- Round 131 graded its own 512 run 1.08 and a 1024 run 1.35. My 512 run grades lower (0.70) than round 131's 512 run
  (1.08): different samples and a different grader. The comparison that counts is within this round: the same day,
  the same grader, +0.38.
- Instant still misses the 1.5 bar on every page except the receipt.

## Image-only PDFs

A PDF with no text layer (a scan, a photo saved as PDF) was read to the end with nothing stored and left at
`needs-ocr` ("empty" once OCR ran and found nothing). `pageReadable` asked for `indexed`, so `planPage` never looked
at it, and the turn gate answered `documents.needsOcr` before any picture could go.

- `pagePhoto.ts`: `pageReadable` also takes `needs-ocr` and `empty` (pages read, file held). Such a page has 0 stored
  characters, so `isVisualPage(0, ink)` decides: ink ≥ 0.10 is visual and its picture goes with the message on a model
  that sees; a blank page (ink < 0.10) stays as today.
- `docsGate.ts`: `planDocsTurn` takes `seesPage`; with attachments, nothing to search and the page picture in the
  conversation for a model that sees it, the turn is `{ kind: "page" }`: no OCR refusal and no "Answered without
  them" notice. `Chat.tsx` computes `seesPage` before it asks the gate.
- `coversAttachments`: a scan with no text, sent as its picture, also skips the 468 MB index card when it has several
  pages (there is nothing to index).
- A model that cannot see it keeps today's path: Fast without its pack gets the pack card (the page picture is the
  photo it holds); after "Remove the photo", in the browser, or with an own photo in the composer there is no picture
  and 0 characters, which is no thin page, so `documents.needsOcr` answers as before and OCR stays offered.
- After OCR: the page has its OCR text. Under 600 characters with ink ≥ 0.10 it is still a picture, and the OCR text
  joins it as the page's passages (round 130's rule); a full page of OCR text takes the text route. The two do not
  compete: the picture route reads the OCR text as the page's stored text.
- Documents library: the row of such a file still says *needs OCR* with the Run OCR action (`stateText.ts`
  unchanged); see the simulator shot.

Fixture: `fixtures/sign-scan.pdf`, the CC0 photo `street-sign-in-karakol.jpg` of the v1 baseline (Bgag, Wikimedia
Commons, licence in `docs/qa/v1-basics-baseline/fixtures/SOURCES.md`) saved as PDF with `sips` and no text layer:
0 characters, ink 0.928 (`pdfpages.swift`). A blue and white street sign "КАРАСАЕВ көчөсү" on a yellow wall.

Tests: `apps/mobile/test/fixes-r132-picture.test.ts` (the image budget per context, the scan rules, the gate);
`fixes-r127.test.ts` now passes the context to `phoneImageMaxTokens`.

## Simulator proof (`sim/`)

Simulator `r132-picture-budget`, iPhone 17 Pro, iOS 26.2, created for this run and deleted afterwards. The physical
iPhone was not touched (no devicectl, no pymobiledevice3). App: the QA variant `com.inbornapp.mobile.qa`, a Release
build for the simulator with the r129 recipe (`docs/qa/r129-wipe-vault/NOTES.md`), the `EXPO_PUBLIC_*` variables
exported for `xcodebuild` too. Fresh install, no index model, models host a closed localhost port. `sign-scan.pdf` and
`turbine-report-3pages.pdf` were copied into `Documents`; for the last step Fast (`Qwen3.5-2B-Q4_K_M.gguf`, no photo
pack) was copied into `Documents/models` with the app stopped and chosen with `dev-vault.txt` (`use fast`). Scripts in
`scripts/`, run with `node scripts/ios-qa.mjs <script> --out docs/qa/r132-picture-budget/sim --simulator --device <udid>
--bundle com.inbornapp.mobile.qa`.

| Shot | What it shows |
|---|---|
| `01-model-step`, `02-chat-instant` | Onboarding, "Start now with Instant", chip INSTANT |
| `03-composer-chip` | `sign-scan.pdf` attached (paperclip chip) |
| `04-sent-bubble`, `05-answer` | Instant, "What do you see?": **the page picture in the bubble, no OCR refusal, no index card**, and *"A faded street sign in Russian reads "КАРАСАЕВ" on a blue background above "кочесу" (likely "koshesu") on a white background, mounted on a yellow wall."* (right but for "Russian": the sign is Kyrgyz). Then the existing "FAST sees pictures better than INSTANT" card. `devrun-s2-instant.json`: `info.imageMaxTokens` **1024** (the simulator's context is 4096) |
| `06-library` | Documents library: the scan's row is unchanged, *"PDF · 1 page · 195 KB · Scanned. Run OCR on this phone?"* with **Run OCR · PRO** |
| `07-text-pdf-hold` | A text PDF, unchanged: new Instant chat, `turbine-report-3pages.pdf`, a question: the 468 MB index card holds it |
| `08a-vault-fast`, `08-fast-pack-card` | Fast without its pack, a new chat, the scan, "What do you see?": **"FAST needs its photo pack to see photos · One 668 MB download, then this photo sends by itself · Download 668 MB · Switch to INSTANT · installed · Remove the photo"**, no answer |

The first pass of `s1-onboard` pressed a wrong testID for "Start now with Instant" (it is `start-now-with`); the
script was fixed and `s1b-start-instant` ran the remaining steps.

## Not proven

- The phone's memory at 1024: measured on the Mac (Metal and CPU), and the reservation logic read in llama.rn's
  vendored `clip.cpp`; no footprint was read on an iPhone.
- The phone's time to first token at 1024: scaled from the Mac and the 13 Pro's 512 numbers.
- Grades are one grader's, not blind.
- "Remove the photo" on the scan's pack card and OCR run after a picture turn were not walked on the simulator; they
  are covered by the unit tests only.
- The Fast CPU-path memory row has one run (the remaining Fast CPU runs were stopped: 40 s each, and the GPU path is
  the phone's).
- Harness note: `run-picture.mjs` now defaults Instant to 1024 (the app's value at 4096) and takes `IMAGE_TOKENS`;
  `serve.sh` takes `IMAGE_TOKENS` for the Instant server.
