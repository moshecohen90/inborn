interface KeyLike {
  key: string;
  shiftKey?: boolean;
  target: unknown;
  currentTarget: unknown;
}

/** The keys that open a focused item's actions menu: Enter, Space, the ContextMenu key and Shift+F10 — never a key aimed at a button inside it. */
export function opensActions(e: KeyLike): boolean {
  if (e.target !== e.currentTarget) return false;
  return e.key === "Enter" || e.key === " " || e.key === "ContextMenu" || (e.key === "F10" && !!e.shiftKey);
}

type WebKeyEvent = KeyLike & { preventDefault(): void };

/** Web-only props that open the same actions sheet a long-press opens: the keys above and a right-click. Native gets none. */
export function actionsMenuProps(open: () => void, os: string): Record<string, unknown> {
  if (os !== "web") return {};
  return {
    onKeyDown: (e: WebKeyEvent) => {
      if (!opensActions(e)) return;
      e.preventDefault();
      open();
    },
    onContextMenu: (e: { preventDefault(): void }) => {
      /* Right-click on selected text keeps the browser's own Copy menu. */
      if (globalThis.getSelection?.()?.isCollapsed === false) return;
      e.preventDefault();
      open();
    },
  };
}
