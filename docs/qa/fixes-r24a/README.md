# Fixes round 25 — evidence (`fixes-r24a`), 22.9.2026

Seven gaps from `docs/qa/spec-conformance-2026-09-22.md`: **1** (family-safe filter), **3** (verifiable-client
claim), **16** (Android backup copy), **19** (`/voice` tier gate), **20** (model licence texts), **21**
(disabled Pro rows), **33** (crisis phrases for ko and zh-Hant). Filed as **F50–F56**.

## What is in here

| File | What it proves |
|---|---|
| `tests.txt` | `pnpm test`, `pnpm typecheck`, `pnpm lint` on the finished branch. 831 tests pass (core 582, mobile 228, i18n 10, ui 11), against 742 on `main` |
| `sabotage.txt` | The negative control. Each of the seven fixes is broken in turn and the test that guards it is shown going red, then restored. A guard nobody has watched fail is not a guard |
| `family-safe-transcript.txt` | F50 run end to end through the shipped core modules and the real repository: the clause the prompt gains, the verdict on the request, the verdict on the answer, and what the database is left holding |
| `family-safe-transcript.mjs` | The script that produced it. `npx tsx docs/qa/fixes-r24a/family-safe-transcript.mjs` |
| `locale-keys.txt` | All 15 new strings in all 9 locale files, and all 4 removed strings gone from all 9 |

## What was NOT run, and why

**No device, no emulator, no simulator, no browser.** This stream had none: the one emulator belongs to
`android-vc16b`, the OnePlus 6T is reserved for it, and the brief forbids anything that touches the Mac's
screen. So every claim here is a test, a log or a transcript, and **none of the seven screens was seen**.

Specifically unverified, and what it would take:

| Not seen | Needs |
|---|---|
| The Family-safe switch in Settings → Chat, and the replaced answer with its note and ledger row | Any device or the web build |
| The licence sheet's scrolling text in the model card and the Licences screen | Any device |
| The Hugging Face licence acceptance before a download | A device with a network and an HF repo open |
| A Free account being bounced from `/voice` to the paywall by a deep link | A device on a Free tier build |
| The Android-only backup sentence | An Android device or emulator |
| That the family-safe clause does not degrade ordinary answers on a real 0.8B model | A phone, a soak run |

The last row is the one worth a real pass: the mode adds ~245 characters to every system prompt, and nothing
here measures what that does to a small model's answers or to time-to-first-token.

## The one judgement call in this round

Gap 1 offered two ways out: build a classifier (**L**), or delete the claim and re-answer both store
questionnaires (**S**). Neither was taken literally. What ships is a third thing, cheaper than a classifier
and honest about being so: a safety clause in the system prompt, plus a phrase check of the request before
generation and of the answer after it. It is written down as exactly that in the privacy policy, the terms,
the store answers and the spec, so there is one answer everywhere, which is what the gap demanded.

The reason not to ship a model: the spec's own candidate is ShieldGemma, which carries the Gemma terms and
would need an acceptance screen and a second download per language; an Apache-2.0 classifier is a week and
another few hundred megabytes on a phone whose promise is one model. **This is Moshe's to overturn** — it is
in README "Decisions for Moshe" with the other two open ones from this round.
