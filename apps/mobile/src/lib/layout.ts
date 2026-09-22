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

export function layoutModeFor(width: number): LayoutMode {
  if (width >= DESKTOP_MIN) return "desktop";
  return width >= WIDE_MIN ? "wide" : "phone";
}

export const isWide = (mode: LayoutMode): boolean => mode !== "phone";

/** True where the window is wide enough for the document/citation panel to sit beside a full message column. */
export const hasPanel = (mode: LayoutMode): boolean => mode === "desktop";
