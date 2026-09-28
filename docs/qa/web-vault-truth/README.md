# Round 122 (F445): the web vault tells the truth about installed models

## Before: main e61f222a, lead's journey walk, 28.9

MosheAI read these screens from the lead's walk (`before-*-e61f222a.png`).

- `before-vault-e61f222a.png`: after Fast → Instant, the vault said *"The browser runs one model at a time, kept in its
  own private storage. Choosing another here replaces it."* Nothing was replaced: Privacy & storage read Models 2.69 GB.
  Fast was listed as *"Fast · 1.28 GB · Use this model"*, with no installed state and no Remove. The tier card printed
  *"533 MB · instant.gguf"*, and the Document index row read *"Not downloaded · 468 MB"* over a button *"Download · 468 MB"*.
- `before-model-sheet-e61f222a.png`: the sheet showed the same sentence, a bare *"1.28 GB"* over *"In use"*, and
  *"533 MB"* over *"Choose 533 MB"*.
- `before-door-from-sheet-e61f222a.png`: Instant's door, opened from the sheet, had no back arrow.
  `before-first-run-door-e61f222a.png` is the first-run door, which has one.

## After: branch `web-vault-truth`, `apps/web/dist` served by `scripts/serve-web.mjs` on 127.0.0.1:8845

Fresh chrome-headless-shell profile, models from the local models folder. The walk is `raw/proof.mjs.txt` and its log is
`raw/walk.txt`. No step failed and the page raised no errors.

| Step | What the screen said | Screenshot |
|---|---|---|
| First run downloads Fast, then the vault | tier card *"In use · 1.28 GB"*; Instant row *"Not downloaded · 533 MB"* | `after-01-vault-fast-in-use.png` |
| Model sheet | Fast *"In use · 1.28 GB"*; Instant *"Not downloaded · 533 MB"*, button *"Choose"* | `after-02-sheet-fast-in-use.png` |
| Choose Instant | Instant's door with the back arrow at the top left | `after-03-door-instant-back-arrow.png` |
| Press the arrow | back on `/`, chip FAST, Model sheet open | `after-04-back-on-the-sheet.png` |
| Choose Instant, Download | no arrow while bytes move, *"Cancel"* stays | `after-05-door-downloading-no-arrow.png` |
| Vault with both | tier card *"In use · 533 MB"* and *"To remove the model in use, switch to another one first."*; Fast *"Installed · 1.28 GB"* with *"Use this model"* and *"Remove"*; extension rows *"Not downloaded · 468 MB"* over *"Download"* | `after-06-vault-instant-in-use-fast-installed.png` |
| Privacy & storage | Models *1.81 GB* | `after-07-privacy-before-remove.png` |
| Remove Fast | inline *"Remove Fast from this browser? Using it again means downloading 1.28 GB."* with *"Remove"* and *"Cancel"* | `after-08-remove-confirm.png` |
| After Remove | Fast *"Not downloaded · 1.28 GB"*, no Remove; *"Used in this browser: 1.84 GB"* → *"563 MB"* | `after-09-vault-after-remove.png` |
| Privacy & storage | Models *533 MB* | `after-10-privacy-after-remove.png` |
| Model sheet | Instant *"In use · 533 MB"*; Fast *"Not downloaded · 1.28 GB"*, *"Choose"* | `after-11-sheet-fast-download-again.png` |
| Choose Fast | Fast's door, *"Download 1.28 GB"*, back arrow; the arrow returns to the sheet on INSTANT | `after-12-door-fast-again.png` |

OPFS before the removal held `fast.gguf` (1,280,835,840), `fast.gguf.json` (170), `instant.gguf` (532,517,120) and
`instant.gguf.json` (172). After it, only the two Instant files remained. Privacy & storage and the vault's used line
both dropped by 1.28 GB. `sm-*` are 500 px wide copies.

## The rule

Every line about a stored text model on the web comes from one OPFS walk, `opfsInventory` in
`apps/mobile/src/web/opfs.ts`. `inventoryStatus` gives the same verdict as `modelStatus`: ready when the
verified-download record matches the bytes on disk. The boot keeps that verdict per model, and `webStoredState` turns it
into in use, installed, half-downloaded or not here. The vault's rows, its tier card, the Model sheet's rows and the
door's list print that one state with the size once. Privacy & storage's Models figure is the same walk's total.

The model in use cannot be removed. Any other stored model, or a half-downloaded file, can be removed from the vault.
Remove deletes the GGUF, `<file>.json` and `<file>.state.json`, then walks OPFS again, and every open screen follows.
Photo packs keep their own Remove.

## Also found on the way

A browser holding Fast but no chats restarted onboarding when Instant was chosen from the sheet. The shell took "no
ready model and nothing kept" for a browser that cleared its data (F405), while Fast was still on disk. A stored model
now counts as kept data, so the door comes up instead. The first walk of this branch hit it before the fix.

## Tests

`apps/mobile/src/web/storedModels.test.ts`: 16 tests. On 81388866 the file cannot load, because
`storedModels.ts` and `doorReturn.ts` do not exist there. Its copy and wiring block run alone fails 6 of 6
(`red-81388866.txt`).
