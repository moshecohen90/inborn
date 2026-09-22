/** Where `app/_layout.tsx` floats the §8.8 strip: below the safe area, and below a screen header of the same height. */
export const BANNER_TOP = 52;

/**
 * Top space a screen must reserve so the floating strip never covers its first row (QA F45). `ownTopGap` is the gap the
 * screen already leaves below the safe area; the strip's height alone is not enough, because the strip starts
 * `BANNER_TOP` below that area, so a screen with a smaller gap still loses its first line behind it.
 */
export const bannerPad = (stripHeight: number, ownTopGap: number): number => (stripHeight > 0 ? Math.max(0, BANNER_TOP + stripHeight - ownTopGap) : 0);

/** The same reservation for a spacer that measured its own position in the window, so no screen has to know the geometry. */
export const bannerSpacerHeight = (stripHeight: number, safeAreaTop: number, measuredTop: number | null): number =>
  stripHeight > 0 && measuredTop !== null ? Math.max(0, safeAreaTop + BANNER_TOP + stripHeight - measuredTop) : 0;
