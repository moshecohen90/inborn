import type { CatalogModel } from "@inborn/core";

export const VISION_MODEL_ID = "vision-qwen35";
export const DEV_VISION_FILE = "mmproj.gguf";
export const resolveVision = (): string | null => null;
export const visionInstalled = (): boolean => false;
/** Nothing to scan in the browser: the vault answer is always the final one. */
export const visionScanned = (): Promise<void> => Promise.resolve();
export async function installVision(): Promise<unknown> {
  throw new Error("vision-unavailable");
}
export const modelHasVision = (_modelId: string): boolean => false;
/* No mmproj path in the browser engine yet, so nothing here can look at a photo. */
export const visionChatModel = (): CatalogModel | null => null;
