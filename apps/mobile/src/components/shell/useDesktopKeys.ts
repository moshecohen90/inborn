import { useEffect } from "react";
import { Platform } from "react-native";
import { emitShortcut } from "../../lib/shortcuts";
import { webviewShortcut } from "../../lib/desktopKeys";
import { isTauri } from "../../adapters/tauri";

/** Binds the §8.9 key map to the window. On the desktop build the menu bar carries the accelerators, so only Esc is bound here (`webviewShortcut`). */
export function useDesktopKeys(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || Platform.OS !== "web" || typeof window === "undefined") return;
    const menuOwnsAccelerators = isTauri();
    const onKey = (e: KeyboardEvent) => {
      const id = webviewShortcut(e, menuOwnsAccelerators);
      if (!id) return;
      /* Cmd+N and Cmd+M belong to the browser itself and survive this; the desktop app owns them through its menu instead. */
      e.preventDefault();
      emitShortcut(id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
