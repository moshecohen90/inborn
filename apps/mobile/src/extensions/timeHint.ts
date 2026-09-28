/**
 * The photo hold card's honest time line (round 105): a photo in a browser without WebGPU is encoded on the CPU, and
 * when that takes over 20 s the card says so before the user waits. The number is this browser's own last photo
 * turn on that model when there was one, else the headless measurement (README, rounds 108 and 117).
 */
export const PHOTO_MS_KEY = "inborn.vision.photoMs";
/** Headless Chromium, photo scaled to 512 px for the CPU (F417), Instant + projector, WASM with 2 threads: 35.7, 38.2 and 36.2 s to the first token. */
export const MEASURED_WASM_PHOTO_MS = 37_000;
/** Per model, since each encodes with its own projector. Fast, measured like Instant: 108.8 s to the first token. */
export const MEASURED_WASM_PHOTO_MS_BY_MODEL: Readonly<Record<string, number>> = { instant: MEASURED_WASM_PHOTO_MS, fast: 109_000 };
export const HINT_ABOVE_MS = 20_000;

type T = (key: string, o?: Record<string, unknown>) => string;

/* Instant keeps the original key so a measurement stored before per-model keys still counts. */
const keyOf = (modelId: string): string => (modelId === "instant" ? PHOTO_MS_KEY : `${PHOTO_MS_KEY}.${modelId}`);

export function photoMs(modelId = "instant"): number | null {
  try {
    const v = Number(localStorage.getItem(keyOf(modelId)));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function recordPhotoMs(ms: number, modelId = "instant"): void {
  try {
    localStorage.setItem(keyOf(modelId), String(Math.round(ms)));
  } catch {
    /* private mode: the estimate stays the round's measurement */
  }
}

const hasWebGpu = (): boolean => typeof navigator !== "undefined" && !!(navigator as Navigator & { gpu?: unknown }).gpu;

export function expectedPhotoMs(modelId = "instant"): number | null {
  return photoMs(modelId) ?? (hasWebGpu() ? null : (MEASURED_WASM_PHOTO_MS_BY_MODEL[modelId] ?? null));
}

export function visionTimeHint(t: T, modelId = "instant"): string | null {
  const ms = expectedPhotoMs(modelId);
  return ms && ms > HINT_ABOVE_MS ? t("extensions.vision.timeHint", { seconds: Math.round(ms / 1000) }) : null;
}
