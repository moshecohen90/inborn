# iPhone 13 Pro device pass on build 1.0.0 (20) — 27.9.2026

Build and install: `docs/qa/ios-build-20-2026-09-27.md`. Evidence for every row is in `docs/qa/ios-device-pass-20/`:
screenshots (`sm-*` are 500 px copies), each run's `result-p20*.json` with every step's verdict and value, the
scripts in `scripts/`, and the driver logs, container listings and archive checks in `raw/`.

**No XCUITest, no passcode sheet.** Every row was driven through the round-51 in-app QA bridge on
`com.inbornapp.mobile.qa`, built from the same commit as the store archive (622b6906), with both models bundled
exactly as the archive has them (`raw/qa-verify.txt`: Instant 532,517,120 B, photo projector 204,987,232 B, one
`INBORN_QA_BRIDGE_V1`). The store app `com.inbornapp.mobile` 1.0.0 (20) was only updated, launched on About, and left on
its first screen. The QA app was installed fresh, so its first launch is a true first launch, and it was uninstalled at
the end.

## The rows

| row | result | what the phone showed | evidence |
|---|---|---|---|
| store app **1.0.0 (20)** | **pass** | About reads `1.0.0 (20) · 622b690623f2`. Moshe's five container files were byte-identical across the update | `S01`, `raw/install20.txt` |
| first launch → onboarding | **pass** | Welcome → Model (*Instant · READY NOW · 533 MB · inside the app · nothing to download*) → Sealed → Lock offer → an empty sealed chat. The Lock step says *"No biometrics on this device: a passcode protects the app instead."* See the notes | `P01`–`P04`, `A01` |
| first answer, tokens/s | **pass** | *"A lighthouse serves as a beacon to guide ships through dark seas or illuminate paths during the night."* Ledger: **32.8 tok/s**, first token **835 ms**, 207 + 19 tokens, 30 ms per token, 1.4 s | `A02`, `A03`, `result-p20a.json` steps 29–41 |
| loop guard, repeat 5 times (F389) | **pass with round 97's wording** | *"Repeat exactly this sentence five times, each on its own line: …"* gave **five lines**, no loop notice. The shorter *"Repeat this sentence 5 times, each on its own line: …"* gave **one line** on both tries, also with no notice. The guard needs three copies before it can cut, so one line is Instant's own answer, not a cut | `L02` (5 lines), `L01`, `L03` (1 line) |
| Continue after Stop (F390) | **pass** | Stopped at *"…than before. The demand for"*. Continue: *"…The demand for The Portuguese expedition's arrival…"*, joined with one space. The continued text starts with the stopped text byte for byte (1,473 → 7,194 chars). Instant restarts a sentence on Continue, the model limit round 97 already noted | `K01`, `K02`, steps 74, 81 |
| a photo on the bundled projector | **pass** | A door as the message's photo, no hold card, no download: *"This image shows a simple, stylized illustration of a brown door with two rectangular panels and a circular doorknob…"* | `V01`, `V02` |
| .txt → index hold → e5 download → SOURCES | **pass** | The hold card: *"The attached file needs the document index model (468 MB) to be searched by meaning. Without it, only exact words are matched."* with **Download · 468 MB** and **Send, exact words only**. Download fetched e5 from models.inbornapp.com: 2% after 8 s, done in **about 5 min 11 s (≈1.5 MB/s)**, with auto-lock held off the whole time (`idleTimer` true, round 91). The held turn went out by itself: *"The heat pump was installed in October 2021."* under **SOURCES greenhouse-notes.txt · part 1** | `D01`–`D03`, steps 133–149 |
| .pdf → SOURCES | **pass** | *"The Rakovsky turbine serial number is RK-4417."* under **SOURCES turbine-report.pdf · p.1**. The library lists both files as Indexed (3 passages, 1 passage) | `D04`, `D05` |
| Documents → Ask, off-topic (round 108) | **pass** | *"Who won the 1998 football World Cup?"* over both files: an answer, then *"Nothing in your documents matched this question. Answered without them."*, no SOURCES, `search 64 ms · 0 passages · 38.4 tok/s`. Instant's answer is wrong (it says Argentina), the case round 108 put under the notice | `Q01`, `Q02`, `result-p20b.json` steps 19–21 |
| Documents → Ask, on-topic | **pass** | *"The Rakovsky turbine serial number is RK-4417."*, **SOURCES turbine-report.pdf · p.1**, no notice, 34.1 tok/s | `Q03` |
| vault → Extensions (round 105) | **pass** | The Extensions section holds **DOCUMENT INDEX** and **PHOTO PACK**. Photo pack: *"Included with the app"*, no Remove. Document index: *"Installed"* after the download, and after Remove on its Details screen *"Install · 468 MB from models.inbornapp.com"* | `X02`, `X03`, `X05`, `X06`, `result-p20b2.json` |
| Settings → Privacy & storage, true numbers | **fail on one row** | See below. Chats and Models are true, **Documents reads 0 B** | `G01`, `raw/qa-container-afterb.txt` |
| Delete everything → onboarding | **pass, with a bug** | The two-step sheet (*"Also delete downloaded models"* off by default), then onboarding again. But the onboarding opens under a warning banner: **"Chats could not be opened. Inborn started over and kept the old file instead of deleting it."** Reproduced twice. See below | `W01`–`W03`, `R01`, `R02` |
| crash reports | **none** | `pymobiledevice3 crash ls` lists no Inborn report | — |

### Privacy & storage: Documents always reads 0 B on a phone

The screen was read with both documents and e5 installed, and the container was listed right after
(`raw/qa-container-afterb.txt`).

| row | the app says | on disk | verdict |
|---|---|---|---|
| Chats · encrypted (SQLCipher) | 2.54 MB | `inborn.db` 4,096 + `-wal` 2,657,432 = 2,661,528 B = 2.54 MiB | true |
| Documents | **0 B** | `Documents/documents/`: 253 + 1,773 = 2,026 B. The Documents screen itself says *"2 documents · 1.98 KB on this device"* | **untrue** |
| Models · not backed up | 468 MB | e5 467,958,912 B | true (the two bundled models are part of the app, not its data) |

The cause is in the code, not the phone: `storageSizes.native.ts` returns `documents: 0` unconditionally. The passage
index lives inside the SQLCipher file, so it is already counted under Chats. Only the original files in
`Documents/documents/` are missing from the Documents row.

### Delete everything leaves a database it then calls unreadable

After Delete everything the app lands on onboarding, as it should, with the amber banner *"Chats could not be opened.
Inborn started over and kept the old file instead of deleting it."* It happened on both tries: once after the full
pass with documents (`W03`), and once on a fresh install with a single chat turn and no documents (`R01` → `R02`).

The user's data is gone. The 318 KB and 2.66 MB databases were deleted. What survives is `Documents/SQLite/inborn.db.corrupt-<time>` (+ `-shm`,
`-wal`) at **4,096 + 127,752 B**, byte for byte the size of the fresh database the next boot created beside it: an
empty schema, not the chats (`raw/qa-container-afterwipe.txt`, `afterwipe2.txt`). Something opened `inborn.db` with the
old key between the delete and the new key. The next boot could not open that file with its new key, renamed it
`.corrupt`, and raised the repair banner. A user who just chose to delete everything is told their chats could not be
opened. A likely candidate, **not proven**: the document index keeps its own keyed connection to the same file
(`documents/db.native.ts`, `useNewConnection: true`), and `wipeAll` closes only the chat store's connection. Not
fixed in this round (not a build or config issue).

### Notes, not failures

- **Thermal banner offers the model already in use.** During the photo and document rows the phone, charging, hit
  `thermal: serious`: *"Slowing down to keep the phone cool · SWITCH TO INSTANT"*, with Instant already the active
  model (`V01`–`D02`). `components/shell/Banners.tsx` adds that action unconditionally.
- **The held turn goes out before the file is re-embedded.** The .txt answer carried the banner *"Re-indexing finished.
  The answer above searched the files before that."* The hold released when e5 was ready, and the answer searched the
  words index while the file was re-embedded. The answer and its SOURCES were right.
- **"No biometrics on this device"** on an iPhone 13 Pro. The Face ID usage string is in both Info.plists; the line
  follows `isEnrolledAsync()`, so Face ID is most likely not enrolled on this phone. Not checked, since Settings are off
  limits.
- **Download speed is the network's.** 1.5 MB/s on the phone against 3.16 MB/s from the Mac, from the same URL at the same
  time while both shared the Wi-Fi (`raw/mac-e5-speed.txt`). Build 19 measured 0.09 MB/s; round 87's fix holds.
- A **model-advice** banner offered *"Install SHARP · 2.74 GB"* after the document answers (`D03`).

## The harness

Five runs: `p20a` 176 steps (169 passed), `p20b` 98 (96), `p20b2` 17 (17), `p20c` 18 (16), `p20r` 33 (33). Every red step
is the script's, not the app's:

- `p20a` steps 109–117 used the **web** vault's Extensions testIDs (`vault-extensions`, `ext-state-*`). The phone vault
  is a SectionList whose Extensions section holds ordinary model cards (`model-card-embed-e5`, `model-status-*`).
  `p20b` read those.
- `p20b` steps 89 and 95: a downloaded extension has no Remove on its card, only on its Details screen. `p20b2` removed
  e5 there. `X04` therefore still shows e5 installed.
- `p20c` steps 13 and 16: after the wipe the shell remounts and the bridge loses its anchor, so `waitFor` and `value`
  cannot read the tree. The screenshot step still ran (`W03`).
- **F268 again.** The first `p20r` launch pushed its script before the wiped app had recreated `Documents/qa/in`, so
  `devicectl` made it as uid 0 and the bridge never read it. Recovery per F268: uninstall and reinstall the QA app, then
  launch with `--boot 45000`.

## End state

The phone keeps `com.inbornapp.mobile` **1.0.0 (20)**, launched and left on its chat root (`S02-store-first-screen.png`).
`com.inbornapp.mobile.qa` was uninstalled. Every `devicectl … --console` launcher this stream started was killed by PID,
and no driver is left running. The older `com.inbornapp.mobile.uitests.xctrunner` from another stream was not touched.
