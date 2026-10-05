# Round 131B: answers about a picture (5.10.2026)

## Numbers first

Grid: {Instant, Fast + pack} × {the founder's page, `visual-page.pdf`, `fixtures/slide-chart.pdf`,
`fixtures/receipt-photo.pdf`, the café photo as a plain photo} × {"What do you see?", "What is this file about?",
"מה אתה רואה?"} × n=4 = 120 answers per route. Every answer was graded by hand with the rubric of
`docs/qa/v1-basics-baseline/README.md` (2 correct, user's language, right-sized, nothing invented; 1 usable with a
flaw; 0 wrong, invented, wrong language or useless). Per-answer grades: `results/grades.json`.

Mean grade, English questions (n=8 per cell) / Hebrew question (n=4 per cell):

| Page | Instant before | Instant after | Fast before | Fast after |
|---|---|---|---|---|
| founder's page | 0.75 / 0.00 | 0.63 / 0.25 | 1.13 / 0.00 | 1.38 / 0.75 |
| visual-page | 1.13 / 0.00 | 1.38 / 0.00 | 1.38 / 0.50 | **1.75** / 0.50 |
| slide-chart | 1.13 / 0.00 | 1.25 / 0.25 | 1.13 / 1.25 | **1.50** / 0.50 |
| receipt-photo | 1.25 / 0.00 | 1.13 / 0.25 | 1.13 / 0.50 | **1.63** / 0.50 |
| café photo | 0.75 / 0.00 | 1.00 / 0.00 | 1.75 / 0.00 | **1.63** / 0.75 |
| all | 1.00 / 0.00 | 1.08 / 0.15 | 1.30 / 0.45 | **1.58** / 0.60 |

Failures, answers that reached the user (a row can carry two):

| | a blind refusal | b off-topic safety | c invented citation | d meta leak |
|---|---|---|---|---|
| Instant before | 5 | 2 | 1 | 4 |
| Instant after | **0** | **0** | **0** | **0** |
| Fast before | 1 | 1 | 7 | 3 |
| Fast after | **0** | **0** | **0** | **0** |

Caught before the user saw them, in the final runs: Instant 1 (a meta opening, retried silently, the second answer
shown); Fast 2 (a stray `[2]` and `[7]` dropped from a sound answer). The honest line did not fire in the final 120;
in the run just before the last check change it fired twice in 60 Instant turns (Hebrew, visual page, both attempts
opened "The user is asking what I see…").

Against the bar:

- **Zero a/c/d reach the user in any cell: met** (also zero b).
- **English ≥ 1.5 on every page: Fast meets it on four of five pages, misses on the founder's page (1.38). Instant
  misses on every page (0.63–1.38).** Instant's errors are not refusals or leaks any more: they are invented
  details (a "dating site", "pricing tiers for selecting dogs", "$94" on a $39.99 receipt). That is the 0.8B model at
  512 image tokens reading a dense page; I did not tune prompts to these fixtures to move it.
- **Hebrew, as measured:** weak on both models (Instant 0.15, Fast 0.60). No refusal and no leak in any Hebrew answer.
  What remains is poor Hebrew (garbled words, a receipt read as "a prayer"), two Instant answers given in English, and
  two Instant non-answers ("אני אשמח לעזור לך.", "I can help with the shared answers of the two pictures").

Instant at **1024 image tokens** (`results/x-after-instant-1024.jsonl`, English only graded, run before the last two
checks were added): 1.35 overall, slide 1.88, receipt 1.38, founder's page 1.00, visual 1.25, café 1.25, at about
+100 to +280 prompt tokens per turn. Recommendation: give Instant 1024 image tokens on phones that can hold it
(`imageTokens.ts`). Not shipped here: 512 is a deliberate memory choice and this round did not re-measure memory.

## Causes

| | Cause | Fix |
|---|---|---|
| a | The system prompt never said a picture was there, and `llamaRn.ts` put the picture **after** the text (wllama and the Qwen-VL training order put it first). Asked "what do you see", the small models answered as a text model would. | `PICTURE_LINES` in `turnSystemPrompt` ("This conversation comes with a picture… and you can see it. Answer from what the picture shows."), dropped again if the vision gate drops the picture; image parts first in `llamaRn.ts`. |
| b | The persona's crisis sentence ("…someone they trust or a crisis line") was echoed, or translated, into answers to questions that had nothing to do with harm. | Gone after the fixes above; the sentence stays in the prompt. The answer check also treats crisis advice as off topic when `detectCrisis` finds nothing in the user's message. |
| c | Next to a page picture the RAG rules said "Answer from the passages…", so the models recited passages and their labels, then invented more (`[2] <file> · p.2` from a one-passage turn). | `pagePicture` rule lead: "The text found on that page is between… use it for exact words and names." The check drops `[n]` beyond the turn's passages and cuts the answer at a label that names none of them. |
| d | The models narrated their instructions ("The user is asking me to answer in one to three sentences"). Sampling at 0.7 made it more likely. | Picture turns sample at 0.3 (`PICTURE_SAMPLING`) unless the persona sets a temperature. The check catches a sentence that opens about "the user", repeats five words of the system prompt, or quotes the whole question. |
| e | No cause found. With `llama-server` at temperature 0, the same picture turn gives the same answer cached (533 tokens reused) and uncached, and a different picture with the same text invalidates the cache and is described correctly. llama.rn (`rn-mtmd.hpp processMedia`) hashes each bitmap, so an identical prompt replays the cached state and a changed picture re-encodes. On these hybrid models a partial cache trim fails and the context is restored from a checkpoint or cleared, so the picture is never lost. Regenerate is a fresh turn in `Chat.tsx` (no `existingMessageId`), so it gets the picture, the picture line and the check. The phone's refusal on a second send fits the measured base rate (3 of 40 English Instant answers refused before the fix). | Not proven on llama.rn itself: the simulator log line `Restored multimodal state checkpoint` was not captured. |

Founder issue 1 (the 468 MB card on a picture turn): `submit()` asked `planIndexHold` before `planPage`, so it could
not know the turn carried the page whole. The page is now planned first, and `coversAttachments` (one attached file
of one page, sent as its picture or whole on the thin route) skips the hold. A longer file still holds.

Founder issue 3: the onboarding source line lost `{host}` once the download was queued, waiting or failed, because
only the `download` state carried it. Every non-ready state now keeps it.

## The answer check (`packages/core/src/chat/answerCheck.ts`)

Turn facts the app already has (`TurnFacts`: a picture was sent, the passage labels, the system prompt, the user's
message) are checked against each sentence as it streams (`checkedAnswer`):

- an opening sentence at fault stops the attempt unseen and asks once more at temperature 0.1;
- a later sentence at fault is left out, the answer goes on;
- a label that names no passage of the turn ends the answer there;
- if neither attempt lets a sentence through, the user reads `chat.vision.unsure` ("I have your picture, but I could
  not make it out well enough to give a reliable answer.", 8 locales + pseudo), and on a phone the model-advice card
  offers a higher tier that sees (`advisePhotoModel`, its own snooze key).

Only fresh picture turns go through it; Continue and text turns stream as before. `EXPO_PUBLIC_DEV_PICTURE_FAULT=1`
(QA builds only) faults every opening, to walk the honest path.

Word lists, where nothing structural exists: denial of sight (English and Hebrew, the two languages the phone answers
were seen in), and crisis advice (English and Hebrew). The rest is structural: passage labels and markers against the
turn's passages, five-word runs of the system prompt, the question quoted whole, an opening about "the user".

## Founder's file

Used from its local path only. Its pages, renders and answers stayed in the scratch directory outside the repo; the
`FOUNDER` rows were removed from every committed results file. Only its grades (numbers) are in `results/grades.json`.

## Harness

`harness/run-picture.mjs` runs the app's own prompt code (bundled with rolldown, `node bundle.mjs <rolldown>`) against
Homebrew `llama-server --jinja -c 4096` with the app's image token budgets, e5 embeddings for retrieval.
`ROUTE=before` is main b3707e81; `ROUTE=after` is this round, with `checkedAnswer` over the streamed completion.
`harness/make_pages.swift` builds the two new fixtures from CC0 sources (a Titanic chart slide; a photographed receipt
on a table, with an OCR text layer).

## Simulator proof (`sim/`)

Simulator `r131-picture-answers`, iPhone 17 Pro, iOS 26.2. I created it for this run and deleted it afterwards. The
physical iPhone was not touched (no devicectl, no pymobiledevice3). App: the QA variant `com.inbornapp.mobile.qa`, a
Release build for the simulator made with the r129 recipe, with the `EXPO_PUBLIC_*` variables exported for `xcodebuild`
too. It is a fresh install with **no index model**: `Documents/models` held only `vault.json`, and only the two PDFs
were copied into `Documents`. The models host is a closed localhost port, so no download can run. Scripts are in
`scripts/`, run with `node scripts/ios-qa.mjs <script> --out docs/qa/r131-picture-answers/sim --simulator --device <udid> --bundle com.inbornapp.mobile.qa`.

| Shot | What it shows |
|---|---|
| `01-model-step` | Fast: "1.28 GB · one download from localhost" (the dump has `model-source-fast`) |
| `01b-download-waits`, `01c-download-later` | Download pressed while offline. "FAST is waiting for a connection", and the source line **still names the host**. In the `01c` dump, "The download did not start…" also shows next to "1.28 GB · one download from localhost" |
| `01d-chat` | "Start now with Instant": chat on INSTANT |
| `02-composer-chip` | `visual-page.pdf` attached (paperclip chip) |
| `03-sent-bubble`, `04-answer` | "What do you see?" with **no index card**: the bubble carries the page picture, then Instant answers *"The image displays a webpage from "NORTHWIND," featuring two main sections: one showing four dogs on pavement and another depicting coffee with cookies, suggesting an e-commerce checkout process."* The advice card above it is the existing documents advice for Instant |
| `05-docs-hold` | New chat with `turbine-report-3pages.pdf` and a question: **the 468 MB index card still holds it** |
| `06-honest-line` | **Forced** with a second build that has `EXPO_PUBLIC_DEV_PICTURE_FAULT=1`. New chat, visual page, "What do you see?": the honest line shows once, and above it the card "FAST sees pictures better than INSTANT. Install FAST · 1.28 GB / Not now" |

The first pass of `s1b` used a wrong testID for "Start now with Instant" (it is `start-chatting`). That script was
fixed, and `s1c` ran the remaining steps. The `log stream` capture of `[picture-check]` lines came back empty, so the
forced faults are shown only by the screen.

## Not proven

- The honest line on a real fault on the phone: the simulator shows the forced path, and the harness shows the real
  path (two fires in an earlier 60-turn Instant run).
- (e) on llama.rn itself: the evidence is the code reading plus `llama-server`. No device or simulator log of a
  multimodal checkpoint restore was captured.
- Instant reaching an English mean of 1.5: it does not reach it at 512 image tokens (see the 1024 recommendation).
- Fast on the founder's page: 1.38, below 1.5.
