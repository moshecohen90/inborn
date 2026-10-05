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
- **One new string** (phase 2): `documents.opener.thinPage`, in the 8 locales and pseudo. Everything else uses existing
  words (the hold card, `documents.reading`, `documents.opener.nothingRelevant`).

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

## Phase 2: one rule for any file, and never an unrelated answer

### The rule

A turn about a file gets the best view of that file the model can use: its text always, plus the page picture when the
page is visual and the model can see. `planPage` (`apps/mobile/src/documents/pagePhoto.ts`) decides once per turn and
returns `{ page, chars, visual, picture }`; `generate()` then takes one of three routes:

| The page | Model can see (and the gates let the picture go) | Model cannot see, or the user removed the picture, or the web |
|---|---|---|
| Text page (ink < 0.10 or ≥ 600 chars) | text route (retrieval) | text route (retrieval) |
| Visual page with some text | picture + passages that bear on the question | **thin route**: the page's whole text + `thinPageRule` |
| Nothing matches the question | no-passage opener, "the files were searched" | same |

How it covers the four shapes the founder named:

- **A scan** (no text layer): OCR text is what the page stores. Long OCR text (a letter) = text route. A photographed
  page whose OCR found little (a receipt, a note: ink 0.50–0.77 as measured in phase 1) = visual: the picture goes to a
  model that can see; otherwise the thin route says it reads only the OCR text.
- **A slide-like page** (a title, a few words, a big chart or photo): few chars + high ink = visual. Same two routes.
- **A web capture** (the founder's file): the same, measured (183 chars, ink 0.272).
- **A mixed page** (a paragraph and a photo): under 600 chars with ink ≥ 0.10 = visual, so the picture goes with the
  passages that bear on the question; a long article with a small photo stays on the text route, where its text carries
  the answer. A multi-page PDF picks the page of the best passage, else page 1.

**Still today's refusal: image-only PDFs** (a scan or a photo saved as PDF with no text layer, before OCR has read
it). `planPage` needs a read page, so such a file gets the existing "needs OCR / could not be read" path, and on a
model that can see the picture never goes. Recommendation: let `planPage` take a page with 0 stored characters
and ink ≥ 0.10 as visual, so a model that can see gets the page picture at once (the case where a picture is worth
most), and keep OCR + the thin route for a model that cannot see. It is one condition in `planPage` plus the
"needs OCR" status check in `Chat.tsx`; I did not ship it in this round because it changes the OCR flow the founder
has not asked about.

The **thin route** replaces what a blind model used to get for a visual page: retrieval over a few labels, which matched
nothing, so the prompt said "Your documents don't mention this" and the model answered "I am an AI and cannot see".
Now the page's own passages all go in (reading order, then any other relevant passage), and the rule tells the model, if
the question is about what the page shows, to start with *"I can read only the text of this page, not its pictures."*
(quoted in the user's language, `documents.opener.thinPage`), then say what that text says, never describe a picture.
It applies when the planned page is visual (or unknown, on the web) and no picture reaches the model: Fast without its
pack after "Remove the photo" (`pageDeclined`), a model with no vision, the Free photo limit, an own photo in the
composer, and the browser. "Remove the photo" on a page hold now means "send without the picture": the next Send goes
out on the thin route instead of holding again.

### The three exits of the pack card for a held page

- **Download**: the card installs the pack and calls `releaseHeldTurn`, which sends the same draft again; `planPage`
  now finds a model that can see, so the page picture goes with the message.
- **Switch to INSTANT**: on a phone the switch opens a new chat, and the draft chat's attachments used to stay behind.
  The held turn (`lib/heldTurn.ts`) now also carries the attached document ids; the new chat attaches them and sends
  once they show in its document context, so the same PDF and the same message go out on Instant.
- **Remove the photo**: closes the card and marks the page declined for this message; the next Send goes out on the
  thin route (text only) instead of holding again. The next message plans the page afresh.

### Grounding when nothing matched

The no-passage opener used to end "…and then answer the question." Instant read that as "answer about the file" and
went on *"The report states…"*, *"The handbook outlines…"*, *"This handbook was authored by Dr. Richard Nixon in 1971"*
(5 of 12 samples). The rule is now (`packages/core/src/rag/prompt.ts`, `startWith`):
*Start with "Your documents don't mention this." The user's files were searched and nothing in them matched, so never
say what they state or contain. If you do not know the answer for sure, stop after that sentence.* "Were searched"
matters for Fast: without it Fast answered "I have no access to your files" (variant B, measured). The "could not be
included" opener (passages that did not fit) keeps "Never say what the user's files state, say or contain." without
"searched".

Behind the prompt, a guard in `generate()`: when files are attached, no passage and no picture reached the model, and
the answer claims what the file says (`claimsFileContent`, English: "the report states/indicates/outlines…", "this
handbook was written…"; an answer that opens with "…don't mention" or says "contains no…" is not a claim), the reply is
replaced by the localized "Your documents don't mention this." Over all 168 no-passage samples of this round (every
variant, both models) it caught 12 of the 15 answers that claimed file content and fired on no honest answer. The three
it missed came from the old prompt or dropped variants: *"they do mention standard building safety protocols"*, *"The
text is from a collection … published by Random House in 1954"*, *"The book is Handbook of Human Resource Management
(1983)"*. With the final prompt no claim reached the guard (0 of 48).

### The held turn waits for the index

The effect that released a turn held for the index model sent it the moment the model was ready, while the attached
files were still being rebuilt with it, so retrieval found nothing and the answer was invented under "Re-indexing
finished" and "Nothing in your documents matched". Now `releaseWhenIndexed` (`apps/mobile/src/lib/docsGate.ts`) shows
the existing line *"Reading your document before answering…"* while `library.attachmentsIndexing(chat)` (attached
documents queued, indexing or with a rebuild pending) is above 0, sends when it reaches 0, and gives up after 120 s and
sends anyway, where the existing re-indexing notice explains the answer. `refreshEmbedder()` marks every stale
document for rebuild in the same tick it reports the model ready, so the count is never read early.

### Measurement (`harness/run-grounding.mjs`, `results/grounding-*.jsonl`, grades in `results/grades.json`)

Same engine and grading as above. **none** = files attached, no passage matched (the plain prompt with the opener);
**thin** = a question about a visual page on a model that gets no picture. Before = the code before phase 2; after = the
final code. Grade 2 = honest and useful; 1 = honest but useless or with a wrong detail; 0 = invents what the file says or
answers something else. Each "after" cell pools two or three runs of the same final prompt.

| Case | Instant before → after | Fast before → after |
|---|---|---|
| none: 4 questions the turbine report / Northgate handbook do not answer (before n=12, after n=24) | 1.33 → **2.00** | 1.58 → **1.75** |
| none: answers inventing what the file says (raw, before the guard) | 5/12 → **0/24** | 0/12 → 0/24 |
| thin, synthetic page: "What do you see?" + "Now what do you see" (before n=6, after n=12) | 0.67 → **1.25** | 0.83 → **1.75** |
| **thin, founder's PDF on a model with no vision** (held-out; before n=6, after n=12) | 0.50 → **0.92** | 1.00 → **1.67** |
| thin route on a text question (turbine p1 on the web, "serial number?"; before n=3, after n=9) | 2.00 → 1.89 | 2.00 → 1.44 |
| text regressions, final code: turbine serial / Northgate paragraph 1.2 (n=3 each) | 1.67 / 2.00 | 2.00 / 2.00 |

- Founder's PDF, a typical after answer in one line (Fast): *"I can read only the text of this page, not its pictures";
  then the shop's free-delivery line and its welcome text*. Before: *"Your documents don't mention this. I am an AI model
  and cannot actually see anything."* Instant after still invents a detail in about one answer in three (a "new home"
  offer, a person holding money).
- The last row of the thin table is the price of the web: with no renderer, any sparse page is treated as possibly
  visual, so Fast sometimes appends "I can read only the text of this page, not its pictures." to a correct
  "RK-4417 [1]". On the phones the turbine page measures ink 0.003 and never takes the thin route.
- Rerun: as above, then `ROUTE=after node harness/run-grounding.mjs <instant|fast> <port> <e5 port> 3 <pages dir> <out.jsonl>`.
  `ROUTE=before` reproduces the old thin route only; the old no-passage opener needs the code at `13387382`.
- Variants measured and dropped: "…Then answer from general knowledge, and never say…" (Instant 5/12 invented);
  "Never say what the user's files state…" without "were searched" (Instant 11/12 clean, Fast "I have no access to your
  files", 1.29); the thin rule without a quoted opener (Instant 0.5 / 0.67, Fast 1.67 / 1.42 on synthetic / founder).

### Simulator proof, phase 2 (`sim2/`)

New simulator `r130-sim2` (iPhone 17 Pro, iOS 26.2), QA build of this branch, deleted afterwards. Only Fast's GGUF
was cloned into `Documents/models`: no index model, no photo pack. Downloads came from `scripts/serve-models.mjs` on
:8799 (local, unthrottled, so a download takes a second or two). Fixtures: the synthetic `visual-page.pdf` and
`turbine-report-3pages.pdf`; the founder's file was not used. Scripts `s8`, `s8b`, `s5b`, `s9`, `s10`, `s11`; 17:11–17:19
local time.

| Shots | What it shows |
|---|---|
| `01-*`, `01b-*` | Fresh install, Instant picked |
| `2a-12-docs-hold` → `2a-13-downloading` | Instant, turbine PDF, "What does the report say about the turbine?": the index card; after Download the card is gone and **"Reading your document before answering…"** shows while the message waits |
| `2a-16-honest-answer` | Then "Nothing in your documents matched this question" and the answer **"Your documents don't mention this."** No invented "The report states…" |
| `2a-17-asked-again-after-index`, `2a-17b-serial-after-index` | The same question asked again with the index done gets the same honest answer, and "serial number?" gets RK-4417 with its source: the miss is retrieval recall for that wording, not the wait (see Not proven) |
| `2b-12` → `2b-16-grounded-answer` | Index model removed, app relaunched, new chat, "What is the serial number of the Rakovsky turbine?": index card → Download → **first answer after the download: "The serial number of the Rakovsky turbine is RK-4417." with SOURCES `turbine-report-3pages.pdf · p.1`** |
| `1c-17-pack-offer` → `1c-18-photo-removed` → `1c-19-answer` | **Exit (c)**, Fast without its pack, visual PDF, "What do you see?": pack card; Remove the photo, Send: no second hold; *"I can read only the text of this page, not its pictures. The visible text includes a welcome message offering free shipping for orders over 150 NIS…"* with its source |
| `1b-21-pack-offer` → `1b-22-sent` → `1b-22-answer` | **Exit (b)**, Switch to INSTANT: the new chat on Instant shows the paperclip chip `visual-page.pdf` and the same message goes out by itself with the page picture; Instant: *"…It shows dogs on one page and coffee with glasses on another."* followed by a stray sentence (see Not proven) |
| `1a-31-pack-offer` → `1a-32-downloading` → `1a-33-answer` | **Exit (a)**, Download 668 MB: the pack lands, the held message goes out by itself with the page picture; Fast: *"The page displays a product listing for NORTHWIND featuring two images of dogs on gravel and a coffee cup with cookies. A Hebrew message at the top reads 'משלוח חינם בהזמנה מעל 150 ₪', indicating free shipping for orders over 150 NIS."* |

The `result-s8-*.json` names its shots `2-…`; they were renamed to `2a-…` after the run.

## Checks

- `pnpm -w typecheck` 0, `pnpm -w lint` 0, `pnpm -w web:build` 0.
- Android: `expo prebuild -p android` + `./gradlew :doc-extract:compileReleaseKotlin` BUILD SUCCESSFUL (the module with
  `pageInk`); no APK was built or run.
- Tests: `apps/mobile/test/fixes-r130.test.ts` (19 tests: the visual decision on the measured numbers, page choice,
  no-search/no-render for text PDFs, own-photo precedence, the gates on Fast/no-vision/Instant, first turn and
  follow-ups, the Chat wiring). Two structural assertions of rounds 128 and F343 updated to the new hold condition.
- Phase 2: `apps/mobile/test/fixes-r130-grounding.test.ts` (18 tests: the thin route and its rule, `pageHits`, the
  quoted opener in every locale, the no-passage rule wording, `claimsFileContent` on the measured invented and honest
  answers, `releaseWhenIndexed` waiting / timing out / sending at once, the held effect's wiring, the three exits of
  the pack card including the files carried through a switch). `packages/core/test/fixes-r124.test.ts` updated to the
  new opener. Totals: core 1265 passed + 4 skipped, mobile 1372, i18n 24, ui 23.

## Not proven

- **A real iPhone** (by design; the next device pass) and therefore on-device latency: the image prefill is the round-127
  cost (Fast 1024 tokens ≈ 6 s on the founder's phone, pass 33). The page render and ink were not timed on a device.
- **Android at run time**: only the Kotlin module was compiled. `pageInk`/`renderPage` on pdfbox/PdfRenderer were not run.
- **Downloads at real speed**: the pack and the index model came from a local server in a second or two, so the 120 s
  bound of the index wait and a slow pack download were not walked on the simulator (unit tests cover the bound).
- **Retrieval recall for "What does the report say about the turbine?"**: the turbine report's page 1 says "The
  Rakovsky turbine serial number is RK-4417" and that question still matches nothing with e5 (one shared word under
  the relevance doors). The answer is now honest ("Your documents don't mention this.") instead of invented, but it is
  not useful; tuning the doors for "what does X say about <one word>" is a retrieval change outside this round.
- **Instant's answer after the switch** (`1b-22-answer`) described the page and then added a stray sentence ("since
  there are no documents provided, I cannot answer based on their instructions"). One sample; the phase-1 picture-route
  grades for Instant (0.83) already show such tails.
- **Visible state of the index wait** is the existing "Reading your document before answering…" line above the chat,
  not a line on the hold card: the card is the other round's component, and it closes when the model is ready.
- **Multi-page PDFs** on the simulator (the best-passage page) are covered by unit tests only.
- **Image-only PDFs** (status empty / needs OCR) keep today's refusal; see the recommendation in phase 2.
- **Context fit of follow-ups**: the passages are fitted into what the pictures leave, but `trimHistory` in the RAG
  prompt still counts text only.
