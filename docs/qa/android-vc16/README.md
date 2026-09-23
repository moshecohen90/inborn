# android-vc16 — evidence for Play internal release versionCode 16

Screenshots and node dumps behind the **vc16** release pass: the Android submission candidate built from `main`
**9da93a2**, uploaded to the Play internal track as "1.0.0 (16)" and delivered to the OnePlus 6T by Google Play as
an **update in place over vc15**.

Where the write-ups live:

| document | what it holds |
|---|---|
| `docs/qa/purchases-run-2026-09-11.md` **§S** | build, gates, upload, the Play update, every phone and emulator row, and the two driver notes |
| `docs/qa/soak-run-9-2026-09-22.md` | the hour of continuous use on the 6T, with a ledger row per answer |
| `docs/qa/qa-run-2026-09-11.md` **Pass 8** | §5.7 incognito closed on real hardware, and why no F number was taken |

Two devices, and the split between them matters:

- **OnePlus 6T** (`<6t-serial>`, Android 11, 8 GB, tier `ANDROID-LEGACY`) — Moshe's personal phone, the primary device.
  It runs the real Play build with real Play Billing, so it is the only place a purchase path is claimed. Driven by
  keys only (`adb -s <6t-serial>`, TAB / DPAD / ENTER / `input text`); taps are ignored on this phone.
- **Pixel 6 API 33 emulator** (`emulator-5554`, 4 GB, tier `ANDROID-ENTRY`) — the same AAB installed with
  `bundletool --local-testing`. It answers the device-tier questions the phone cannot ask and nothing about billing
  beyond what the app does with no Play account.

## The files

| file | device | what it shows |
|---|---|---|
| `a-01-about-1-0-0-16.png` | 6T | About: **1.0.0 (16)**, commit **9da93a296bbe** — the phone naming the build every other row was taken on |
| `a-02-proof-out-0b.png` | 6T | Proof: `SEALED · ON-DEVICE`, **OUT 0 B · IN 0 B**, 0 connections, 0 trackers |
| `b-01-vault-top.png` | 6T | vault head after the update: `4.8 GB in the vault · 12 GB free · RUNS ON: ANDROID-LEGACY · 8 GB`, FAST `RECOMMENDED ON THIS PHONE`, `~5-7 tok/s on your phone`, `Loaded`, `In use` |
| `b-02-vault-all-packs.png` | 6T | vault foot: SHARP · Phi-4-mini 3.8B, `~0.4-0.6 tok/s · Too slow to use on this phone`, **"Not offered through Google Play"** over `Import GGUF` |
| `c-03-fast-hebrew.png` | 6T | F39 lengths: Fast answering the Hebrew "shalom" question in 2 sentences / 30 words |
| `d-01-attach-sheet.png` | 6T | attach sheet with Fast resident: **"FAST cannot look at photos. INSTANT is the one model here that can."** |
| `f-01-paywall-owns-pro.png` | 6T | **real Play billing**: YOU OWN PRO, Work upgrade **₪149.90 one-time** |
| `f-02-restore-purchase-restored.png` | 6T | Restore purchases → **"Purchase restored"** |
| `g-01-normal-chat.png` | 6T | the control chat for the incognito test: codeword `KESTREL`, an ordinary saved chat |
| `g-02-incognito-open.png` | 6T | the new-chat sheet opened by `new-incognito`: `incognito-switch` `checked="true"`, "Not saved, no memory. Gone when you close it." |
| `g-03-incognito-answer.png` | 6T | an incognito turn answering: header **`INCOGNITO · NOT SAVED`** beside `SEALED` and `INSTANT` |
| `g-04-chatlist-after.png` | 6T | chat list while the incognito session is alive — both `KESTREL` and `ZARFOLIN` present |
| `g-05-chatlist-cold.png` | 6T | chat list after `am force-stop` + relaunch — `KESTREL` still there, **`ZARFOLIN` gone** |
| `e-00-airplane-out-0b.png` | emulator | the airplane screen answering `17 × 23` with OUT 0 B. Airplane Mode was **not** switched on — the screen says so |
| `e-01-about-1-0-0-16.png` | emulator | About **1.0.0 (16)** on the bundletool install |
| `e-02-proof-out-0b.png` | emulator | Proof: OUT 0 B · IN 0 B |
| `e-03-vault-top.png` | emulator | `RUNS ON: ANDROID-ENTRY · 4 GB`, **Instant** recommended here, `~6-12 tok/s` |
| `e-04-vault-bottom.png` | emulator | the two Sharp cards, both **"Will not run on 4 GB"** |
| `e-05-paywall-usd-fallback.png` | emulator | no Play account: the **Free** cards, **$19.99 / $69.99** with "US price shown. The store shows your local price." |
| `e-06-restore-could-not-reach-store.png` | emulator | Restore with no account: **"Could not reach the store. Try again when you are online."** — an error, not a silent grant |
| `e-07-fast-gated-4gb.png` | emulator | the Fast card on the 4 GB tier: `1.2 GB · Q4_K_M · Battery: Medium` over **"Will not run on 4 GB"**, with no install button |

Screenshots are 500 px-tall copies. The full-resolution originals, the `uiautomator` node dumps
(`vault-sweep.txt`, `vault-full.txt`, `f36-attach-sheet.xml`), the logcat captures and the soak CSVs stay in the
session scratch dir and are not committed.

## Two things this folder does not contain

**A vault capture that was deleted rather than committed.** The first `b-02-vault-all-packs.png`, taken at 15:12,
was a **Google Play subscription sheet for another of Moshe's apps** — `shot.sh` photographed whatever was on the
display while Inborn was in the background. It was deleted, `shot.sh` now refuses to write into this folder unless
Inborn holds window focus, and the committed `b-02` is the 16:50 re-capture taken under that guard.

**An F row.** Nothing in this pass is a defect in the app. The one behaviour that looked like one — Fast drawn but
gated on the 4 GB tier — is the catalog doing what it says: `fast.minRamGB` is **6**, `ramFit()` returns `"no"`
below it, and `ModelCard` renders `vault.willNotRun` with no install action. Deliberate, so no finding was filed.
