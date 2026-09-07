# Content sign-off — 6 September 2026

Content-owner pass over the shipping app (main @ cbb3810) against spec §6 (models), §7 (feature map), §8.1–§8.5 copy, §10.5 safety, §11 legal, and the store listings. Follows the content review of the same date (commit 984bfa2, merged); all of its fixes verified intact on main. Tests 386 pass, lint clean, pseudo regenerated (no delta — no i18n key changed this round).

## Findings

| Area | Finding | Severity | Exact change |
|---|---|---|---|
| Legal screen (/legal) | The in-app Legal screen renders `privacy-policy.md` and `terms.md` verbatim from the first `##` on — which included the "Notes for the maintainer (delete before publishing)" sections. Internal lawyer notes were visible to every user. | **High** | **Fixed here**: notes moved to `docs/legal/maintainer-notes.md`; both rendered files now end at their last real section. No code touched. |
| Legal screen | 12 template placeholders render raw in-app: privacy shows `{{DOMAIN}}` ×5, `{{SUPPORT_EMAIL}}` ×2, `{{DEVELOPER_LEGAL_NAME}}`, `{{POSTAL_ADDRESS}}`; terms show `{{PRIVACY_URL}}`, `{{GOVERNING_LAW: Israel proposed}}`, `{{SUPPORT_EMAIL}}`. | **High — launch blocker** | Values are Moshe-only decisions (legal name, support address, domain, governing law with a lawyer). Fill in both files before any store build; nothing for me to invent. |
| Models §6.1 | Shipped catalog matches the spec for what exists: Instant/Fast/Sharp/Sharp (Phi) with the exact `goodFor` lines from the §6.1 table, correct battery tags, licences, vision flags, and honest companions (index, voice, photo). Power (T3) and Studio (T4) are not in the catalog. | Med (handoff) | `paywall.pro.models` already honestly says "Larger models: Sharp and Sharp (Phi)". Before Work or desktop promises "Power/Studio", the models stream must add signed catalog entries (manifest is Ed25519-signed; needs the signing key). |
| Models §6.1 | Whisper companion `goodFor` says "in any language" — an overclaim for whisper base (~99 languages, weak on low-resource ones). | Low | Cannot edit: the manifest is signature-covered. At the next catalog re-sign, change to "in 90+ languages". |
| Vault S31 | Details "Good languages" renders ISO codes ("en, zh, es, …") instead of language names — developer-speak in a plain-language screen. | Low | Code change (map codes via Intl.DisplayNames or i18n) — design/vault stream, not a copy edit. |
| §7 feature map | Paywall is honest by construction: `PAYWALL_BULLETS` only lists shipped, gated capabilities, and `sellable()` hides the Work card while Work has none. Every Pro bullet verified backed: documents + OCR (wired, `runOcr`), unlimited personas + memory, folders + export-all, larger models, Whisper + hands-free voice. | OK | None. |
| Work tier (being built) | What `work-tier` + `work-docs` must deliver before the Work card can appear (§7.9, §11.3): at least one gated Work capability + its `paywall.work.*` bullet keys; client vaults with a second code; redaction before paste; DOCX/XLSX/HTML intake; dictation to records; audit log + signed export; profession packs with fixed "verify before use" disclaimers on Work personas; the printable architecture statement; the Art. 50(4) note for professionals. Copy rule: never "HIPAA-compliant", never "privileged" (§11.3). Work exports keep the AI marking. | Info (handoff) | Listed for the two streams; I review their copy when it lands. |
| Personas / safety / exports | 984bfa2 intact: AI-identifying safety baseline, Translator direction+injection rules, extended crisis phrases and hotlines (AT/CH/BE/PT/NZ/IN), Art. 50(2) export marking with tests, "ON-DEVICE AI" label, Instant §6.1 line. Legal stream also fixed the web model-host paragraph I flagged. | OK | None. |
| New copy since last review | Documents, voice, vault-web, device-state and reports strings reviewed: consistent with §6.5's exact English lines (battery/thermal/charging), §7.3 strict mode ("says so instead of guessing"), §7.2 photo limits, S13/S14 unchanged. `chat.canBeWrong` now device-aware; onboarding disclaimer sentence-case per S01. | OK | None. |
| Airplane test | Suggested question "What's 17 × 23?" matches S03 but is a hardcoded EN constant in `AirplaneTest.tsx`. | Low | i18n stream: move to a key at the first localized release (already on the localization-debt list). |
| Hebrew expectations | Only Sharp (Pro) lists `he` in goodLanguages — honest. But nothing tells a Hebrew-typing Free user that Instant/Fast are weak in Hebrew, and §7.8's per-language model recommendation (e.g. DictaLM) has no catalog support. | Low now, Med before HE launch | Models stream: per-language recommendation when HE/AR join the UI languages. Not an EN-launch issue. |
| Store listings | Updated honestly since last review: model names now "Qwen and Phi, or import any GGUF (Gemma, Mistral, Llama)"; voice lines isolated in `voice_lines` for removal if voice slips (it shipped); screenshot subline fixed. AI disclaimer present in all 6 languages. | OK | Standing note: Apple keyword `deepseek` is a 2.3.7 rejection risk for an import-only model — ASO's call. |

## Changed in this pass

- `docs/legal/privacy-policy.md`, `docs/legal/terms.md` — maintainer-notes sections removed from the rendered files.
- `docs/legal/maintainer-notes.md` — new home for those notes (content preserved verbatim).
- No i18n key changed; no locale has anything to translate from this pass.

## Verification

- `pn test`: 386 pass (294 core, 80 mobile, 8 ui, 4 i18n). `pn lint`: clean. Pseudo: 769 keys, unchanged.

## Verdict

**Content sign-off: YES** for the shipping build — with two blockers that must close before store submission, neither of them a copy fix:

1. Fill the 12 legal placeholders (developer legal name, support email, domain, postal address, privacy URL, governing law, effective dates) — Moshe + lawyer.
2. Keep Work hidden until `work-tier`/`work-docs` ship real capabilities with reviewed copy (the code already enforces this; the deliverables list above is their contract).

## Addendum 7.9: Work copy (7 September 2026, main @ f1193c1)

Review of the Work-tier copy against §7.5/§7.6/§7.9 and §11.3. `packClaimsAreHonest` stays green for all four packs.

| Area | Finding | Severity | Exact change |
|---|---|---|---|
| Pack declarations | Excellent: each states what leaves the device (nothing), that output is a draft for a qualified professional, and that vaults/audit/signed exports "document, not certify". Legal correctly says the tool "does not create a privilege" (a disclaimer, not a claim — passes `\bprivileged\b`). Medical avoids naming HIPAA entirely. But the Art. 50(4) note that `ai-act-notes.md` §5 requires in the Work pack was missing. | Med | **Fixed**: one sentence appended to all four declarations: "If you publish AI-generated text on a matter of public interest in the EU, you must disclose that it is AI-generated (EU AI Act, Art. 50(4))." |
| Signed record (Markdown companion) | Assistant turns are labelled "AI" ✓, but the record itself carried no AI-generated marking line, unlike every other export since 984bfa2 — and Work exports must keep the marking (ai-act table). | Med | **Fixed** in `renderRecord`: "Generated with Inborn (on-device AI). Verify before use." after the header; test asserts it. The signed JSON itself has no `aiGenerated` field — adding one changes the hashed canonical shape, so that is the work stream's call at the next format version, not a copy edit. |
| Templates (16) | Reviewed all: consistently anti-hallucination ("[citation needed]", "[not documented]", "[confirm]", "[rule needed]", "only those listed", "do not add", "recompute every percentage"), right register per profession, no outcome promises. No changes. | OK | None. |
| Architecture statement | Facts-only, per-platform lines match the privacy policy, §6 disclaims certification without using a forbidden claim, "reviewed by a qualified person before use" present. No changes. | OK | None. |
| Verification instructions | Clear two-path verify (in-app + standalone Node one-liner), honest about per-install keys and wipe behaviour. No changes. | OK | None. |
| Paywall + moments | All five `paywall.work.*` bullets are backed by shipped code (vault.ts, audit.ts, signedRecord.ts, packs, statement.ts) — the blocker from the main review is closed; Work is now legitimately sellable. `work.moment.*` lines are honest and price-transparent. | OK | None. |
| Redaction + office intake | `redact.*` copy is precise ("The model never sees the originals", mapping "never written or exported") and matches the implementation's on-device claim; `documents.office.*` consistent with the intake feature. | OK | None. |
| Open note | When Work ships persona presets, each sensitive-domain persona needs its fixed "verify before use" disclaimer (§10.5 #37); today the pack declaration covers it. | Info | Work stream, later. |

Changed keys for the locales: **none** (edits were pack JSON and a code string; `en.json` untouched, pseudo unchanged).

Tests 422 pass (328 core), lint clean. Verdict unchanged: **Content sign-off: YES** — Work-copy blocker closed; the legal-placeholder blocker from the main review still stands.
