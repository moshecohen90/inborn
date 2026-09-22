import { createContext, useContext } from "react";
import { View } from "react-native";

/** Measured height of the §8.8 strip drawn under the header; a screen whose first row sits there pads by it so both stay readable (QA F13). */
export const BannerInsetContext = createContext(0);

export const useBannerInset = (): number => useContext(BannerInsetContext);

/* The strip floats over whatever screen is up, so every screen reserves its height instead of drawing under it (QA F45). */
export function BannerSpacer() {
  const inset = useBannerInset();
  return inset ? <View testID="banner-inset" style={{ height: inset }} /> : null;
}
