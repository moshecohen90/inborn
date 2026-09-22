import type { Shortcut } from "./shortcuts";

/** The fields of a DOM KeyboardEvent the map reads; a plain object is what the tests pass. */
export interface KeyEventLike {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

/**
 * Keyboard shortcuts on the browser and desktop shells (spec §8.9, §9.7). The Tauri menu owns the same ids through its
 * accelerators (`apps/desktop/src-tauri/src/shell.rs`); this map is what a browser window has instead of a menu bar.
 */
export function matchKey(e: KeyEventLike): Shortcut | null {
  if (e.key === "Escape") return "stop";
  const mod = !!e.metaKey || !!e.ctrlKey;
  if (!mod || e.altKey) return null;
  switch (e.key.toLowerCase()) {
    case "n":
      return e.shiftKey ? "new-incognito" : "new-chat";
    case "k":
      return "palette";
    case "f":
      return e.shiftKey ? null : "search";
    case "m":
      return e.shiftKey ? null : "model-picker";
    case "\\":
      return "toggle-sidebar";
    default:
      return null;
  }
}

/**
 * Which of those the webview itself must act on.
 *
 * A desktop build carries the whole map on its menu accelerators, so handling them here too would fire each
 * shortcut twice — except Esc, which macOS reserves and no accelerator can hold. The menu binds Stop to ⌘.
 * instead, and Esc is a §9.7 desktop key, so this is the one binding the webview keeps under Tauri.
 */
export function webviewShortcut(e: KeyEventLike, menuOwnsAccelerators: boolean): Shortcut | null {
  const id = matchKey(e);
  if (!id) return null;
  return menuOwnsAccelerators && e.key !== "Escape" ? null : id;
}
