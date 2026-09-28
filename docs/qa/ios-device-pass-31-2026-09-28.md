# iPhone 13 Pro device pass on build 1.0.0 (31): round 126 on the phone — 28.9.2026

Build 31 carries round 126 to Moshe's iPhone (`docs/qa/ios-build-31-2026-09-28.md`). Round 126 touches the phone in two
places: the Model vault offers no photo pack for a chat model that is not on the device, and reads *"Install {Model}
first"* instead (F456), and a documents answer drops an opening line that is only a passage label (F457). This pass ran
J1, J6 and J5 on the `.qa` twin built from the same commit, 22d0bc51, then removed the twin and opened the store app.
Evidence is in `docs/qa/ios-device-pass-31/`:

- `screens/` holds every screenshot at full size, and `sm-*` are 500 px copies.
- `raw/` holds each run's `result-*.json` and driver log, the gates, the archive checks, the install record, the twin's
  checks (`qa-verify.txt`) and `NOTES.txt` (the run's log, step by step).
- `scripts/` holds the bridge scripts and `make-scripts.py`, which writes them. `fixtures/office-hours.txt` is pass 30's.

**No store upload.** Nothing went to TestFlight, App Store Connect or Play.

## The rows

| row | result | what the phone showed | evidence |
|---|---|---|---|
| store app **1.0.0 (31)** | **pass** | Opened only after the twin was uninstalled. About reads `1.0.0 (31) · 22d0bc516ab4`, the stamp from the generated build-info file. The byte copy was taken before the install, and all six files are byte-identical after it | `S01-store-about-31`, `raw/install31.txt` |
| J1 first answer, tokens/s | **pass** | *"A lighthouse illuminates the dark sea or night to guide ships, making them safer and easier to reach."* Ledger: **33.2 tok/s**, first token **773 ms**, 156 + 21 tokens, 30 ms per token, 1.4 s, on Instant | `J1-01`, `J1-02`, `result-j1-first-answer.json` |
| J6 the packs, Fast and Sharp not installed (F456) | **pass** | **PHOTO PACK FOR INSTANT** *"Included with the app"*. **PHOTO PACK FOR FAST** *"Install Fast first"* and **PHOTO PACK FOR SHARP** *"Install Sharp first"*, each with no Install or Import, only Details; the sizes stay on the spec lines, *"… 0.3B · 668 MB · F16 …"* and *"… 0.3B · 672 MB · F16 …"*. 28 of 28 steps | `J6-01` to `J6-03`, `result-j6a-vault-packs.json` |
| J6 after Fast was installed | **pass** (24 of 25 steps; the failed one is a read the Install state cannot answer, see below) | Fast read *"9% · 124 MB of 1.28 GB"* 60 s after Go (2.07 MB/s) and showed **Use this model** about 9 min 20 s after Go. The vault then shows **PHOTO PACK FOR FAST** with **Install · 668 MB from models.inbornapp.com**, and **PHOTO PACK FOR SHARP** still *"Install Sharp first"* with no Install | `J6-04` to `J6-07`, `result-j6b-fast-probe.json`, `result-j6c-after-fast.json` |
| J5 a document, on Instant (F457) | **pass** | *"What is the office phone number?"*: *"The office phone number is 555-0134."* as the first and only line, no *"[1] office-hours.txt · part 1"* line, and **SOURCES** `office-hours.txt · part 1` under it. *"What is the capital of Australia?"*: *"The capital of Australia is Canberra."* with *"Nothing in your documents matched this question. Answered without them."* 50 of 50 steps | `J5-*`, `result-j5-documents.json` |

## J6: the photo packs in the vault

The twin was installed fresh, so its container started empty: Instant, bundled with the app, was the only chat model on
the device. J6a opened the native vault three times with `/vault?focus=<id>`, on the document index, on Fast's pack and
on Sharp's pack, so the three shots cover the whole Extensions section from its header to the Companions header below it
(`J6-01` to `J6-03`). The cards read, verbatim from `model-card-<id>`:

| card | spec line | status line | buttons |
|---|---|---|---|
| **PHOTO PACK FOR INSTANT** | *"Qwen3.5 mmproj 0.1B · 205 MB · F16 · Battery: Medium"* | *"Included with the app"* | Details |
| **PHOTO PACK FOR FAST** | *"Qwen3.5 mmproj 0.3B · 668 MB · F16 · Battery: Medium"* | *"Install Fast first"* | Details |
| **PHOTO PACK FOR SHARP** | *"Qwen3.5 mmproj 0.3B · 672 MB · F16 · Battery: Medium"* | *"Install Sharp first"* | Details |

The strings are round 126's key `vault.state.needsModel`, *"Install {model} first"*, with the catalog name. The steps
assert that `install-vision-qwen35-2b`, `import-vision-qwen35-2b`, `install-vision-qwen35-4b` and
`import-vision-qwen35-4b` are not mounted, and each size stays on its spec line. Above the packs the **DOCUMENT INDEX**
card still offers **Install · 468 MB from models.inbornapp.com**: it serves every model, so round 126 leaves it alone.
Build 28's screen that MosheAI flagged (`docs/qa/ios-device-pass-28/screens/J6-02-pack-fast.png`) showed a live
**Install · 672 MB** on Sharp's pack with Sharp not installed.

**After Fast was installed.** The brief allowed this half only if Fast's download ran at 2 MB/s or more on the first
try. J6b opened the model sheet in a new chat and pressed Download and Go for Fast: the progress read *"0% · 0 B of
1.28 GB"* when it appeared and *"9% · 124 MB of 1.28 GB"* 60 s later (`J6-04`), 2.07 MB/s, so the chain ran J6c. The
sheet showed **Use this model** on Fast 488.9 s after J6c began, about 9 min 20 s after Go (`J6-05`). In the vault the
packs' spec lines, status and buttons then read, verbatim (`J6-06`, `J6-07`):

| card | after the title and the description |
|---|---|
| **PHOTO PACK FOR INSTANT** | *"Qwen3.5 mmproj 0.1B · 205 MB · F16 · Battery: Medium Included with the app Details"* |
| **PHOTO PACK FOR FAST** | *"Qwen3.5 mmproj 0.3B · 668 MB · F16 · Battery: Medium Install · 668 MB from models.inbornapp.com Details"* |
| **PHOTO PACK FOR SHARP** | *"Qwen3.5 mmproj 0.3B · 672 MB · F16 · Battery: Medium Install Sharp first Details"* |

The steps assert *"668 MB"* on `install-vision-qwen35-2b`, *"Install Fast first"* absent from Fast's pack card,
*"Install Sharp first"* on Sharp's and `install-vision-qwen35-4b` not mounted. Step 14 failed: it read
`model-status-vision-qwen35-2b`, and that node is not mounted. `ModelCard` shows no status line for a card that is not
installed and has a download plan (`statusLine()` returns null for `not-installed` with a plan), which is the Install
state the step's neighbours assert. The script expected a status line there; the app does not draw one. Fast's pack was
not installed: the row asks only that it be offered.

## J5: a document, on Instant

`office-hours.txt` holds one line: *"Office hours: Monday to Thursday 9:00–17:00, Friday 9:00–13:00. Phone 555-0134.
Closed on public holidays."* It was attached on Instant through the bridge's `attach:` line. The first question drew
the index card, verbatim: *"The attached file needs the document index model (468 MB) to be searched by meaning.
Without it, only exact words are matched."* with **Download · 468 MB**, **Send, exact words only** and **Cancel**
(`J5-01`). After Download the card read *"Downloading the document index model… 2%. Your message is sent when it's
ready."* (`J5-02`), and the message went about 193 s after the press (pass 30: 262 s).

| question | answer, verbatim | under it |
|---|---|---|
| *"What is the office phone number?"* | *"The office phone number is 555-0134."* | **SOURCES** `office-hours.txt · part 1` |
| *"What is the capital of Australia?"* | *"The capital of Australia is Canberra."* | *"Nothing in your documents matched this question. Answered without them."* |

**F457.** The first answer's first and only line is the sentence. The step asserting that `office-hours.txt · part` is
absent from `assistant-text` passed, and the tree dump holds `assistant-text` = *"The office phone number is
555-0134."* next to `citation-1` = *"office-hours.txt · part 1"*: the label is on the chip, not in the answer
(`J5-03`). What Instant generated before round 126's filter is not logged by the Release twin, so this row shows the
answer on screen and does not show whether Instant copied a label this time. The answer also has none of F449's
narration words (*"instruction"*, *"rules"*, *"general knowledge"*, *"documents list"*, *"NOT_FOUND"*, *"<<<"*).

After the first answer the chat showed *"Re-indexing finished. The answer above searched the files before that. Your
next question uses the full index."* (`J5-03`), as in pass 30. The second answer is read from `J5-04`, which shows both
exchanges: the bridge's `value` and `dump` ops keep the first node per testID. `J5-03` and `J5-04` also show the advice
card *"SHARP is better at documents than INSTANT."* with **Install SHARP · 2.74 GB**.

## J1: the first answer

Onboarding on the fresh twin, then *"In two sentences, what is a lighthouse for?"* on Instant: *"A lighthouse
illuminates the dark sea or night to guide ships, making them safer and easier to reach."* The ledger reads **33.2
tok/s**, first token **773 ms**, 156 + 21 tokens, 30 ms per token, 1.4 s, context 177 / 4096 (`J1-01`, `J1-02`;
pass 30: 32.1 tok/s, 777 ms). The ledger's detailed rows were read with the bridge's `setTier` to Pro and back, as in
passes 28 to 30.

## The harness

1. **The twin.** `com.inbornapp.mobile.qa` was built 18:08:03 to 18:11:36 from 22d0bc51, the store archive's commit. It
   carries one `INBORN_QA_BRIDGE_V1`, the same round 117 to 126 markers as the store bundle, the commit 22d0bc516ab4 in
   its bundle, and Instant and its pack byte-identical to the archive's (`raw/qa-verify.txt`). No twin was on the phone
   before, so it was installed fresh at 18:11:52 to 18:12:16 with an empty container, and J1 launched it with
   `--launch --boot 45000`.
2. **The chain** ran detached from 18:12:22 to 18:27:56: J1, `office-hours.txt` pushed, J6a, J5, J6b, then J6c. The
   brief lists J6 before J5. J6a ran before J5, on the fresh twin, and the Fast half ran after J5, so the index model's
   download and Fast's did not share the connection. Each script went through pass 27's watchdog. No run stalled and
   no push hit CoreDevice 7000. The only failed step is J6c's read of a status line that the Install state has not.
3. **The ledger reads** set the tier to Pro and back with the bridge's `setTier`, as in passes 28 to 30. No row here
   depends on the tier.
4. **Processes.** J1's `--console` launcher for the twin (pid 66789, started 18:12:23) was killed by its PID after the
   rows. My progress monitor was stopped. No memory sampler ran in this pass.

## End state

- The phone keeps `com.inbornapp.mobile` **1.0.0 (31)**. It was launched on About only after the twin was gone (`S01`,
  18:29:06, *"1.0.0 (31) · 22d0bc516ab4"*) and then with `inborn:///chats` (`S99-left-on-chats`, 18:29:14). The list
  holds the store app's older chats.
- `com.inbornapp.mobile.qa` was uninstalled at 18:28:43, rc 0, and Fast and the index model went with its container.
  `devicectl device info apps` then lists only `com.inbornapp.mobile` 1.0.0 (31) and the other session's
  `com.inbornapp.mobile.uitests.xctrunner`, which was not touched.
- The phone was unlocked at the install, at the twin install and after the rows (`lockState`: `passcodeRequired`
  false), and no run met a lock. It was never locked or unlocked by this pass, and Settings, Control Center and Face ID
  were not touched.
- No screenshot shows the thermal strip, and the tree dumps of J5, J6a and J6c hold no `banner-thermal` node.
- Every chain, driver, watchdog and launcher this pass started has exited or was killed by its PID. No simulator was
  booted, no XCUITest runner was started, and port 8787 was not touched.
