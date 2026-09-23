/** Which shell the window gets (spec §8.9): the phone shell, or the sidebar shell a tablet/browser/desktop window is wide enough for. */
export type LayoutMode = "phone" | "wide" | "desktop";

/** Below this the phone shell is the only one that fits; the app is portrait-locked, so no phone ever reaches it. */
export const WIDE_MIN = 760;
/** The desktop window minimum of §9.7 (1,040×720): at this width the document/citation panel also fits beside the column. */
export const DESKTOP_MIN = 1040;

/** Sidebar, message column and document panel widths (spec §8.9). */
export const SIDEBAR_WIDTH = 280;
export const COLUMN_WIDTH = 680;
export const PANEL_WIDTH = 340;

/** The widest a stack of page actions may get: a 1,400 px "Continue" reads as a banner, not a button (F110). */
export const ACTION_WIDTH = 420;
/** The onboarding card of §8.9 on a wide window: one object to look at instead of a screen-tall phone layout. */
export const CARD_WIDTH = 480;

/** A cap applies only in the sidebar shell; below it the window's own gutters are the whole rule. */
export const maxWidthAbove = (width: number, cap: number): number | undefined => (width >= WIDE_MIN ? cap : undefined);

/** Max width of a reading / settings column. */
export const contentMaxWidth = (width: number): number | undefined => maxWidthAbove(width, COLUMN_WIDTH);
/** Max width of stacked page actions (footer buttons, full-width CTAs). */
export const actionMaxWidth = (width: number): number | undefined => maxWidthAbove(width, ACTION_WIDTH);
/** Max width of the centred onboarding card. */
export const cardMaxWidth = (width: number): number | undefined => maxWidthAbove(width, CARD_WIDTH);

export function layoutModeFor(width: number): LayoutMode {
  if (width >= DESKTOP_MIN) return "desktop";
  return width >= WIDE_MIN ? "wide" : "phone";
}

export const isWide = (mode: LayoutMode): boolean => mode !== "phone";

/** True where the window is wide enough for the document/citation panel to sit beside a full message column. */
export const hasPanel = (mode: LayoutMode): boolean => mode === "desktop";
