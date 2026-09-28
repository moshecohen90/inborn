# iPhone 13 Pro device pass on build 1.0.0 (30): round 124 on the phone — 28.9.2026

Build 30 carries rounds 124 and 125 to Moshe's iPhone (`docs/qa/ios-build-30-2026-09-28.md`). Round 124 touches the
phone in four places: the documents answer's prompt (F449), the Instant photo pack's label (F450), the hold card's
switch label (F451) and the build stamp (F452). Round 125 changes only the web's CPU photo path. This pass reran the rows
those rounds touch, plus J1 to J3, on the `.qa` twin built from the same commit, cdaf1ca5, then removed the twin and
opened the store app. The lead then added J8 (Delete everything and a cold relaunch): the same twin was installed again,
J8 ran on it, the twin was removed again and the store app was opened again. Evidence is in `docs/qa/ios-device-pass-30/`:

- `screens/` holds every screenshot at full size, and `sm-*` are 500 px copies.
- `raw/` holds each run's `result-*.json` and driver log, `j2-joins.txt` (the format of
  `docs/qa/continue-prefill/joins.txt`) and `j2-joins.json`, the twin's container listings around the wipe
  (`container-*.txt`), `j8-frames.txt` (the pixel check of every Welcome shot), the gates, the archive checks, the
  install record and `NOTES.txt` (the run's log, step by step).
- `scripts/` holds the bridge scripts, `make-scripts.py` (writes them, J8's included), `joins30.py` (writes the joins
  files) and `frames.py` (the black-frame check).
  `photos/red-circle-cat.png` is the repo's `scripts/fixtures/photo/red-circle-cat.png`, byte for byte, and
  `fixtures/office-hours.txt` is pass 28's.

**No store upload.** Nothing went to TestFlight, App Store Connect or Play.

## The rows

| row | result | what the phone showed | evidence |
|---|---|---|---|
| store app **1.0.0 (30)** | **pass** | Opened only after the twin was uninstalled. About reads `1.0.0 (30) · cdaf1ca562fc`, the stamp from round 124's generated file. The byte copy was taken before the install, and all six files are byte-identical after it | `S01-store-about-30`, `raw/install30.txt` |
| J1 first answer, tokens/s | **pass** | *"A lighthouse is a beacon of guidance and safety for ships navigating dark seas."* Ledger: **32.1 tok/s**, first token **777 ms**, 156 + 15 tokens, 31 ms per token, 1.2 s, on Instant | `J1-01`, `J1-02`, `result-j1-first-answer.json` |
| J2 Stop, then Continue (knight) | **pass** | Stopped at 171 characters, *"…His face was etched with scars from battles lost to"*; Continue went on *" darkness, and his boots were covered in mud…"*. The stopped text is kept byte for byte, nothing is said twice | `J2-1*`, `result-j2-continue-1.json`, `raw/j2-joins.txt` |
| J3 the CAT photo on Instant, run 1 | **fail** (no colour named) | No card, no *"photo pack"* text, none of the six banned phrases. *"The shape is a circle, which is commonly known as a dot in some contexts. The text below it reads "CAT"."* It names the circle and CAT but not red, so 44 of 45 steps passed | `J3-cat-*`, `result-j3-photo-cat.json` |
| J3 run 2, the same steps | **pass** | No card, no *"photo pack"* text, no banned phrase. *"The image shows a red circle (shape) with "CAT" written underneath it."* 45 of 45 | `J3-cat2-*`, `result-j3-photo-cat-2.json` |
| J5 a document, on Instant | **pass** | *"What is the office phone number?"*: *"The office phone number is 555-0134."* with **SOURCES office-hours.txt · part 1**, and no sentence about instructions, rules or general knowledge. *"What is the capital of Australia?"*: *"Australia's capital city is Canberra."* with *"Nothing in your documents matched this question. Answered without them."* | `J5-*`, `result-j5-documents.json` |
| J6 the Instant photo pack in the vault | **pass** | **PHOTO PACK FOR INSTANT**, detail line *"Qwen3.5 mmproj 0.1B · 205 MB · F16 · Battery: Medium"* (build 28: 0.4B), status *"Included with the app"* | `J6-01-pack-instant`, `result-j6-vault-packs.json` |
| J8 Delete everything, models kept | **pass** (the bridge loses the tree after the wipe, as in passes 21 to 28) | *"Also delete downloaded models"* off (`value: false`). After the wipe, Welcome, *"Nothing leaves this phone."*, with no error banner, and no `.corrupt` file in the container. The index model (446.3 MB) and `vault.json` are kept; the chat, `documents/` and the text file are gone. A cold relaunch (`--boot 45000`) opens Welcome again with no banner. All four Welcome shots were taken after the Welcome testID was mounted and are rendered frames, not black ones | `J8-*`, `result-j8*.json`, `raw/container-*.txt`, `raw/j8-frames.txt` |
| J4 Fast, then the CAT photo | **skipped** | The brief runs J4 only if Fast downloads in under 3 minutes on the first try. The model sheet read *"10% · 139 MB of 1.28 GB"* at 60 s and *"35% · 454 MB of 1.28 GB"* at 180 s, with no **Use**. So *"Switch to FAST · installed"* (F451) was not seen on the phone | `J4-probe-*`, `result-j4-probe-fast.json` |

## J2: Stop, then Continue

The run opened a new chat on Instant, asked *"Tell a short story about a knight who fears the dark."*, pressed Stop
1.0 s after the answer text appeared, pressed Continue and read the whole answer when it ended. It passes when the final
text starts with the stopped text unchanged and the continuation goes on from the cut: no word said twice, no clause said
again, no new sentence that starts the topic over.

| stopped at, chars | first 8 words after the cut | kept | after Continue: first token, tokens, tok/s | verdict |
|---|---|---|---|---|
| 171, *"…scars from battles lost to"* | darkness, and his boots were covered in mud | true | 40 ms, 186 + 71, 37.8 | pass |

The final text, verbatim from the screen; ⟦…⟧ is what Continue added:

> Once upon a time, in the shadowed lands of Oakhaven, a knight named Silas stood guard at the gates of the great
> castle. His face was etched with scars from battles lost to⟦ darkness, and his boots were covered in mud that hid the
> true color of his armor. When a storm raged outside, Silas would not even blink; he would only shift his weight,
> keeping his eyes fixed on a low stone circle he carved into the ground, trying to ignore the grey light that seemed to
> creep toward him like a hungry ghost.⟧

The cut fell mid-clause, after *"lost to"*, and the continuation completes it with its object. As in pass 29, the
Release twin logs no llama.rn continue line, so the cached and evaluated counts were not read. The first token 40 ms
after Continue, against 777 ms for J1's 156-token prompt, fits a reused cache and does not prove it.

## J3: the CAT photo on Instant

The photo went in through the bridge's `image:` line with pass 28's question, *"What colour is the shape in this photo,
what shape is it, and what word is written under it?"*. Each run asserted that no `vision-hold` card was mounted 3 s
after Send and after the answer, that *"photo pack"* was not on screen, that none of *"The request specifies"*, *"I will
focus"*, *"as an AI"*, *"family-safe"*, *"violence"* or *"self-harm"* was in the answer, and that *"red"*, *"circle"*
and *"CAT"* were.

| run | answer, verbatim | red / circle / CAT | ledger |
|---|---|---|---|
| 1 | *"The shape is a circle, which is commonly known as a dot in some contexts. The text below it reads "CAT"."* | no / yes / yes | 35.3 tok/s, first token 1,553 ms, 185 + 25, 2.3 s |
| 2 | *"The image shows a red circle (shape) with "CAT" written underneath it."* | yes / yes / yes | 34.8 tok/s, first token 1,550 ms, 185 + 17, 2.0 s |

Run 1 is the row the brief asked for, and it fails the colour check: the question asks for the colour and the answer
does not give it. Run 2 repeated the same steps on the same twin a few minutes later and names all three. Nothing on the
photo path changed between builds 29 and 30 on the phone, so this reads as Instant's sampling, one miss in two here
(pass 29: one run, red named). Neither run showed a card or any banned phrase. Run 2 ran after the J4 probe, and its
screens show the probe's Fast download still going on behind it (*"Delivering FAST · 37% of 1.28 GB"*).

## J5: a document, on Instant

`office-hours.txt` holds one line: *"Office hours: Monday to Thursday 9:00–17:00, Friday 9:00–13:00. Phone 555-0134.
Closed on public holidays."* It was attached on Instant through the bridge's `attach:` line. The first question drew
the index card, verbatim: *"The attached file needs the document index model (468 MB) to be searched by meaning.
Without it, only exact words are matched."* with **Download · 468 MB**, **Send, exact words only** and **Cancel**
(`J5-01`). After Download the card read *"Downloading the document index model… 0%. Your message is sent when it's
ready."* (`J5-02`), and the message went 262 s after the press (pass 28: 3 min 13 s).

| question | answer, verbatim | under it |
|---|---|---|
| *"What is the office phone number?"* | *"The office phone number is 555-0134."* | **SOURCES** `office-hours.txt · part 1` |
| *"What is the capital of Australia?"* | *"Australia's capital city is Canberra."* | *"Nothing in your documents matched this question. Answered without them."* |

After the first answer the chat showed *"Re-indexing finished. The answer above searched the files before that. Your
next question uses the full index."* (`J5-03`): the first answer was written from the search that existed before the new
index model had indexed the file.

The first answer was checked for *"instruction"*, *"rules"*, *"general knowledge"*, *"documents list"*, *"NOT_FOUND"*
and *"<<<"*, F449's narration on the web, and has none of them. The bridge's `value` and `dump` ops keep the first node
per testID, so the second answer's text is read from `J5-04`, which shows both exchanges; the step asserting
*"Canberra"* on screen passed.

Round 124 also tells the model to open a reply with no passage with *"Your documents don't mention this."*, and the
bundle carries that sentence. Instant did not write it here; the app's notice under the answer says the same thing. The
brief's pass condition, Canberra with the notice, is met. `J5-04` also shows the advice card *"SHARP is better at
documents than INSTANT."* with **Install SHARP · 2.74 GB**.

## J6: the Instant photo pack in the vault

The card was opened with `/vault?focus=vision-qwen35` in the native vault. Its full text, verbatim: *"◉ PHOTO PACK FOR
INSTANT Lets Instant look at your photos on this device. Qwen3.5 mmproj 0.1B · 205 MB · F16 · Battery: Medium Included
with the app Details"* (`J6-01-pack-instant`). The steps assert *"Qwen3.5 mmproj 0.1B · 205 MB · F16"* present, *"0.4B"*
absent and *"Included with the app"* on the status line. The same screen shows **PHOTO PACK FOR FAST** at *"0.3B · 668
MB"*, unchanged, and the **DOCUMENT INDEX** card, installed by J5, reading *"Installed"* (also read by the run's last
step).

## J8: Delete everything, then a cold relaunch

The lead added this row after the first chain, when the twin was already uninstalled. The same `Inborndev.app` from
cdaf1ca5 was installed again at 17:41:35, so the twin started empty, and four runs went through the same watchdog:

1. **Setup** (`j8a-setup-chat`, 22 of 22; `j8b-setup-document`, 23 of 23): onboarding, one answer on Instant, then
   `office-hours.txt` attached and asked about, with the index model downloaded from the card. The answer read *"The
   office phone number is 555-0134."*
2. **Delete everything** (`j8c-delete-everything`, 21 of 25). Privacy & storage read **Chats encrypted (SQLCipher) 515
   KB**, **Documents 111 B**, **Models not backed up 468 MB** (`J8-01`). The sheet reads *"Delete everything Deletes
   every chat, the encryption key and every document on this device. Nothing was ever anywhere else, so nothing can be
   recovered. Also delete downloaded models Cancel Continue"*, and the switch *"Also delete downloaded models"* reads
   `value: false` (`J8-02`). After Continue and the second step, the screen shows Welcome, *"Nothing leaves this phone.
   AI that runs on your device. No account, no cloud, and nothing you type ever leaves it."*, with no banner (`J8-03a`
   10 s after the press, `J8-03b` 6 s later). Steps 21 to 24 fail with *"the QA bridge never got a fiber: the anchor view
   is not mounted"*: after the wipe the shell remounts and the bridge loses its anchor, as in passes 21 to 28. Both shots
   were taken before those steps, by the driver.
3. **Cold relaunch** (`j8d-cold-relaunch`, 11 of 11): the twin was launched again with `--launch --boot 45000`. The run
   waited for the `onboarding-welcome` testID, waited 3 s and shot `J8-04a`, then waited 8 s, checked the testID again
   and shot `J8-04b`. The screen reads *"Nothing leaves this phone. AI that runs on your device. No account, no cloud,
   and nothing you type ever leaves it. RUNS ON: A15 Bionic · 6 GB Continue This is AI. It can be wrong. Check important
   facts."*. The tree holds no `banner-*` node, *"could not be opened"* is not on screen, and `banner-repair` is not
   mounted. The run then swept `Documents/qa`.

**The frames.** Pass 28's `J8-04-cold-relaunch.png` was a black frame under the status bar. `raw/j8-frames.txt` measures
each Welcome shot below the status bar: all four have a mean luminance of 29.9 with 8.03% of pixels brighter than 60,
the same as a rendered Welcome, where pass 28's black frame measures 0.0 and 0%. `J8-03a` and `J8-03b` are
byte-identical, and so are `J8-04a` and `J8-04b`: the screen did not change between the two shots.

| listing | lines | what it shows |
|---|---|---|
| `container-before-wipe.txt` | 34 | `inborn.db` with a 511 KB `-wal`, `documents/` with the 111 B text file, `documents.json`, `office-hours.txt`, `models/multilingual-e5-large-instruct-Q6_K.gguf` 446.3 MB, `models/vault.json` 785 B, the bridge's `qa/` files |
| `container-after-wipe.txt` | 24 | a fresh 4 KB `inborn.db` (`-wal` 125 KB, `-shm` 32 KB) dated 17:46. The index model and `vault.json` kept, with the same size and time. No `documents/`, `documents.json` or text file. **No `.corrupt` file** |
| `container-after-relaunch.txt` | 14 | the same database and model; `vault.json` rewritten at 17:46 at the same size; the bridge swept `Documents/qa`. No `.corrupt` file |

**The thermal strip.** *"Slowing down to keep the phone cool"* is a device-state strip (`banner-thermal`), not an app
error. It is on none of this pass's screenshots: the top of all J1 to J8 shots was checked, and the J5 and J8 tree
dumps hold no `banner-thermal` node. The J8 shots show iOS's *"◀ Inborn"* back link in the status bar, because the twin
was launched while the store app was in front.

## The harness

1. **The twin.** `com.inbornapp.mobile.qa` was built 17:18:00 to 17:20:58 from cdaf1ca5, the store archive's commit. It
   carries one `INBORN_QA_BRIDGE_V1`, the same round 117 to 124 markers as the store bundle, the commit cdaf1ca562fc in
   its bundle, and Instant and its pack byte-identical to the archive's (`raw/qa-verify.txt`). It was installed fresh at
   17:21:35, so its container started empty, and J1 launched it with `--launch --boot 45000`.
2. **The chain** ran detached from 17:21:42 to 17:33:47: J1, the CAT photo and `office-hours.txt` pushed, J2, J3, J5,
   J6, then the J4 probe. Each script went through pass 28's watchdog. No run stalled, no push hit CoreDevice 7000, and
   the only failed steps are J3 run 1's colour check and the probe's two reads of **Use**. J3 run 2 ran at 17:34:05 to
   17:34:26, with the twin still in the foreground, before the twin was removed.
3. **The ledger reads** set the tier to Pro and back with the bridge's `setTier`, as in passes 28 and 29. No row here
   depends on the tier.
4. **J8's twin.** The first twin was uninstalled at 17:35:12, before the lead asked for J8. The same build was installed
   again at 17:41:14 to 17:41:35, and its chain ran from 17:41:13 to 17:48:10. The store app had been opened on About
   in between; the twin's bridge only needs the twin in the foreground, which each `--launch` gave it.
5. **Processes.** J1's `--console` launcher for the twin (pid 58400, started 17:21:42) and J8d's (pid 59256, started
   17:46:53) were killed by their PIDs after the rows. J8a's launcher had already exited when J8d relaunched the twin.
   My progress tails were stopped. No memory sampler ran in this pass.

## End state

- The phone keeps `com.inbornapp.mobile` **1.0.0 (30)**. After the first twin was gone it was launched on About (`S01`,
  17:35:35) and then with `inborn:///chats` (`S99-left-on-chats`). After J8's twin was gone it was launched the same way
  again: About reads `1.0.0 (30) · cdaf1ca562fc` (`S01-store-about-30-after-j8`, 17:49:46), and it was left on its
  Chats list (`S99-left-on-chats-after-j8`, 17:49:54). The list holds the store app's older chats.
- `com.inbornapp.mobile.qa` was uninstalled at 17:35:12 and again at 17:49:23, rc 0 both times. `devicectl device info
  apps` then lists only `com.inbornapp.mobile` 1.0.0 (30) and the other session's
  `com.inbornapp.mobile.uitests.xctrunner`, which was not touched. The partial Fast download went with the first twin.
- The phone was unlocked at the install, at both twin installs and after the rows (`lockState`: `passcodeRequired`
  false), and no run met a lock. It was never locked or unlocked by this pass, and Settings, Control Center and Face ID
  were not touched.
- Every chain, driver, watchdog and launcher this pass started has exited or was killed by its PID. No simulator was
  booted, no XCUITest runner was started, and port 8787 was not touched.
