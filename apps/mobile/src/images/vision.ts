import { BUNDLED_MANIFEST, type CatalogModel } from "@inborn/core";
import { isTauri } from "../adapters/tauri";
import { extensionUri, installExtension, refreshExtension } from "../extensions/store";
import { scaleImage } from "./pick";
import { MAX_EDGE } from "./scale";

export const VISION_MODEL_ID = "vision-qwen35";
export const DEV_VISION_FILE = "mmproj.gguf";

/* Round 105: the browser loads the projector through wllama next to Instant; the desktop shell has no path for it yet. */
const browser = (): boolean => !isTauri();

/** The verified OPFS copy of the photo pack, or null until the extension is downloaded. */
export const resolveVision = (): string | null => (browser() ? extensionUri(VISION_MODEL_ID) : null);
export const visionInstalled = (): boolean => resolveVision() !== null;
/** Reads OPFS once, so a missing pack is an answer and not a race with the page load (F294). */
export const visionScanned = (): Promise<void> => (browser() ? refreshExtension(VISION_MODEL_ID).then(() => undefined) : Promise.resolve());
export const installVision = (): Promise<unknown> => (browser() ? installExtension(VISION_MODEL_ID) : Promise.reject(new Error("vision-unavailable")));

/** One `mmproj` fits one embedding width, and ours is Instant's (QA F36): the catalog's `vision` flag says which. */
export const modelHasVision = (modelId: string): boolean => browser() && BUNDLED_MANIFEST.models.find((m) => m.id === modelId)?.vision === true;
export const visionChatModel = (): CatalogModel | null => (browser() ? (BUNDLED_MANIFEST.models.find((m) => m.role === "chat" && m.vision) ?? null) : null);

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
