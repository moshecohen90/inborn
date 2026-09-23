# attach-android — "it answered that it received no image at all" (round 37, F125–F128)

Moshe, 23.9.2026: *"I attached a photo of a door and asked what it sees; it answered that it received no image at
all. I attached a PDF: same problem. Did you check that everything in Pro works? Everything in Work? Does the
indexing really work? If a user asks to answer only from his sources, does it really do that or does it invent from
elsewhere?"*

**One device.** Every row is the **OnePlus 6T** (`<6t-serial>`, Android 11, 8 GB, tier `ANDROID-LEGACY`). Driven by keys
(`TAB` / `DPAD_CENTER` / `input text`) plus the accessibility driver APK for the system pickers, which ignore
injected touches on this phone. The licence on this phone is real and it **owns Pro** (paywall reads `YOU OWN PRO`),
so every row below is a Pro row unless it says otherwise.

## What was actually wrong

Not vision, and not a missing companion. Both companions are installed on this phone (vault: `EMBEDDING` and the
projector, both `Installed`), and with `INSTANT` resident the Play build described the door photo correctly
(`f125-vision-works-play19.png`). The defect was one line of turn planning: `planDocsTurn` returned `{kind:"model"}`
whenever the strict switch was off and no attached document had passages yet — **including when a document was
attached**. So the question went to the model as if the composer were empty, and the model answered for a chat with
no attachment.

Two ways to reach it, both reproduced on the Play build **1.0.0 (19)**:

| file | how it was attached | what the app did | what the model said |
|---|---|---|---|
| `door.jpg` | `[+]` → **Add a file…** | imported as an image document, indexing ended `needs-ocr · 0 chunks`, attached anyway | *"I don't see an attached photo. Please upload the image directly so I can analyze it."* |
| `northgate-big.pdf`, 40 pages | `[+]` → **Add a file…** | attached the instant it was picked; indexing was still running | invented **`"NORTGATE"`** as the maintenance access code. The real code, on page 30 of the attached file, is `ZR-4471-QX` |

The second one is the direct answer to Moshe's last question: with *"answer only from my documents"* **off**, an
attached-but-unread file did not produce a hedge or a warning, it produced a confident invention with no citation.
The same PDF finished indexing a minute later as `Indexed · 80 passages`, so nothing was wrong with indexing itself —
the answer simply beat it.

Third finding, found while checking that the fix's advice is actionable: **running OCR on a photo is a dead end.**
Documents offers `Run OCR` on `door.jpg`, and running it finished `empty · 1/1 pages · 0 chunks` — a picture of a
door has no text to recognise. So "run OCR" is the wrong thing to tell someone who attached a photograph; the Photo
button is the right one, and it works.

## The files

| file | what it shows |
|---|---|
| `f125-vision-works-play19.png` | the Play build, `INSTANT`, the door photo attached with the **Photo** button: *"I see a simple brown door with two panels, a gold doorknob…"*. Vision is not broken |
| `f125-image-doc-denied-before.png` | **before.** The same photo attached with **Add a file…**: the `door.jpg` chip is on screen and the answer is *"I don't see an attached photo"* |
| `f126-invented-while-indexing-before.png` | **before.** The 40-page PDF chip on screen, and an invented access code `"NORTGATE"` in place of `ZR-4471-QX` |
| `f126-reading-notice-after.png` | **after.** The same 40-page PDF, the question asked the instant it was picked: the turn holds and says *"Reading your document before answering…"* instead of answering |
| `f126-cited-after.png` | **after.** The answer that follows: *"…is ZR-4471-QX…"*, cited `00-northgate-big.pdf · p.30` |
| `f125-photo-refusal-after.png` | **after.** `door.jpg` attached with **Add a file…**: *"That is a picture, and I read files for their text. To have it looked at, attach it with the Photo button instead."* |
| `f125-photo-button-sees-after.png` | the route that refusal names, on the fixed build: the same photo on the **Photo** button, *"I see a brown door with a gold coin on the right side."* |
| `f-strict-notfound.png` / `f-strict-off-model.png` | strict on: *"I could not find that in your documents."* · strict off: *"The capital of Portugal is Lisbon."* |
| `tier-*.png` | the tier matrix rows below, one file per row |
| `f129-*.png` | the Free/Pro attach gap and its fix |
| `fixtures/` | the fixtures the rows were taken with: `door.jpg`, `northgate.pdf` (1 page), `northgate-big.pdf` (40 pages, the fact on page 30), `scan-certificate.png` (a rendered "scan", certificate `WP-8832-VN`), `bearings.xlsx` (part no `BR-3311-LM` for SR-2), `sitenotes.html` (muster point `Gate C car park`) |

## Reading the phone

Recipes that cost time here and are not in the repo:

- The **photo picker** and the **file picker** ignore injected touches like the rest of this phone, and the roots
  drawer scrolls the first four roots off-screen, so `Downloads` is out of the accessibility tree. Reach a file
  through `OnePlus 6T` → `Download` instead, and click its **title** node, not the substring: `click:00-northgate`
  matches the *preview* button's content description (`Preview the file …`) and opens an "Open with" chooser.
- A file pushed with `adb push` lands in MediaStore as `is_pending=1` with a null size on this ROM, and **neither
  picker will show it**. Clear it (`content update --uri content://media/external/downloads/<id> --bind
  is_pending:i:0 --bind _size:i:<bytes>`); for the photo picker, `datetaken` also decides the position in `Recent`.
- `uiautomator dump` and the driver APK both take the UiAutomation service. Running them at once crashes the driver
  with `Process crashed` inside `getUiAutomation`; serialise them.
- The library dedupes by content, so importing the same file again reuses the record that is already indexed and the
  turn never waits. To film the wait a second time, change one byte: `northgate-big2.pdf` is `northgate-big.pdf` with a
  trailing PDF comment.
- Indexing in the debug bundle runs at about 11 s/page against roughly 1.5 s/page in the Play build. Times in these
  logs are the dev bundle's, not the product's.

## Proven on the phone, on the fixed build

The Play build cannot be replaced without uninstalling it and its 4.8 GB vault, so the fix runs as a second app,
`com.inbornapp.mobile.qa`, side by side with it. Same source, `assembleDebug` against Metro on a private port, the three
models pushed into its own `files/`. The Play build and its vault were not touched.

| what | before (Play 1.0.0 (19)) | after (fixed build, same phone, same files) |
|---|---|---|
| 40-page PDF, question asked while it indexes | invented `"NORTGATE"`, no citation | holds the turn, *"Reading your document before answering…"*, then *"…is ZR-4471-QX…"* with `p.30` cited. Re-checked after `origin/main` was merged, strict on as well as off |
| photo attached with **Add a file…** | *"I don't see an attached photo."* | *"That is a picture… attach it with the Photo button instead."*, and that button then describes the door |
| strict on, question not in the file | — | *"I could not find that in your documents."* No invention |
| strict off, same question | — | *"The capital of Portugal is Lisbon."* The model answers, as designed |

Indexing that PDF took **444 s** in the debug build (11 s/page) against about a minute in the Play build; it is the dev
bundle, not the fix. It made the "answer beat the index" window wide enough to film, which is the whole point.

## Tier matrix on this phone

Driven with the dev licence hooks (`EXPO_PUBLIC_PRO=1`, `EXPO_PUBLIC_TIER=work`, nothing for Free) through Metro, one
reload per tier. Every row is a tap on the 6T.

| tier | feature | result | evidence |
|---|---|---|---|
| Free | second file in a chat → Pro | **proven.** "Add a file…" opens the Pro paywall | `tier-free-second-file-paywall.png` |
| Free | *"Answer only from my documents"* → Pro | **proven.** The switch opens the Pro paywall, it does not flip | `tier-free-strict-paywall.png` |
| Free | one photo per message | **proven.** The sheet says *"One photo per message on Free"*, the composer *"FREE SENDS ONE PHOTO PER MESSAGE"* | `f125-photo-button-sees-after.png` |
| Free | attaching a document already in the library | **was broken → fixed.** See F129; the count half is F146, fixed on `main` in the same week, and this round adds the Work-format half | `f129-free-two-docs-work-kind.png` → `f129-free-second-doc-blocked-after.png` |
| Pro | library, attach, detach, citations | **proven** throughout the rows above | `f126-cited-after.png` |
| Pro | OCR of a scanned page | **proven.** `scan-certificate.png` imported `needs-ocr · 0 chunks`; **Run OCR** → `indexed · 1/1 pages · 1 chunks · 2706 ms`; strict answer *"…is WP-8832-VN."* cited `p.1` | `tier-pro-ocr-indexed.png`, `tier-pro-ocr-cited.png` |
| Pro | strict mode | **proven** both ways on this device and this model. Read it with **F137** (`attach-ios`): the check that turns the model's sentinel into that sentence was an exact `startsWith`, so the localized refusal here depended on the casing this model happened to return. On the iPhone the same path printed `Not_FOUND_IN_DOCUMENTS` to the screen. Fixed in core for both streams; this row was not re-run on the 6T afterwards | `f-strict-notfound.png`, `f-strict-off-model.png` |
| Pro | Excel / HTML stay behind Work | **proven.** Picking `bearings.xlsx` on Pro opens the paywall at **PRO FOR WORK** | `tier-pro-xlsx-work-paywall.png` |
| Work | XLSX import | **proven.** `indexed · 1 chunk`, answer *"…is BR-3311-LM."* cited `bearings.xlsx · sheet 1` | `tier-work-xlsx-cited.png` |
| Work | HTML import | **proven.** `indexed · 2/2 pages`, answer *"…is Gate C car park."* cited `sitenotes.html · part 2` | `tier-work-html-cited.png` |
| Work | redaction before send | **proven.** Name list + Dates → preview *"Draft a note to [NAME] about the inspection on [DATE]"*, applied to the composer as `[NAME-1]` / `[DATE-1]`, sent message marked **REDACTED** with *Show originals* | `tier-work-redact-preview.png`, `tier-work-redact-applied.png`, `tier-work-redacted-sent.png` |
| Work | templates, profession packs | **not testable here.** The row is in the sheet; §7.9 lists profession packs under `UNBUILT_FEATURES` in `packages/core/src/licence/gates.ts`, so there is nothing behind it yet to prove | — |
| any | the price on the paywall | **not testable here.** This QA package has no Play products, so both tiers render as *" · one-time purchase"* with an empty price. The Play build shows the real prices | `tier-free-strict-paywall.png` |

## What is still open

- **F128**, the browser tier cannot add a document at all. Not this stream's surface; handed over.
- Sources are listed under an answer the model gave from its own weights (strict off). Retrieval ran, so the chips are
  honest about what was searched, but a reader takes them for what was used. Worth a designer's eye, not a QA fix.
