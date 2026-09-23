import { useWindowDimensions } from "react-native";
import { ACTION_WIDTH, CARD_WIDTH, COLUMN_WIDTH, isWide, layoutModeFor, maxWidthAbove, type LayoutMode } from "./layout";

/** The live layout mode of the window (spec §8.9); `layout.ts` holds the thresholds, which are pure and tested. */
export function useLayoutMode(): LayoutMode {
  return layoutModeFor(useWindowDimensions().width);
}

export function useWide(): boolean {
  return isWide(useLayoutMode());
}

/* A cap only ever shrinks a column, so the window width decides it even inside the sidebar shell's narrower content area. */
export const useMaxWidth = (cap: number): number | undefined => maxWidthAbove(useWindowDimensions().width, cap);
export const useContentMaxWidth = (): number | undefined => useMaxWidth(COLUMN_WIDTH);
export const useActionMaxWidth = (): number | undefined => useMaxWidth(ACTION_WIDTH);
export const useCardMaxWidth = (): number | undefined => useMaxWidth(CARD_WIDTH);
