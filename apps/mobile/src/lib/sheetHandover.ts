import { Platform } from "react-native";

/** The §9.4 sheet animation; a native hand-over waits it out. */
export const SHEET_HANDOVER_MS = 320;

/**
 * Runs the action a sheet item chose, once that sheet is out of the way.
 *
 * Android freezes when one Modal opens in the frame another one dismisses, so the phones wait out the 280 ms sheet
 * animation. A browser has no Modal to collide with, so the wait there is only 320 ms of nothing between the tap and
 * the result, and it is the last thing left holding a gesture-gated action away from its gesture.
 */
export function afterSheetClose(fn: () => void): void {
  if (Platform.OS === "web") return fn();
  setTimeout(fn, SHEET_HANDOVER_MS);
}
