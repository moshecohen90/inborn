# Round 130B: downloads while offline (simulator proof, 5.10.2026)

The founder asked: onboarding tells people to turn on Airplane Mode, so what happens when they then tap a download?

I ran this on simulator `r130-offline-downloads` (iPhone 17 Pro, iOS 26.2). I created it for this run and deleted it
afterwards. The Mac's network was not touched (no Network Link Conditioner) and devicectl was not used. The app was
the QA variant `com.inbornapp.mobile.qa`, one native Release build for the simulator. Two JS bundles were swapped into it:

- **before**: main b9fd8819 plus only the new QA offline switch (`vault/devOffline.ts`, the bridge's `network` step).
  Built from a throwaway worktree.
- **after**: this branch.

```
cd apps/mobile
APP_VARIANT=development EXPO_PUBLIC_QA=1 EXPO_PUBLIC_DEV_MODEL_HOST=localhost \
EXPO_PUBLIC_MODELS_BASE_URL=http://localhost:8799/v1 EXPO_PUBLIC_AUTOPROMPT=file EXPO_PUBLIC_AUTOINSTALL=file \
INBORN_IOS_SHARE_EXT=0 INBORN_MODELS_DIR=<repo>/.models pnpm exec expo prebuild -p ios --no-install && (cd ios && pod install)
xcodebuild -workspace ios/Inborndev.xcworkspace -scheme Inborndev -configuration Release -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath ios/build/qa-sim ARCHS=arm64 ONLY_ACTIVE_ARCH=YES build
# same env:
pnpm exec expo export:embed --platform ios --dev false --entry-file index.ts \
  --bundle-output <copy>/Inborndev.app/main.jsbundle --assets-dest <copy>/Inborndev.app
```

The models were served by `scripts/serve-models.mjs` on :8797 behind a throttling proxy on :8799 (~20-40 MB/s, a
scratch script that is not committed). The throttle keeps a transfer running long enough to cut it in the middle. Each step is a
bridge script in `scripts/`:
`node scripts/ios-qa.mjs docs/qa/r130-offline-downloads/scripts/<s>.json --out docs/qa/r130-offline-downloads/<before|after> --simulator --device <udid> --bundle com.inbornapp.mobile.qa`.
The script order was d1, d1b, d1c, d5, d5b, d2, d3, d4a, d4. Before d4a the shell wrote `use fast` to `Documents/dev-vault.txt`.

**Offline in this proof** means the `network` step: `{ "op": "network", "offline": true }`. With it on, the app's
`networkKind()` reports `none` and every network listener hears the change, the same way NWPathMonitor reports a
change. A HEAD fails with React Native's `Network request failed`. A task that starts fails with expo-file-system's
iOS text for NSURLErrorNotConnectedToInternet. A transfer that is running gets cancelled 1 s later and fails with the
text for NSURLErrorNetworkConnectionLost, unless the app parked it first. A store bundle refuses the switch
(`devBuild()` is false, test in `src/vault/devOffline.test.ts`).

Run times: before 15:53 to 16:01, after 16:11 to 16:18 (IDT).

## Before and after, door by door

| Door | Before (`before/`) | Internet named? | Recovers without hunting? | After (`after/`) |
|---|---|---|---|---|
| 1 Onboarding "Download Fast · 1.28 GB" | `02`/`03`: card at "0%", strip "Delivering FAST · 0% of 1.28 GB", button "Start chatting while it downloads". Nothing says why. `04`: back online, it started by itself (15%) | No | Partly: it starts by itself, but the user never learns why it sat at 0% | `01`: before the tap, "You are offline. A download is the one thing that needs internet; it starts by itself once Airplane Mode is off or Wi-Fi is on." `02`/`03`: "You are offline… turn off Airplane Mode or join Wi-Fi." + "Waiting for a connection. It starts by itself." The strip says "FAST is waiting for a connection. It starts by itself." The main button is **Start now with Instant** and "Stop the download" stays. `04`: online, it moves by itself |
| 5 Model advice "Install FAST" → vault | `06` advice card. `07b` confirm sheet with no word about being offline. `08`/`09`: "Paused, will resume on Wi-Fi" (the wrong reason: the phone has no path at all), with Pause and Cancel | No (says Wi-Fi) | It resumed by itself, but under the wrong explanation | `07b`: the sheet adds the offline line. `08`/`09`: "You are offline…" + "Waiting for a connection. It starts by itself.", with Cancel and no Pause. `10`/`11`: online, Fast **downloads all 1.28 GB by itself and is ready** |
| 2 Vault, connection lost mid-download (Sharp 2.74 GB) | `13`/`14`: red "No connection. Check the internet and try again." + Try again. `15`: **back online it stays failed**, a dead end | Generic | **No**: needs Try again, and on iOS that restarts from byte 0 | `13`/`14`: the offline line + waiting, at 6% (179 MB). `15`: online, it **continues by itself** (15%, 437 MB). Server log: `HEAD … 200`, `GET … 200` at 13:15:14, then `GET … 206 bytes=189038488-` at 13:15:43 (UTC). That is the resume data, from the same byte, with no new HEAD |
| 3 Document index card (PDF + question) | `17`/`18`: "The download isn't moving right now. Open the vault to see why." This card has no vault button. "Send, exact words only" stays. `19`/`20`: online, it finished and the message went out | No | Partly: no reason given, and the "open the vault" it points to is not on the card | `17`/`18`: "You are offline…" + **"Waiting for a connection. It starts by itself."**, with "Send, exact words only" and Cancel. `19`: online, 41%. `20`: the 468 MB index landed and **the held message went out by itself** |
| 4 Photo pack card (Fast, photo + question) | `22`/`23`: "The download isn't moving right now. Open the vault to see why." + Open the vault. **"Switch to INSTANT" is gone** | No | No: it sends the user to the vault, and the offline way out is gone | `22`/`23`: "You are offline…" + waiting, with **"Switch to INSTANT · installed"** and "Remove the photo". `24`/`25`: online, the 668 MB pack landed and **the photo turn went out by itself** (Fast answering) |

One complete download for each door that has one: Fast 1.28 GB (vault, door 5→2), the document index 468 MB
(door 3), and Fast's photo pack 668 MB (door 4). The smallest real file in the catalog, Whisper base at 148 MB, has
no download door in these flows. So the smallest one proven to the end is the 468 MB index.

The `sm-*` files are the driver's small copies of the same screenshots.

## Screenshot list (after/)

- `01-model-step-offline`: model step, offline, before the tap: the pre-tap offline line under the cards.
- `02-download-tapped-offline` / `03-download-offline-16s`: the waiting state, the strip, "Start now with Instant".
- `04-model-step-online-8s`: back online, the download moving by itself.
- `05-chat-instant`: after "Stop the download" and "Start now with Instant": chat on Instant.
- `06-advice-card`: the advice card offers FAST.
- `07-vault-from-advice-offline`, `07b-confirm-sheet-offline`: the vault opened from the card, and the confirm sheet with the offline line.
- `08`/`09-vault-fast-*offline*`: the Fast card offline, waiting, Cancel only.
- `10-vault-fast-online-8s`, `11-vault-fast-ready`: online, then Fast installed.
- `12-sharp-downloading`, `13-sharp-connection-lost`, `14-sharp-offline-15s`, `15-sharp-online-10s`: the mid-download drop and the resume.
- `16`-`20-docs-*`: the document index door, offline, then online, then sent.
- `21`-`25-photo-*`: the photo pack door, offline, then online, then sent.

## What changed

- `packages/core` install reducer: a `waiting-for-network` event and a `waitingForNetwork` flag on `delivering`.
  It excludes `waitingForWifi`, and bytes moving clear it.
- `HttpsDelivery`: no path → `waiting-for-network`. The `waiting-for-wifi` wait is unchanged for cellular with
  Wi-Fi-only on. A path change wakes the wait at once. A running transfer whose path goes is paused with its resume
  data, waits, and continues from the same byte.
- `VaultStore.install`: a delivery that fails with a connection error (the lost race, Play's `network`, a HEAD with no
  route) waits for a path and goes again by itself. A path that says it is up and keeps failing gets 3 retries with
  backoff, then the old offline line.
- The cards: vault, onboarding, the document index card, the photo card, the chat's model sheet, the confirm sheets
  and the strip. They all use one line, "You are offline. A download is the one thing that needs internet: …"
  (`offlineKey` gives the web/desktop its own wording), plus "Waiting for a connection. It starts by itself." Each
  door keeps its way out. The strip says "{name} is waiting for a connection". The keep-awake hold and the iPhone
  "keep the app open" note let go while nothing moves.
- The Airplane proof screen is unchanged. The audit found no dead end there, and a waiting download only shows the
  muted strip line.

## Not proven

- **Real Airplane Mode on a real iPhone.** On the simulator the offline state was the in-app switch. On a phone, the
  order of events between NWPathMonitor (the park, which keeps the resume data) and URLSession's own failure is not
  proven. If URLSession fails first, the transfer still waits and starts again by itself. But on iOS expo-file-system
  drops the resume data with the error, so that leg restarts from byte 0. That path is covered only by
  `src/vault/storeOffline.test.ts`.
- **Android / Play packs.** Play's `network` failure goes through the same wait-and-retry (unit test). What Play
  reports while offline (PENDING, WAITING_FOR_WIFI) was not driven on an emulator.
- **The web and desktop download doors** (`web/ModelOffer.tsx`) are unchanged and were not driven. They use the `…Offline` wording.
- **A Wi-Fi with no internet behind it.** The retry with backoff and the final offline line are unit-tested only.
- **A download queued offline, then the app killed before any connection.** It is not resumed at the next launch:
  nothing was written yet, so the card is back to its normal Download offer.
- **The chat's model sheet** (tap the model chip → Download) gets the same offline line and waiting text, but it was
  not driven on the simulator and has no render test. It is covered by typecheck only.
