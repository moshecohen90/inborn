import { createContext, useContext, useRef, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Where `app/_layout.tsx` floats the §8.8 strip, below the safe area and below a screen header. */
export const BANNER_TOP = 52;

/** Measured height of the §8.8 strip drawn under the header; a screen whose first row sits there pads by it so both stay readable (QA F13). */
export const BannerInsetContext = createContext(0);

export const useBannerInset = (): number => useContext(BannerInsetContext);

/**
 * Extra top space a screen needs so the floating strip never covers its first row (QA F45). `ownTopGap` is the gap the
 * screen already leaves below the safe area — the strip's height alone is not enough, because the strip starts
 * `BANNER_TOP` below that area and a screen with a smaller gap would still lose its first line behind it.
 */
export function useBannerPad(ownTopGap: number): number {
  const h = useBannerInset();
  return h > 0 ? Math.max(0, BANNER_TOP + h - ownTopGap) : 0;
}

/** The same reservation as a flex child, for a screen whose first row follows a header of its own: it measures where it sits, so no screen has to know the strip's geometry. */
export function BannerSpacer() {
  const h = useBannerInset();
  const insets = useSafeAreaInsets();
  const ref = useRef<View>(null);
  const [top, setTop] = useState<number | null>(null);
  /* Growing the spacer moves what is below it, never its own top edge, so re-measuring on layout cannot oscillate. */
  const measure = () => ref.current?.measureInWindow((_x, y) => setTop(y));
  const height = h > 0 && top !== null ? Math.max(0, insets.top + BANNER_TOP + h - top) : 0;
  return <View ref={ref} testID="banner-inset" onLayout={measure} style={{ height }} />;
}
