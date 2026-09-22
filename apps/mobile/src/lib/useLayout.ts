import { useWindowDimensions } from "react-native";
import { isWide, layoutModeFor, type LayoutMode } from "./layout";

/** The live layout mode of the window (spec §8.9); `layout.ts` holds the thresholds, which are pure and tested. */
export function useLayoutMode(): LayoutMode {
  return layoutModeFor(useWindowDimensions().width);
}

export function useWide(): boolean {
  return isWide(useLayoutMode());
}
