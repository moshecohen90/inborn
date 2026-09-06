import { useSyncExternalStore } from "react";
import { Appearance, useColorScheme } from "react-native";
import { dark, light, MAX_TEXT_SCALE, type Theme, type ThemeMode } from "@inborn/ui";

let override: ThemeMode = "system";
const listeners = new Set<() => void>();

/** One switch for the whole app: native screens that read useColorScheme() (Chat, Chats) follow it through Appearance; react-native-web has no setColorScheme, so there the override applies to the shell's own screens. */
export function applyThemeMode(mode: ThemeMode): void {
  override = mode;
  for (const l of listeners) l();
  if (typeof Appearance.setColorScheme === "function") Appearance.setColorScheme(mode === "system" ? "unspecified" : mode);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useTheme(): { theme: Theme; scheme: "dark" | "light" } {
  const system = useColorScheme();
  const mode = useSyncExternalStore(subscribe, () => override, () => override);
  const scheme = (mode === "system" ? system : mode) === "light" ? "light" : "dark";
  return { theme: scheme === "light" ? light : dark, scheme };
}

let textScale = 1;
const scaleListeners = new Set<() => void>();
const subscribeScale = (l: () => void) => {
  scaleListeners.add(l);
  return () => scaleListeners.delete(l);
};

/** The Settings "Text size" multiplier, applied once through useType() on every surface (web included). */
export function applyTextScale(scale: number): void {
  const next = Math.min(MAX_TEXT_SCALE, Math.max(0.5, Number.isFinite(scale) ? scale : 1));
  if (next === textScale) return;
  textScale = next;
  for (const l of scaleListeners) l();
}

export function useTextScale(): number {
  return useSyncExternalStore(subscribeScale, () => textScale, () => textScale);
}
