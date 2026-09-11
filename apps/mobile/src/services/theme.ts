import { useSyncExternalStore } from "react";
import { Appearance, useColorScheme } from "react-native";
import { dark, light, MAX_TEXT_SCALE, type Theme, type ThemeMode } from "@inborn/ui";

let override: ThemeMode = "system";
const listeners = new Set<() => void>();

/**
 * The one theme source (QA B14): every surface resolves `override` first and the system scheme only under "system".
 * Native `useColorScheme()` alone is not enough: on Android a uiMode change reports the system scheme even while
 * AppCompat holds the app in night mode, so screens reading it directly split from the ones reading the override.
 */
export function applyThemeMode(mode: ThemeMode): void {
  const changed = mode !== override;
  override = mode;
  if (changed) for (const l of listeners) l();
  if (typeof Appearance.setColorScheme === "function") Appearance.setColorScheme(mode === "system" ? "unspecified" : mode);
}

export const themeMode = (): ThemeMode => override;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export type Scheme = "dark" | "light";

export const resolveScheme = (mode: ThemeMode, system: string | null | undefined): Scheme => ((mode === "system" ? system : mode) === "light" ? "light" : "dark");

/** Resolved scheme for hooks and for code that runs before React (the splash's first paint). */
export const currentScheme = (): Scheme => resolveScheme(override, Appearance.getColorScheme());

export function useTheme(): { theme: Theme; scheme: Scheme } {
  const system = useColorScheme();
  const mode = useSyncExternalStore(subscribe, () => override, () => override);
  const scheme = resolveScheme(mode, system);
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
