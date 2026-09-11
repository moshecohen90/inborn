import { useWindowDimensions } from "react-native";
import type { Theme } from "@inborn/ui";
import { useTheme as useResolvedTheme } from "../services/theme";

/** Same source as the shell (services/theme): the Settings override first, the system scheme only under "system". */
export function useTheme(): Theme {
  return useResolvedTheme().theme;
}

/** Text-size multiplier (Android font scale / iOS Dynamic Type); layout heights scale with it, never clip. */
export function useFontScale(): number {
  return useWindowDimensions().fontScale || 1;
}
