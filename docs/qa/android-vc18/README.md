# android-vc18 — evidence for Play internal release versionCode 18

Screenshots and node dumps behind the **vc18** release pass: the Android submission candidate built from `main`
**8033dce**, uploaded to the Play internal track as "1.0.0 (18)" and delivered to the OnePlus 6T by Google Play as
an **update in place over vc17**.

vc18 exists for one reason. MosheAI's sixth verdict found that `vc17`'s in-app Legal screens rendered raw
`{{PLACEHOLDER}}` tokens and made claims the code does not keep, and `main` now carries **fixes round 31 (F92–F96)**
that fill and correct those texts. So this pass adds three rows the earlier ones never had: **L1** reads the whole
Legal text off the phone, **L2** walks the document intake gate, and **H1** asks the same Hebrew question three
times because vc17 answered an "answer in Hebrew" prompt in English twice.

Where the write-ups live:

| document | what it holds |
|---|---|
| `docs/qa/purchases-run-2026-09-11.md` **§U** | build, gates, the upload, the Play update, every phone row incl. L1/L2/H1 |
| `docs/qa/soak-run-11-2026-09-22.md` | the half hour of continuous use on the 6T, with a ledger row per answer |

**One device, and that is the whole of this pass.** Every row is the **OnePlus 6T** (`<6t-serial>`, Android 11, 8 GB,
tier `ANDROID-LEGACY`), Moshe's personal phone, running the real Play build with real Play Billing. It is driven by
keys only (`adb -s <6t-serial>`, TAB / DPAD / ENTER / `input text`); taps are ignored on this phone. `input swipe`
is **not** ignored, which L1 needed and no earlier run had established.

## The files

| file | what it shows |
|---|---|
| `a-01-about-1-0-0-18.png` | About: **1.0.0 (18)**, commit **8033dce21dfc** — the phone naming the build every other row was taken on |
| `a-02-proof-out-0b.png` | Proof: `SEALED · ON-DEVICE`, **OUT 0 B · IN 0 B**, `CONNECTIONS 0 this session`, allowlist `none · the app has no internet permission` |
| `a-03-proof-after-soak11.png` | the proof screen after soak run 11: still `OUT 0 B · IN 0 B`, `CONNECTIONS 0 this session` |
| `b-01-vault-top.png` | vault head after the update: `4.8 GB in the vault · 12 GB free · RUNS ON: ANDROID-LEGACY · 8 GB` |
| `b-02-vault-all-packs.png` | vault foot after the 22-screen sweep that found **no `install-` node anywhere** |
| `c-01-instant-howto.png` | F39 lengths: Instant answering "How do I set up SSH keys on my Mac?" in 70 words |
| `c-02-fast-howto.png` | the same question on Fast: 73 words, 4 sentences |
| `d-01-attach-sheet.png` | attach sheet with Fast resident: **"FAST cannot look at photos. INSTANT is the one model here that can."** |
| `f-01-paywall-owns-pro.png` | **real Play billing**: YOU OWN PRO, Work upgrade **₪149.90 one-time purchase** |
| `f-02-restore-purchase-restored.png` | Restore purchases → **"Purchase restored"** |
| `g-01-normal-chat.png` | the control chat for the incognito test: codeword `MARLINSPIKE`, an ordinary saved chat |
| `g-02-incognito-open.png` | the new-chat sheet opened by `new-incognito`: `incognito-switch` `checked="true"` |
| `g-03-incognito-answer.png` | an incognito turn answering, codeword `QUILLONBRAE` |
| `g-04-chatlist-after.png` | chat list while the incognito session is alive — both codewords present |
| `g-05-chatlist-cold.png` | chat list after `am force-stop` + relaunch — `MARLINSPIKE` still there, **`QUILLONBRAE` gone** |
| `h-01…h-03-hebrew-*.png` | **H1**: the same Hebrew prompt in three fresh chats on Fast, answered in Hebrew all three times |
| `l1-01-legal-privacy.png` | **L1a**: the Privacy screen, head |
| `l1-02-legal-privacy-contact.png` | **L1a**: §12 Contact — **Cohen Apps**, support@inbornapp.com, +1-440-847-8502 |
| `l1-03-legal-terms.png` | **L1b**: the Terms screen, head — it opens at §1, because everything above the first heading is cut |
| `l1-04-legal-terms-bottom-no-owner.png` | **L1b → F97**: the foot of the Terms screen. No licensor, no phone, no effective date, and §14 pointing at "the effective date at the top" |
| `l2-01-first-pdf-attached.png` | **L2a**: the first PDF attached to a fresh chat |
| `l2-02-second-pdf.png` | **L2b**: the second PDF attached too — this account owns Pro, so the one-file cap is not a gate it can reach |
| `l2-03-work-format-gate.png` | **L2c**: the gate this tier *can* reach — **"Excel and HTML files need Pro for Work"** with the paywall rising behind it |
| `l2-04-attach-sheet-after.png` | the attach sheet afterwards: both PDFs `Indexed · 1 passage` |
| `legal-privacy-on-device.txt` | every line of the Privacy screen, 1,298 words, read off the device |
| `legal-terms-on-device.txt` | every line of the Terms screen, 1,444 words — the file F97 rests on |
| `f97-legalbody-proof.txt` | `legalBody()` run over both files: terms `Cohen Apps` file=1 rendered=**0** |
| `bundle-legal-grep.txt` | the shipped `index.android.bundle`, read as UTF-16: the legal facts present, every legal placeholder gone |

Screenshots are 500 px-tall copies. The full-resolution originals, the `uiautomator` node dumps, the logcat captures
and the soak CSVs stay in the session scratch dir and are not committed.

## What this folder does not contain

**Device-tier rows.** vc16's `e-*` files answered the 4 GB `ANDROID-ENTRY` questions on the Pixel 6 API 33 emulator.
That emulator belongs to another stream and the rule is one emulator per stack, so those rows were **not re-run**,
exactly as in vc17. Nothing in `main` between 239a268 and 8033dce touches the catalog, `ramFit()` or the paywall's
no-account path.

**A free-tier reading of the document gate.** See §U row L2: this Google Play account owns Pro, so the one-file cap
is not a gate this phone can reach. What the phone can reach, and what L2 therefore proves on it, is the sibling
Work-format gate.
