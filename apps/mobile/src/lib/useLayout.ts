import { useWindowDimensions } from "react-native";
import { actionMaxWidth, cardMaxWidth, contentMaxWidth, isWide, layoutModeFor, type LayoutMode } from "./layout";

/** The live layout mode of the window (spec §8.9); `layout.ts` holds the thresholds, which are pure and tested. */
export function useLayoutMode(): LayoutMode {
  return layoutModeFor(useWindowDimensions().width);
}

export function useWide(): boolean {
  return isWide(useLayoutMode());
}

/* A cap only ever shrinks a column, so the window width decides it even inside the sidebar shell's narrower content area. */
export const useContentMaxWidth = (): number | undefined => contentMaxWidth(useWindowDimensions().width);
export const useActionMaxWidth = (): number | undefined => actionMaxWidth(useWindowDimensions().width);
export const useCardMaxWidth = (): number | undefined => cardMaxWidth(useWindowDimensions().width);
