import type { Tier } from "./types";

/**
 * "Expected on your device" (spec §6.4): a range, never one number, because heat takes 15–40% after
 * 5–10 minutes. Classes are keyed by platform and RAM, the two things the app can read without a benchmark.
 */
export type ChipClass =
  | "ios-entry" // 3–4 GB: SE 2/3, 11–14, 13 mini
  | "ios-mid" // 6 GB: 13 Pro … 15 Plus
  | "ios-high" // 8 GB: 15 Pro, all 16, 17
  | "ios-flagship" // 12 GB: 17 Pro, Air
  | "android-entry" // ≤4 GB
  | "android-mid" // 6 GB: Pixel 6/7, S21–S23
  | "android-high" // 8 GB: Pixel 8/9, S24/S25, 8 Gen 2/3
  | "android-flagship" // 12 GB+: 8 Elite, Ultra
  | "desktop-cpu"
  | "desktop-apple"
  | "desktop-gpu"
  | "web";

export type SpeedRange = readonly [min: number, max: number];

/* tok/s from §6.4 measurements plus the week-0 runs (README): OnePlus 6T 15.8, iPhone 13 Pro 36, headless Chromium 33/7. */
const TABLE: Record<ChipClass, Partial<Record<Tier, SpeedRange>>> = {
  "ios-entry": { instant: [15, 25], fast: [8, 14] },
  "ios-mid": { instant: [25, 36], fast: [15, 24], sharp: [8, 12] },
  "ios-high": { instant: [27, 40], fast: [24, 40], sharp: [13, 18], power: [5, 8] },
  "ios-flagship": { instant: [40, 58], fast: [30, 40], sharp: [15, 20], power: [6, 9] },
  "android-entry": { instant: [6, 12] },
  "android-mid": { instant: [12, 20], fast: [8, 12], sharp: [5, 8] },
  "android-high": { instant: [18, 28], fast: [10, 14], sharp: [8, 14], power: [4, 5] },
  "android-flagship": { instant: [25, 35], fast: [14, 20], sharp: [10, 15], power: [5, 6] },
  "desktop-cpu": { instant: [20, 30], fast: [12, 18], sharp: [6, 10], power: [3, 5] },
  "desktop-apple": { instant: [40, 80], fast: [30, 50], sharp: [20, 35], power: [15, 41], studio: [5, 10] },
  "desktop-gpu": { instant: [100, 200], fast: [80, 150], sharp: [60, 100], power: [40, 80], studio: [20, 40] },
  web: { instant: [7, 33], fast: [4, 15] },
};

export interface ChipInput {
  os: "ios" | "android" | "macos" | "windows" | "linux" | "web";
  ramGB: number;
  appleSilicon?: boolean;
  discreteGpu?: boolean;
  /** Marketing chip name when known ("Snapdragon 845"); RAM alone rates an 8 GB phone from 2018 as a Pixel 9. */
  chipName?: string | null;
}

/* Pre-2022 flagships and every Tensor before G3: an 8 GB OnePlus 6T measured 12-15 tok/s on Instant, the "high" row promises 18-28. */
const OLD_ANDROID_CHIP = /snapdragon\s+(6\d\d|7\d\d|8[0-9]{2}|8 gen 1)\b|tensor(\s+g[12])?$|exynos\s+(9|2[01])\d\d|kirin|helio|dimensity\s+[1-9]\d{2,3}\b/i;

export function chipClassFor({ os, ramGB, appleSilicon, discreteGpu, chipName }: ChipInput): ChipClass {
  if (os === "web") return "web";
  if (os === "ios") return ramGB >= 12 ? "ios-flagship" : ramGB >= 8 ? "ios-high" : ramGB >= 6 ? "ios-mid" : "ios-entry";
  if (os === "android") {
    const byRam: ChipClass = ramGB >= 12 ? "android-flagship" : ramGB >= 8 ? "android-high" : ramGB >= 6 ? "android-mid" : "android-entry";
    return chipName && OLD_ANDROID_CHIP.test(chipName) && (byRam === "android-high" || byRam === "android-flagship") ? "android-mid" : byRam;
  }
  if (discreteGpu) return "desktop-gpu";
  return appleSilicon || os === "macos" ? "desktop-apple" : "desktop-cpu";
}

export const expectedSpeed = (chip: ChipClass, tier: Tier | undefined): SpeedRange | undefined => (tier ? TABLE[chip][tier] : undefined);
