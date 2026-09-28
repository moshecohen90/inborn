# Round 123 (F446): screens say what is true

## Before: main e61f222a, the lead's journey walk, 28.9 13:54–14:00

MosheAI reviewed the lead's screenshots. The `before-*.png` files here are those screenshots, copied unchanged.

## After: branch `web-polish`, `apps/web/dist` served by `scripts/serve-web.mjs` on 127.0.0.1:8823

`shoot.mjs` walked a fresh chrome-headless-shell profile at 1280 × 900: onboarding with Instant from the local models
folder (31 s), the lead's 320 × 320 test photo (a red circle over the word CAT) with Instant's photo pack, Documents
with `office.txt`, the Ask sheet, Settings, Privacy & storage, and the wipe sheet, cancelled both times. Its log is
`after-notes.txt`. `sm-*` files are 500 px wide copies; the 390 px screenshot is copied at its own width.

| Screen | Before | After | Files |
|---|---|---|---|
| Documents, index model card | "Searching your documents needs a small on-device model (468 MB). It runs here and never uploads a word." | "Exact-word search works now. The document index model (468 MB) adds search by meaning: it finds passages worded differently from your question, or in another language. Worth it for long files. It runs here and never uploads a word." | `before-documents-added.png`, `after-documents-added.png` |
| Documents, footer | "INDEXED ON THIS DEVICE · indexeddb" | "Indexed on this device" | same |
| Documents, Free limit | "Add file · PRO" with no word about the limit | "Free: 1 document of up to 20 pages · Pro: no limit" under the header, before and after the first file | `after-documents-empty.png`, `after-documents-added.png` |
| Ask sheet, timing line | "search 1 ms · 1 passages · answer 16683 ms · 14.6 tok/s · prompt 287 tokens" | not shown on Free; shown with Pro's detailed stats, the chat ledger's gate | `before-ask-answer.png`, `after-ask-answer.png` |
| Ask sheet, "Answer only from my documents" | a working switch with no PRO tag, while the panel showed PRO | PRO tag and the panel's gate: on Free the switch opens the paywall and the question is asked without strict mode (from the code; the switch was not tapped in this run) | `after-ask-sheet.png`, `after-ask-answer.png` |
| Sent photo | 160 × 120 box, cover: the word CAT cut in half | the photo's own shape inside 240 × 180, contain: 180 × 180 for this photo at 1280 and at 390 | `before-photo-bubble-1280.png`, `after-photo-bubble-1280.png`, `after-photo-bubble-390.png` |
| Photo hint in the composer | "FREE SENDS ONE PHOTO PER MESSAGE" (mono, all caps) | "Free: one photo per message" (sentence case) | `before-photo-pick.png`, `after-photo-pick.png` |
| Settings on the web | "Hide in app switcher / Not available in a browser." (switch on), "Screenshot protection / Not available in a browser." (switch off), "Delete everything after failed unlock attempts" with no lock | the two browser rows are gone; the failed-unlock row shows once a lock is on | `before-settings.png`, `after-settings.png` |
| Privacy & storage | "Browser cleanup" with no value; "Reports 0 B" with no line | "Browser cleanup … May be cleared" (Protected / May be cleared / Unknown); "Reports / Answers you reported, kept on this device / 0 B" | `before-privacy-storage.png`, `after-privacy-storage.png` |
| Delete everything, last step | "This cannot be undone. The app restarts as if just installed." | models kept: "This cannot be undone. Chats, the key and documents are deleted and Inborn starts over. Downloaded models stay." Models ticked: "This cannot be undone. Chats, the key, documents and downloaded models are deleted and Inborn starts over." The two steps are unchanged. | `before-wipe-step2.png`, `after-wipe-step2-models-kept.png`, `after-wipe-step2-models-ticked.png` |

The bubble measure in `after-notes.txt`: box 180 × 180 for a 320 × 320 image, at both widths. The log also carries a `bg` field that the committed `shoot.mjs` no longer prints; it was dropped after the run to pass lint.

The Free limit comes from the code, not from a typed number: `limits("free").filesPerChat` (1) and `FREE_PAGE_CAP`
(20 pages, `apps/mobile/src/documents/library.ts`).

## Tests

`apps/mobile/test/screens-truth-r123.test.ts`: 12 tests. All 12 fail on the 81388866 sources (`red-81388866.txt`) and
pass on this branch (`green.txt`). `apps/mobile/test/fixes-r94.test.ts` no longer expects the web line of the
app-switcher row, which is gone with the row.

## Not covered

No phone was run. The Documents copy, the Ask sheet gate and the photo bubble are shared code, and the mobile unit
tests pass, but no iOS or Android layout was looked at. Safari and Firefox were not run. The failed-unlock row with a
lock on was checked in the unit test only. Instant's answers in these screenshots are wrong in places (the word under
the circle, a hedge about the phone number); that is the model, not these screens.
