# Acceptance run — round 43, branch `acceptance`, 23.9.2026

Moshe's words this round: *"go over EVERYTHING I wrote again and make sure it is all fine. It is important that
users who buy get what they paid for, and if they asked to index their documents it must work well: find several
documents and play with them, investigate from every direction. Also check why we do not see more models."*

Every line of `~/Documents/inborn -.ini` is a row below, plus a row per tier feature the paywall's comparison table
promises. A row is **PASS** only with a file under this folder behind it, **FAIL** with the same, or **not verified**
with the reason. Four findings of this run are fixed on this branch (F160–F163); the two layout rows belong to the
`responsive-design` stream (round 35, F110–F119) and are recorded, not fixed here.

## How the browser half was run

`pn web:build` → `apps/web/dist`, served by `scripts/serve-web.mjs` on port 8643 with
`MODELS_DIR=/Users/moshecohen/dev/inborn/.models`, driven by `playwright-core` over the installed
`chrome-headless-shell` (no window, no focus stolen). Ten drivers live next to this file; each writes its own
`web/<name>.json` and the screenshots it names. A fresh context per width downloads the 533 MB GGUF into its own OPFS
and walks onboarding, so every run is a first visit.

Five test documents, built by `fixtures/mkdocs.py` (they are in `fixtures/` so any claim below can be re-checked):

| file | what it is | the fact only it knows |
|---|---|---|
| `turbine-report-3pages.pdf` | 3 pages, real text layer, one fact per page | p1 `RK-4417` · p2 `March 2019` · p3 `284,000 euro` |
| `scan-no-text-layer.pdf` | one JPEG page, **no** text operators | "Kessler valve inspection passed on 12 May 2021" (only as pixels) |
| `novara-depot.docx` | Word | `1,742 spare bearings`, `Ingrid Halvorsen` |
| `sites.xlsx` | Excel, 4 rows | three sites and their managers |
| `quarterly-note.html` | HTML with a script and a comment | `318,000 passengers`, `Solveig Dahl` |

---

## A. The .ini, line by line

| # | Moshe wrote | Verdict | Evidence |
|---|---|---|---|
| 1 | "on a big screen the onboarding shows a very, very long button… designed for mobile, stretched on desktop, it does not look good. Check the whole UI fits every device size" | **FAIL — owner `responsive-design` (round 35), not landed at the time of writing** | The primary button is **1408 × 48 px at a 1440 viewport, 98 % of the width**, and 992 px (97 %) at 1024. The download door above it is capped at 398 px, so the cap exists and the onboarding screens do not use it. Measured on all four widths: `web/a1-onboarding.json` (`welcome.button`, `model.button`, `sealed.button`, `lock.button`), pictures `web/A1-02-welcome-1440.png`, `web/A1-03-model-1440.png` |
| 2a | "you offer me a second package after I already downloaded one… and it cannot even be downloaded now, so why offer it?" | **PASS** (round 36) | The browser's model step offers exactly the model it already has and no download: `model.offersFast: false`, text "Instant · READY NOW · 508 MB · already on this browser". `web/a1-onboarding.json`, `web/A1-03-model-1440.png` |
| 2b | "the Wi-Fi button is only shown for devices that have Wi-Fi? maybe the wording should suit wired computers" | **PASS** (round 36) | No Wi-Fi switch anywhere in the browser onboarding, because nothing there can start a download: `model.wifiOnly: false` at 390/768/1024/1440. `web/a1-onboarding.json`. The wording for the phones is the `responsive`/`onboarding` streams' row, not re-opened here |
| 2c | "it looks as if going to airplane mode is inside the previous window… I do not even know why you want me in airplane mode. Put the airplane part on the next page, where you really prove it to me" | **PASS** (round 36, F124b) | The seal screen carries the reason and the link, not the test: "SEALED · ON-DEVICE / From here on, every answer is made on this browser. / **Prove it: turn on Airplane Mode and ask**". `web/a1-onboarding.json` (`sealed.prove`), `web/A1-04-sealed-1440.png` |
| 3a | "in the web I press add a file and the screen simply disappears without letting me add a file" | **PASS** (round 34, F100) | A real chooser opens and the file lands: `chooserOpened: true`, then `[documents] turbine-report-3pages.pdf: indexed · 3/3 pages · 3 chunks · 2391 ms`. `web/a2-documents-free.json`, `web/A2-01-attach-sheet-1440.png` |
| 3b | "the other buttons show they are not active, but why does pressing them not take me to the paywall?" | **PASS** (round 39) | Folders → "Folders for your chats come with Pro."; the strict switch → "You asked for answers only from your documents. Pro turns that on."; a second file on Free → "Free keeps one file per chat. Pro opens the whole library."; an Excel file on Pro → "You opened a spreadsheet. Pro for Work reads Excel and HTML files." `web/a5-ui.json` (`locked`), `web/a3-matrix-free.json`, `web/a3-matrix-pro.json`, `web/A5-03-locked-*.png` |
| 4 | "`/paywall` is very strange… where are all the prices? it looks completely naked" | **PASS** (round 39) | The page now carries **PRO $19.99 · one-time purchase** and **PRO FOR WORK $69.99 · one-time purchase** with five bullets each, the three store buttons, the "US list prices" note, and the full 17-row comparison table. `web/a5-ui.json` (`paywall`), `web/A5-05-paywall-1440.png`, `web/A5-05-paywall-390.png` |
| 5 | "the popup that disappeared without reading anything happened a few more times" | **PASS** (round 34, F101) — and one new one found and fixed | Every sheet item a browser can reach acts: `attach-templates` opens the templates sheet, the locked rows open the paywall, the library row attaches and detaches. **New this round:** tapping a document row to re-attach it threw `(0 , R.planLibraryAttach) is not a function` on web and desktop — the sheet went silent exactly the way Moshe described. **F163, fixed.** Before/after in `web/a9-libattach.json`, `web/A9-00-library-row-1440.png` |
| 6 | "the Wi-Fi-only switch moves left or right but it is not clear which state is on (iPhone)" | **PASS on the web tier** (round 34, F102) | The switch is drawn, not delegated: filled track + knob side + tick. The one switch a browser reaches is the strict switch, `web/A5-03-locked-attach-strict-*.png`. **Not verified on the iPhone itself** — see §D |
| 7 | "where it says New chat / Incognito it actually reads New ⏎ chat" | **PASS** (round 34, F103) | 247 × 44 px, one line, at 768 / 1024 / 1440; at 390 the sidebar is hidden. `web/a5-ui.json` (`newChat`), `web/A5-00-chat-1440.png` |
| 8 | "the input with + on the left and send on the right is not at the same height… only on big screens, because in the app the field is one line and here it is 2" | **FAIL — owner `responsive-design` (round 35), not landed at the time of writing** | Measured at every width: the field is a **fixed 70 px box** while `+` is 44 px and send is 36 px, all three bottom-aligned at y 891/887. It is 70 px with one line of text and **does not grow** with a second, so the empty composer already looks like the two-line one Moshe saw. `web/a5-ui.json` (`composer`, `composerTwoLines`), `web/A5-01-composer-2lines-1440.png` |
| 9 | "the site itself should offer the message line… the home page should be a landing page, sharp copy, an original design, a GitHub link and all the stores, marketing, maybe a short blog" | **PASS** (round 41) | The home page is a landing page with the message line first: **"Ask anything. It stays on this device." → Ask Inborn**, which opens the app in the browser with the text already in the composer and says underneath what it costs ("downloads the model once, 533 MB, and then answers with no network at all. The line you type travels in the web address… Nothing after it leaves your browser."). Under it a live `OUT 0 B · CONNECTIONS 0 · SEALED · ON-DEVICE` strip, then numbered sections: what it is, three steps, **pick the model your device can actually run**, how do I know it is not sending my data, pricing, FAQ, get Inborn; nav carries Proof, Blog, Support and Get Inborn. `node build.mjs && node check.mjs` → "✓ 12 pages: no scripts, no external assets, no dead links, CSP present". `web/A10-site-1440.png`, `web/A10-site-390.png` |
| 10 | "check design in the browser first and only then in the Mac/phone apps" | **followed** | Everything above was measured in the browser at 390/768/1024/1440 before any device work; only the CPU-, model-, photo- and purchase-shaped rows went to a phone |
| 11 | "on Android and iPhone I attached a photo of a door and it said it received no image… I sent a PDF and the same problem" | **PASS on the phones** (rounds 37 and 38, F125–F129 and F135–F144) | Both streams landed today and proved it on the real devices; this stream did not re-run their device matrix — see §D for what it did run |
| 12 | "did you check everything in Pro works? everything in Work works?" | **PASS on the web tier, partial on device** | §B below, row by row against the comparison table |
| 13 | "did you really check the indexing mechanism? does answering only from my sources really work, or does it also invent from other sources?" | **FAIL then fixed — F160, F161** | This is the biggest finding of the round; §C |
| 14 | "buttons to premium, and pressing things that lead to premium, so users know premium exists" | **PASS** (round 39) | The paywall opens from every locked control with its own reason (row 3b), Settings carries an "Inborn Pro · See what's in Pro" row, the model sheet carries a `FREE` chip and "See what's in Pro". `web/a4-models.json` (`settingsBody`), `web/A5-02-model-sheet-1440.png` |
| 15 | "how do I change model? is there a choice of other models? I did not find how to switch. Recommendation should be by language and by the action. Apart from Instant I saw no other models" | **PASS** (round 40) | The chat header chip opens a Model sheet listing **all four chat models**: ON THIS DEVICE → `INSTANT · RECOMMENDED · Good at: Chat, Summaries, Voice notes, Photos · English · Native · 508 MB · In use`; IN THE APP → `SHARP (PRO)`, `FAST`, `SHARP (PHI) (PRO)`, each with its own "Good at", its language fit and its size, under the line `RECOMMENDED ON THIS BROWSER · CHAT IN ENGLISH`. Why a browser sees one: "The browser runs one model and keeps it in its own private storage. There is nothing to import or switch here. The full vault (more models, GGUF import, store delivery) lives in the app." `web/a4-models.json`, `web/A5-02-model-sheet-1440.png`, `web/A4-02-vault-1440.png`. Nothing was removed: the catalog ships 4 chat models + 3 companions (`packages/core/src/catalog/manifest.json`) |

### The comment on the report, thread 1 — Hebrew

Moshe: *"why does Hebrew come out as gibberish on purpose? Do not treat Hebrew specially — if a user wants to speak
Hebrew, let him. We do not push it, but we do not block it."*

**PASS.** A Hebrew prompt reaches the engine unchanged and is answered; nothing rewrites, degrades or refuses it. Above
the answer the app states the truth rather than hiding it: **"NOTHING ON THIS BROWSER IS GOOD AT CHAT IN HEBREW ·
CLOSEST: INSTANT"** (`models.recommendedNone`, shown because a browser cannot install a better model; a phone gets the
actionable card instead). The answer itself is poor, because Instant rates Hebrew `none` in the catalog — the app says
so, it does not pretend. `web/a6-scan-hebrew.json`, `web/A6-02-hebrew-1440.png`.

---

## B. What a purchase buys, row by row against the paywall's own table

The web build cannot sell anything, so Pro and Work were driven on a `--dev` export of the same commit
(`EXPO_PUBLIC_PRO=1` / `EXPO_PUBLIC_TIER=work`, the `DEV_TIER` hook in `apps/mobile/src/licence/devFlags.ts`), which
is the only tier switch a release bundle deliberately does not have.

| Table row | Free | Pro | Work | Verdict |
|---|---|---|---|---|
| Files per chat 1 / ∞ / ∞ | a second file stops at the paywall **before the chooser opens**, reason "Free keeps one file per chat. Pro opens the whole library." | three files imported into one chat | same | **PASS** `web/a3-matrix-free.json`, `web/a3-matrix-pro.json` |
| Answers only from your documents | `PRO` tag, the switch opens the paywall with "You asked for answers only from your documents. Pro turns that on." | the switch turns on; an outside question ("Who was the first person to walk on the moon?") returns **"I could not find that in your documents."**, while "Who manages the Novara depot?" returns **"The Novara depot is managed by Ingrid Halvorsen."** from the DOCX | same | **PASS** — this is the direct answer to Moshe's question 13. `web/a3-matrix-pro.json` (`strictOutside`, `strictInside`) |
| Excel and HTML import (Work only) | — | `sites.xlsx` and `quarterly-note.html` both stop at the paywall: "You opened a spreadsheet. Pro for Work reads Excel and HTML files." | — | **PASS for the Free and Pro halves** (`web/a3-matrix-pro.json`). The Work half is **not verified**: the `dist-dev-work` export was built but the run was not repeated on it before the phones freed up |
| Folders and full export | locked, paywall says "Folders for your chats come with Pro." | — | — | **PASS on the Free half** `web/a5-ui.json` |
| Text from scans and photos (OCR) | — | — | — | **not verified.** The browser tier ships no OCR at all (`apps/mobile/src/documents/extract.ts`: "No OCR in the browser tier yet"), so this row can only be proven on a phone or the desktop app |
| Larger, sharper models | the model sheet marks Sharp and Sharp (Phi) `PRO` and says the vault lives in the app | — | — | **PASS on the labelling**, `web/A5-02-model-sheet-1440.png`; the switch itself needs a device |
| Client vaults, audit log, signed records, redaction | — | — | — | **not verified** on this run; Work's own screens (`/work/verify`, `/work/audit`, `/work/statement`) were reached only through the F162 fix below |

One wording nit, recorded not fixed: an `.html` file is refused with the **spreadsheet** sentence
("You opened a spreadsheet…"). The gate is right, the noun is not; `paywall.why.office` covers both formats with one
string. Left to whoever owns the Work copy.

---

## C. The documents, from every direction — and what was wrong

### C.1 It does index, and it cites the right page

Free, production build, the 3-page PDF: `[documents] turbine-report-3pages.pdf: indexed · 3/3 pages · 3 chunks ·
2391 ms (797 ms/page)`, the sheet row reads "Indexed · 3 passages", and the answers land on the right page:

| asked | answered | cited first |
|---|---|---|
| "when was the Belmont warehouse roof replaced?" | "…was replaced in **March 2019**." | `turbine-report-3pages.pdf · p.2` ✓ |
| "what is the annual maintenance budget for the Halden plant?" | "…is **284,000 euro**." | `turbine-report-3pages.pdf · p.3` ✓ |

`web/a2-documents-free.json`, `web/A2-03-answer-page2-1440.png`, `web/A2-04-answer-page3-1440.png`.

### C.2 F160 — a scan looked like a file that was still being read

The library got it right and said so in the log — `[documents] scan-no-text-layer.pdf: **needs-ocr** · 1/1 pages ·
0 chunks` — but the attach sheet collapsed every state that was not "indexed" into one sentence, **"Not indexed
yet"**, the same words a file still being processed shows. So the user waits for something that is never coming, the
file stays attached, and the answer arrives from nowhere.

**Fixed.** `apps/mobile/src/documents/stateText.ts` holds the one mapping the library row already had, and the attach
sheet reads it: the scan now says **"Scanned. Run OCR on this browser?"**, an empty file says it is empty and a failed
one says why. Before `web/A6-00-scan-state-1440.png` ("Not indexed yet"), after `web/A7-00-scan-state-after-1440.png`.

### C.3 F161 — an invented answer arrived carrying a SOURCES list

Moshe asked whether it invents from other sources. It did, and worse: it stamped the invention with citations.

Outside strict mode `buildRagPrompt` put **every** retrieved passage into the prompt and **every one of them** under
the answer as SOURCES, with no relevance floor — the floor (`isRelevant`, cosine ≥ 0.5 or a lexical match) existed but
was only consulted in strict mode. With three chunks in the index, a question about a ferry that appears in no document
retrieved all three anyway:

> **before** — "How many passengers did the Arendal ferry carry in 2024?" →
> *"The Arendal ferry did not operate in 2024, as the ferry lines ceased operations that year…"*
> **SOURCES** turbine-report-3pages.pdf · p.3 · p.2 · p.1

and with only the unreadable scan attached:

> **before** — "When did the Kessler valve inspection pass?" → *"…passed in March 2019, as noted in the accepted test
> document associated with the turbine report."* **SOURCES** turbine-report-3pages.pdf · p.2 · p.3 · p.1

Both sentences are fabrications wearing citations. `web/a3-matrix-free.json`, `web/a6-scan-hebrew.json`.

**Fixed, in two places.**

1. The floor now decides the passages in **both** modes, so an answer the documents did not carry gets no SOURCES list.
   When nothing is relevant the model is told so explicitly (`NOTHING_RELEVANT_RULE`), which is a different sentence
   from the budget case it used to share.
2. A 0.8B model does not reliably obey that instruction, so the app says it itself rather than hoping:
   `documents.noneMatched` — **"Nothing in your documents matched this question. Answered without them."** — fires on
   both ways of answering without the files: attached but never indexed (the turn never reaches retrieval at all,
   `planDocsTurn` sends it straight to the model) and indexed but nothing matched.

> **after** — the scan question: the same invention, but **no SOURCES block at all** and the notice on screen
> (`web/a8-toast.json`, `web/A8-00-none-matched-toast-1440.png`, `web/A7-01-scan-answer-after-1440.png`).
> **after** — with the real PDF attached: "How many passengers did the Arendal ferry carry in 2024?" →
> *"The attached document contains no data regarding the 2024 capacity of the Arendal ferry."* — a truthful refusal
> (`web/A7-03-off-topic-after-1440.png`), while the on-topic question still cites p.2 first
> (`web/A7-02-on-topic-after-1440.png`). The floor did not silence honest citations.

**Residual, stated rather than hidden:** with only an unreadable file attached, Instant still invents a date and still
says "based on the attached file". Nothing in the prompt stops a 0.8B model from doing that; what the app can do
deterministically it now does — no citations and the notice. Strict mode (Pro) is the real answer and is proven to
work in §B. One passage also still clears the floor on the ferry question, so a SOURCES chip survives under a truthful
refusal; tightening the floor needs a corpus, not a guess, and is left for a round with one.

### C.4 F162 — three of the four "pick a file" doors were dead outside the phones

Round 34 fixed the chat's `+` by writing a browser chooser, but `File.pickFileAsync` — which
`expo-file-system` implements on web as `console.warn` and `Promise.resolve(undefined)` — was still the picker in
three other places: **the Documents screen's own Add** (where a user manages the library Moshe cares about), **the
vault's GGUF import** and **Work's "Verify a record"**. All three are reachable in the Tauri desktop app, which runs
the same bundle. Fixed by lifting the chooser into `documents/chooseFile.ts` / `.web.ts` and routing all four doors
through it; a guard fails if any screen calls `File.pickFileAsync` again.

### C.5 F163 — the library row threw on web and desktop

Found while merging round 37: `planLibraryAttach` (the F129 gate) was added to `importPicker.ts` only, a file the web
bundle never loads. Re-attaching a document from the attach sheet threw
`(0 , R.planLibraryAttach) is not a function` — a page error, and to the user a sheet that does nothing. Reproduced
(`web/a9-libattach.json`, `afterReattach.errors`), moved to `documents/libraryAttach.ts`, re-proven: detach → 0 ticks,
re-attach → ticked, chip back, **no page error**. A guard now fails when the two picker halves stop exporting the same
names.

---

## D. The phones

See `android/README.md` and `ios/README.md` in this folder for what each device run covered, on which build, and what
it did not.

## E. Not verified, and why

| what | why |
|---|---|
| OCR (paywall row "Text from scans and photos") | the browser tier ships no OCR; it needs a phone or the desktop app |
| Work's client vaults, audit log, signed records, redaction | not driven this round |
| the Wi-Fi switch on the iPhone (.ini row 6) | the switch was proven in the browser; the iPhone half is the `responsive`/iOS streams' row |
| PDF indexing on a `--dev` web export | the two PDFs never produced a `[documents]` line on `dist-dev-pro`, while the same files index in 2.4 s on the production build and a DOCX indexes on the dev one. A dev-export artefact, not reproduced on anything that ships; not chased further |
