import { BUNDLED_MANIFEST, type CatalogModel } from "@inborn/core";
import { isTauri } from "../adapters/tauri";
import { extensionUri, installExtension, refreshExtension } from "../extensions/store";

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
