# Round 130A: a visual PDF page reaches the vision model (5.10.2026)

The founder attached a one-page PDF (a Safari capture of a shop page: two large portrait photos, about 200 characters
of Hebrew button labels) and asked "Now what do you see". The answer had nothing to do with the page: a PDF went only
through the text layer, so the model got the labels and never the pictures.

Now, for a turn with an attached PDF and no photo of the user's own, the page the turn is about (a one-page PDF: that
page; several pages: the page of the best passage, else page 1) is rendered and sent as the turn's photo when it is
visual. Passages that bear on the question still go in, in round 128's shape (`withPhotoText`).

## The threshold, and why characters alone are not enough

Measured with `harness/pdfpages.swift` (PDFKit text = `pageText`; ink = `pageInk`, the same 128 px render and cut at 96
below white as the new native function on iOS and Android).

| Page | Characters | Ink |
|---|---|---|
| Founder's shop page (two photos) | 183 (PDFKit, whitespace collapsed; the brief counted 229) | **0.272** |
| `fixtures/visual-page.pdf` (synthetic, two CC0 photos) | 132 | **0.597** |
| `turbine-report-3pages.pdf` p1–p3 (text only) | 157, 165, 178 | 0.003 |
| `fleet-memo.pdf` (text only) | 282 | 0.008 |
| `northgate.pdf` (text only) | 593 | 0.013 |
| A public SEC filing p1–p3 (text only, measured locally, not kept) | 872, 2,526, 1,046 | 0.004, 0.005, 0.002 |
| `northgate-big.pdf` p1–p14 (dense text) | 2,490 | 0.019–0.020 |
| `scan-no-text-layer.pdf` (clean scan) | 0 (OCR 149) | 0.001 |
| Photographed letter / handwritten note / receipt as a PDF (v1 fixtures, `sips`) | 0 | 0.501 / 0.768 / 0.002 |

Text pages with **fewer** characters than the founder's page exist (157), so a character count alone would send them
as pictures, and Fast without its pack would then hold a plain text question. Ink separates the two classes by an
order of magnitude: every text page ≤ 0.020, every picture page ≥ 0.272.

**Rule (`apps/mobile/src/documents/pagePhoto.ts`): visual = fewer than 600 characters stored for the page AND ink ≥ 0.10.**
Characters are what the text route stores for the page (the end of its last passage, OCR text included), so a scan
whose OCR text is long stays on the text route. 600 is the cheap gate: a page past it never costs a render. 0.10 sits
5× above the densest text page and 2.7× below the founder's page.

Cost: a text-rich PDF only reads its stored page lengths (cached per document), with no retrieval and no render. A PDF
with a sparse page pays one retrieval to pick the page (only if it has more than one page), one 128 px ink render, and,
when visual, one scale-2 render imported like a photo.

## Decisions

- **Own photo wins.** Any photo in the composer keeps the PDF text-only for that turn, on every tier. The page counts as
  the turn's one photo on Free (`limit` < 1 never renders).
- **Gates unchanged.** The page goes through `gatePhotoSend` exactly like a composer photo: Fast without its pack gets
  the pack offer card (the card shows with no photo in the composer, `pageHeld`), a model with no vision gets the switch
  offer, Instant's bundled pack sends. A model switch from the card stashes the message text.
- **Follow-ups: the first turn carries the page; it is not re-sent.** The page image is stored on the user's message
  (`pdfpage-<doc>-p<n>-…jpg`), and a later turn in the chat sees it in the history, whose image tokens `buildPrompt`
  already counts. While the chat carries the page and the model can see now, a turn is asked like a photo turn
  (passages only when they bear on the question; no "Your documents don't mention this" opener), and the passages are
  fitted into what the pictures leave of the context. If the current model cannot see (Fast without its pack after
  Instant saw the page), the page is planned again, so Send shows the pack offer rather than a blind answer.
- **Web:** pdf.js reads text only; `hasPageRenderer()` is false, the browser keeps today's behaviour.
- **No new strings.** The hold card's existing words are used.

## Offline measurement (`harness/`)

Engine: Homebrew `llama-server` with the shipped GGUFs from `.models`, `--jinja -c 4096`, projector capped at the app's
image tokens (Instant 512, Fast 1024), the app's sampler. Prompt code: the app's own (`harness/lib.ts` bundles the
round-1 lib plus `pagePhoto.ts` and `photoPrompt.ts`). Documents: PDFKit text → `indexDocument` with e5 →
`Retriever` → `buildRagPrompt`. The page picture: PDFKit scale-2 render, then `sips -Z 1024` JPEG 85 (what
`importImageFile` does). **before** = today's text route; **after** = `planPagePhoto`'s decision, then the photo-turn
prompt of `generate()`. 3 samples per cell, one grader (me), 0/1/2 as in `v1-basics-baseline/README.md`; grades per
sample in `results/grades.json`, answers in `results/pdf-*.jsonl`.

Tuning set = the synthetic PDF (looked at while choosing the passage rule). Held-out = the founder's PDF (its answers
were read once, graded, and not kept) and the two text PDFs.

| Set | Question | Instant before → after | Fast before → after |
|---|---|---|---|
| Tuning, synthetic | "What do you see?" + "Now what do you see" (n=6) | 0.00 → **0.83** | 0.00 → **1.17** |
| Tuning, synthetic | "What does the free shipping line say?" (n=3) | 0.00 → 0.33 | 0.00 → 0.33 |
| Tuning, synthetic | follow-up "What is next to the cup?" (turn 2, n=3) | 0.00 → **1.67** | 0.00 → **2.00** |
| Held-out, founder's PDF | "What do you see?" + "Now what do you see" (n=6) | 0.00 → **0.83** | 0.00 → **1.00** |
| Held-out, founder's PDF | "What does the free shipping line say?" (n=3) | 0.00 → 0.33 | 0.00 → 0.00 |
| Held-out, text PDF (turbine, 157-char pages) | serial number (n=3) | 1.67 → 1.67 | 2.00 → 2.00 |
| Held-out, text PDF (northgate-big, 40 pages) | paragraph 1.2 (n=3) | 1.67 → 2.00 | 2.00 → 1.67 |

- Before, every visual-page answer was a 0: "Your documents don't mention this", or "I cannot see images".
- Founder's PDF, best after-answer in one line (Fast): *a cosmetics shop page with two smiling portrait photos, a chat
  bubble in Hebrew and the shop's menu icons*. Failures after: two refusals ("I can't see images", a safety refusal on
  Fast), one off-topic answer, and invented details (a "social profile page", "hair colour options").
- Text PDFs: the decision was "text" for every page (turbine ink 0.003, northgate 0.020), so before and after are the
  same prompt; the differences are sampling noise. Every sample used a passage (with source).
- **The text question on a visual page is not answered from the text.** "What does the free shipping line say?" (English)
  never retrieved the Hebrew line in either route (used = 0 in all 24 samples), so before = "documents don't mention
  this"; after, the models read "150" off the picture now and then. This is a cross-language retrieval limit, not the page route.
- **Variant measured and rejected:** always adding the shown page's own passages (`PAGE_TEXT=1`,
  `results/page-text-variant-*.jsonl`). The shipping question rose to Instant 1.33 / Fast 2.00, but describing fell
  (Instant 0.83 → 0.67, Fast 1.17 → 1.00, with Hebrew-only and "the documents contain no…" answers). The founder's
  complaint is describing, so the rule stays "passages only when they bear on the question".

Rerun: `swift harness/pdfpages.swift <pages dir> <pdfs…>` → `node harness/bundle.mjs <rolldown dir>` →
`harness/serve.sh <models> e5|instant|fast <port>` → `node harness/run-pdf.mjs <instant|fast> <port> <e5 port> 3 <pages dir> <out.jsonl>`.
The founder's PDF is read from the pages dir as `FOUNDER.json`; it never enters the repo. `make_visual_pdf.swift` builds
`fixtures/visual-page.pdf` from two CC0 photos of `v1-basics-baseline/fixtures/photos/sized` (dogs, mug; licences in
that folder's `SOURCES.md`) and about 130 characters of short Hebrew and English labels as a real text layer.

## Simulator proof (`sim/`)

Simulator `r130-pdf-page-vision`, iPhone 17 Pro, iOS 26.2, created for this run and deleted afterwards. App: the QA
variant `com.inbornapp.mobile.qa`, Release for the simulator, built from this worktree with the r129 recipe; the
`EXPO_PUBLIC_*` variables must also be exported for `xcodebuild` (the bundle step reads them; without them the QA bridge
is stubbed out). Fast (`Qwen3.5-2B-Q4_K_M.gguf`, **without** `mmproj-Qwen3.5-2B-F16.gguf`) and the index model were
cloned into `Documents/models`; `visual-page.pdf` and `turbine-report-3pages.pdf` into `Documents`. Scripts in
`scripts/`, run with `node scripts/ios-qa.mjs <script> --out docs/qa/r130-pdf-page-vision/sim --simulator --device <udid> --bundle com.inbornapp.mobile.qa`.
Times are the `result-*.json` stamps (UTC; local = +3).

| Shot | What it shows |
|---|---|
| `01-welcome`, `01-model-step`, `01b-instant-picked`, `01b-chat` | Fresh install, Instant picked (Fast shows "already on this phone"), chip INSTANT (13:16–13:19) |
| `02-composer-chip` | `attach: visual-page.pdf`: the composer shows the **paperclip chip** `visual-page.pdf`, no photo thumbnail |
| `03-sent-bubble` | "Now what do you see" sent: the user bubble shows **the page render** (NORTHWIND page with the dogs and the cup) above the text (13:20) |
| `04-answer` | Instant: *"I see a shopping cart with a checkout flow and some dog illustrations on a website called Northwind…"* |
| `05/06-follow-up` | "What is next to the cup?": *"To the right of the cup, there is a white paper with printed text and a small white button labeled 'Continue to checkout.' To the left of the cup, there are two brown cookies shaped like hearts…"*. One image file in `Documents/images` after both turns (`pdfpage-<doc>-p1-….jpg`): the page was not re-sent |
| `07-chat-on-fast` | `use fast` through the vault screen: chip FAST (a model switch opens a new chat) |
| `08-fast-pack-offer`, `08b-…-later` | New chat on Fast, visual PDF attached, "What do you see?": **"FAST needs its photo pack to see photos" / Download 668 MB / Switch to INSTANT**, the message stays in the composer with the paperclip chip, no answer (13:23) |
| `09-text-pdf-chip`, `10-text-sent`, `11-text-answer` | New chat, still Fast without the pack, `turbine-report-3pages.pdf`: no picture in the bubble, no hold, *"The serial number of the Rakovsky turbine is RK-4417, as stated in document [1]."* with the source chip `turbine-report-3pages.pdf · p.1` (13:24) |
| `extra/` | First attempts: `use fast` written while the chat was open (only the vault screen reads it), so a third Instant turn "What do you see?" answered from the same page without re-sending it |

## Checks

- `pnpm -w typecheck` 0, `pnpm -w lint` 0, `pnpm -w web:build` 0.
- Android: `expo prebuild -p android` + `./gradlew :doc-extract:compileReleaseKotlin` BUILD SUCCESSFUL (the module with
  `pageInk`); no APK was built or run.
- Tests: `apps/mobile/test/fixes-r130.test.ts` (19 tests: the visual decision on the measured numbers, page choice,
  no-search/no-render for text PDFs, own-photo precedence, the gates on Fast/no-vision/Instant, first turn and
  follow-ups, the Chat wiring). Two structural assertions of rounds 128 and F343 updated to the new hold condition.

## Not proven

- **A real iPhone** (by design; the next device pass) and therefore on-device latency: the image prefill is the round-127
  cost (Fast 1024 tokens ≈ 6 s on the founder's phone, pass 33). The page render and ink were not timed on a device.
- **Android at run time**: only the Kotlin module was compiled. `pageInk`/`renderPage` on pdfbox/PdfRenderer were not run.
- **The pack download path completing** for a held page (Download → the turn sends by itself) was not walked; it is
  the round-127/128 card unchanged. "Remove the photo" on a page hold only closes the card; the next Send holds again.
- **Multi-page PDFs** on the simulator (the best-passage page) are covered by unit tests only.
- **A model switch from the card in a brand-new chat**: the switch opens a new chat, so the stashed message arrives
  without the draft chat's attachment (same as for documents today).
- **Image-only PDFs** (status empty / needs OCR) are out of scope: they keep today's refusal; the page route needs a
  read PDF.
- **Context fit of follow-ups**: the passages are fitted into what the pictures leave, but `trimHistory` in the RAG
  prompt still counts text only.
