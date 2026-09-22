# Desktop pass 1 — §8.9 and §9.7 against the running Mac app, 22.9.2026

Branch `desktop-pass-1`, Apple Silicon (M2 Max, Metal), `Inborn.app` built with `--features qa`, Qwen3.5-0.8B
Q4_K_M from the shared vault. Moshe worked on this Mac throughout: no dialog, no keystroke, no pointer, no
focus change, nothing on his screen. Everything below went through the QA control socket
(`apps/desktop/scripts/qa-drive.mjs`, channel described in `docs/qa/desktop-run-2026-09-22.md`); captures are
`screencapture -x -o -l <our own window id>`.

This is the first pass to drive the desktop app against the spec rather than against a browser at desktop
widths. `docs/qa/spec-conformance-2026-09-22.md` could not class a single §8.9 desktop row better than
"PROVEN **in a browser**"; the rows below are the app itself.

Three failures were found and fixed on this branch (**F47**, **F48**, **F49**), three are filed and not fixed
(**F81**–**F83**). A fourth, the dropped document that went nowhere, was **withdrawn** when this branch merged
`origin/main`: F63 had already built the drop path there. Both rows are kept below with what closed them.

## The clause table

`run.json` holds the raw readings. "measured" numbers are `getBoundingClientRect()` inside the webview.

| § | Clause | Verdict | Evidence |
|---|---|---|---|
| §8.9 | sidebar **280 px** | **PASS** | measured 280 at x=0, at every window size in the sweep — `01-chat-1120x720.png` |
| §8.9 | message column **680 px** | **PASS** | measured 680, centred (x=360 in a 1120 window: 280 + (840−680)/2) — `01` |
| §8.9 | sidebar sections: chats, **projects**, vault, proof, settings | **PARTIAL** | Chats, Model vault, Proof, Settings are there, plus Personas, Memory, Documents and Folders (PRO). There is no "Projects" section; Work folders stand in. Unchanged from the audit — `01` |
| §8.9 | optional **document/citation panel** on the right | **PASS** | 340 px panel beside a 280 px sidebar and a 680 px column in a 1400×900 window — `04-document-panel-1400x900.png` |
| §8.9 | **Command palette** (Cmd/Ctrl+K) | **PASS** | the menu's `inborn:shortcut` = `palette` opens it with SCREENS (New chat, Incognito, Documents, Model vault, Proof, Settings) and CHATS — `02-command-palette-1120x720.png` |
| §8.9 | shortcut **Toggle sidebar** | **PASS** | sidebar 280 → gone → 280 over two firings (`run.json` `shortcuts`) |
| §8.9 | shortcut **New chat** | **PASS** | lands on an empty chat with the "Nothing leaves this computer." headline |
| §8.9 | shortcut **Search** | **PASS** | on a wide window Search is the palette (`app/index.tsx:28`), and it opened |
| §8.9 | shortcut **Model picker** | **PASS** | opens the Chat settings sheet, whose first row is MODEL (`chat-settings`, `system-prompt`, `thinking-switch`) |
| §8.9, §9.7 | shortcut **Stop**, on **Esc** | **FAIL → fixed (F49)** | Esc did nothing to a running answer; the menu's ⌘. stopped it in under 500 ms. Now Esc stops it — `06-f49-escape-stopped-the-answer.png` |
| §9.7 | desktop window minimum **1040×720** | **FAIL → fixed (F47)** | the window took 700×460 and drew the phone shell — `00-f47-before-700x460-was-accepted.png`. Now the smallest it takes is 1040×720 — `03-f47-at-the-1040x720-minimum.png` |
| §8.9 | the shell follows the window | **FAIL → fixed (F48)** | five resizes, **zero** DOM resize events, sidebar still 280 px in a 700 px window. Now every resize reaches the app — see F48 |
| §8.9 | **Tray**: seal state, quick chat, "Quit unloads model" | **needs Moshe** | built (`shell.rs:131-175`), and "Quit unloads model" is real (`main.rs`, `RunEvent::ExitRequested` → `unload_blocking`). Opening a menu-bar menu needs a pointer. **Ask: click the Inborn tray icon and photograph the menu.** |
| §8.9 | **drag-and-drop of files** into the library | **FAIL at pass time → closed on main by F63** | on this branch's base the Rust event was emitted, relayed and heard by nothing, so a dropped PDF landed nowhere. `origin/main` added the listener (`documents/drop.web.ts`, wired in `_layout.tsx` through `dropQueue` into `DocumentsScreen`) and the `documents_read` command that serves the bytes the webview cannot read itself. Merged here. **Not re-observed at runtime: a real drag needs a pointer** |
| §8.9 | …**and folders** | **MISSING at pass time → closed on main by F63** | the drop was partitioned by the `.gguf` extension with no `is_dir()` and no recursion. `shell.rs::expand_drop` now walks a dropped folder (depth 4, 64 files, hidden skipped), covered by its three Rust tests. Same caveat: no pointer, so no live drop |
| §8.9 | desktop settings: **model location**, **Launch at login (off)** | **FAIL (F81)** | neither row exists. Settings shows the phone's "Storage location · Internal" instead, though the app knows the real path (`desktop_info` → `…/com.inbornapp.desktop/models`) |
| §8.9 | Advanced: **backend picker**, **VRAM offload**, **local server (Pro)** | **MISSING (F81)** | there is no Advanced section. The backend is chosen at compile time (`engine.rs:22-28`; this build reports `metal`) |
| §8.9 | Paywall: **Work first on desktop** | **PASS** | `tier-inborn.work` then `tier-inborn.pro` — `07-f82-paywall-work-first-buy-disabled.png` |
| §8.9 | Paywall: **signed Paddle key, verified offline** | **PARTIAL** | the door is there and opens: "Have a license key?" with `licence-key-input` and `licence-key-redeem` both present in the page. No photograph — see below. A real signed key was never redeemed. **Ask: one test key, or say to mint one.** |
| §8.9 | Paywall: Microsoft Store / Mac App Store | **DEFERRED** | `licence/provider.web.ts:5-7`, spec §14.4 |
| §8.9 | …and what the paywall actually offers | **FAIL (F82)** | both buy buttons are priced and permanently disabled: "Unlock Work · $69.99" and "Unlock Pro · $19.99", `aria-disabled="true"` — `07-f82-paywall-work-first-buy-disabled.png` |
| §5 | seal, and nothing leaving | **PASS** | header SEALED, sidebar meter `INSTANT · OUT 0 B`, and Rust's own `seal_state` = `{sealed: true, outBytes: 0}` |
| §5 | "Nothing leaves this computer." | **PASS** | `01` |
| §5 | screenshot-protection row | **FAIL (F83)** | the native macOS app says "Not available in a browser." — `05-settings-1120x720.png` |
| §7 | tier gating visible on desktop | **PASS** | Folders carries the PRO tag in the sidebar; the paywall opens from it |
| §5.9 | the Rust engine answers | **PASS** | `[inborn] loaded …/models/instant.gguf (497 MB) in 421 ms · backend=metal gpu=true threads=4 nCtx=4096`, then a streamed answer this pass cancelled on Esc |

## F47 — raising the configured minimum does not reopen an old window at it

§9.7 gives the desktop window a minimum of 1,040×720 and `lib/layout.ts:7` even names it (`DESKTOP_MIN`),
but `tauri.conf.json` said `minWidth: 720, minHeight: 480`. Asked for 700×460 the old build took it exactly,
and at that size the app drew the **phone shell** — no sidebar, the header's "Chats" button as the only door
to the list (`00-f47-before-700x460-was-accepted.png`).

**The config is F63's, not this branch's.** `origin/main` raised those two numbers to 1040×720 in round 26 and
pinned them with a test in `lib/layout.test.ts`; this branch merged that and kept it. What is filed here is the
half that change does not reach, found by driving the built app rather than reading the config.

AppKit's `contentMinSize` constrains a *drag* and not a size set in code, and
`tauri-plugin-window-state` restores the last size by setting it in code — after `setup` and after
`RunEvent::Ready` both, which is where the first two attempts at this fix were placed and did nothing. Every
existing install carries a state file written under the old 720×480 minimum, so on the first launch after the
change those windows would still have opened under the new one and nothing would ever have grown them back.

Fixed in `shell.rs`: `hold_to_configured_minimum` hangs off the window's own `Resized` event, reads the
minimum from the same config F63's test asserts, and grows the window when it is under it. So the raised
number now also reaches a window that was saved under the old one. Proven from a state file holding 500×400:

```
[inborn] window was 500x400, under the 1040x720 minimum; grown
reopened inner = 1040 x 688   (1040 x 720 outer)   sidebar 280   column 680
```

Tested by the 2 Rust tests in `shell.rs`, plus two assertions added to F63's own test (`layout.test.ts`) for
what it did not cover: that one pixel under the minimum is no longer the desktop mode, and that §8.9's sidebar
with its column, and with its panel, both fit inside the minimum.

**Not proven here:** that AppKit refuses a *drag* below 1,040×720. That needs a pointer. **Ask: drag the
Inborn window's corner as small as it will go and tell me the size.**

## F48 — the desktop shell never followed the window

The §8.9 shell switches on `useWindowDimensions().width`. In the Tauri WKWebView that number was frozen at
whatever the window was on the first paint, so the sidebar, the message column, the document panel and the
command palette's routing were all decided once and never revisited.

Measured, with counters armed in the page, across five resizes:

| | |
|---|---|
| resizes performed | 1400 → 760 → 700 → 1200 → 1400 |
| `window.innerWidth` | followed every one, exactly |
| `visualViewport.width` | followed every one, exactly |
| `window` `resize` events | **0** |
| `visualViewport` `resize` events | **0** |
| sidebar at `innerWidth` 700 | **still 280 px** — the wide shell in a window 60 px under the phone threshold |

Two things had to be true at once. The WKWebView dispatches no resize event when the Tauri window is resized,
and react-native-web 0.21.2's `Dimensions` (`exports/Dimensions/index.js`) subscribes to **`visualViewport`'s**
resize event when that object exists and to `window`'s only when it does not — so even the `resize` event this
pass dispatched by hand was ignored. `Dimensions.get()` refreshes once behind a `shouldInit` flag and never
again.

Fixed in `adapters/tauri.ts`: the one event the window does deliver is Tauri's own `tauri://resize`, so that
now drives `dispatchViewportResize` (`lib/viewportResize.ts`), which notifies whichever target this browser's
`Dimensions` subscribed to. After the fix, three resizes produced three `visualViewport` resize events and the
shell was correct at 1600, 1040 and 1280 — 280 px sidebar, 680 px column each time, and the 340 px panel at
1400.

## F49 — Esc did not stop a running answer

`matchKey` maps Escape to `stop` and `_layout.tsx:74` calls Esc "Stop" in a comment, but `useDesktopKeys`
returned early on `isTauri()` — the whole map, so that the desktop menu's accelerators would not fire twice.
macOS reserves Esc and no accelerator can carry it, so the menu binds Stop to ⌘. and Esc reached nothing.

Measured on one generation each, same prompt:

| | stop button 3.5 s later | answer still growing |
|---|---|---|
| Esc | **still showing** | **yes**, 506 → 3,342 characters |
| menu Stop (⌘.) | gone within 500 ms | no, frozen at 5,033 |

Fixed by splitting the decision out as `webviewShortcut(e, menuOwnsAccelerators)` in `lib/desktopKeys.ts`:
under Tauri the webview keeps Esc and drops every key the menu declares. After the fix Esc stops a streaming
answer within 700 ms and also closes the command palette.

## Filed, not fixed

| # | What | Why not here |
|---|---|---|
| **F81** | Desktop Settings has none of §8.9's desktop rows: no model location (the app knows it), no "Launch at login (off)", no Advanced section at all — no backend picker, no VRAM offload, no local server (Pro) | A screen's worth of new product surface, and Launch at login needs an autostart plugin. The backend cannot be a picker while it is a compile-time feature |
| **F82** | The desktop paywall shows two priced, permanently disabled buy buttons — "Unlock Work · $69.99" and "Unlock Pro · $19.99" — because the provider is `licence-key` and there is no in-app checkout. The only live door is "Have a license key?" | What should stand there instead is a copy and commerce decision, not a QA one |
| **F83** | The native macOS app's screenshot-protection row reads "Not available in a browser." (`settings.security.screenshots.web`, reached because `Platform.OS === "web"` under Tauri) | One `isTauri()` branch plus a new string in eight locales; the translations want the translation owner, not me |

## About the harness

Four things this pass had to fix in `qa-drive.mjs` / `qa-windows.swift` before any of the above could be
trusted, each of which had already produced a false or missing result:

- **A socket path over ~100 bytes cannot be bound**, and the app logged that and carried on, so a run under an
  agent scratchpad hung on `start` with no visible cause. The client now falls back to a short `/tmp` path.
- **A window on another Space images as empty chrome.** `screencapture -l` reports success and returns the
  window frame with nothing in it. Two such PNGs were already sitting in this folder as "evidence". The client
  now captures only a window the window server calls on-screen, and `window --all` exists to tell "the app
  died" apart from "Moshe went full-screen".
- **A second copy of the app leaves a window of its own**, and the first whole run of this pass photographed
  it — eight shots of a session nobody was driving. Captures are now pinned to the pid the control socket
  answers for.
- **A window that has not repainted since its last resize also images blank**, and that one is a success as
  far as `screencapture` is concerned. A frame carrying this app's UI runs 70–100 KB per megapixel and an
  empty one about 20, so the client rejects anything under 40 and waits for a real frame.

One thing is still open in the harness, and it is why the licence-key sheet has no photograph. An occluded
window repaints on a geometry change and apparently not on a modal opening over it: with
`licence-key-input` and `licence-key-redeem` both in the page, eight captures came back byte-identical to the
frame before the sheet opened, and a 1 px resize repainted everything except the modal. Only the sheet's own
pixels are missing; the DOM proof stands, and every capture in this folder was checked against the one before
it so no stale frame is filed as evidence.

Also worth knowing: the QA build keeps `inborn.db` and its licence files beside its key file, but **not** its
window state — `.window-state.json` still lives in `~/Library/Application Support/com.inbornapp.desktop/`, so
a QA run moves the window of Moshe's own Inborn. Harmless, and it is how F47 was reproduced, but it is shared
state.

## Still not proven on the desktop

The tray menu, drag-and-drop by an actual drag, a real signed licence key, the updater, documents and RAG,
Windows (the QA socket is `cfg(unix)`), and whether AppKit refuses a drag below the new minimum.
