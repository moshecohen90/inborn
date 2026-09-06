import { useMemo, useSyncExternalStore } from "react";
import { Appearance, Platform, useColorScheme, type TextStyle } from "react-native";
import { dark, fonts, light, typeScale, webFonts, type Theme, type ThemeMode } from "@inborn/ui";

export const FONT = Platform.OS === "web" ? webFonts : fonts;

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

export type TypeName = keyof typeof typeScale;

/** The §9.3 scale multiplied by the text-size setting; mono styles keep their tracking. */
export function useTypeScale(scale: number): Record<TypeName, TextStyle> {
  return useMemo(() => {
    const out = {} as Record<TypeName, TextStyle>;
    for (const k of Object.keys(typeScale) as TypeName[]) {
      const t = typeScale[k];
      out[k] = {
        fontSize: Math.round(t.fontSize * scale),
        lineHeight: Math.round(t.lineHeight * scale),
        fontWeight: t.fontWeight,
        ...("letterSpacing" in t ? { letterSpacing: t.letterSpacing } : {}),
      };
    }
    return out;
  }, [scale]);
}
