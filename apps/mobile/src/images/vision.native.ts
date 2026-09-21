import { File, Paths } from "expo-file-system";
import type { CatalogModel } from "@inborn/core";
import { getVault } from "../vault/store";

/** Catalog id of the Qwen3.5 projector that gives Instant / Fast / Sharp their eyes (spec §6.1 "vision: yes (mmproj)", §6.2). */
export const VISION_MODEL_ID = "vision-qwen35";
/** Dev fallback: the mmproj GGUF pushed by hand as Documents/mmproj.gguf. */
export const DEV_VISION_FILE = "mmproj.gguf";

export function resolveVision(): string | null {
  const state = getVault().state(VISION_MODEL_ID);
  if (state.kind === "ready") return state.path;
  const dev = new File(Paths.document, DEV_VISION_FILE);
  return dev.exists ? dev.uri : null;
}

export const visionInstalled = (): boolean => resolveVision() !== null;

export function installVision(): Promise<unknown> {
  return getVault().install(VISION_MODEL_ID);
}

/** Only the Qwen3.5 chat models share this projector (spec §6.1: Phi-4-mini has no vision). */
export const modelHasVision = (modelId: string): boolean => getVault().model(modelId)?.vision === true;

/**
 * The chat model the shipped projector actually fits. One `mmproj` is built for one embedding width, and ours is
 * Instant's (1024): Fast (2048) and Sharp (2560) refuse it, so the catalog marks them `vision: false` (QA F36).
 */
export const visionChatModel = (): CatalogModel | null => getVault().manifest.models.find((m) => m.role === "chat" && m.vision) ?? null;
