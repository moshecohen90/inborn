# Round 129: Erase everything leaves the vault stale (simulator proof, 5.10.2026)

Simulator `r129-wipe-vault`, iPhone 17 Pro, iOS 26.2. I created it for this run and deleted it afterwards. The founder's
iPhone was not touched and devicectl was not used. App: the QA variant `com.inbornapp.mobile.qa`, built Release for the
simulator from this worktree.

```
cd apps/mobile
APP_VARIANT=development EXPO_PUBLIC_QA=1 EXPO_PUBLIC_DEV_MODEL_HOST=localhost \
EXPO_PUBLIC_MODELS_BASE_URL=http://localhost:8799/v1 EXPO_PUBLIC_AUTOPROMPT=file EXPO_PUBLIC_AUTOINSTALL=file \
INBORN_IOS_SHARE_EXT=0 INBORN_MODELS_DIR=<repo>/.models \
  pnpm exec expo prebuild -p ios --no-install && (cd ios && pod install)
xcodebuild -workspace ios/Inborndev.xcworkspace -scheme Inborndev -configuration Release -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath ios/build/qa-sim ARCHS=arm64 ONLY_ACTIVE_ARCH=YES build
```

- **before**: the JS of main 73e49484. The app was built with this round's changes reverted (14:15).
- **after**: the same native build with this round's JS (final bundle 14:38).

The base URL points at a closed localhost port, so no model is ever downloaded. Fast
(`Qwen3.5-2B-Q4_K_M.gguf`) and the index model (`multilingual-e5-large-instruct-Q6_K.gguf`) come from `.models`.
They are copied into the container's `Documents/models` while the app is stopped, and the vault adopts them on the
next launch (hash check). Each step is a bridge script in `scripts/`, run with
`node scripts/ios-qa.mjs docs/qa/r129-wipe-vault/scripts/<s>.json --out docs/qa/r129-wipe-vault/<dir> --simulator --device <udid> --bundle com.inbornapp.mobile.qa [--launch]`.
Between scripts, shell steps write `Documents/dev-vault.txt` (`use fast` / `use instant`, which is what the vault's
Use button does) and `Documents/dev-prompt.txt` (`attach: turbine.pdf`, the attach sheet's file door), and copy
`vault.json` out of the container.

## Before the fix

`before/`, 14:16 to 14:25. Erase everything, then Start chatting on the stale Fast.

| Shot | What it shows |
|---|---|
| `01b-chat` | Fresh install, chat on Instant |
| `02-vault-fast-installed` | Fast and the index model adopted from `Documents/models` |
| `03-chat-on-fast` | `use fast`: chip FAST |
| `04-wipe-models-on`, `05-wipe-confirm` | Settings › Erase everything, "also delete models" on |
| `06-model-step` | **Bug:** Fast "READY NOW · already on this phone" while `Documents/models` is gone (`ls`: no such directory) |
| `06b-chat` | Start chatting: chip FAST, running on weights still resident from before the wipe |
| `08-pdf-hold-card`, `09-pdf-hold-card-later` | **Bug:** "Downloading the document index model… 100%. Your message is sent when it's ready.", no Download button, unchanged 20 s later |
| `vault-after-wipe.json` | **Bug:** the new vault.json (14:23) lists `fast` and `embed-e5` as installed, `defaultModelId: "fast"`, with only `vault.json` on disk |
| `relaunch/10-vault-after-wipe` | Vault: "1.75 GB in the vault", Fast "In use · Loaded" |
| `relaunch/11-chat-after-switch` | After a relaunch: the boot scan drops the record and the chat is on Instant. The old code heals only at the next launch |

`before2/`, 14:26 to 14:30. The founder's path: Instant picked after the wipe, then a switch to Fast in the same session.

| Shot | What it shows |
|---|---|
| `06-model-step`, `06d-instant-picked`, `06d-chat` | Fast still shown READY; Instant picked; chip INSTANT |
| `vault-json-after-wipe.json` | `fast` and `embed-e5` written back as installed |
| `08/09-pdf-hold-card*` | Same "… 100%" card, stuck |
| `10-vault-after-wipe` | Fast listed on this phone |
| `11-chat-after-switch` | **Bug:** `use fast` gives the red line "Could not load FAST: Failed to load model" (the founder's error) and no way back |
| `12-chat-next-launch` | The next launch is on Instant again (boot scan) |

## After the fix

`after/`, 14:38 to 14:43. The same sequence as `before/` + `before2/`, on the final build.

| Shot | What it shows |
|---|---|
| `02-vault-fast-installed`, `03-chat-on-fast` | Same setup: Fast and the index model adopted, chip FAST |
| `04/05-wipe*` | Erase everything with models |
| `06-model-step` | Fast is "1.28 GB · one download from localhost" with "Download Fast · 1.28 GB" and "Start now with Instant": the vault equals the disk |
| `06c-chat` | Start now with Instant: chip INSTANT, no error line |
| `vault-json-after-wipe.json` | Only `instant` and `vision-qwen35` (bundled), `defaultModelId: "instant"` |
| `08/09-pdf-hold-card*` | "The attached file needs the document index model (468 MB)…" with "Download · 468 MB" and "Send, exact words only". Never 100% |
| `10-vault-after-wipe` | "0 B in the vault"; only Instant on this phone; Fast under "Fits your phone" |
| `11-chat-after-switch` | `use fast` (Fast not installed): chip INSTANT, no raw engine error |
| `12-chat-next-launch` | Relaunch: still Instant, no error |

`after-heal/`, 14:44 to 14:47. A model file gone at use time, with no wipe.

| Shot | What it shows |
|---|---|
| `02-vault-fast-installed`, `10-vault-after-wipe` | Fast pushed and adopted; `use instant` (the vault.json default is then `instant`, with `fast` installed) |
| (shell 14:46:44) | `rm Documents/models/Qwen3.5-2B-Q4_K_M.gguf` while the app runs, then `use fast` |
| `13-chat-fast-file-gone` | Chip INSTANT, and the line "FAST is no longer on this phone. Download it again in the vault." with Dismiss (`chat.modelMissing`, testID `model-missing`) |
| `14-vault-fast-file-gone` | "0 B in the vault"; Fast back under "Fits your phone" with a normal install offer |
| `vault-json-after-heal.json` | `fast` dropped from `installs`, `defaultModelId: "instant"` |
| `relaunch/12-chat-next-launch` | The same missing file across a relaunch: the existing boot scan drops it, chip INSTANT, no error |

The first attempt at the heal run, on the build before the last change, came back to Instant without the line.
The chat took the news once on mount, and the swap remounts the chat more than once. The chat now follows
`missingModel()` through a subscription until Dismiss or a reinstall clears it. The run above is on that build.

## Not proven on the simulator

- **The chat's catch path for a missing file.** This is the case where the engine already resolved a model whose
  file then vanishes, so `loadSession` itself throws, and the chat then shows `chat.modelMissing` and calls
  `onSwitchModel` back to Instant. On the simulator the vault's `locate()` heal always fired first: the engine was
  re-resolved on the switch and never handed the gone path. That catch path is covered only by the source assertion
  in `apps/mobile/test/fixes-r129.test.ts` and by the vault unit tests underneath it.
- **The "without models" toggle on the simulator.** It is covered by the unit test (`rescan` keeps the kept files,
  record and default) but was not walked on the simulator.
- **Android (Play packs) and the web wipe.** The web's `forgetExtensions()` was not driven in a browser. `web:build`
  and `web:smoke` pass.
- **A real iPhone.** That is intentional: this was simulator only.
