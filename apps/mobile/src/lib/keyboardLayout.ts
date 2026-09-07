/** Pure keyboard geometry for sheets and screens; `keyboard.ts` feeds it from the native events. */

export type KeyboardOS = "ios" | "android" | "web" | "windows" | "macos";

/** Keyboard top measured from the window bottom. Android reports the IME above the navigation bar (RN subtracts it); iOS from the screen edge. */
export function keyboardLift(keyboardHeight: number, safeBottom: number, os: KeyboardOS): number {
  if (keyboardHeight <= 0) return 0;
  return os === "android" ? keyboardHeight + safeBottom : keyboardHeight;
}

export interface SheetGeometry {
  bottom: number;
  paddingBottom: number;
  maxHeight: number;
}

export interface SheetGeometryInput {
  lift: number;
  safeBottom: number;
  safeTop: number;
  windowHeight: number;
  /** Padding under the content with no keyboard; the safe inset is added to it. */
  basePadding: number;
  /** Share of the window the sheet may take with no keyboard (0–1). */
  share: number;
}

const TOP_GAP = 24;
const MIN_HEIGHT = 160;

/** A bottom sheet resting on the keyboard: lifted by it, safe inset dropped (the keyboard covers it), height capped to what stays visible. */
export function sheetGeometry({ lift, safeBottom, safeTop, windowHeight, basePadding, share }: SheetGeometryInput): SheetGeometry {
  if (lift <= 0) return { bottom: 0, paddingBottom: safeBottom + basePadding, maxHeight: Math.round(windowHeight * share) };
  return { bottom: lift, paddingBottom: basePadding, maxHeight: Math.max(windowHeight - lift - safeTop - TOP_GAP, MIN_HEIGHT) };
}
