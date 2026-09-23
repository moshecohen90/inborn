# android-vc20 — evidence for Play internal release versionCode 20

Screenshots behind the **vc20** release pass: the first Android build carrying the thirteen rounds merged on
23.9.2026 (34–43), built from `main` **bab0618**, uploaded to the Play internal track as "1.0.0 (20)" and delivered
to the OnePlus 6T by Google Play as an **update in place over vc19**.

`vc19` was the submission candidate, and it was built from `main` 202db50 — before the web pickers, the responsive
pass, the onboarding rework, the attach gate, the premium entrances, the model sheet, the site landing, the
legal-from-site block and the acceptance round landed. None of those had ever run on an Android release build. This
pass is the first time they have.

Where the write-up lives:

| document | what it holds |
|---|---|
| `docs/qa/purchases-run-2026-09-11.md` **§W** | the build, the gates, the upload, the Play update and every phone row of this pass |
| `docs/qa/qa-run-2026-09-11.md` **F180–F184** | the same rows as findings, including the driver traps that cost this run its time |

**One device.** Every row is the **OnePlus 6T** (`REDACTED-6T`, Android 11, 8 GB, tier `ANDROID-LEGACY`), running the
real Play build on Moshe's own licence, which owns **Pro**.

## The files

| file | what it shows |
|---|---|
| `a-01-about-1-0-0-20.png` | About: **1.0.0 (20)**, commit **bab0618d7782** — the phone naming the build every other row was taken on |
| `a-02-proof-out-0b.png` | Proof: `SEALED · ON-DEVICE`, **OUT 0 B · IN 0 B**, `CONNECTIONS 0 this session`, `Internet: none (not in the manifest)` |
| `a-03-proof-after-run.png` | the same screen after the whole pass: still **OUT 0 B · IN 0 B**, `CONNECTIONS 0 this session` |
| `m1-01-model-sheet.png` | **round 40's first device proof.** The Model sheet opened from the chat header chip: the `PRO` tier chip, `See what's in Pro`, the recommendation line, and the model rows each with `Good at:` and their language fit |
| `m1-02-model-sheet-rows.png` | the chat root after the sheet closed, header chip on INSTANT. Not a second view of the sheet: the sheet is `m1-01-model-sheet.png` |
| `m2-switched-fast.png` | after **one** tap on `model-sheet-use-fast`: the header chip reads **FAST** |
| `m2b-switched-instant.png` / `m2pre-switched-instant.png` | one tap back: the chip reads **INSTANT** again |
| `d1-01-f126-reading-notice.png` | **F126.** A 40-page PDF attached and asked about at once: *"Reading your document before answering…"*, 5 s after send |
| `d1-02-f126-cited.png` | the answer that follows: **ZR-4471-QX**, cited `vc20-northgate.pdf · p.30` |
| `d2-01-f161-none-matched.png` | **F161.** Strict off, a question the file does not answer: no SOURCES, and the notice *"Nothing in your documents matched this question. Answered without them."* — a 1,400 ms toast, filmed rather than polled |
| `d3-01-f137-not-found.png` | **F137.** The same question with `DOCS ONLY` on: *"I could not find that in your documents."* Both turns are on this one screen |
| `p-01-f125-door-described.png` | **F125.** The door photo on the **Photo** button: *"I see a simple brown door with a keyhole on the upper right…"* |
| `pw-01-paywall-from-settings.png` | **round 39.** Settings → `INBORN PRO` → the paywall with the `owned` block and the comparison table and **no** reason line, because nothing was refused |
| `pw-02-paywall-with-reason-office.png` | the same screen reached by a **locked** control: *"You opened a spreadsheet. Pro for Work reads Excel and HTML files."* |
| `lg-01-legal-terms-open-on-site.png` | **round 42.** Terms opens with `OFFLINE COPY · EFFECTIVE 22 September 2026` and **"Read the current version at inbornapp.com/terms"** |
| `pf-01-proof-airplane-link.png` | **F124b.** The Proof screen scrolled to `Run the airplane test`, with the BUILD line `1.0.0 (20) · bab0618d7782 · built 2026-09-23` above it |
| `pf-02-airplane-test.png` | where that link lands: the airplane-test screen |
| `h-01-hebrew.png` | a Hebrew question answered in Hebrew: 68 Hebrew characters, **0** Latin letters |

Screenshots are 500 px-tall copies. The full-resolution originals, the `uiautomator` node dumps, the logcat captures
and the ~2 fps frame series that caught the F161 toast stay in the session scratch dir and are not committed.

## Two things the reader had to learn

**The header chip cannot be read by grepping the screen.** The first cut of the model-switch row matched
`INSTANT|FAST|SHARP` anywhere in the tree and therefore matched the **model sheet's own row labels**, so it reported
`FAST → FAST` for a switch that had not happened yet and called it a pass. The chip is read from the `model-chip`
node's last text-carrying descendant, with the sheet closed, and the row was re-measured in both directions.

**This phone cannot be driven by keys alone any more.** The Chats screen's TAB focus ring is empty — every
`focused="true"` query answers nothing — and on Android the new-chat control is a FAB sitting under the soft
keyboard, so three attempts in a row logged `focus=[]` on a screen that was perfectly healthy. The pass is driven by
the `a11y-drive` instrumentation APK (`apps/mobile/android-dev/a11y-drive`), which acts on accessibility nodes by
view id in every window and reaches the system photo picker as well. Two sheet readers also had to learn to scroll
before believing a dump: the attach sheet's strict toggle is its last item and starts below the fold, so a driver
reading `checked=` off one dump gets an empty string, reads it as "off", and skips the row — it left strict **on**
across two turns of this run before the check caught it. Both driver packages were uninstalled at the end.
