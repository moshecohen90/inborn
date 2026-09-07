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
  | "android-legacy" // LPDDR4X flagships of 2018–2020 (Snapdragon 845/855/865), any RAM: OnePlus 6T
  | "android-mid" // 6 GB: Pixel 6/7, S21–S23
  | "android-high" // 8 GB: Pixel 8/9, S24/S25, 8 Gen 2/3
  | "android-flagship" // 12 GB+: 8 Elite, Ultra
  | "desktop-cpu"
  | "desktop-apple"
  | "desktop-gpu"
  | "web";

export type SpeedRange = readonly [min: number, max: number];

/* tok/s from §6.4 measurements plus the device runs (README): OnePlus 6T Instant 12–15.5 / Fast 5–5.8 (CPU only), iPhone 13 Pro 36, headless Chromium 33/7. */
const TABLE: Record<ChipClass, Partial<Record<Tier, SpeedRange>>> = {
  "ios-entry": { instant: [15, 25], fast: [8, 14] },
  "ios-mid": { instant: [25, 36], fast: [15, 24], sharp: [8, 12] },
  "ios-high": { instant: [27, 40], fast: [24, 40], sharp: [13, 18], power: [5, 8] },
  "ios-flagship": { instant: [40, 58], fast: [30, 40], sharp: [15, 20], power: [6, 9] },
  "android-entry": { instant: [6, 12] },
  "android-legacy": { instant: [12, 18], fast: [5, 7], sharp: [3, 4] },
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
  /** Marketing SoC name (androidChipName); RAM alone cannot tell a 2018 flagship from a Pixel 9. */
  chipName?: string | null;
}

/* Token generation is memory-bound: these ship LPDDR4X (~half the bandwidth of every 8 Gen 1+ phone), so 8 GB of RAM buys no speed. */
const LEGACY_ANDROID_CHIPS = new Set(["Snapdragon 845", "Snapdragon 855", "Snapdragon 865"]);
export const isLegacyAndroidChip = (chipName: string | null | undefined): boolean => !!chipName && LEGACY_ANDROID_CHIPS.has(chipName);

export function chipClassFor({ os, ramGB, appleSilicon, discreteGpu, chipName }: ChipInput): ChipClass {
  if (os === "web") return "web";
  if (os === "ios") return ramGB >= 12 ? "ios-flagship" : ramGB >= 8 ? "ios-high" : ramGB >= 6 ? "ios-mid" : "ios-entry";
  if (os === "android") {
    if (isLegacyAndroidChip(chipName)) return "android-legacy";
    return ramGB >= 12 ? "android-flagship" : ramGB >= 8 ? "android-high" : ramGB >= 6 ? "android-mid" : "android-entry";
  }
  if (discreteGpu) return "desktop-gpu";
  return appleSilicon || os === "macos" ? "desktop-apple" : "desktop-cpu";
}

export const expectedSpeed = (chip: ChipClass, tier: Tier | undefined): SpeedRange | undefined => (tier ? TABLE[chip][tier] : undefined);
