import { useEffect, useSyncExternalStore } from "react";
import { AppState, Appearance, Platform, useColorScheme } from "react-native";
import { dark, isAutoDark, light, MAX_TEXT_SCALE, type Theme, type ThemeMode } from "@inborn/ui";
import { systemSchemeWatch } from "./systemScheme";

let override: ThemeMode = "auto";
const listeners = new Set<() => void>();

/**
 * The one theme source (QA B14): every surface resolves `override` first and the system scheme only under "auto".
 * Native `useColorScheme()` alone is not enough: on Android a uiMode change reports the system scheme even while
 * AppCompat holds the app in night mode, so screens reading it directly split from the ones reading the override.
 */
export function applyThemeMode(mode: ThemeMode): void {
  const changed = mode !== override;
  override = mode;
  if (changed) for (const l of listeners) l();
  if (typeof Appearance.setColorScheme === "function") Appearance.setColorScheme(mode === "auto" ? "unspecified" : mode);
}

export const themeMode = (): ThemeMode => override;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** F309: a shared minute tick so every mounted `useTheme()` re-evaluates the clock rule while "auto" stays open. */
let tick = 0;
const tickListeners = new Set<() => void>();
const subscribeTick = (l: () => void) => {
  tickListeners.add(l);
  return () => tickListeners.delete(l);
};
function bumpTick(): void {
  tick += 1;
  for (const l of tickListeners) l();
}
let autoWatchStarted = false;
/** Started lazily on first mount, never torn down: the clock/foreground watch lives for the app's lifetime, like `override` above. */
function ensureAutoWatch(): void {
  if (autoWatchStarted) return;
  autoWatchStarted = true;
  setInterval(bumpTick, 60_000);
  AppState.addEventListener("change", (state) => {
    if (state === "active") bumpTick();
  });
}

export type Scheme = "dark" | "light";

/* react-native-web's useColorScheme re-subscribes on every render and missed a live OS flip (W1): the page stayed dark. */
const webSystem =
  Platform.OS === "web" && typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? systemSchemeWatch(window.matchMedia("(prefers-color-scheme: dark)"))
    : null;
const noSubscribe = () => () => {};
const webSnapshot = () => webSystem?.get() ?? null;

/** "auto" resolves via the isAutoDark clock rule (night 18:00-06:00, or the OS already dark); `now` is injectable for tests. */
export const resolveScheme = (mode: ThemeMode, system: string | null | undefined, now: Date = new Date()): Scheme => {
  if (mode === "light") return "light";
  if (mode === "dark") return "dark";
  return isAutoDark(now, system === "dark") ? "dark" : "light";
};

/** Resolved scheme for hooks and for code that runs before React (the splash's first paint). */
export const currentScheme = (): Scheme => resolveScheme(override, webSystem?.get() ?? Appearance.getColorScheme(), new Date());

export function useTheme(): { theme: Theme; scheme: Scheme } {
  const nativeSystem = useColorScheme();
  const webScheme = useSyncExternalStore(webSystem?.subscribe ?? noSubscribe, webSnapshot, webSnapshot);
  const system = webScheme ?? nativeSystem;
  const mode = useSyncExternalStore(subscribe, () => override, () => override);
  useSyncExternalStore(subscribeTick, () => tick, () => tick);
  useEffect(() => {
    ensureAutoWatch();
  }, []);
  const scheme = resolveScheme(mode, system, new Date());
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
