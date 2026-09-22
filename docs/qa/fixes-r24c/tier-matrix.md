# Round 28 — the §7 tier matrix, row by row

Evidence for F72–F76. Every row below is the audit's own list in
`docs/qa/spec-conformance-2026-09-22.md` ("Eleven rows where the enforced tier is not the spec's tier", plus the
share-target row), answered against the spec text in `docs/spec-src/07-features.html`.

No device, emulator, browser or GUI was used in this round: the gates are pure functions and are proven by the unit
tests below, plus two source-scan guards that were watched failing before they were watched passing.

## The eleven rows

| §7 row | Spec tier | Was enforced | Now | Where |
|---|---|---|---|---|
| OCR on device, for scans and images (§7.3 row 3) | Pro | nothing — `runOcr` ran for everyone | `ocr` gate; the row's action opens the paywall and reads `Run OCR · PRO` | `DocumentsScreen.tsx` `ocrLocked`, `DocumentRow.tsx` |
| "Answer only from my documents" (§7.3 row 4) | Pro | nothing — the switch was open in two places | new `strictDocuments` gate, on both switches **and** on the prompt | `DocumentsScreen.tsx`, `AttachSheet.tsx`, `documents/hooks.ts` |
| CSV (§7.3 row 1 Free, row 5 Pro) | **Free as an attachment** | ungated | unchanged, and now inside `fileIntake` | ruling below |
| DOCX (§7.3 row 1 Free, row 8 Work) | **Free as an attachment** | ungated | unchanged, and now inside `fileIntake` | ruling below |
| XLSX (§7.3 row 5 Pro, row 8 Work) | **Work** | Work, at the picker only | Work at every door | `licence/intake.ts` |
| System file picker (§7.3 row 7) | Pro | Free, capped at one file | unchanged | ruling below |
| Camera (§7.2 image row) | Free one image · Pro several + live camera | Free one image | unchanged — the code already matches | `Chat.tsx` `addPhoto`, `limits().imagesPerMessage` |
| Memory read / edit / delete (§7.6) | Pro | only *add* was gated | every write is gated, deletion never is | `MemorySheet.tsx`, `Chat.tsx` memory read |
| Detailed statistics (§7.8) | Free basic · Pro detailed | all eight rows free | the four rows §7.1 names are Free; the rest are `detailedStats` | `Ledger.tsx`, `FREE_LEDGER_ROWS` |
| Screenshot blocking (§5.7 Pro vs §7.5 Free) | **Free** | Free, and a test locks it | unchanged; **the spec was corrected** | `docs/spec-src/05-architecture.html:95` |
| Panic wipe from the lock screen (§5.7 Pro vs §7.5 Free) | **Free** | Free | unchanged; **the spec was corrected** | `docs/spec-src/05-architecture.html:96` |

## Three rulings where the spec contradicts itself

The audit lists these as spec-internal conflicts that no implementation can be judged against until someone decides.
The code now encodes a decision; the §7 tables were **not** edited, because the brief limits spec edits to §5.7.
Each is a one-line decision for Moshe if he disagrees.

1. **CSV and DOCX are Free to attach.** §7.3 row 1 names `PDF/TXT/MD/DOCX/CSV/code` as the Free single attachment,
   which is more specific than row 5's "table understanding (CSV/XLSX) — Pro" and row 8's "DOCX/XLSX/HTML import —
   Work". Row 5 is read as the RAG capability inside the Pro library; row 8 as intake into a Work vault. A Free user
   who cannot attach the Word file the row promises would be the more visible bug.
2. **XLSX and HTML are Work, not Pro.** Row 8 names them by format; row 5 names the capability. The shipping code and
   `documents.office.*` already said Work, and nothing in the audit says the code is wrong here.
3. **The system picker stays Free.** §7.3 row 7 marks "import from Files / iCloud Drive / Google Drive through the
   system picker" as Pro, but row 1's Free attachment has no other way in. Row 7 is read as the Pro *library* built
   from those imports. Gating the picker would make row 1 unreachable.

## Proof

| what | file |
|---|---|
| The gate matrix, every tier × every kind, and the share payloads end to end | `packages/core/test/licence-intake.test.ts` (11 assertions) |
| No declared cut is still a gate key; the Free receipt is §7.1's four rows | `packages/core/test/licence-gates.test.ts` |
| No gate key is dead, and every intake door asks `fileIntake` | `apps/mobile/test/gates-wired.test.ts` |
| The intake guard **failing** with the share-target fix removed | `guard-red-share-target.txt` |
| The dead-key guard **failing** with one unwired key added back | `guard-red-dead-key.txt` |
| typecheck, 757 tests, lint | `tests-green.txt` |

## Not proven

Nothing in this round was seen on a phone, a simulator, an emulator or a browser. The paywall that each gate now
opens, the `PRO` chips on the strict switch and the memory panel, and the shortened ledger are all unobserved. The
next device pass should read: Free user shares an `.xlsx` from Files, Free user shares a second PDF into a chat that
already has one, Free user opens the ledger, Free user taps the strict switch.
