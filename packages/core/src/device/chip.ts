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

/** Whole gigabytes as marketed: 5.6e9 reported by the OS is the 6 GB phone. */
export function ramLabel(totalBytes: number | null | undefined): string | null {
  if (!totalBytes || totalBytes <= 0) return null;
  return `${Math.round(totalBytes / 2 ** 30)} GB`;
}

/** Below 4 GB the honest line is "small models, slowly" (S01 floor state). */
export const RAM_FLOOR_BYTES = 3.5 * 2 ** 30;
export const belowFloor = (totalBytes: number | null | undefined): boolean => !!totalBytes && totalBytes < RAM_FLOOR_BYTES;
