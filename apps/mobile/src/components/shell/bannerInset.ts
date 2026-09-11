import { createContext, useContext } from "react";

/** Measured height of the §8.8 strip drawn under the header; a screen whose first row sits there pads by it so both stay readable (QA F13). */
export const BannerInsetContext = createContext(0);

export const useBannerInset = (): number => useContext(BannerInsetContext);
