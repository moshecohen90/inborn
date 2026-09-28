# iPhone 13 Pro device pass on build 1.0.0 (28): the first-user journeys and the photo flow on the phone — 28.9.2026

Build 28 carries round 117 (each model sees photos with its own photo pack, one hold card with the whole cost, no
family-safe clause in the prompt) and round 118 (the word said again at the Continue seam goes) to Moshe's iPhone
(`docs/qa/ios-build-28-2026-09-28.md`). This pass walked the first-user journeys J1 to J10 on the `.qa` twin built from
the same commit, 46b8b6f4, then removed the twin and opened the store app. Evidence is in `docs/qa/ios-device-pass-28/`:

- `screens/` holds every screenshot at full size, and `sm-*` are 500 px copies.
- `raw/` holds each run's `result-*.json` and driver log, the memory samples (`mem-*.jsonl`), the container listings
  around the wipe, `j2-seams.json`, the gates, the archive checks, the install record, `summary.json` (every value,
  slow step and error per run) and `NOTES.txt` (the run's log, step by step).
- `scripts/` holds the bridge scripts, `make-scripts.py` (J1 to J8), `make-photos.py` (the three photos, seeded, so a
  rerun writes the same pixels), `seam28.py` and `summary28.py`. `photos/` holds the four photos and `fixtures/` the
  office-hours text file.

**No store upload.** Nothing went to TestFlight, App Store Connect or Play.

## The rows

| row | result | what the phone showed | evidence |
|---|---|---|---|
| store app **1.0.0 (28)** | **pass** | Opened only after the twin was uninstalled. About reads `1.0.0 (28) · 46b8b6f49049`. The byte copy was taken before the install, and all six files are byte-identical after it | `S01-store-about-28`, `raw/install28.txt` |
| J1 first answer, tokens/s | **pass** | *"A lighthouse signals ships and guides travelers safely around dark, uninhabited shores."* Ledger: **32.3 tok/s**, first token 782 ms, 156 + 16 tokens, 31 ms per token, 1.3 s, on Instant | `J1-01`, `J1-02`, `result-j1-first-answer.json` |
| J2 Stop, then Continue | **fail** (no word doubled; the stopped clause said again in both tries) | Both continued texts start with the stopped text byte for byte, and neither join doubles a word. Try 1 reads *"…This initial discovery The initial discovery of these seeds sparked…"*. Try 2 says the stopped sentence's *"connects the crankcase to the cassette"* again in its first sentence | `J2-*`, `result-j2-continue-*.json`, `j2-seams.json` |
| J3 four photos on Instant | **pass** (two misreads) | No card, no *"photo pack"* text, and none of the six banned phrases in any answer. All four answered on Instant with the bundled pack, 32.6 to 34.2 tok/s, first token 1.5 to 1.6 s. Answers verbatim below | `J3-*`, `result-j3-photo-*.json` |
| J4 Fast, then the CAT photo | **pass** | Fast from the model sheet took **9 min 25 s** on a fresh twin (J6 redo). The first try crawled at 0.04 MB/s, unexplained (below). The card read *"FAST needs its photo pack to see photos"* / *"One 668 MB download, then this photo sends by itself."* / **Download 668 MB** / **Switch to INSTANT** / *"Smaller, but less accurate with photos."* / *"Remove the photo"*. Download showed the bar and *"Downloading the photo pack: 8 of 668 MB."* The pack took **6 min 22 s**, the photo then sent by itself, and Fast answered *"The shape is a red circle (symbolizing the sun), and the word written underneath is "CAT.""* at 16.6 tok/s, first token **4,408 ms**. One process throughout, no jetsam, peak footprint 1,061 MB | `J4-*`, `result-j4b-fast-photo.json`, `mem-j4b.jsonl` |
| J5 a document | **pass** | *"What is the office phone number?"*: *"The office phone number is 555-0134."* with **SOURCES office-hours.txt · part 1**. *"What is the capital of Australia?"*: *"The capital of Australia is Canberra."* with *"Nothing in your documents matched this question. Answered without them."* | `J5-*`, `result-j5-documents.json` |
| J6 photo packs in the vault | **pass** (the size is on the card's detail line) | Re-run on a fresh twin. **PHOTO PACK FOR INSTANT** reads *"Included with the app"*. **PHOTO PACK FOR FAST** reads *"Installed"*, and its detail line reads *"Qwen3.5 mmproj 0.3B · 668 MB · F16 · Battery: Medium"*. No status line reads *"Installed · 668 MB"* as one string. Before the vault, Fast drew the same card, the pack took 5 min 5 s, and Fast answered *"The shape is a red circle, and the word written underneath is "CAT"."* | `J6-01-pack-instant`, `J6-02-pack-fast`, `J6-03-index`, `J6-10`, `J6-11`, `result-j6c-*.json` |
| J7 Privacy & storage | **pass** | Chats encrypted (SQLCipher) **2.92 MB**, Documents **111 B**, Models not backed up **2.42 GB** | `J7-01`, `result-j6-j7-vault-storage.json` |
| J8 Delete everything, models kept | **pass** | *"Also delete downloaded models"* left off. Welcome with no banner, a fresh 4 KB `inborn.db`, the three downloaded models and `vault.json` kept, no `.corrupt` file. A cold relaunch opened Welcome again with no banner | `J8-*`, `result-j8*.json`, `raw/container-*.txt` |
| J10 airplane | **skip** | The bridge has no network-off op, and airplane mode needs Control Center or Settings, which this pass may not touch | – |

J9 is not in this pass's list. The strip *"Slowing down to keep the phone cool"* shows on some screenshots, `J5-04`
among them. It is round 109's thermal line, on a phone answering back to back while charging.

## J2: Stop, then Continue

The script stops the answer 1.5 s after its first text, then presses Continue and reads the whole answer when it ends.

| try | stopped at | Continue added | on screen |
|---|---|---|---|
| 1, spice trade, 278 chars | *"…could be harvested without fire or plow. This initial discovery"* | *" The initial discovery of these seeds sparked an immediate commercial boom that would span several centuries…"* | no word doubled at the join. **The stopped clause is said again**, *"This"* now *"The"*, and the stopped sentence is left without its end |
| 2, bicycle gears, 316 chars | *"…a chain mechanism that connects the crankcase to the cassette, which sits within the frame of the rear derailleur and hub"* | *" A chain is a flexible link that connects the crankcase to the cassette, allowing the gears to mesh…"* | no word doubled at the join. **The stopped sentence's middle is said again**, and the stopped sentence is left without its end |

Round 118's claim holds: neither join says a word twice. Round 113's `restated()` in `loop.ts` drops a restatement
only when it is a suffix of the stopped sentence of at least 5 words or 24 code points (`RESTATE_WORDS`,
`RESTATE_CP`). Try 1's clause is 3 words and 22 code points, under both. Try 2 says a phrase from the middle of the
stopped sentence again, and `restated()` reads only its suffixes. `seam28.py` looks for the stopped sentence's last 4
words in the first sentence after the join, so it sees neither (`restatesStoppedClause: false` in `j2-seams.json`).
The finding comes from reading both answers. No join reads ",." or ";.", and no run logged a loop retry, cut or notice.

## J3: four photos on Instant

Each photo went in through the bridge's `image:` line, with one question. The photos are `photos/`, written by
`make-photos.py`: a shop receipt on a table, a street sign on a pole, a notes-app screenshot, and the repo's
`scripts/fixtures/photo/red-circle-cat.png` (a red circle with *"CAT"* under it), byte for byte.

| photo | question | answer, verbatim | misread | tok/s, first token |
|---|---|---|---|---|
| CAT | *"What colour is the shape in this photo, what shape is it, and what word is written under it?"* | *"The red circle contains the word 'CAT'. The circle itself is a red shape."* | the word is under the circle, not in it | 32.7, 1,625 ms |
| receipt | *"What is the total on this receipt, and how many items were bought?"* | *"The total on the receipt is 15.09 EUR, and five items were purchased: oat milk (2.49), sourdough bread (3.80), bananas (1.65), cheddar cheese (4.20), and orange juice (2.95)."* | **"EUR" is invented**: the receipt shows no currency. The total, the count and all five prices are right | 34.2, 1,596 ms |
| street sign | *"What does this street sign say, and which way does the arrow point?"* | *"The street sign says Cedar Avenue and points to the left."* | none | 32.6, 1,580 ms |
| screenshot | *"When does the pool open on weekends, and on which day is it closed?"* | *"The community pool opens at 7 a.m. on weekdays and 9 a.m. on weekends, while remaining closed every Monday for cleaning."* | none | 33.9, 1,504 ms |

Each run asserted that no `vision-hold` card was mounted 3 s after Send and after the answer, and that none of
*"The request specifies"*, *"I will focus"*, *"as an AI"*, *"family-safe"*, *"violence"* or *"self-harm"* is in the
answer. All passed. Round 117's claim, no family-safe clause narrated back, holds on these four. The memory sampler
saw one process, a peak footprint of 583 MB and a peak resident size of 1,149 MB (`mem-j3.jsonl`).

## J4: Fast, then a photo on Fast

**The Fast download.** The first leg, from the model sheet at 14:14:40, crawled: 27 MB at 14:24:55, 28 MB at 14:25:20
and 33 MB at 14:27:20, about 0.04 MB/s. No network link condition was active on the phone
(`pymobiledevice3 developer dvt condition list`), and the Mac fetched the same URL at 36 MB/s. The chain was stopped at
14:27 to measure the phone's network through the bridge (`result-n-*.json`):

| measure | value |
|---|---|
| `probeDownload` in the foreground, Fast's URL | 1.96 MB/s, 24.6 MB in 12.6 s |
| `probeDownload` in the foreground, the 2B photo pack's URL | 2.36 MB/s, 47.1 MB in 20.0 s |
| the vault after the relaunch | *"Paused · 0 B of 1.28 GB"*. Resume kept 33 MB: *"2% · 34 MB of 1.28 GB"* 15 s later |
| after Resume, every 15 s | 34, 53, 79, 115, 148, 190 MB: about 2.1 to 2.8 MB/s |
| the chat's model sheet open over the download | 250 to 438 MB in 75 s, 2.5 MB/s |
| the sheet closed, on the vault | 461 to 644 MB in 60 s, 3.0 MB/s |

The sheet is not what slowed the first leg, and the first leg's 0.04 MB/s is not explained. The resumed leg finished at
about 14:39:05, about 8 min 43 s after Resume. The J6 redo downloaded Fast again from the same sheet on a fresh twin:
Download at 15:07:02, 32, 69, 100 and 141 MB at 15 s steps, and **Use** at 15:16:27, **9 min 25 s** for 1.28 GB, about
2.3 MB/s (`result-j6c-1-fast-again.json`, `J6-10`). Pass 20 measured 1.5 MB/s on this phone and this Wi-Fi, and build 19
0.09 MB/s before round 87 moved iOS downloads into the app's own foreground session. Build 28 has round 87, and neither
the resume nor the fresh download slowed like that. The `probeDownload` op refused `speed.cloudflare.com` as *"not an
allowed model host"*, so no neutral host was measured from the phone.

**Not a lock, and not the sheet's keep-awake.** The phone was not locked during the crawl: `lockState` read
`passcodeRequired: false` at 14:24:48, mid-crawl. The twin's model sheet was on screen and lit at every observation:
14:14:40 (`J4-03`, 8 MB), 14:24:55 (`N00a-crawl-1424-sheet`, 27 MB), 14:25:20 (`N00b-crawl-1425-28mb`, 28 MB) and
14:27:20 (`N00c-crawl-1427-33mb`, 33 MB). Nothing was observed between 14:14:40 and 14:24:55, because J4a sat in one
long wait. Keep-awake covers this path: the chat's model sheet calls the vault store's `install()`, which holds the
screen awake on every progress event, as the vault screen does. J4a's own idle-timer read was lost with its result file.
Every status bar shows Wi-Fi and no cellular service; `devicectl` exposes only the phone's USB link to the Mac. The
download began at a normal rate, 8 MB in its first 6 s, and then moved 19 MB in about 10 minutes.

**The photo on Fast.** `j4a2-fast-use` chose Fast in the sheet (`J4-05`: the chip reads FAST). `j4b-fast-photo`
opened a new chat, put the CAT photo in and asked J3's question. The card came at once (`J4-06`), with the strings in
the table above, each asserted. Download was pressed at 14:40:03. Five seconds later the card read *"Downloading the
photo pack: 8 of 668 MB."* over a progress bar, and the shot a moment later shows 10 of 668 MB with *"Keep Inborn
open: the download pauses when you leave"* (`J4-07`). The idle timer was off. The card went at 14:46:25, **6 min 22
s** after the press, about 1.75 MB/s, and the photo sent by itself (`J4-08`). Fast answered:

> The shape is a red circle (symbolizing the sun), and the word written underneath is "CAT."

Colour, shape and word are right. *"(symbolizing the sun)"* is the model's own reading. None of the six banned phrases
is in it. Ledger: **16.6 tok/s**, first token **4,408 ms**, 185 + 21 tokens, 5.7 s, on FAST (`J4-10`).

**Memory.** The sampler read the twin every 5 s from 14:39:53 to 14:46:50: one pid, 17029, from start to end, so no
jetsam. Peak footprint **1,061 MB** at 14:46:24, as the pack loaded. Peak resident size 2,270 MB at 14:46:35. Two of 82
samples failed to read and are counted as failed. The same pid then ran all of J5, peak footprint 1,161 MB.

## J5: a document

`office-hours.txt` holds one line: *"Office hours: Monday to Thursday 9:00–17:00, Friday 9:00–13:00. Phone 555-0134.
Closed on public holidays."* Attached on Fast, the first question drew the index card: *"The attached file needs the
document index model (468 MB) to be searched by meaning. Without it, only exact words are matched."* with **Download ·
468 MB**, **Send, exact words only** and **Cancel** (`J5-01`). Download was pressed at 14:47:04, the card read
*"Downloading the document index model… 1%. Your message is sent when it's ready."*, and the message went at 14:50:17,
3 min 13 s later.

| question | answer, verbatim | under it |
|---|---|---|
| *"What is the office phone number?"* | *"The office phone number is 555-0134."* | **SOURCES** `office-hours.txt · part 1` |
| *"What is the capital of Australia?"* | *"The capital of Australia is Canberra."* | *"Nothing in your documents matched this question. Answered without them."* |

The bridge's `value` op reads the first match, so the second answer's text is in `J5-04`, which shows both exchanges.

## J6: photo packs in the vault

The first J6 run looked for the web vault's testIDs and failed (see *The harness*). It was run again on a fresh twin,
installed at 15:05:25, so this row also repeats J4 from the start:

1. **Fast from the model sheet** (`j6c-1-fast-again`, 40 of 40): onboarding, then Download at 15:07:02. The sheet read
   32, 69, 100 and 141 MB at 15 s steps (`J6-10` shows *"11% · 146 MB of 1.28 GB"*), and **Use** showed at 15:16:27,
   9 min 25 s later. Fast was chosen.
2. **The CAT photo on Fast** (`j6c-2-pack-and-vault`, 44 of 46): the card read the same title, body and Switch line as
   in J4. Download was pressed at 15:16:45, the card read *"Downloading the photo pack: 11 of 668 MB."* five seconds
   later, and it went at 15:21:50, **5 min 5 s** later, about 2.2 MB/s. The photo sent by itself, and Fast answered
   *"The shape is a red circle, and the word written underneath is "CAT"."* (`J6-11`). One pid, 17520, from start to
   end, peak footprint 1,000 MB (`mem-j6c.jsonl`).
3. **The vault**, each card opened with `/vault?focus=<id>`:

| card | status line (`model-status-<id>`) | the card's full text | shot |
|---|---|---|---|
| `vision-qwen35` | *"Included with the app"* | *"◉ PHOTO PACK FOR INSTANT Lets Instant look at your photos on this device. Qwen3.5 mmproj 0.4B · 205 MB · F16 · Battery: Medium Included with the app Details"* | `J6-01-pack-instant` |
| `vision-qwen35-2b` | *"Installed"* | *"◉ PHOTO PACK FOR FAST Lets Fast look at your photos on this device. Qwen3.5 mmproj 0.3B · 668 MB · F16 · Battery: Medium Installed Details"* | `J6-02-pack-fast` |
| `embed-e5` | none: not installed on this twin | *"○ DOCUMENT INDEX Lets Inborn search your documents on this device. multilingual-e5-large-instruct 560M · 468 MB · Q6_K · Battery: Low Install · 468 MB from models.inbornapp.com Details"* | `J6-03-index` |

The two failed steps are the script's, not the app's. Step 42 read `model-status-embed-e5`, which the card has only
once the model is installed. Step 45 asserted *"Installed · 668 MB"* as one string, and the native card puts the size
on its detail line instead. `J6-02` also shows **PHOTO PACK FOR SHARP** with a PRO mark and
*"Install · 672 MB from models.inbornapp.com"*.

**A catalog label to review.** The Instant pack's card says *"0.4B"* (`manifest.json` `"params": "0.4B"`). Its file is
204,987,232 B at F16, two bytes per weight, which is about 0.1B parameters. The Fast and Sharp packs' *"0.3B"* fit
their 668 and 672 MB.

## J7 and J8: storage and Delete everything

Privacy & storage read **Chats encrypted (SQLCipher) 2.92 MB**, **Documents 111 B** and **Models not backed up 2.42 GB**
(`J7-01`). The models line is the three downloads in the catalog's units, Fast 1.28 GB, the 2B photo pack 668 MB and the
index model 468 MB. Instant and its pack ship inside the app and are not in it.

J8 opened *Delete everything* from the same screen. The sheet reads *"Deletes every chat, the encryption key and every
document on this device. Nothing was ever anywhere else, so nothing can be recovered."* with **Also delete downloaded
models** left off (`value: false`, `J8-02`). After Continue and the second step:

| listing | lines | what it shows |
|---|---|---|
| `container-before-wipe.txt` | 132 | `inborn.db` with a 2.9 MB `-wal`, `documents/`, `documents.json`, `office-hours.txt`, the four photos, the three models, the bridge's `qa/` files |
| `container-after-wipe.txt` | 25 | a fresh 4 KB `inborn.db` (`-wal` 125 KB, `-shm` 32 KB). `Qwen3.5-2B-Q4_K_M.gguf` 1.19 GB, `mmproj-Qwen3.5-2B-F16.gguf` 637.3 MB, `multilingual-e5-large-instruct-Q6_K.gguf` 446.3 MB and `vault.json` kept. No `documents/`, `documents.json`, text file or photo. **No `.corrupt` file** |
| `container-after-relaunch.txt` | 16 | the same database and models; the bridge swept `Documents/qa`. No `.corrupt` file |

The phone showed Welcome with no *"could not be opened"* banner (`J8-03`). The cold relaunch read *"Nothing leaves this
phone. AI that runs on your device. No account, no cloud, and nothing you type ever leaves it."* with no banner
(`J8-04`, `result-j8b-cold-relaunch.json`).

`j8-delete-everything` steps 19 to 21 fail, as in passes 21 to 27. After the wipe the shell remounts and the bridge
loses its anchor (*"the QA bridge never got a fiber"*). `J8-03` was taken at step 18, before them, and
`j8b-cold-relaunch` read the same screen from a fresh process.

## The harness

Every row ran through the round-51 bridge on `com.inbornapp.mobile.qa`, built 14:04:41 to 14:08:09 from 46b8b6f4, the
store archive's commit. The twin carries one `INBORN_QA_BRIDGE_V1`, the same round 117 and 118 markers as the store
bundle, and Instant, its bundled pack and the catalog byte-exact (`raw/qa-verify.txt`). It was installed at 14:08:51.
The store app was not launched until the twin was gone.

1. **The first chain** was started at 14:08:56 from a foreground tool call and stopped at 14:09:05, before its first
   push, so that it could run detached. It had only launched the twin.
2. **J4a was stopped at 14:27** to measure the network (above). Its log and three shots are kept. It wrote no result
   file because it was stopped mid-run. `j4a2-fast-use` finished the leg.
3. **J6's first run used the web vault's testIDs.** `vault-extensions` and `ext-state-*` exist only in
   `VaultEntry.web.tsx`. The native vault lists packs as `model-card-<id>` and `model-status-<id>` in a SectionList,
   reached by `/vault?focus=<id>`. That run's seven failed steps are J6's only; its J7 steps passed.
4. **The J6 redo stalled twice.** J8b's sweep stops the bridge, and the next push went out without `--launch`, so
   `devicectl` created `Documents/qa/in` itself. The relaunched twin then never wrote `qa/out` or `boot.json`, and AFC
   refused to remove the folder (status 10). My watchdog killed only its subshell and left driver node 38322 running.
   It was fixed to kill the child too, and 38322, 63165 and 63177 were killed by PID. Recovery was pass 27's:
   uninstall the twin at 15:04:57, install it again at 15:05:25, which dropped its downloads, then onboarding, Fast,
   the pack and the vault again.
5. **The QA tier sticks at Pro.** J1 and every ledger read set the tier to Pro and back with the bridge's `setTier`.
   Back to free calls `pretendTier(null)` in `packages/core/src/licence/manager.ts`, whose `set({})` keeps the Pro tier
   the pretend wrote into `_state`. So the licence state stayed Pro while the entitlement was free: `J4-01` shows the
   sheet's **PRO** chip and Sharp installable, and `J4-06` shows *"FREE SENDS ONE PHOTO PER MESSAGE"*. The fresh twin
   in J6 shows FREE and Sharp locked. Only the QA runtime and the dev `DEV_TIER` call `pretendTier`, so the store app
   is not affected. No row depends on Pro: Fast, the 2B pack and the index model are not Pro-only in the catalog.
6. **Memory** was read with `pymobiledevice3 developer dvt sysmon process single` every 5 s during J3, J4b, J5 and the
   J6 redo. The first J6 run's shot `J6-01-vault-extensions` is kept with its result file.

## End state

- The phone keeps `com.inbornapp.mobile` **1.0.0 (28)**. After the twin was gone it was launched on About (`S01`,
  15:24:00) and then with `inborn:///chats`, and left on its Chats list (`S99-left-on-chats`). The list holds the store
  app's older chats.
- `com.inbornapp.mobile.qa` was uninstalled at 15:23:37, rc 0. `devicectl device info apps` then lists only
  `com.inbornapp.mobile` 1.0.0 (28) and the other stream's `com.inbornapp.mobile.uitests.xctrunner`, which was not
  touched.
- The phone was unlocked at the install and at 15:23 (`lockState`: `passcodeRequired` false), and no run met a lock. It
  was never locked or unlocked by this pass, and Settings, Control Center and Face ID were not touched.
- Every chain, driver, watchdog, sampler and launcher this pass started has exited or was killed by its PID. No
  simulator was booted, no XCUITest runner was started, and port 8787 was not touched.
