# android-vc19 — evidence for Play internal release versionCode 19

Screenshots and node dumps behind the **vc19** release pass: the Android submission candidate built from `main`
**202db50**, uploaded to the Play internal track as "1.0.0 (19)" and delivered to the OnePlus 6T by Google Play as
an **update in place over vc18**.

vc19 exists for one reason. `vc18`'s own L1 row read the Terms screen off the phone and found it named **no
licensor, no phone number and no effective date** (**F97**); round 32 (`fixes-r27`) fixed that in `legalBody.ts`,
and this is the first Android build carrying the fix. So this pass is deliberately **light**: the full matrix ran on
`vc18` an hour earlier from the same `main` plus that one screen fix, and only the rows that name the build, the rows
F97 touched, and a short soak are repeated here.

Where the write-ups live:

| document | what it holds |
|---|---|
| `docs/qa/purchases-run-2026-09-11.md` **§V** | build, gates, the upload, the Play update and every phone row of this pass |

**One device.** Every row is the **OnePlus 6T** (`<6t-serial>`, Android 11, 8 GB, tier `ANDROID-LEGACY`), running the
real Play build. Driven by keys only (`adb -s <6t-serial>`, TAB / DPAD / ENTER / `input text` / `input swipe`); taps are
ignored on this phone.

## The files

| file | what it shows |
|---|---|
| `a-01-about-1-0-0-19.png` | About: **1.0.0 (19)**, commit **202db50abf36** — the phone naming the build every other row was taken on |
| `a-02-proof-out-0b.png` | Proof: `SEALED · ON-DEVICE`, **OUT 0 B · IN 0 B**, `CONNECTIONS 0 this session`, `Internet: none (not in the manifest)` |
| `a-03-proof-after-soak19.png` | the Proof screen after the soak: still **OUT 0 B · IN 0 B**, `CONNECTIONS 0 this session` |
| `l1-01-legal-terms-identity.png` | **the F97 proof.** The Terms screen, head: `Effective date: 22 September 2026`, `Licensor: Cohen Apps ("we", "us")`, `Contact: support@inbornapp.com or +1-440-847-8502…` — the three lines vc18 could not show |
| `l1-03-legal-privacy.png` | the Privacy screen, unchanged by the fix beyond gaining the effective date |
| `c-01-fast-howto.png` | one Fast answer, "How do I set up SSH keys on my Mac?" — 59 words, **6.3 tok/s** off the ledger card |
| `h-01-hebrew.png` | one Hebrew answer: 73 Hebrew characters, **0 Latin letters** |
| `legal-terms-on-device.txt` | every line of the Terms screen read off the phone, 52 lines / 1,600 words |
| `legal-privacy-on-device.txt` | every line of the Privacy screen, 56 lines / 1,323 words — §12 Contact still names Cohen Apps, the email and the phone |
| `bundle-legal-grep.txt` | the shipped Hermes bundle scanned for the same values, before the phone was touched |
| `soak19-sweep.txt` | the 10-minute soak's crash sweep: 0 fatals, 0 ANR, 0 process deaths, one pid throughout |

Screenshots are 500 px-tall copies. The full-resolution originals, the `uiautomator` node dumps, the logcat captures
and the soak CSVs stay in the session scratch dir and are not committed.

## One thing the reader had to learn

The first read of the Terms screen reported `MISSING :: Cohen Apps` while the line was plainly on screen.
`uiautomator` writes an attribute whose value contains a double quote in **single** quotes —
`text='Licensor: Cohen Apps ("we", "us")'` — and the reader matched `text="…"` only, so it dropped that node and no
other. Confirmed against the raw dump before anything was concluded, and the reader now accepts both quotings. Any
future driver that greps a node dump for text has the same trap waiting.
