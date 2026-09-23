# web-bugs (round 34, F100–F103; round 35, F108–F109) — 23.9.2026

Everything here was produced headlessly over the built `apps/web/dist`, driven with playwright-core and the
chrome-headless-shell in the Playwright cache. `before-*` comes from a bundle built from `origin/main` (c45509c),
`after-*` from the bundle this branch ships. The server is `scripts/serve-web.mjs` on an ephemeral port with an
empty `MODELS_DIR`, so `webReady` is true with no model and the chat shell renders without the download door.

| file | what it proves |
| --- | --- |
| `before-f100-result.json`, `after-f100-result.json` | F100: 0 file choosers before (with the `expo-file-system is not supported on web` warning), 1 after, with `probe.txt` imported and attached |
| `before-f100-*.png`, `after-f100-*.png` | F100: the attach sheet and the screen after "Add a file" |
| `before-sheet-audit.json`, `after-sheet-audit.json`, `after-sheet-audit.txt` | F101: every item of every reachable sheet clicked one at a time; `attach-import` is the only real dead end and only before |
| `activation-control.json`, `activation-control-webkit.json` | F101: a chooser and a download fire both inside the gesture and from a 320 ms timer, in Chromium and WebKit — the hand-over was not the cause |
| `before-toggle-*.png`, `after-toggle-*.png` | F102: the switch off and on, light and dark, at 390/768/1024/1440 |
| `before-report.json`, `after-report.json` | F103: the "New chat" button is 119.5×52 before and 247×44 after at 768/1024/1440, unchanged at 390 |
| `before-w*-chats.png`, `after-w*-chats.png` | F103: the chats pane at every width |
| `after-locale-report.json`, `after-locale-*.png` | F103: all eight shipped locales × four widths, 0 wrapped labels, the one French ellipsis named |

**Reading the toggle files.** `Wi-Fi only` ships on, so in `*-toggle-*-off.png` the switch is in its **on** state as
the screen was found, and `*-toggle-*-on.png` is the state after one click, i.e. **off**. The pair is what matters:
before, both states are a barely-there grey smudge; after, one is a filled track with a ✓ and the other a hollow
outline with the knob at the other end.

`start-chat` scores a dead end in both audits. It is a false positive of the audit's "did a new testID appear"
heuristic: with a non-default persona picked it does start that chat, and the header changes to `Writer`.

## Round 35 (F108–F109) — 23.9.2026

Same rig. Here `before-*` is a bundle built from `origin/main` (88e0599, which already carries round 34) with the
four touched sources checked out from it, `after-*` the bundle this branch ships. The F108 runs use the real
`.models` directory, because Enter can only be proven to send by sending a message to a model that answers.

| file | what it proves |
| --- | --- |
| `before-f108-result.json` | F108: Enter typed into the composer added a newline and sent nothing — `enterSent: false`, `draftAfterEnter: "Say hi in three words.\n"`, 0 user messages |
| `after-f108-result.json` | F108: the same keystroke sends — `enterSent: true`, the draft is cleared, `lastUserText: "Say hi in three words."`, and Shift+Enter still yields `"line one\nline two"` |
| `after-touch-f108-result.json` | F108: a 390 px touch-only context (`finePointer: false`) still treats Enter as a newline, so phones are unaffected |
| `before-f108-*.png`, `after-f108-*.png`, `after-touch-f108-*.png` | F108: the field after Shift+Enter and the screen after Enter |
| `before-f109-result.json`, `after-f109-result.json` | F109: the wipe button's computed colours — dark text goes `rgb(243,245,247)` → `rgb(10,13,17)` on the same red, light fill goes `rgb(201,58,58)` → `rgb(188,47,47)` |
| `before-f109-wipe-*.png`, `after-f109-wipe-*.png` | F109: the button itself, dark and light, at 2× |
| `f109-ratios.txt` | F109: every pair measured, before and after |
| `f108-f109-sabotage.txt` | both: each new guard broken on purpose and the red it produced |

The statement's "about 4.3:1 in the light theme" is a different pair from the one it names: light `onDanger` on
`danger` was already 4.63:1, while 4.30:1 is danger-coloured **text** on `well`. Both are fixed; the light red moved
for the second one.
