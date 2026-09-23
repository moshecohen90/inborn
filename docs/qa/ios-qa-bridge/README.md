# The in-app QA bridge — driving the iPhone without XCUITest

**Why it exists.** Until 23.9.2026 every tap on Moshe's iPhone went through an XCUITest runner, and that runner
cannot start until iOS's *"Enter iPhone Passcode for 'XCTest' · Enable UI Automation"* sheet is answered. The grant
comes back after a few launches and expires in about six minutes, and Moshe is usually not next to the phone. On
build 16 that cost **six of ten proof rows** (`docs/qa/ios-device-pass-16-2026-09-23.md`, F185). The bridge removes
the runner from the loop: the app drives itself, and the Mac only pushes a file, takes pictures and reads the result.

**What it is.** A step interpreter inside the app's own JS runtime. It finds any `testID` already in the app by
walking React's fiber tree and calls the handler React is holding (`onPress`, `onChangeText`, a `Toggle`'s
`onChange`, a settings `Row`'s `onToggle`). No native module, no new dependency, no accessibility permission, no
passcode. It is compiled **only** into builds made with `EXPO_PUBLIC_QA=1`; see *The guard* below.

## Run a script

```bash
# one-off: build the QA app and install it over whatever is on the phone (never uninstall — F144)
cd apps/mobile
export INBORN_MODELS_DIR=/Users/moshecohen/dev/inborn/.models MODELS_DIR=$INBORN_MODELS_DIR
export EXPO_PUBLIC_QA=1 EXPO_PUBLIC_AUTOPROMPT=file
npx expo prebuild -p ios --no-install && (cd ios && pod install)
xcodebuild -workspace ios/Inborn.xcworkspace -scheme Inborn -configuration Release \
  -destination "id=REDACTED-IPHONE" -derivedDataPath ios/build/qa \
  -allowProvisioningUpdates DEVELOPMENT_TEAM=NGCHN95667 SWIFT_VERSION=5.0 build
xcrun devicectl device install app --device REDACTED-IPHONE \
  ios/build/qa/Build/Products/Release-iphoneos/Inborn.app

# then, as often as you like — no rebuild, no prompt, no passcode
node scripts/ios-qa.mjs docs/qa/ios-qa-bridge/rows.json --out docs/qa/ios-qa-bridge --launch --timeout 2400000
```

`--launch` restarts the app first; without it the script goes to the app already running. Screenshots land in
`--out` as `<name>.png` plus a 500 px `sm-<name>.png`, and the per-step report as `result-<run>.json`.

The driver takes the xcodebuild lock nowhere and needs no lock: it is `devicectl` file copies plus
`pymobiledevice3 developer dvt screenshot --userspace`, which is also how build 16 photographed the phone.

## Writing a script

A script is `{ "runId": "...", "steps": [ … ] }` (a bare array works too). Every step is one object with an `op`.
Steps never stop the run: each one is reported pass or fail and the next one runs, because a device session is too
expensive to lose at the first red.

| op | fields | what it does |
|---|---|---|
| `press` | `testID` | calls the innermost pressable node's handler; fails if the id is not mounted **or** is disabled |
| `send` | — | `press` on `send`; fails while the composer's send button is disabled |
| `type` | `testID`, `text` | calls `onChangeText`, then reads the field back and fails if it did not take the text |
| `waitFor` | `testID` \| `text`, `gone?`, `timeoutMs?` | polls the committed tree (250 ms) until it appears, or with `gone: true` until it is off screen; default 30 s |
| `assertText` | `text`, `testID?`, `absent?` | case- and whitespace-insensitive; without `testID` it reads the whole screen |
| `value` | `testID` | records the node's rendered text and its data props (`value`, `accessibilityState`, `disabled`, …) |
| `dump` | `name?` | one row per `testID` on screen with text, role, state and whether it can be pressed |
| `screenshot` | `name` | pauses the run, the driver photographs the phone and acknowledges, then the run continues |
| `scrollTo` | `testID` | scrolls the enclosing ScrollView so the node is on screen (needed for evidence, not for pressing) |
| `deeplink` | `url` | `inborn:///vault`, `inborn://vault` and `/vault` all navigate in-process; the OS is not involved |
| `setTier` | `free` \| `pro` \| `work` | the existing licence hook (`LicenceManager.pretendTier`), so Pro-gated rows can be reached |
| `devPrompt` | `lines` | writes the line file `screens/Chat.tsx` already watches: `image: <name>`, `attach: <name>`, `strict: on\|off`, or a prompt |
| `sleep` | `ms` | |
| `cleanup` | — | deletes `Documents/qa/` and any `qa-*` file the driver left at the root; see *Leaving nothing behind* |

Three things to know before writing one:

- **A closed sheet is not on screen.** React keeps a `<Modal visible={false}>`'s children mounted, so
  `attach-sheet` exists in the tree on the chat root. The bridge refuses to walk into a `visible={false}` subtree,
  which is what makes `waitFor attach-sheet` and `waitFor attach-sheet gone: true` mean what they say. Every sheet
  therefore also answers to `<its testID>-close`, the backdrop.
- **Pressing is not tapping.** A control that is off screen, behind a keyboard or under another view is still
  pressable, because the handler is called directly. That is a feature for reaching a row below the fold and a trap
  for claiming "the user can see it" — pair any such row with `scrollTo` and a screenshot.
- **`cleanup` alone does not empty the container.** The report is written after the last step, so a script ending
  in `cleanup` recreates `Documents/qa/out/<run>/` on its way out. The driver therefore acknowledges the report the
  same way it acknowledges a screenshot, and the bridge sweeps a second time once that ack lands — it never deletes
  a report the driver has not taken, because a run nobody read is a run to be diagnosed. The driver's last line says
  which happened: `swept: Documents/qa is gone` or `swept: STILL ON THE DEVICE`.
- **The photo picker cannot be driven.** `UIImagePickerController` is a system sheet in another process. The photo
  rows go through `devPrompt` with `image: <file at the Documents root>`, the hook round 38 already used.

## The guard: no bridge in a shipping build

`metro.config.js` resolves `src/qa/Bridge.tsx` to `src/qa/Bridge.stub.tsx` (`() => null`, importing nothing) unless
`EXPO_PUBLIC_QA=1`. A dead `if` would not be enough — metro records a dependency whether or not the branch can run —
so the swap happens at resolution and metro never walks into the interpreter at all.

```bash
scripts/check-qa-bridge.sh <main.jsbundle | Inborn.app | *.ipa | *.apk>   # fails if the bridge is present
scripts/check-qa-bridge.sh --expect-present <bundle>                      # fails if it is absent
```

Both directions are proven on real bundles, and the gate is watched failing in
`apps/mobile/test/qaBridgeGate.test.ts`.

| bundle | `INBORN_QA_BRIDGE_V1` | `Documents/qa/in` | `qa-bridge` | gate |
|---|---|---|---|---|
| `expo export:embed` with no `EXPO_PUBLIC_QA` | 0 | 0 | 0 | **OK** |
| `expo export:embed` with `EXPO_PUBLIC_QA=1` | 1 | 1 | 1 | **FAIL** |

## How it works

1. The driver writes the script to `Documents/qa/in/<run>.json` with `devicectl device copy to`. That reaches an
   app's own data container with no prompt of any kind.
2. `QaBridge`, one 0×0 `View` mounted by the shell, polls that directory every second. Its host node hands over a
   fiber; from the fiber the bridge climbs to the FiberRoot and reads `current`, so every walk sees the committed
   tree rather than the alternate the ref captured.
3. Each step runs against that tree. Progress goes to `Documents/qa/out/<run>/progress.json`; a `screenshot` step
   parks there until `Documents/qa/ack/<run>/<name>.ok` appears, which is how the picture and the step line up.
4. The final report is `Documents/qa/out/<run>/result.json`: per step ok/ms/detail, every `value` and `dump`, and
   any `console.error`/`console.warn` the app raised during the run.

`Documents/qa/boot.json` is written 1.5 s after launch (`{ sentinel, fiber, nodes }`) — read it first when a run
goes wrong, because it says whether the bridge is in the build at all and whether it can see the tree.
