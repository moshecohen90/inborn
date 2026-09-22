import { useEffect } from "react";
import { Platform } from "react-native";
import { emitShortcut } from "../../lib/shortcuts";
import { matchKey } from "../../lib/desktopKeys";
import { isTauri } from "../../adapters/tauri";

/** Binds the §8.9 key map to the browser window. The desktop build has a real menu bar carrying the same accelerators, so binding there would fire each shortcut twice. */
export function useDesktopKeys(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || Platform.OS !== "web" || typeof window === "undefined" || isTauri()) return;
    const onKey = (e: KeyboardEvent) => {
      const id = matchKey(e);
      if (!id) return;
      /* Cmd+N and Cmd+M belong to the browser itself and survive this; the desktop app owns them through its menu instead. */
      e.preventDefault();
      emitShortcut(id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
