import { File, Paths } from "expo-file-system";
import { extensions, photoPlan, visionPackFor, type PhotoPlan } from "@inborn/core";
import { chatModelState, offeredChatModels } from "../extensions/chatModel";
import { getVault } from "../vault/store";

/** Catalog id of Instant's projector, the one the app bundles (spec §6.1 "vision: yes (mmproj)", §6.2). */
export const VISION_MODEL_ID = "vision-qwen35";
/** Dev fallback: the mmproj GGUF pushed by hand as Documents/mmproj.gguf. */
export const DEV_VISION_FILE = "mmproj.gguf";

/* One `mmproj` fits one embedding width (QA F36), so a pack serves only its own model. */
export const visionPackId = (modelId: string): string | null => visionPackFor(modelId)?.id ?? null;

function packPath(packId: string): string | null {
  const state = getVault().state(packId);
  if (state.kind === "ready") return state.path;
  /* The hand-pushed dev file has always been Instant's projector; it fits no other model. */
  if (packId !== VISION_MODEL_ID) return null;
  const dev = new File(Paths.document, DEV_VISION_FILE);
  return dev.exists ? dev.uri : null;
}

export function resolveVision(modelId: string): string | null {
  const id = visionPackId(modelId);
  return id ? packPath(id) : null;
}

export const visionInstalled = (modelId: string): boolean => resolveVision(modelId) !== null;

/** Resolves once the vault has read the disk: before that every model reads as "no projector installed" (QA F294). */
export const visionScanned = (): Promise<void> => getVault().ready();

export function installVision(modelId: string): Promise<unknown> {
  const id = visionPackId(modelId);
  return id ? getVault().install(id) : Promise.reject(new Error("vision-unavailable"));
}

/** Whether the model can see on this phone: its pack is here, or this build can bring it (Android only through Play, F463). */
export function modelHasVision(modelId: string): boolean {
  const pack = getVault().model(modelId)?.vision === true ? visionPackFor(modelId) : undefined;
  return !!pack && (packPath(pack.id) !== null || getVault().canDeliver(pack.id));
}

const isPack = (id: string): boolean => extensions().some((e) => e.kind === "vision" && e.id === id);

export function photoPlanHere(selected: string, pro: boolean): PhotoPlan {
  return photoPlan({
    selected,
    models: offeredChatModels(pro),
    installed: (id) => (isPack(id) ? packPath(id) !== null : getVault().state(id).kind === "ready"),
    available: (id) => (isPack(id) ? getVault().canDeliver(id) : chatModelState(id).kind !== "unavailable"),
  });
}
