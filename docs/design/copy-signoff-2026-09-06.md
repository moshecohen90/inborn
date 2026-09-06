# Copy sign-off - en.json (shipping strings)

Date: 2026-09-06. Reviewer: conversion-copywriter. Branch: copy-signoff (from origin/main).
Scope: full pass over `packages/i18n/locales/en.json` (769 keys) against spec §3 (brand
voice), §8 (screens S01-S60), §9.9 (wording rules, {device}), §12.2-12.3 (paywall), §8.1
(onboarding). Also checked `docs/store/listing.en.json`.

Result: the file is in good shape. The privacy thesis, model-fit, and most banner strings
now use `{device}` correctly; the earlier copy-review fixes are merged. It is clean of
AI-tell typography (0 em/en dashes, 0 curly quotes, 0 non-breaking hyphens; the middot "·"
is the spec's telemetry separator, kept). 13 strings changed, all applied. Gates pass:
`@inborn/i18n test` (4/4) and `lint` (clean); pseudo.json regenerated (769 keys).

## Changes applied (key · current · proposed · why)

| # | Key | Current | Applied | Why |
|---|-----|---------|---------|-----|
| 1 | newChat.fits | FITS THIS PHONE | FITS THIS DEVICE | The other model-fit strings use {device} (models.recommended, vault.fits); this one is wrong on a tablet. Code passes no device var here, so device-neutral wording is the no-code fix. |
| 2 | device.throttling | Your PC is throttling | Your computer is throttling | Desktop ships on Mac too; "PC" is wrong there. Matches device.thermal.slowingComputer ("computer"). |
| 3 | chat.stats | {engine} · {tps} tok/s · TTFT {ttft} ms | {engine} · {tps} tok/s · first token {ttft} ms | "TTFT" is jargon; the Ledger already uses plain "FIRST TOKEN" (ledger.ttft). (Key is currently unused; fixed for when it is wired.) |
| 4 | paywall.pro.voice | Whisper dictation + hands-free voice | Hands-free voice and dictation | Sibling Pro bullets lead with the capability, not a model name. "Whisper" is jargon in a consumer paywall bullet (§2.3 plain language). Still honest: voice and dictation both ship as Pro. |
| 5 | paywall.pro.models | Larger models: Sharp and Sharp (Phi) | Larger models, Sharp and Sharp (Phi) | Drop the colon for consistency with the other bullets (which use "+"/commas, not colons). Both names are real Pro models in the catalog (sharp, sharp-phi), so both are kept. |
| 6 | reports.explain | ...Email one when you choose; Inborn never sends anything. | ...Email one when you choose. Inborn never sends anything. | Semicolon -> period (short-sentence voice, §3.3). |
| 7 | chat.attach.empty | ...in the library; it is indexed here, nothing is uploaded. | ...in the library. It is indexed here, and nothing is uploaded. | Semicolon -> period and fix the comma splice. |
| 8 | chat.attach.visionMissing | ...Install it once in the vault; it runs on this phone. | ...Install it once in the vault. It runs on this phone. | Semicolon -> period. |
| 9 | chat.image.permission | ...Allow it in Settings; photos never leave this phone. | ...Allow it in Settings. Photos never leave this phone. | Semicolon -> period. |
| 10 | vault.web.status.chrome | Chrome manages this model itself; nothing is stored by Inborn. | Chrome manages this model itself. Inborn stores nothing. | Semicolon -> period; active voice. |
| 11 | voice.endedQuiet | Ended: nothing was heard for a while. | Ended. Nothing was heard for a while. | Remove colon-intro; two calm sentences. |
| 12 | voice.paused.memory | Paused: memory is tight | Paused, memory is low | The colon was the outlier; siblings read "Paused <phrase>" (voice.paused.thermal/background/call). "low" is clearer than "tight". |
| 13 | desktop.update.available | Inborn {version} is ready. Install it from File › Check for Updates when you are ready. | Inborn {version} is available. Install it from File › Check for Updates whenever you like. | Removes the "ready...ready" repetition; keeps the no-nag, install-when-you-want tone. |

Placeholders and key names unchanged; the ICU/placeholder and locale-completeness tests pass.

## Checked and deliberately left as-is

- Store listing `docs/store/listing.en.json`: feature names match the app (incognito, screen
  lock, one-tap wipe, documents/PDF, voice, GGUF import, Qwen/Phi models, Pro one-time). Store
  copy uses "phone" on purpose (it targets a phone buyer). No change needed.
- Middot "·" separator (76 uses): spec telemetry style (§9.3). Ellipsis "…": standard UI. Kept.
- "GGUF" on vault/import/desktop: enthusiast entry point, matches the S30 mock. Kept.
- chat.modelLabel "{model} · ON-DEVICE AI": adds "AI" vs the S11 mock's "ON-DEVICE"; kept,
  because per-output AI labeling supports the EU AI Act §50 disclosure and is not off-voice.
- Spec-matching semicolons: airplane.stillZero, state.storageFull (both quoted verbatim in
  the spec). Left as written.
- Proof-screen technical readouts (proof.meter.*, airplane.meter.ios): dense on purpose; this
  is the "precise measurement" layer (§9). Left.
- chat.comingSoon / placeholder.comingSoon: unused keys; no contradiction with shipped voice.

## Open questions (spec silent, or would need a code change)

1. Voice and camera strings hardcode "this phone" (voice.onDevice "ALL ON THIS PHONE",
   voice.saySomething, voice.instantHint, voice.whisperMissing.body, chat.attach.visionMissing,
   chat.image.permission, and others). On an iPad these read slightly wrong. The code does not
   pass {device} to these keys, so switching to {device} needs a code change. Voice and camera
   are phone-first features, so "phone" is defensible for now. Decision: wire {device} into
   these calls, or accept "phone" on tablets.
2. paywall.pro.models names "Sharp and Sharp (Phi)". Both are real Pro models, but two items
   both called "Sharp" can read as a typo to a mainstream buyer. Confirm whether to keep both
   names or show one representative ("Larger models (Sharp)").
3. chat.stats is unused. Remove it, or wire it in (now that "TTFT" is fixed to "first token").

## Changed keys (for the five locales to follow)

newChat.fits, device.throttling, chat.stats, paywall.pro.voice, paywall.pro.models,
reports.explain, chat.attach.empty, chat.attach.visionMissing, chat.image.permission,
vault.web.status.chrome, voice.endedQuiet, voice.paused.memory, desktop.update.available
