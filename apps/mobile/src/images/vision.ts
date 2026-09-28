import { BUNDLED_MANIFEST, extensions, photoPlan, visionPackFor, type PhotoPlan } from "@inborn/core";
import { isTauri } from "../adapters/tauri";
import { chatModelState, offeredChatModels } from "../extensions/chatModel";
import { extensionState, extensionUri, installExtension, refreshExtension } from "../extensions/store";
import { scaleImage } from "./pick";
import { MAX_EDGE } from "./scale";

export const VISION_MODEL_ID = "vision-qwen35";
export const DEV_VISION_FILE = "mmproj.gguf";

/* Round 105: the browser loads the projector through wllama next to its model; the desktop shell has no path for it yet. */
const browser = (): boolean => !isTauri();

/* One `mmproj` fits one embedding width (QA F36), so a pack serves only its own model. */
export const visionPackId = (modelId: string): string | null => (browser() ? (visionPackFor(modelId)?.id ?? null) : null);

export function resolveVision(modelId: string): string | null {
  const id = visionPackId(modelId);
  return id ? extensionUri(id) : null;
}
export const visionInstalled = (modelId: string): boolean => resolveVision(modelId) !== null;
/** Reads OPFS once for the packs of the models this browser offers, so a missing pack is an answer and not a race with the page load (F294). */
export function visionScanned(): Promise<void> {
  if (!browser()) return Promise.resolve();
  const packs = offeredChatModels(true).map((m) => visionPackFor(m.id)?.id).filter((id): id is string => !!id);
  return Promise.all(packs.map((id) => refreshExtension(id))).then(() => undefined);
}
export function installVision(modelId: string): Promise<unknown> {
  const id = visionPackId(modelId);
  return id ? installExtension(id) : Promise.reject(new Error("vision-unavailable"));
}

export const modelHasVision = (modelId: string): boolean => browser() && BUNDLED_MANIFEST.models.find((m) => m.id === modelId)?.vision === true && !!visionPackFor(modelId);

const isPack = (id: string): boolean => extensions().some((e) => e.kind === "vision" && e.id === id);

export function photoPlanHere(selected: string, pro: boolean): PhotoPlan {
  if (!browser()) return { kind: "none" };
  const state = (id: string) => (isPack(id) ? extensionState(id) : chatModelState(id)).kind;
  return photoPlan({ selected, models: offeredChatModels(pro), installed: (id) => state(id) === "ready", available: (id) => state(id) !== "unavailable" });
}

/* F417 (round 108): the CPU projector took ~80 s on a 1024 px photo; half the edge is a quarter of the patches. */
export const WASM_PHOTO_EDGE = 512;
/** The long edge the projector gets: the stored 1024 px on WebGPU, 512 px when wllama encodes on the CPU. */
export const photoEdge = (onGpu: boolean): number => (onGpu ? MAX_EDGE : WASM_PHOTO_EDGE);

type Scale = (blob: Blob, max: number) => Promise<{ uri: string } | null>;

function dataUrlBlob(uri: string): Blob | null {
  const comma = uri.indexOf(",");
  if (!uri.startsWith("data:") || comma < 0 || !uri.slice(0, comma).endsWith(";base64")) return null;
  try {
    const bin = atob(uri.slice(comma + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: uri.slice(5, comma - ";base64".length) });
  } catch {
    return null;
  }
}

/** The stored photo sized for this engine; the message keeps its 1024 px copy for the thumbnail. */
export async function photoForEngine(uri: string, onGpu: boolean, scale: Scale = scaleImage): Promise<string> {
  const edge = photoEdge(onGpu);
  if (edge >= MAX_EDGE) return uri;
  const blob = dataUrlBlob(uri);
  if (!blob) return uri;
  return (await scale(blob, edge))?.uri ?? uri;
}
