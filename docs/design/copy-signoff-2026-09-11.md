# Copy sign-off - en.json (round 2, Work tier + delta)

Date: 2026-09-11. Reviewer: conversion-copywriter. Branch: copy-r2 (from main 2b11180).
Scope: every English line added or changed in `packages/i18n/locales/en.json` since the
2026-09-06 sign-off (`git diff 66d7331 HEAD`). 131 added lines, 1 removed (`chat.stats`),
8 `{device}` rewrites. Judged in render context (grep `apps/mobile/src`) against spec §3.3
(voice), §7 (Work tier), §12 (paywall copy rules), and the 2026-09-06 sign-off's rules.

Result: the delta is in good shape and consistent with the round-1 canon. 6 lines fixed,
the rest kept. No AI-tell typography in any new line (0 em/en dashes, 0 curly quotes; the
middot "·" and ellipsis "…" are the spec's on-brand separators, kept). The pinned
`device-policy.test.ts` strings were not touched. Gates pass: `typecheck`, `test`
(i18n 4/4 incl. locale-parity, core 348, mobile 93, ui 11), `lint` clean; `pseudo.json`
regenerated (890 keys).

## Fixes applied (key · verdict · old -> new · reason)

| # | Key | Verdict | Old -> New | Reason |
|---|-----|---------|-----------|--------|
| 1 | paywall.work.signed | FIX | `Signed export: verifiable records` -> `Signed, verifiable records` | Drop the colon (round-1 removed the colon from `paywall.pro.models` for the same bullet-consistency reason). "record" is the canonical output noun (`export.signed` = "Signed record", `verify.title` = "Verify a signed record"); the new line matches the sibling moment `work.moment.signed` ("Signed, verifiable exports") and the hint "verifiable anywhere". |
| 2 | vaults.removeVaultHint | FIX | `...chats stay; the passcode goes` -> `...chats stay. The passcode goes` | Semicolon -> period (short-sentence voice, §3.3; same fix class as round-1 #6-10). No trailing period, matching the immediate sibling `vaults.makeVaultHint`. |
| 3 | documents.office.explain | FIX | `...by sheet and row; saved web pages...` -> `...by sheet and row. Saved web pages...` | Semicolon -> period. Rest unchanged (honest: "on this device, never uploaded"). |
| 4 | vaults.lockedRow | FIX | `{count} chats · locked` -> `{count, plural, one {# chat} other {# chats}} · locked` | Grammatical number: a vault with one chat rendered "1 chats". ICU plural is the established pattern here (`redact.found`, `redact.apply`, `proof.sinceInstall`). Arg name stays `count`, so locale-parity passes. |
| 5 | audit.verified | FIX | `Chain verified · {count} entries` -> `Chain verified · {count, plural, one {# entry} other {# entries}}` | A freshly created vault has exactly one audit entry ("Vault created"), so "1 entries" was reachable. Same plural pattern. |
| 6 | verify.valid | FIX | `VALID · {count} messages · exported {date}` -> `VALID · {count, plural, one {# message} other {# messages}} · exported {date}` | Same grammatical-number fix for a one-message record. |

## Checked and deliberately kept as-is (notable)

- **The 8 `{device}` rewrites** (visionMissing, image.permission, transcribingHint,
  saySomething, instantHint, whisperMissing.body, offlineMissing.title, permission.body):
  KEPT and correct. This resolves round-1 open-question #1. `{device}` is supplied globally
  via i18next `defaultVariables` (`packages/i18n/src/index.ts:46`), so the call sites need no
  per-call arg and the strings do not render a literal "{device}".
- **`chat.stats` removal**: resolves round-1 open-question #3 (it was an unused, TTFT-fixed key).
- **paywall.work.packs / templates.hint** `Profession packs: legal, therapy, medical, accounting`:
  KEPT. This colon introduces a real 4-item list, which is correct English and the most
  scannable form for a feature bullet. It is not the banned teaser colon-intro ("New: ..."),
  and a comma would make "packs" read as a list item. It is the only enumerating bullet on the
  card, so the single colon is not an inconsistency.
- **Work paywall honesty**: `statement.row` ("Dated, printable, for a compliance file") and the
  Work bullets never claim "HIPAA-compliant" or "privileged" (§7 hard rule). The `work.moment.*`
  strings each show the feature plus one price line with "one-time" framing (§12.20; canon: never
  "once"). All correct.
- **Nouns** consistent with canon and siblings: vault, passcode, folder, record, installation,
  Pro for Work, VAULT/LOCKED/REDACTED mono tags, "one-time".
- **`redact.*`, `verify.*`, `audit.action.*`**: proof-forward and factual ("The model never sees
  the originals", "never message content", "the content was changed after signing"). Kept.

## Observation for the product/gating streams (not a copy fix)

`chat.attach.importHint` lists "PDF, Word, Excel, HTML, text, CSV or a photo", while the
Work gate card (`documents.office.*`) is titled "Excel and HTML files". If DOCX/XLSX/HTML are
Work-gated (§7) but PDF/text/CSV are Pro, the import hint enumerates formats across both tiers.
The copy is not dishonest (the importer accepts them; gating happens at the gate), but confirm
the intended tier split so the hint and the gate agree.

## Changed keys (for the i18n stream - new English values)

- paywall.work.signed = `Signed, verifiable records`
- vaults.removeVaultHint = `The folder and its chats stay. The passcode goes`
- documents.office.explain = `Spreadsheets become rows you can ask about by sheet and row. Saved web pages keep their headings and tables. Read and indexed on this device, never uploaded.`
- vaults.lockedRow = `{count, plural, one {# chat} other {# chats}} · locked`
- audit.verified = `Chain verified · {count, plural, one {# entry} other {# entries}}`
- verify.valid = `VALID · {count, plural, one {# message} other {# messages}} · exported {date}`

Verdict: APPROVED. 6 FIX, 125 KEEP. Placeholders and key names otherwise unchanged; ICU and
locale-completeness tests pass.
