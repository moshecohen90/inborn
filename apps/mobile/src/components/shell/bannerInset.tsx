import { createContext, useContext, useRef, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BANNER_TOP, bannerPad, bannerSpacerHeight } from "../../lib/bannerGeometry";

export { BANNER_TOP };

/** Measured height of the §8.8 strip drawn under the header; a screen whose first row sits there pads by it so both stay readable (QA F13). */
export const BannerInsetContext = createContext(0);

export const useBannerInset = (): number => useContext(BannerInsetContext);

/** Extra top space a screen needs so the floating strip never covers its first row (QA F45). */
export function useBannerPad(ownTopGap: number): number {
  return bannerPad(useBannerInset(), ownTopGap);
}

/** The same reservation as a flex child, for a screen whose first row follows a header of its own: it measures where it sits. */
export function BannerSpacer() {
  const h = useBannerInset();
  const insets = useSafeAreaInsets();
  const ref = useRef<View>(null);
  const [top, setTop] = useState<number | null>(null);
  /* Growing the spacer moves what is below it, never its own top edge, so re-measuring on layout cannot oscillate. */
  const measure = () => ref.current?.measureInWindow((_x, y) => setTop(y));
  return <View ref={ref} testID="banner-inset" onLayout={measure} style={{ height: bannerSpacerHeight(h, insets.top, top) }} />;
}
