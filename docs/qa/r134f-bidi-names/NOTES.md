# Round 134F · Hebrew and Arabic file names keep their order

Build 38 (J7-04, J7-27): `קובץ.pdf` showed as `pdf · p.1–2.קובץ` in a source chip and `pdf.קובץ` in the attached-file
row. Each of those lines took its direction from its first strong letter, the Hebrew one, so the line became RTL and
carried ".pdf" and the page across the name.

## What changed

- `packages/core` (`chat/language.ts`): `hasRtl` and `isolateName(name)`. `isolateName` wraps a name holding Hebrew or
  Arabic letters in **LRI…PDI** (U+2066 … U+2069). Latin and CJK names are returned unchanged, and a name that is
  already wrapped is not wrapped twice.
- **LRI, not FSI.** FSI picks the isolate's direction from the name's first letter, so the inside of the isolate is
  RTL and still reads `pdf.קובץ` (seen in Chrome, `web-chrome-bidi.png` was built from the same test page). LRI keeps
  the name laid out as typed.
- `apps/mobile/src/lib/fileNames.ts`: `nameLine(text)` returns `{ writingDirection: "ltr" }` when the text holds RTL
  letters. Every UI locale is LTR, so this does not flip a translated sentence. `shownCitationLabel` is
  `citationLabel` with the name isolated. The prompt, `wholeFile` and `TurnFacts.sources` keep calling the plain
  `citationLabel`, so the model never sees the marks.
- Where it is used:
  - Source chips, the passage sheet and the passage panel (`documents/Citations.tsx`): the isolated label plus
    `nameLine`.
  - The attached-file chip in the composer (`Chat.tsx`): `nameLine`. Its "Remove … from this chat" label and the
    "Could not import …" flash use `isolateName`.
  - The attach sheet row: `SheetItem` takes an optional `labelStyle`, and `AttachSheet` passes `nameLine`.
  - The Documents screen row (`DocumentRow`) and the details sheet name (`DocumentDetails`): `nameLine`.
  - The Ask sheet's "Searching 1 document: …" line (`AskDocuments`): each name is isolated before `joinList`, and the
    line gets `nameLine`.
  - The Documents screen's drop toasts ("Not added: …", "…: pictures are read as photos"): `isolateName`, and the
    toast line gets `nameLine`.
- **A name alone on its line** (attached chip, rows, details) gets the `writingDirection` style only, with no marks.
  The name gets both when it sits inside other text. The isolate keeps a neighbour from crossing the name
  (`קובץ, דוח` would otherwise swap). The LTR line keeps web's `dir="auto"` from making the line RTL: that rule does
  not skip isolates (`web-chrome-bidi.png`, first row against the second).
- The stored name is not changed. No hold card names a file, so none was touched.

## Proof

- Tests: `apps/mobile/test/fixes-r134f-bidi.test.ts` covers the helper on Hebrew, Arabic, Latin and CJK names, a chip
  label that isolates only the name while the prompt label stays plain, `nameLine`, and every render site using the
  helper. `fixes-r133a-section-chips.test.ts` now accepts `shownCitationLabel` in Citations.
- Gates in the worktree: `pnpm -r typecheck` ok, `pnpm lint` ok. `pnpm -r --no-bail test`: ui 23, i18n 24, mobile
  1433, core 1410 + 1 timeout. The timeout was `fixes-r114` "25 distinct verbs" at a load average of 122. Rerun alone
  at a lower load, it passed 27/27.
- iOS Simulator (iPhone 17 Pro, iOS 26.2, created for this run and deleted afterwards). Release build
  `com.inbornapp.mobile.qa` with `INBORN_PACKS=instant`, `EXPO_PUBLIC_QA=1`, `EXPO_PUBLIC_AUTOPROMPT=file` and
  `EXPO_PUBLIC_MODELS_BASE_URL=http://localhost:8792/v1`. The shell copied `../r132-doc-summary/fixtures/constitution-9pages.pdf`
  into the app's Documents as `קובץ.pdf`; the repo holds no Hebrew-named file. Scripts `c1` (onboarding), `c2`
  (attach, summary, attach sheet, Documents) and `c3` (the Ask sheet). All steps passed.
  - `sim/01-attached-row.png`: the composer chip reads `קובץ.pdf`.
  - `sim/02-summary-chips.png`: "Summary of all 9 pages.", then chips `קובץ.pdf · p.1–2`, `p.3–4`, `p.5–6`, `p.7–9`,
    in that order.
  - `sim/03-attach-sheet.png`: the row reads `קובץ.pdf`, "Indexed · 45 passages".
  - `sim/04-documents.png`: the Documents row reads `קובץ.pdf`, "PDF · 9 pages · 55.6 KB".
  - `sim/05-ask-scope.png`: "Searching 1 document: קובץ.pdf".
- Web: `web-chrome-bidi.png` is headless Chrome on a page that repeats react-native-web's output, a `div dir="auto"`
  with the style's `direction`. Without the fix the chip reads `pdf · p.1–2.קובץ`, the same as on the phone. With it,
  the chip, the cited chip, the row, a two-name list and the photo toast all keep their order.

## Not proven

- The Expo web app itself was not run. The web check is the Chrome page above.
- Android: `writingDirection` is an iOS (and web) style in React Native. On Android, a name alone on its line may
  still read `pdf.קובץ`. The isolated strings (chips, Ask line, toasts) would hold there, but Android was not run.
- No "before" capture on the simulator. The "before" picture is the Build 38 device pass, plus the first row of
  `web-chrome-bidi.png`.
- Arabic names, the passage sheet and the details sheet are covered only by the tests.
