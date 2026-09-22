# android-vc17 — evidence for Play internal release versionCode 17

Screenshots and node dumps behind the **vc17** release pass: the Android submission candidate built from `main`
**239a268**, uploaded to the Play internal track as "1.0.0 (17)" and delivered to the OnePlus 6T by Google Play as
an **update in place over vc16**.

Where the write-ups live:

| document | what it holds |
|---|---|
| `docs/qa/purchases-run-2026-09-11.md` **§T** | build, gates, the upload that had to be done twice, the Play update, every phone row |
| `docs/qa/soak-run-10-2026-09-22.md` | the hour of continuous use on the 6T, with a ledger row per answer |

**One device, and that is the whole of this pass.** Every row below is the **OnePlus 6T** (`REDACTED-6T`, Android 11,
8 GB, tier `ANDROID-LEGACY`), Moshe's personal phone, running the real Play build with real Play Billing. It is
driven by keys only (`adb -s REDACTED-6T`, TAB / DPAD / ENTER / `input text`); taps are ignored on this phone. The
Pixel 6 API 33 emulator that carried vc16's device-tier rows belonged to another stream for the length of this run
and was not touched, so vc17 claims nothing about the 4 GB tier — see "What this folder does not contain".

## The files

| file | what it shows |
|---|---|
| `a-01-about-1-0-0-17.png` | About: **1.0.0 (17)**, commit **239a268a082b** — the phone naming the build every other row was taken on |
| `a-02-proof-out-0b.png` | Proof: `SEALED · ON-DEVICE`, **OUT 0 B · IN 0 B**, `CONNECTIONS 0 this session`, allowlist `none · the app has no internet permission` |
| `b-01-vault-top.png` | vault head after the update: `4.8 GB in the vault · 12 GB free · RUNS ON: ANDROID-LEGACY · 8 GB` |
| `b-02-vault-all-packs.png` | vault foot after the 22-screen sweep that found **no `install-` node anywhere** |
| `c-01-instant-howto.png` | F39 lengths: Instant answering "How do I set up SSH keys on my Mac?" in 96 words |
| `c-02-fast-howto.png` | the same question on Fast: 54 words, 3 sentences |
| `c-03-fast-hebrew.png` | Fast on "Answer in Hebrew: what is the meaning of the word shalom?" — answered in **English**, twice; see §T |
| `d-01-attach-sheet.png` | attach sheet with Fast resident: **"FAST cannot look at photos. INSTANT is the one model here that can."** |
| `f-01-paywall-owns-pro.png` | **real Play billing**: YOU OWN PRO, Work upgrade **₪149.90 one-time purchase** |
| `f-02-restore-purchase-restored.png` | Restore purchases → **"Purchase restored"** |
| `g-01-normal-chat.png` | the control chat for the incognito test: codeword `KESTREL`, an ordinary saved chat |
| `g-02-incognito-open.png` | the new-chat sheet opened by `new-incognito`: `incognito-switch` `checked="true"` |
| `g-03-incognito-answer.png` | an incognito turn answering |
| `g-04-chatlist-after.png` | chat list while the incognito session is alive — both `KESTREL` and `ZARFOLIN` present |
| `g-05-chatlist-cold.png` | chat list after `am force-stop` + relaunch — `KESTREL` still there, **`ZARFOLIN` gone** |

Screenshots are 500 px-tall copies. The full-resolution originals, the `uiautomator` node dumps
(`vault-sweep.txt`, `paywall.xml`, `f36-attach-sheet.xml`), the logcat captures and the soak CSVs stay in the
session scratch dir and are not committed.

## What this folder does not contain

**Device-tier rows.** vc16's `e-*` files answered the 4 GB `ANDROID-ENTRY` questions on the Pixel 6 API 33
emulator: the Sharp cards gated, Fast gated, the USD paywall fallback with no Play account, and Restore refusing
rather than granting silently. That emulator was owned by another stream throughout this run and the rule is one
emulator per stack, so those rows were **not re-run for vc17**. Nothing in `main` between 9da93a2 and 239a268
touches the catalog, `ramFit()` or the paywall's no-account path, so vc16's readings still describe this build —
but they are vc16 readings, and this pass does not restate them as vc17 evidence.

**An F row.** Nothing in this pass is a defect in the app. The one behaviour that looked like one — Fast answering
an "Answer in Hebrew" prompt in English, where vc16 answered in Hebrew — is sampling, not a regression: the diff
between the two builds touches no prompt, length or language code, and §T records both vc17 samples rather than
hiding the difference.
