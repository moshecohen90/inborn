# Desktop and wide-window layout (branch `desktop-layout`) — 22.9.2026

Moshe, 22.9: *"on large screens like desktop the app must have a desktop design, not a mobile one, depending on the
screen size."* Until this branch the web export and the Tauri window rendered the phone shell stretched to the window
width — one column, the "Chats" header button as the only door to the chat list, bottom sheets rising from the bottom
edge of a 1,440 px window. Spec §8.9 and §9.7 already described the desktop shell; this is that shell.

## What was built

**One threshold table, three shells** (`apps/mobile/src/lib/layout.ts`, pure and tested; the hooks live in
`lib/useLayout.ts` because the vitest environment is Node and cannot import `react-native`):

| mode | window width | shell |
|---|---|---|
| `phone` | < 760 | exactly what shipped to the stores |
| `wide` | 760–1039 | sidebar + centred message column |
| `desktop` | ≥ 1040 (the §9.7 window minimum) | sidebar + column + document/citation panel |

The app is portrait-locked (`app.config.ts`), so no phone reaches 760 pt: the phone layout is unreachable-by-accident,
not merely unchanged. A tablet in portrait (820 pt) and a browser window do reach it, which is what §8.9 asks for.
Onboarding, the legal screens and the lock screen keep the whole window at any width — a chats sidebar beside a
first-run screen would be the shell before the app exists.

**Sidebar, 280 px** (`components/shell/WideShell.tsx` + `components/shell/ChatsPane.tsx`). The chats drawer that the
phone pushes as a route is the sidebar's content, mounted permanently: search, New chat / Incognito, pinned, the Work
folders (the spec's "projects"), recent, archived, and the footer readout. The route body moved into `ChatsPane` so both
shells render the same pane; `/chats` redirects to `/` on a wide window, the way the demo's desktop frame does.
`Chats` gained one prop, `embedded`, which drops the close ✕ (there is nothing to close) and nothing else. In the
sidebar the footer also carries Model vault and Documents, so all five §8.9 sections are reachable there; the phone
drawer's footer is untouched.

**Message column, 680 px** (`screens/Chat.tsx`). The stream and the composer are centred at the §8.9 text measure; the
header spans the content area with the phone's "Chats" button replaced by a spacer, so the seal stays centred. Hide the
sidebar with Cmd+\ and the button comes back and reopens it, so the shortcut is never a dead end (`lib/sidebar.ts`
holds that one flag outside React so the header can read it). Every other chat behaviour is the phone's.

**Document / citation panel, 340 px, desktop only.** `Citations` already carried an `onOpen` hook documented as "the
desktop side panel, for instance" — it now opens the passage in the right panel instead of a modal sheet when the
window has one. `PassageSheet`'s body was lifted into `PassagePanel` so both render the same passage. The Documents
library opens in the same panel from the sidebar, the command palette and the chat's attach flow.

**Sheets become dialogs.** Both `Sheet` primitives (`components/shell/Sheet.tsx`, `components/chat/Sheet.tsx`) render a
centred 560 px dialog with a fade instead of a bottom sheet with a slide when the window is wide. A window with a
sidebar has no bottom edge for a sheet to rise from.

**Keyboard shortcuts**, browser and desktop only (`lib/desktopKeys.ts` is the pure map, `components/shell/useDesktopKeys.ts`
binds it):

| chord | id | effect |
|---|---|---|
| Cmd/Ctrl+N | `new-chat` | new chat (Shift: incognito) |
| Cmd/Ctrl+K | `palette` | command palette |
| Cmd/Ctrl+F | `search` | the palette (wide) / the drawer (phone) |
| Cmd/Ctrl+M | `model-picker` | the chat's model sheet |
| Cmd/Ctrl+\ | `toggle-sidebar` | show/hide the sidebar |
| Esc | `stop` | stop generating; closes the palette |

They ride the `lib/shortcuts.ts` bus the Tauri menu has used since phase 3, so the screens needed no new wiring. The
three new ids also became real menu items with the same accelerators (`apps/desktop/src-tauri/src/shell.rs`: Edit ›
Command Palette, Window › Toggle Sidebar / Model Picker), and the browser binding is skipped inside Tauri so a chord
never fires twice.

**Command palette** (`components/shell/CommandPalette.tsx`): no animation, one text field, the six screens of the
sidebar and the recent chats, filtered by substring; Enter runs the first hit.

**One bug found on the way.** `chatCreated` never bumped `chatsVersion`, so a chats list that stays mounted — which is
new, the sidebar is the first one — did not show a chat the moment the first message created it. The phone never saw
this because its drawer reloads on every mount. One line in `services/AppServices.tsx`; before it, the sidebar in
screenshot 01 read "No chats yet." beside the answer it had just produced.

## Proof

Screenshots are of the real deployable web build (`pn web:build` → `apps/web/dist`) served by `scripts/serve-web.mjs`,
driven headless by `docs/qa/desktop-layout/shots.mjs` (one Chromium, closed at the end; the model is downloaded once
into OPFS and every shot is taken against a real Instant answer).

```
MODELS_DIR=/Users/moshecohen/dev/inborn/.models node docs/qa/desktop-layout/shots.mjs
```

| file | what it shows |
|---|---|
| `docs/qa/desktop-layout/01-desktop-1280x800-chat.png` | 1280×800: sidebar, centred column, header without the back button |
| `docs/qa/desktop-layout/02-desktop-1280x800-palette.png` | Cmd+K palette: SCREENS + CHATS |
| `docs/qa/desktop-layout/03-desktop-1280x800-document-panel.png` | three columns: sidebar, chat, document panel |
| `docs/qa/desktop-layout/04-desktop-1280x800-sidebar-hidden.png` | Cmd+\ with the sidebar hidden; the header's "Chats" button is back to reopen it |
| `docs/qa/desktop-layout/05-desktop-1440x900-chat.png` | 1440×900: the column stays 680, the sidebar lists the chat |
| `docs/qa/desktop-layout/06-wide-900x800-chat.png` | 900 px: sidebar, no panel (the `wide` mode) |
| `docs/qa/desktop-layout/07-phone-390x844-chat.png` | 390×844: the phone shell, unchanged |
| `docs/qa/desktop-layout/08-phone-390x844-chats.png` | 390×844: the pushed chats drawer with its ✕, unchanged |
| `docs/qa/desktop-layout/10-ab-phone-chat.png` | the phone A/B: the empty chat at 390×844 |
| `docs/qa/desktop-layout/11-ab-phone-chats.png` | the phone A/B: the chats drawer at 390×844 |

**The phone shell is pixel-identical, measured.** `SHOTS_PHONE_AB=1` takes those last two shots with no prompt sent, so
the picture is deterministic (an answer's wording changes run to run). The same run against `origin/main` 6899f07 in a
separate worktree produced **byte-identical files**:

| screen | sha256 (both trees) |
|---|---|
| empty chat, 390×844 | `b9c0fac7b09ea6f38718…` |
| chats drawer, 390×844 | `9aff31497a08365ce90b…` |

The baseline carries the one-file `vault/resolve.web.ts` below and nothing else, because without it `origin/main`'s web
bundle throws before the first paint and there is no phone screen to compare.

Gates on this branch: `pn install --frozen-lockfile` 0, `pn typecheck` 0, `pn test` 0 (core 505, mobile 179 — 169 plus
the 4 layout-mode and 6 key-map tests — i18n 10, ui 11: **705**), `pn lint` 0, `pn web:build` 0, `pn web:smoke` 0
(five PASS lines). `pn desktop:build:app` also returned 0 here, but see the note below: the desktop app is not part of
this branch's proof.

## Where this differs from the demo, and what is not proven

- **Column width 680, not 760.** `docs/inborn-demo.html` sets `.device.desktop .scr .col{max-width:760px}`; §8.9 and
  §9.7 say 680 for the message column. The spec wins; the demo's own notes panel says "עמודת הודעות 760px", so the two
  documents disagree and this is the one place the build follows the spec text rather than the picture.
- **The demo's desktop frame is 1120×720**, between the two thresholds in height only; width 1120 lands in `desktop`,
  which is what the frame shows (sidebar + column). No panel is in the demo frame because the demo has no citations.
- **The citation panel was not photographed.** Producing a real citation needs an indexed document, and indexing on the
  web tier needs the `nomic-embed` GGUF, which is not in `.models` on this machine. The passage panel and the library
  panel are the same component and the same store; only the library variant is in a screenshot.
- **Cmd+N and Cmd+M cannot be claimed in a browser** (new window / minimise are handled above the page and survive
  `preventDefault`). They work in the desktop app, where the menu owns them. Cmd+K, Cmd+\ and Esc work in both.
- **Focus rings are the browser default blue**, not the 2 px amber of §9.7, on the palette field and on every other
  input on the web. That is a pre-existing web-wide gap, not something this branch introduced; fixing it belongs with
  the web stream that owns the page shell.
- **The web build needed the F40 fix to boot at all.** `apps/mobile/src/vault/resolve.ts` imports the llama.rn adapter,
  which evaluates `TurboModuleRegistry.get("RNLlama")` in the web bundle and throws before the first paint. The
  `web-desktop-check` stream owns that fix; this branch carries the same minimal `apps/mobile/src/vault/resolve.web.ts`
  so its own proof could run, to be reconciled at merge.
- **No phone, emulator or simulator was used**, by instruction. The phone-shell screenshots are the web build at
  390×844, which is the same React tree, not an Android or iOS run.
- **No screenshot of the desktop app, by instruction.** Launching a freshly built `Inborn.app` changes its ad-hoc
  signature, and the vault key's Keychain ACL then asks the operator for a password on screen. Moshe asked for that to
  stop, so the desktop shell is out of this branch's proof and belongs to the `web-desktop-check` stream. **The desktop
  layout is therefore proven in the browser at desktop widths, not in the Tauri window.** The Tauri side of the work —
  the three menu accelerators in `apps/desktop/src-tauri/src/shell.rs` — is covered by the Rust build and by the fact
  that the webview binding stands down inside Tauri so a chord never fires twice; neither was exercised in a window.
  One observation from the single launch made before that instruction arrived, for whoever owns the desktop shell: the
  window came up **blank** at its default 1120×720 with the Rust side healthy (`metal backend ready` in 107 ms), while
  the very same `apps/mobile/dist` bundle rendered correctly when served to headless Chrome. That points at the Tauri
  boot path, which this branch does not touch, in the same area as F41.
