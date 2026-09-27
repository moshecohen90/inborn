# iPhone 13 Pro device pass on build 1.0.0 (21): round 109's three rows — 27.9.2026

Round 109 fixed the three defects device pass 20 found (`docs/qa/ios-device-pass-20-2026-09-27.md`): Documents read
0 B (F418), Delete everything opened onboarding under "Chats could not be opened" and left an `inborn.db.corrupt-*`
file (F419), and the thermal line offered "Switch to Instant" while Instant was running (F420). Build 21 carries the
fixes to Moshe's iPhone, and this pass re-ran only those three rows. Evidence is in `docs/qa/ios-fix-109/`: screenshots in
`screens/` (`sm-*` are 500 px copies), each run's `result-d*.json` and driver log, the container listings, the gates and
the archive checks in `raw/`, and the scripts in `scripts/`.

**No store upload.** Nothing went to TestFlight, App Store Connect or Play.

## The rows

| row | result | what the phone showed | evidence |
|---|---|---|---|
| store app **1.0.0 (21)** | **pass** | About reads `1.0.0 (21) · 586afa95c802`. Moshe's six container files were byte-identical across the update | `S01-store-about-21`, `raw/install21.txt` |
| Privacy & storage → Documents (F418) | **pass** | With greenhouse-notes.txt and turbine-report.pdf attached: **Documents 1.98 KB**, the same figure the Documents screen gives ("2 documents · 1.98 KB on this device"). Chats 414 KB, Models 0 B | `F418-privacy-storage`, `F418-documents-screen`, `result-d2.json` |
| Delete everything → onboarding (F419) | **pass** | Chats 3.02 MB and Documents 1.98 KB before. After the two-step sheet: the Welcome screen, **no "Chats could not be opened" banner**, and **no `.corrupt` file** in the container | `W01`, `W02`, `raw/container-before-wipe.txt`, `raw/container-after-wipe.txt` |
| the next cold boot after the wipe (F419) | **pass** | The app killed and launched again: onboarding, "could not be opened" absent, no `banner-repair` node, still no `.corrupt` file | `W03-cold-relaunch`, `result-d5.json`, `raw/container-after-relaunch.txt` |
| thermal line under Instant (F420) | **pass, it triggered** | Three long answers back to back on the charging phone. From the second one on, the strip read **"Slowing down to keep the phone cool"** with **no action**, the header showing INSTANT at 34 tok/s. Pass 20 showed "· SWITCH TO INSTANT" in the same state | `T2-while-answering`, `result-d3.json` dumps `banners-while-2` … `banners-after-3` |

### Documents size (F418)

| row | the app says | on disk (`raw/container-after-docs.txt`) | verdict |
|---|---|---|---|
| Chats · encrypted (SQLCipher) | 414 KB | `inborn.db` 4,096 + `-wal` 420,272 = 424,368 B = 414.4 KiB | true |
| Documents | **1.98 KB** | `Documents/documents/`: 253 + 1,773 = 2,026 B | **true** (pass 20: 0 B) |
| Models · not backed up | 0 B | no downloaded model; Instant and the photo projector are part of the app | true |

### Delete everything (F419)

The container after the wipe (`raw/container-after-wipe.txt`) holds `SQLite/inborn.db` 4,096 B, `-shm` 32,768 B and
`-wal` 127,752 B: the new, empty database under the new key, and nothing else in `SQLite/`. `documents/` and
`documents.json` are gone. Pass 20's listing at this point had `inborn.db.corrupt-2026-09-27T11-38-22-705Z` (+ `-shm`,
`-wal`) beside it.

**The cause, proven before the fix.** A trace build on the simulator ran the same 33 steps twice and reproduced the
banner both times (`raw/sim-wipe-trace-before.txt`, `raw/sim-result-before-run*.json`, `screens/sim-before-after-wipe.png`):

1. **The index kept the file open.** `deleteDatabaseAsync` failed with *"Unable to delete database … inborn.db that is
   currently open. Close it prior to deletion"*. The document index held its own keyed connection, and `wipeAll` closed
   only the chat store's. The file was then unlinked by the directory sweep instead.
2. **Two boots, two keys.** The `router.replace("/onboarding")` after the wipe remounted the root layout, so two boots
   started within 6 ms. Both read an empty Keychain, and each generated a key. The first created the new `inborn.db` under
   its key. The second failed with `file is not a database`, quarantined the first one's fresh file as
   `.corrupt-<time>`, and raised the "started fresh" banner.

The same build after the fix (`raw/sim-wipe-trace-after.txt`, `screens/sim-fixed-after-wipe.png`) shows the index
closing and then `deleteDatabaseAsync ok`. One boot runs, one key is generated, and the database opens as v5 with
`repaired=no`. The trace code was removed before the commit. The unit test `storage/wipeReboot.test.ts` reproduces
step 2 without a device (`raw/red-f419-two-keys.txt`) and keeps F58's real repair: a file that really is unreadable is
still set aside and reported.

## The harness

Five runs through the round-51 bridge on `com.inbornapp.mobile.qa`, built from commit 586afa95, the same commit as the
store archive. It has one `INBORN_QA_BRIDGE_V1`, bundles both models exactly as the archive does, and adds
`EXPO_PUBLIC_AUTOPROMPT=file` for the `attach:` line (`raw/qa-verify.txt`). The twin was installed fresh, launched
with `--boot 45000` (F268), and uninstalled at the end.

| run | steps | passed | what |
|---|---|---|---|
| `d1` | 23 | 23 | onboarding, first answer: *"A lighthouse serves as a beacon for navigators at sea, illuminating dark waters and guiding ships to safe shores or harbors."* |
| `d2` | 36 | 36 | both files attached with `attach:`, Documents screen, Privacy & storage |
| `d3` | 51 | 51 | three long answers with a banner dump while and after each |
| `d4` | 18 | 15 | Delete everything |
| `d5` | 6 | 6 | cold relaunch after the wipe |

`d4` steps 15–17 are the harness's, as in pass 20's `p20c`. After the wipe the shell remounts, and the bridge loses its
anchor ("the QA bridge never got a fiber"), so it cannot read the tree in that session. The screenshot step still ran
(`W02`). `d5` then read the same screen from a fresh process, with every assertion green.

## Build 21

The branch is `ios-fix-109`: the fix commit 1de9b548, `origin/main` 046eabaa merged in (no conflicts; round 107 had not
landed), and `ios.buildNumber` 20 → 21 in `apps/mobile/app.config.ts` and `apps/mobile/test/fixes-r55.test.ts`,
committed as **586afa95** before the archive.

- **Gates in the worktree** (`raw/gates.txt`): all exit 0 for `pnpm install --frozen-lockfile`, `typecheck`, `test`,
  `lint`, `web:build` and `web:smoke`. Test counts: core 973 passed with 4 skipped, mobile 1,178, i18n 24, ui 23, and
  desktop 4. `web:smoke` printed 27 PASS lines and no FAIL.
- **Archive** (`raw/archive.status`, `raw/archive-verify.txt`):
  - `check-store-env.sh` reported the store env clean, and there was no `EXPO_PUBLIC_*` in the environment.
  - It came from a fresh `expo prebuild -p ios --no-install --clean` plus `pod install`, and `.xcode.env.local` held only
    `NODE_BINARY`.
  - It ran **15:44:03 → 15:47:49** and ended with `** ARCHIVE SUCCEEDED **`, 0 errors.
  - `CFBundleVersion` is 21 and `com.inbornapp.mobile` is 1.0.0. The share extension is at version 21.
  - Both models are byte-exact to the catalog: `instant.gguf` 532,517,120 B and `vision-qwen35.gguf` 204,987,232 B.
  - The metadata reads `extra.commit` 586afa95c802 and `devVariant` false.
  - `check-qa-bridge.sh` finds no QA bridge, and `check-shipping-bundles.mjs` passes with and without `--models`.
  - `main.jsbundle` is 6,556,396 B and carries the round-109 strings.
- **Install** (`raw/install21.txt`):
  - `devicectl device install app` updated 1.0.0 (20) in place, **15:48:38 → 15:48:59**, rc 0.
  - Six of Moshe's files were pulled before and after and compared byte for byte, and all are identical: `inborn.db`
    2,543,616 B, `inborn.db-wal` 4,185,952 B, `documents.json`, `vault.json`, `device-prefs.json` and `licence.bin`.
    The copies stay in the session scratchpad, outside the repo.

## End state

- The phone keeps `com.inbornapp.mobile` **1.0.0 (21)**, launched and left on its chat root with no banner
  (`S02-store-first-screen-21`).
- `com.inbornapp.mobile.qa` is uninstalled.
- The one `devicectl … --console` launcher still running (from `d5`) was killed by PID. No devicectl or
  pymobiledevice3 process is left.
- The phone was never locked or unlocked, and Settings were not touched.
- `com.inbornapp.mobile.uitests.xctrunner` from another stream was not touched.
