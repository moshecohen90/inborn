# work-tier-6t — the $69.99 Work card, driven on real hardware (round 49, F215–F224)

The review of 24.9.2026 opened with this: *"Nobody has ever run the Work tier on hardware, and its three headline
bullets are the ones never driven."* Their only coverage was T48/T49/T50 on an **emulator on 11.9**, thirteen rounds
old, and `docs/qa/acceptance/README.md` §E still lists them as "not verified". This folder is that pass.

**One device.** Every row is the **OnePlus 6T** (Android 11, 8 GB, tier `ANDROID-LEGACY`). Moshe's own install
(`com.inbornapp.mobile`, Play 1.0.0 (20)) was **never touched**: the whole run is a second package,
`com.inbornapp.mobile.qa`, built `assembleDebug` from this branch against Metro on a private port, with
`EXPO_PUBLIC_TIER=work` so the licence hook reports the Work tier. It was uninstalled when the run ended.

Driven with the `a11y-drive` instrumentation APK (`apps/mobile/android-dev/a11y-drive`) plus `input text` and
`input keyevent`; this phone ignores injected touches.

## The Work card, bullet by bullet

`paywall.work.*` sells five lines and the compare table adds two more. Every one of them has a file here.

| what the card promises | verdict | evidence |
|---|---|---|
| the tier itself | **PASS.** The paywall reads **YOU OWN PRO FOR WORK** and the compare table's WORK column is on for every Work row | `w0-paywall-work.png` |
| *Client vaults with their own passcode* — create two | **PASS.** `Client Alpha` (code 1234) and `Client Beta` (5678), each folder wearing **Code / Unvault** | `w1b-two-vaults.png` |
| … lock | **PASS.** `Lock vault` → the header reads **LOCKED · 1 chat · locked** and the chat row is gone from the tree, not merely hidden | `w2b-vault-locked.png` |
| … wrong passcode | **PASS.** `9999` → **Wrong passcode**, field cleared, sheet stays open, nothing says which digit | `w2c-wrong-passcode.png` |
| … *their own* passcode | **PASS.** The **other vault's** real code (`5678`) on Client Alpha is refused the same way — per-vault salt, not one app code | `w2d-other-vault-code-rejected.png` |
| … unlock | **PASS.** `1234` → the vault reopens and the chat row returns | `w2e-vault-unlocked.png` |
| *Per-vault audit log, hash-chained* — verify | **PASS.** **Chain verified · 4 entries**: vault.created · Client Alpha, chat.moved-in · chat e03882f1, vault.locked, vault.unlocked. Entries name ids, never titles or content | `w3a-audit-verified.png` |
| … a tampered log is noticed | **PASS.** One byte flipped in the sealed `files/work/audit-<id>.bin` → **Chain broken at entry 1 (link)**. Restoring the file → **Chain verified · 4 entries** again | `w3c-audit-tampered-broken.png` |
| … the log and the signed file point at each other | **PASS.** After the signed export the log reads **6 entries** with `Signed export · chat e03882f1 · fad7b8315662…`, the record's own content hash | `w3d-audit-signed-export-linked.png` |
| … export | **PASS.** `Share as text` writes the plain-text log with the head hash | `audit-export.txt` |
| *Signed, verifiable records* — sign and export | **PASS.** `Export chat → Signed record` wrote `inborn-record-fad7b8315662.json`: Ed25519, the public key inside, the vault block with its audit head | `w4a-export-sheet.png`, `record.json` |
| … verify in the app | **PASS.** **VALID · 2 messages · exported Sep 24, 2026, 1:27 AM** | `w4c-verify-valid.png` |
| … a changed record is refused | **PASS.** One word of one message changed → **INVALID · the content was changed after signing** | `w4d-verify-invalid.png` |
| … verify **off the device** | **PASS.** The Node one-liner the app itself prints (`verificationInstructions()`), run on the Mac against the pulled file: `VALID`; against the same file with one word changed: `INVALID` | `record.json` + the recipe on the Verify screen |
| *Profession packs: legal, therapy, medical, accounting* | **PASS.** All four load, each with its declaration and four templates | `w5a-packs.png`, `w5b-pack-legal.png`, `w5b-pack-therapy.png`, `w5b-pack-medical.png`, `w5b-pack-accounting.png` |
| … a template actually works | **PASS.** Accounting → *Documents request email*, four blanks filled, inserted into the composer, sent: the answer is a real letter naming **Northgate Ltd**, the **3 October** deadline and the fixed-asset register | `w5c-template-filled.png`, `w5d-pack-answer.png` |
| *Printable architecture statement* | **PASS.** Renders with today's date, **Inborn 1.0.0 (build af4079681079) on android**, *Licence tier at print time: Pro for Work*, both vault names, and the very public key that signed the record above | `w6a-statement.png`, `statement.md` |
| *Excel and HTML import* (compare row) | **PASS for import and retrieval, PARTIAL for the Excel answer.** `bearings.xlsx` indexed **1 sheet · 1 passage**, `sitenotes.html` **2 parts · 2 passages**; one question over both cites `r49-bearings.xlsx · sheet 1` **and** `r49-sitenotes.html · part 2`. The HTML fact comes back exactly (*"the muster point is the Gate C car park"*). The Excel fact does not: asked for the part no. of SR-2, INSTANT answers **"SR-2"**, the row label, where the sheet says `BR-3311-LM`. Round 37 got `BR-3311-LM` from the same fixture on this phone, so this is INSTANT sampling, not the gate — and the app's own banner on this screen reads *"FAST is better at documents than INSTANT"* | `w7c-office-indexed.png`, `w7d-office-cited.png`, `w7e-xlsx-partno.png` |
| *Redaction before sending* (compare row) | **PASS.** `Dana Okonkwo` added to the names list, Names + Dates on → preview *"Draft a note to [NAME] about the inspection on [DATE]."*, `Replace 2 items` → composer `[NAME-1]` / `[DATE-1]`. The model answers in placeholders, so it never saw the originals; `Show originals` puts them back locally | `w9a-redact-preview.png`, `w9c-redacted-sent.png`, `w9d-show-originals.png` |
| *Answers only from your documents* (strict, Pro row) | **PASS both ways.** Strict on, a question the files do not answer → *"I could not find that in your documents."* under the **DOCS ONLY** marker — the localized sentence, not the raw sentinel. Strict off, same question → *"Lisbon."* | `w8a-strict-on.png`, `w8b-strict-notfound.png`, `w8c-strict-off.png` |

## Pro rows that had never been driven on this phone either

| row | verdict | evidence |
|---|---|---|
| *Custom personas* — Free caps at 3 | **PASS.** Four custom personas (`Auditor`, `Paralegal`, `Nurse`, `Bookkeeper`) saved and listed, no cap and no paywall | `w10a-personas.png` |
| *Memory across chats* | **PASS.** One fact stored (`FACTS (1)`), the custom personas appear under **USE MEMORY WITH**, and a **new** chat signs off *"Best, M. Cohen."* from that fact alone | `w10b-memory.png`, `w10c-memory-used.png` |
| *Detailed speed and token stats* | **PASS.** The ledger shows the two rows Free does not get: **13.6** tok/s and **7165 ms** TTFT, beside model / Q4_K / 238 of 4096 / 73 ms | `w10d-ledger.png` |
| *Folders* | **PASS.** Two folders created and a chat moved between them (the same run that made the vaults) | `w1b-two-vaults.png`, `w2a`→`w2e` |

## The one thing that had to be fixed to run this pass at all — F215

The chat row's action menu (Rename, Pin, Archive, **Move to folder**, **Export chat**, Delete) opens only on
`onLongPress`, and a React Native `Pressable` publishes no `ACTION_LONG_CLICK` to the accessibility tree. Every
long-press the driver performed answered `action 32 … -> false`, and the whole menu — including the two doors this
pass needed, *Move to folder* and *Export chat → Signed record* — was unreachable to any accessibility client. The
row's swipe actions (pin / archive / delete) **are** published, so the menu was the only blind spot.

Fixed in `apps/mobile/src/screens/Chats.tsx` with `accessibilityActions` + `onAccessibilityAction` for `longpress`,
and the new key `chats.more` in all nine locales. On the phone the same step then answered `action 32 … -> true` and
the menu opened — `f215-row-menu-after.png`. Guard: `apps/mobile/test/work-tier-r49.test.ts`, watched to fail
(remove the `accessibilityActions` line → 2 of its 3 tests go red).

## What the QA package cannot prove, and why

- **Prices.** This package has no Play products, so both tiers render as *" · one-time purchase"* with an empty
  price. The Play build shows the real ones (`docs/qa/purchases-run-2026-09-11.md` §S–§T).
- **Companion models.** Play asset delivery has no packs for this package id, so the document index model had to come
  from `scripts/serve-models.mjs` over `adb reverse` with `EXPO_PUBLIC_MODELS_BASE_URL`; the vision and speech
  companions were not installed, so photos, OCR and voice are not rows here. OCR is already proven on this phone in
  `docs/qa/attach-android/` (`tier-pro-ocr-indexed.png`, `tier-pro-ocr-cited.png`).
- **Vault wipe after failed attempts.** Not a Work-card promise and not built: the emergency wipe belongs to the app
  lock (the architecture statement says so in §4), not to a vault. Nothing here claims it.

## Traps this run paid for

- **A hand-pushed companion model is invisible on Android.** `PlayDelivery.locate()` only looks inside Play asset-pack
  paths, so `files/models/<file>` plus a hand-written `vault.json` entry is dropped on the next boot scan. The dev
  route is `EXPO_PUBLIC_MODELS_BASE_URL` + `scripts/serve-models.mjs`, which switches the store to `HttpsDelivery`.
- **Port 8791 was already taken** by another stream's server on `127.0.0.1`; binding `*:8791` succeeds and the phone
  still reaches the *other* server, which answers `HEAD 404 from localhost`. Pick a port nothing holds and check with
  `curl` before blaming the app.
- **A document keeps the state it was indexed under.** A file imported before the index model existed still reads
  "Install the document index model first" afterwards, and there is no re-index action — delete it and import again.
- **`adb reverse` is cleared when the adb server restarts** (another stream's emulator closing is enough). Re-add both
  the Metro and the model-host reverses before deciding the bundle is broken.
