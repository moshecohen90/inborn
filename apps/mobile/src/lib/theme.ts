import { useColorScheme, useWindowDimensions } from "react-native";
import { dark, light, type Theme } from "@inborn/ui";

export function useTheme(): Theme {
  return useColorScheme() === "light" ? light : dark;
}

/** Text-size multiplier (Android font scale / iOS Dynamic Type); layout heights scale with it, never clip. */
export function useFontScale(): number {
  return useWindowDimensions().fontScale || 1;
}
