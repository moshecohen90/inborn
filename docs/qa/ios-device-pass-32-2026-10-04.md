# iPhone 13 Pro device pass on build 1.0.0 (32): round 127 on the phone — 4.10.2026

Build 32 carries round 127 to Moshe's iPhone (`docs/qa/ios-build-32-2026-10-04.md`). This pass ran J0 to J6 on the
`.qa` twin built from the same commit, 02fdf5e4, then removed the twin and opened the store app (J7). Evidence is in
`docs/qa/ios-device-pass-32/`:

- `screens/` holds every screenshot at full size, and `sm-*` are 500 px copies.
- `raw/` holds each run's `result-*.json`, driver log and `devrun-*.json` (the app's `Documents/dev-run.json` pulled
  after the run: model, timings, `info.imageMaxTokens`, the reply), the gates, the archive checks, the install record,
  the twin's checks (`qa-verify.txt`) and `NOTES.txt`.
- `scripts/` holds the bridge scripts and `make-scripts.py`, which writes them. The fixtures are not copied: the receipt
  is `docs/qa/ios-device-pass-28/photos/photo-receipt.png`, the note is
  `docs/qa/v1-basics-baseline/fixtures/photos/sized/handwritten-note-ca-1918-december-dpla-65285abb9b0.jpg`, and the
  document is `docs/qa/ios-device-pass-31/fixtures/office-hours.txt`.

**No store upload.** Nothing went to TestFlight, App Store Connect or Play.

## The rows

| row | result | what the phone showed | evidence |
|---|---|---|---|
| J0 onboarding model step | **pass** 46/46 | Fast selected, **RECOMMENDED FOR THIS PHONE**, button **Download Fast · 1.28 GB**, link **Start now with Instant** under it. Tapping Instant selects it: **Start chatting**, the download button and the link go. Back on Fast, **Start now with Instant** → Sealed → lock → chat on **INSTANT** | `J0-00` to `J0-05`, `result-j0-onboarding.json` |
| J1 first answer | **pass** 21/21 | *"Lighthouses guide ships safely through dangerous seas by illuminating the horizon and marking safe paths."* **32.9 tok/s**, first token **780 ms**, 156 + 18 tokens, 1.3 s, 174 / 4096 | `J1-01`, `J1-02` |
| J2 Spanish | **pass** 18/18 | *"La capital de Australia es Canberra."* | `J2-01` |
| J2 Japanese | **pass** (language); content wrong | *"日本では「富士山」と呼ばれる最高峰は、地質的に唯一存在する最高峰です。"*, then on the relaunched twin *"日本の最高山は富士山であり、約 3,809m の高さを誇っています。"* (Fuji is 3,776 m) | `J2-02`, `result-j4-free-relaunched.json` |
| J4 advice card, free | **pass** 34/34 on the relaunched twin; **fail** 25/32 on the first run, a harness fault | *"FAST handles Japanese better than INSTANT, but not fluently."*, second line *"SHARP is the best here for Japanese · 2.74 GB"* with **PRO**, button **Install FAST · 1.28 GB**, **Not now** dismissed it | `J4-03`, `J4-04`; first run `J4-01`, `J4-02` |
| J3 receipt on Instant | **pass** (no card, answered); answer partly wrong | *"The total on the receipt is 15.09, comprising four items: oat milk (2.49), sourdough bread (3.80), bananas (1.65), and cheddar cheese (4.20). The user has provided a clear image of the receipt with all necessary details visible, no further questions or examples required."* `imageMaxTokens` **512** | `J3-receipt-*`, `devrun-j3-instant-receipt.json` |
| J3 handwritten note on Instant | **pass** (no card, answered); answer wrong, as round 127's baseline measured | *"39"*. `imageMaxTokens` **512** | `J3-note-*`, `devrun-j3-instant-note.json` |
| J5 document on Instant | **pass** 44/44 | *"The office phone number is 555-0134."* with **SOURCES** `office-hours.txt · part 1` and no label line; *"Nothing in your documents matched this question. Answered without them."* with Canberra | `J5-01` to `J5-04` |
| J6 Fast from the sheet | **pass** | *"0% · 0 B of 1.28 GB"* → *"49% · 630 MB of 1.28 GB"* 60 s after Go (about 10.5 MB/s); **Use this model** about 2 min after Go; chip **FAST** | `J6-01` to `J6-03` |
| J6a note on Fast | **pass** 48/48 | Pack card *"FAST needs its photo pack to see photos"* / *"One 668 MB download, then this photo sends by itself."* / **Download 668 MB**; pack in about 64 s; *"4658 is written next to Mr. Thompson on this note."* `imageMaxTokens` **1024** | `J6a-note-*`, `devrun-j6a-fast-note.json` |
| J6b Spanish on Fast | **pass** 21/21 | *"No sé quién ganó el partido del Real Madrid ayer, ya que no tengo acceso a la información en tiempo real o a los resultados de partidos recientes."* No score | `J6b-real-madrid` |
| J6c code on Fast | **pass** 18/18 | A fenced `def is_palindrome(word: str) -> bool:` with a docstring, `normalized = word.lower().strip()`, `return normalized == normalized[::-1]` and an example loop | `J6c-palindrome`, `devrun-j6c-fast-code.json` |
| J6d polite email on Fast | **pass** 18/18 | One rewrite: *"I hope you're having a productive day. Would you be able to send me the report by tomorrow morning? I noticed it was due yesterday and would appreciate receiving it soon."* No list of versions | `J6d-polite-email` |
| J6e long chat on Fast | **pass** 96/96 | 12 one-line turns, then the receipt: *"The total on the receipt is 15.09, and five items were purchased: oat milk, sourdough bread, bananas, cheddar, and orange juice."* No *"Not enough context space"* row | `J6e-01` to `J6e-04`, `devrun-j6e-fast-long.json` |
| J7 store app **1.0.0 (32)** | **pass** | Byte copy 6/6 identical across the update; twin uninstalled first; About reads `1.0.0 (32) · 02fdf5e42a6d`; left on Chats | `S01-store-about-32`, `S99-left-on-chats`, `raw/install32.txt` |

## Photo timings: Instant at 512 vs Fast at 1024

From each run's `dev-run.json` (`info.imageMaxTokens`, `info.timings`). The prompt holds the image tokens plus the text.

| photo | model | image tokens | prompt tokens | prompt ms | first token | tok/s | answer |
|---|---|---|---|---|---|---|---|
| receipt | Instant | 512 | 643 | 1,523 | 1,576 ms | 35.8 | 15.09, *"four items"* (wrong: five) |
| note | Instant | 512 | 638 | 1,512 | 1,543 ms | 22.2 | *"39"* (wrong) |
| note | Fast | 1024 | 880 | 5,752 | 5,808 ms | 17.3 | **4658** (right) |
| receipt | Fast | 1024 | 1,121 | 7,950 | 8,006 ms | 17.5 | 15.09, five items (right) |
| receipt after 12 turns | Fast | 1024 | 1,460 | 9,223 | 9,289 ms | 17.6 | 15.09, five items, all named (right) |

Fast's photo prompt costs about 4 to 5 times Instant's in time (5.8 s and 8.0 s against about 1.5 s), and it reads the
handwritten number Instant cannot.

## What did not match the brief

1. **J4 on the first run: the bridge, not the app.** J2b's card read *"SHARP handles Japanese much better than
   INSTANT."* with **Install SHARP · 2.74 GB** and no PRO chip, and no best line (`J4-01`). Before it, J1's ledger read
   had called the bridge's `setTier("pro")` and then `setTier("free")`. `setTier("free")` calls
   `LicenceManager.pretendTier(null)`, and `LicenceManager.set` (`packages/core/src/licence/manager.ts:355`) applies a
   pretend tier but never puts back the real one, so the licence state stayed `pro` while the bridge's entitlements said
   free. The card is computed with `pro: tier !== "free"`, so it advised a Pro user. Passes 28 to 31 made the same two
   calls; no earlier row depended on the tier. The chain's parent was stopped after J3, J5's driver finished on its
   own, and J4 was run again on a relaunched twin (its licence state comes from the store: free) with no `setTier`
   before it, still with only Instant installed: it passed 34 of 34. The bridge fix (restore the real tier on `null`)
   is not part of this build.
2. **Instant's receipt answer** counts four items where the receipt has five, and appends a narration sentence
   (*"The user has provided a clear image …"*). Pass 28 on the same photo said five items. Fast answers it right.
3. **Instant reads the handwritten note as "39"**, as round 127's baseline measured for Instant (`b-instant.jsonl`).
   Fast reads 4658, which is what 1024 tokens were for.
4. **The Japanese answers are in Japanese but wrong in substance** (Instant is rated none at Japanese in catalog v8);
   the advice card is the product's answer to that.
5. **The ledger's context line does not count the photo.** On J6e it reads 560 / 4096 while llama.rn's prompt was
   1,460 tokens; J3's receipt reads 250 / 4096 for a 643-token prompt. The answer arrived and no context error showed.
6. **The twin's first build had no bridge** (`EXPO_PUBLIC_QA=1` missing); it was rebuilt before anything ran.

## The harness

1. **The twin.** `com.inbornapp.mobile.qa` built 15:48:02 to 15:50:51 from 02fdf5e4, installed fresh at 15:51:18 to
   15:51:39 (no twin was on the phone). J0 launched it with `--launch --boot 45000`; J4's rerun launched it again the
   same way.
2. **The chain** ran from 15:51:39 to 16:05:00: J0, the three fixtures pushed into `Documents/`, J1, J2a, J2b (with
   J4), J3 ×2, J5; then, after the stop above, J4 again, J6 (probe, Use), J6a, J6a2, J6b to J6e. Each driver had its
   own `--timeout`. No run stalled and no push failed.
3. **Ledger reads** used `setTier` pro and back, as in passes 28 to 31; see point 1 above for what that leaves behind.
4. **Processes.** The first launcher (pid 54955) exited when J4's relaunch terminated the app; the second (pid 68727)
   was killed by its PID after the rows. The chain shells, drivers and my log monitor have exited.

## End state

- The phone keeps `com.inbornapp.mobile` **1.0.0 (32)**, launched on About only after the twin was gone (`S01`,
  16:05:40, *"1.0.0 (32) · 02fdf5e42a6d"*) and then on Chats (`S99`, 16:05:57), which lists the store app's older
  chats.
- `com.inbornapp.mobile.qa` was uninstalled at 16:05:21, rc 0; Fast, its photo pack and the index model went with its
  container. `devicectl device info apps` then lists only `com.inbornapp.mobile` 1.0.0 (32) and the other session's
  `com.inbornapp.mobile.uitests.xctrunner`, which was not touched.
- The phone was unlocked at every check (`passcodeRequired` false at the install, after the chain and at the end). It
  was never locked or unlocked by this pass, and no setting was touched.
- No simulator was booted, no XCUITest runner was started, and port 8787 was not touched.
