# Desktop run — unattended, invisible, on `main` 9da93a2 + branch `desktop-headless-qa`

22.9.2026, this Mac (Apple Silicon, Metal), `Inborn.app` built from the branch, Qwen3.5-0.8B Q4_K_M from the
vault. Moshe was working on the machine throughout: no dialog, no keystroke, no pointer, no focus change.

**Why this run exists.** F41 and F42 both shipped with *runtime proof NOT RUN*: a freshly built `Inborn.app` is
re-signed ad hoc, the vault key's Keychain ACL then names a binary that no longer exists, and macOS asks the
operator for the login password. The fix is finding F44 below.

## What was proven

| # | Step | Result |
|---|---|---|
| 1 | Launch the built app, `INBORN_QA_SOCKET` set | window up, control socket answering `ping` in < 1 s |
| 2 | Any authorization dialog? | **none** — no `SecurityAgent` process event in `log show`, no `SecurityAgent` window in `CGWindowListCopyWindowInfo`, across every launch of the run |
| 3 | Was the Keychain touched at all? | **no** — `security find-generic-password -s com.inbornapp.desktop -a chat-db-key` was last modified at 12:29:14Z by the *production* launch and is byte-identical after the QA runs; the QA build reads `INBORN_QA_KEY_FILE` |
| 4 | Window renders (not blank) | `document.body.innerText` 171 characters of S01 Welcome; `01-launch.png` |
| 5 | Onboarding S01 → S05 | Welcome → Your model (Instant, READY NOW) → airplane test → SEALED · ON-DEVICE → Lock it? — `01`–`05` |
| 6 | Chat turn on the Rust engine | **"The capital of France is Paris."** — `07-answer.png` |
| 7 | Engine log line | `[inborn] +1444 ms loaded …/models/instant.gguf (497 MB) in 322 ms · backend=metal gpu=true threads=4 nCtx=4096`, then `generated 7 tokens · 159.6 tok/s · TTFT 66 ms · prompt 157 tokens` |
| 8 | Wide layout at the default window | 1120×720 (the `tauri.conf.json` size): `wide-sidebar` present, 280 px sidebar + centred column — `06-chat-empty.png` |
| 9 | Relaunch after a rebuild — the point | see below |
| 10 | Quit | `{"op":"quit"}` on the socket; process gone |

Ledger read from the app itself: 159.6 tok/s, TTFT 66 ms, 157 + 7 tokens, context 164/4096.

## 9 — no prompt after a rebuild, on both paths

**QA path (ad-hoc signed, the CI / agent case).** The app was rebuilt three times during this run, each with a
different code identity, and launched after each. The Keychain was never opened: the secrets come from
`INBORN_QA_KEY_FILE`. There is nothing for macOS to ask about, on any Mac, signed or not.

**Production path (Moshe's own rebuild).** `desktop:build:app` signs with *Apple Development: Moshe Cohen*,
whose designated requirement is `identifier "com.inbornapp.desktop" and anchor apple generic and certificate
leaf[subject.CN] = "Apple Development: Moshe Cohen (WUCEF6CXDH)"` — identical across builds.

| | evidence |
|---|---|
| stale ad-hoc items deleted once | `com.inbornapp.desktop / chat-db-key` and `/ licence-cache-key` (both created earlier the same day by ad-hoc builds). Deleting did not prompt |
| build 1 launched | created `chat-db-key` itself at 12:29:14Z; no dialog; window up |
| source changed, rebuilt, re-signed twice | `CDHash=b717db6e306a2ba4776a0f59576e2f79b6a89978`, then `CDHash=14ffe956083eeebe6a40e4d9b23355fb45122e49` |
| builds 2 and 3 launched | **no dialog** either time; `chat-db-key` `mdat` still 12:29:14Z — the key was *read*, not recreated; the `inborn.db` build 1 made was opened rather than started fresh — `08-production-rebuild-relaunch.png` |
| production binary carries no QA code | `strings` over `Contents/MacOS/inborn-desktop`: 0 hits for `INBORN_QA_SOCKET` / `INBORN_QA_KEY_FILE` / `qa_result`, against 5 in the QA build |

The old test data (`inborn.db*`, `licence.bin`) was backed up before the Keychain items were deleted; those dev
chats were unreadable without the deleted key anyway.

## How the run drives the app

macOS has no WKWebView WebDriver: `tauri-driver` is Linux and Windows only, the cross-platform fork is paid, and
WebdriverIO's alternative embeds a WebDriver server in the shipped app. So the `qa` Cargo feature carries
`apps/desktop/src-tauri/src/qa.rs`: a Unix socket (`INBORN_QA_SOCKET`) answering `ping` / `eval` / `window` /
`quit`, one JSON line each, with `eval` running a snippet through `Webview::eval` and getting its value back
through a `qa_result` invoke. `apps/desktop/scripts/qa-drive.mjs` is the client, `qa-desktop-run.mjs` this run.

Nothing in the path types or clicks: presses are pointer events dispatched in the page, window ids come from
`CGWindowListCopyWindowInfo`, and captures are `screencapture -x -o -l <our window id>` — our own window, never
the screen. `INBORN_QA_SOCKET` also puts the app on `NSApplicationActivationPolicyAccessory`, so it never
activates; the frontmost app was Terminal, then Chrome, then Cursor — Moshe's, throughout.

## Two things found while building it

**The occluded window freezes.** macOS marks a window nobody can see as occluded, and WebKit then stops
delivering animation frames. Onboarding S04 enables *Start* from the seal animation's completion callback, so
the run hung there for 180 s — with `document.hidden === true` while the window was perfectly healthy behind
Moshe's Chrome. Timers keep firing, so the QA build's plugin installs one line before the app's bundle:
`requestAnimationFrame` backed by `setTimeout`. The final run above completed **entirely while
`document.hidden` was true** — the whole point of the exercise.

**QA runs and Moshe's app were wiping each other's chats.** Two different keys over one `inborn.db`: whichever
opened second found a file its key could not read and started fresh (`store.rs` does that deliberately, so the
app never stops saving). A QA build now keeps `inborn.db` and the licence files beside its key file
(`secrets.rs::data_dir_override`); the model vault stays shared, so a run does not copy 497 MB. Verified: the
`inborn.db` in `~/Library/Application Support/com.inbornapp.desktop/` has the same MD5 before and after the QA
run that follows it.

## Not proven here

Documents / RAG, the updater, the tray menu and the accelerators, Pro licensing, and Windows. The QA socket is
`cfg(unix)`, so the same harness on Windows needs a named pipe.
