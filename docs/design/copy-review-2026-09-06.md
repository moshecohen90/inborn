# Copy review - en.json (source of UI strings)

Date: 2026-09-06. Reviewer: conversion-copywriter.
Scope: `packages/i18n/locales/en.json` (591 keys), reviewed against the spec voice:
`02-vision.html` §2.3 (product rules), `03-brand.html` §3.3-3.4 (positioning, voice),
`08-screens.html` (S01-S60 prescribed copy), `09-design.html` §9.9 (do/don't),
`10-edgecases.html` §10.5 (AI disclaimer, crisis card), `11-store-legal.html`
(AI-disclosure), `docs/store/listing.en.json` (approved store voice).

Headline finding: the file is already close to spec and clean of marketing tells
(no "military-grade", "bulletproof", "100% secure", "seamless", "unlock your potential",
"uncensored"). Changes are refinements, not rewrites. 18 strings changed.

## Changes

| # | Key | Before | After | Reason / spec ref |
|---|-----|--------|-------|-------------------|
| 1 | onboarding.disclaimer | THIS IS AI. IT CAN BE WRONG. CHECK IMPORTANT FACTS. | This is AI. It can be wrong. Check important facts. | Voice is "quiet, factual" (§3.3). Three shouted sentences under a button reads as alarm. S01 mock renders it sentence case; matches chat.canBeWrong. Rendered in a custom mono style, not the auto-uppercasing MonoLabel, so the caps were literal. |
| 2 | paywall.oneStore | One purchase per store: it unlocks every device signed into the same {store} account and does not carry over to another store. | One purchase per store. It unlocks every device signed into the same {store} account, and does not carry over to another store. | Remove colon-intro (brand rule); split one long clause into two calm sentences. |
| 3 | paywall.familySharing.iosOff | Family Sharing: not enabled yet for this product | Family Sharing is not enabled for this product yet. | Colon-intro -> full sentence; add terminal period. |
| 4 | paywall.play.acknowledge | ...within 3 days; open the app once after buying. | ...within 3 days. Open the app once after buying. | Semicolon joining an instruction -> two sentences (short-sentence voice). |
| 5 | paywall.grace | Last confirmed by the store; checked again automatically until {when}. | Last confirmed by the store. Checked again automatically until {when}. | Semicolon -> period. |
| 6 | paywall.revoked | ...Pro features are locked; your data stays. | ...Pro features are locked. Your data stays. | Semicolon -> period; the reassurance stands stronger as its own sentence (§2.3 honesty). |
| 7 | paywall.usdFallback | US price shown; the store shows your local price | US price shown. The store shows your local price. | Semicolon -> period; add terminal period to match sibling footnotes. |
| 8 | web.unknownMemory | ...does not report memory; starting with the smaller models. | ...does not report memory. Starting with the smaller models. | Semicolon -> period. |
| 9 | web.download.explain | ...It stays on this device; later visits need no network. | ...It stays on this device. Later visits need no network. | Semicolon -> period. |
| 10 | vault.manifest.bad | ...Downloads are off; import still works. | ...Downloads are off. Import still works. | Semicolon -> period. |
| 11 | chatSettings.thinkingOff | {model} answers directly; thinking is for larger models. | {model} answers directly. Thinking is for larger models. | Semicolon -> period. |
| 12 | chat.editHint | Edits this message and answers again | Edits this message and answers again. | Missing terminal period; sibling hints (chat.rememberHint, chatSettings.thinkingHint) end with a period. |
| 13 | paywall.familySharing.play | Family Library does not include in-app purchases | Family Library does not include in-app purchases. | Missing terminal period; sibling paywall.familyShared ends with one. |
| 14 | export.dialog | Export "{title}" (curly quotes U+201C/U+201D) | Export "{title}" (straight quotes) | Brand rule bans curly quotes (AI-tell). |
| 15 | vault.speed | ~{min}-{max} tok/s (en-dash U+2013) | ~{min}-{max} tok/s (hyphen) | Brand rule: plain hyphens, no fancy dashes. |
| 16 | personas.temperature | Temperature (0-2) (en-dash U+2013) | Temperature (0-2) (hyphen) | Same. |
| 17 | vault.state.waitingWifi | Wi-Fi (non-breaking hyphen U+2011) | Wi-Fi (plain hyphen) | Standardize; settings.downloads.wifiOnly already uses a plain hyphen. |
| 18 | vault.confirm.wifiOnly | Wi-Fi only (non-breaking hyphen U+2011) | Wi-Fi only (plain hyphen) | Same. |

Placeholders (`{...}`) and key names were left intact; the locale-completeness and
ICU/placeholder tests pass, and pseudo.json was regenerated.

## Deliberately NOT changed (and why)

- Middot separator "·" (55 uses, e.g. "SEALED · ON-DEVICE", "{engine} · {tps} tok/s"):
  spec-prescribed telemetry/mono style (§9.3, §9.5). The "no bullet" brand rule targets
  bulleted lists, not this separator. Kept.
- Ellipsis "…" (loading/progress: "Message…", "Restoring…"): standard UI typography on
  both platforms; not a marketing tell. Kept. (Open question 5 if ASCII is preferred.)
- "GGUF" (vault.import, vault.state.corrupt, desktop import): the S30 mock literally shows
  `[Import GGUF]` and "Not a valid GGUF". The vault/import surface is the enthusiast entry
  point (§2.2 hobbyist persona) and needs the precise term. Kept.
- "phone" on phone screens (onboarding.headline, chats.emptyHint, chat.canBeWrong): the
  spec deliberately says "this phone" on mobile (S01, S10, §9.9) and "device" in a few
  general statements (message 1, paywall.footer). This mix is intentional, not an error.
- ALL-CAPS mono labels (section headers, "ON-DEVICE", "SEALED", "READY NOW", etc.): the
  MonoLabel component applies textTransform:uppercase, so their literal case is cosmetic
  in JSON and matches the design (§9.3 mono labels are uppercase). Left as written.
- chat.stoppedBySystem / chat.loopDetected: no terminal period, because they share a
  render slot (AssistantMessage) with chat.stopped ("Stopped"), which has none.

## Open questions (spec silent or code change needed)

1. models.recommended = "RECOMMENDED FOR THIS PHONE" hardcodes "phone"; on a tablet it
   should read "tablet". It has no placeholder and the code does not pass {device}, so
   fixing it needs a code change. Options: change copy to device-neutral "RECOMMENDED FOR
   THIS DEVICE" (no code), or wire a {device} placeholder like vault.fits does. Left as-is.
2. chat.suggest.summarize = "Summarize text" vs spec S10 "Summarize a document". Kept
   "Summarize text" because the chip's prompt (chat.suggest.summarize.prompt) operates on
   pasted text and the free empty state must not point at the Pro Documents feature. If the
   chip is meant to open the attach flow, change it to "Summarize a document". (Key appears
   unused in the current mobile code.)
3. Pro / Work naming: buttons use short "Work" (paywall.unlockWork, paywall.work.title),
   while ownership/gate use the full "Pro for Work" (paywall.owned.work, gate.unlockWork).
   This is consistent by surface but confirm the canonical full name.
4. onboarding.disclaimer is styled in a 10px mono letter-spaced treatment. I set the copy
   sentence case (calm AI disclosure, per S01 mock). If design wants it visually uppercased
   like other mono labels, that is a styling decision; the copy should stay sentence case.
5. Ellipsis: keep typographic "…" (current) or switch to ASCII "..."? Kept "…".
6. Duplicate values, not errors: paywall.footer == paywall.privacyNote; paywall.features
   restates the Pro feature list as one line. Consolidating would need a code change.

## Glossary - canonical English term per concept (for translators)

Translate the concept, keep it consistent everywhere; do not vary these within a language.

| Concept | Canonical English | Notes |
|---------|-------------------|-------|
| Privacy state object (the ring) | Seal / Sealed / Unsealed / Sealing | "SEALED · ON-DEVICE". The only "AI is working" indicator. |
| Verification screen (S50) | Proof | Not "verification", "audit", "security". |
| Where models are stored (S30) | Vault ("Model vault") | Also "Client vaults" (Work). |
| Collapsed receipt under an answer | Ledger | Shows model, quant, context, ms/token. |
| Unsaved RAM-only chat | Incognito | "Not saved. Gone when you close it." |
| The "facts about me" store (S42) | Memory | Capitalized as a feature name. |
| Chat character profiles (S41) | Personas | Assistant, Writer, Tutor, Translator, + custom. |
| Chat grouping (Pro) | Folders | |
| Attached files library (Pro) | Documents | |
| Saved output reports (S13) | Reports | |
| Paid tiers (one-time) | Pro / Work | "Pro for Work" = full name of the Work upgrade; "Work" short. |
| Built-in always-available model | Instant | Ships in the app; works offline immediately. |
| Model friendly-name tiers | Instant / Fast / Sharp / Power / Studio | No parameter counts on cards (S02, S30). Numbers live in Details/Ledger. |
| Runs entirely on the device | on-device | Hyphenated; "ON-DEVICE" in mono labels. |
| The mobile thesis line | "Nothing leaves this phone." | Keep "phone" on phone screens; use "device" only where message 1 / paywall.footer do. |
| The proof ritual (S03) | Airplane test / "Prove it to yourself." | |
| Wireless network | Wi-Fi | Plain hyphen, capital F. |
| Price framing (S60) | one-time purchase | Never "once" in the price line. |
| Speed unit | tok/s | Use "first token" in user-facing readouts (Ledger), not "TTFT". |
| Imported model file | GGUF | Enthusiast import surfaces only (vault, desktop). |
| Device noun (interpolated) | phone / tablet / computer | via {device} (vault.device.*). |
| No data collection | "We collect nothing." / "Data Not Collected" | Store label per §11. |
