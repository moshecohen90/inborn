/** "Runs on: A17 Pro" (S01): the chip is the trust object, so it is named from the hardware model id. */
const IPHONE_CHIPS: Record<string, string> = {
  "iPhone13,": "A14 Bionic",
  "iPhone14,": "A15 Bionic",
  "iPhone15,2": "A16 Bionic",
  "iPhone15,3": "A16 Bionic",
  "iPhone15,4": "A16 Bionic",
  "iPhone15,5": "A16 Bionic",
  "iPhone16,1": "A17 Pro",
  "iPhone16,2": "A17 Pro",
  "iPhone17,1": "A18 Pro",
  "iPhone17,2": "A18 Pro",
  "iPhone17,3": "A18",
  "iPhone17,4": "A18",
  "iPhone17,5": "A18",
  "iPhone18,": "A19 Pro",
};

export function chipForModelId(modelId: string | null | undefined): string | null {
  if (!modelId) return null;
  if (IPHONE_CHIPS[modelId]) return IPHONE_CHIPS[modelId] ?? null;
  const family = modelId.replace(/,.*$/, ",");
  return IPHONE_CHIPS[family] ?? null;
}

/* Phones report a little under their marketing size (7.4 GiB on an "8 GB" phone); §6.3 speaks in marketing sizes. */
export function marketingRamGB(bytes: number): number {
  const gb = bytes / 1024 ** 3;
  const steps = [2, 3, 4, 6, 8, 12, 16, 24, 32, 64, 128];
  return steps.find((s) => gb <= s + 0.05) ?? Math.round(gb);
}

/**
 * The one RAM number every reader uses: the marketed size, never raw GiB. The guard read raw GiB while the vault and
 * the catalog read the marketed size, which put a "6 GB" phone on both sides of Fast's 6 GB minimum (QA F43).
 */
export const ramGBFromBytes = (totalBytes: number | null | undefined): number | null => (totalBytes && totalBytes > 0 ? marketingRamGB(totalBytes) : null);

/** The one RAM label every screen shows (S01 / S02 / S30): the marketed size, never a rounded raw number. */
export function ramLabel(totalBytes: number | null | undefined): string | null {
  if (!totalBytes || totalBytes <= 0) return null;
  return `${marketingRamGB(totalBytes)} GB`;
}

/** Below 4 GB the honest line is "small models, slowly" (S01 floor state). */
export const RAM_FLOOR_BYTES = 3.5 * 2 ** 30;
export const belowFloor = (totalBytes: number | null | undefined): boolean => !!totalBytes && totalBytes < RAM_FLOOR_BYTES;

/* Android 12+ reports the SoC id (`Build.SOC_MODEL`); the marketing name is what a buyer recognises. */
const ANDROID_SOCS: Record<string, string> = {
  SDM845: "Snapdragon 845",
  SDM855: "Snapdragon 855",
  SM8150: "Snapdragon 855",
  SM8250: "Snapdragon 865",
  SM8350: "Snapdragon 888",
  SM8450: "Snapdragon 8 Gen 1",
  SM8475: "Snapdragon 8+ Gen 1",
  SM8550: "Snapdragon 8 Gen 2",
  SM8650: "Snapdragon 8 Gen 3",
  SM8750: "Snapdragon 8 Elite",
  SM7325: "Snapdragon 778G",
  SM7450: "Snapdragon 7 Gen 1",
  SM7550: "Snapdragon 7 Gen 3",
  SM6375: "Snapdragon 695",
  SM6450: "Snapdragon 6 Gen 1",
  GS101: "Tensor",
  GS201: "Tensor G2",
  ZUMA: "Tensor G3",
  "ZUMA PRO": "Tensor G4",
  "TENSOR G5": "Tensor G5",
  S5E9925: "Exynos 2200",
  S5E9935: "Exynos 2400",
  S5E9945: "Exynos 2500",
  MT6983: "Dimensity 9000",
  MT6985: "Dimensity 9200",
  MT6989: "Dimensity 9300",
  MT6991: "Dimensity 9400",
};

/* Phones on Android 11 and older have no SoC field; the few models we measured on are named by their model code. */
const ANDROID_MODELS: Record<string, string> = {
  "ONEPLUS A6013": "Snapdragon 845",
  "ONEPLUS A6003": "Snapdragon 845",
  "ONEPLUS A6010": "Snapdragon 845",
  "ONEPLUS A6000": "Snapdragon 845",
  "PIXEL 6": "Tensor",
  "PIXEL 6 PRO": "Tensor",
  "PIXEL 6A": "Tensor",
  "PIXEL 7": "Tensor G2",
  "PIXEL 7 PRO": "Tensor G2",
  "PIXEL 7A": "Tensor G2",
  "PIXEL 8": "Tensor G3",
  "PIXEL 8 PRO": "Tensor G3",
  "PIXEL 8A": "Tensor G3",
  "PIXEL 9": "Tensor G4",
  "PIXEL 9 PRO": "Tensor G4",
  "PIXEL 9A": "Tensor G4",
};

/** "Snapdragon 845" from the SoC id or the model code; null when neither is known (the caller falls back to the model name). */
export function androidChipName(socModel: string | null | undefined, modelName: string | null | undefined): string | null {
  const soc = (socModel ?? "").trim().toUpperCase();
  if (soc && soc !== "UNKNOWN") {
    if (ANDROID_SOCS[soc]) return ANDROID_SOCS[soc]!;
    /* Some vendors report a lowercase or suffixed id ("sm8550-ab"); match the leading id. */
    const base = Object.keys(ANDROID_SOCS).find((k) => soc.startsWith(k));
    if (base) return ANDROID_SOCS[base]!;
  }
  const model = (modelName ?? "").trim().toUpperCase();
  return model ? (ANDROID_MODELS[model] ?? null) : null;
}
