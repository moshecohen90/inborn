/**
 * The photo hold card's honest time line (round 105): a photo in a browser without WebGPU is encoded on the CPU, and
 * when that takes over a minute the card says so before the user waits. The number is this browser's own last photo
 * turn when there was one, else the headless measurement of the round (README, round 105).
 */
export const PHOTO_MS_KEY = "inborn.vision.photoMs";
/** Measured in headless Chromium on the M-series Mac of round 105, 1024 px photo, Instant + projector, WASM. */
export const MEASURED_WASM_PHOTO_MS = 0;
export const HINT_ABOVE_MS = 60_000;

type T = (key: string, o?: Record<string, unknown>) => string;

export function photoMs(): number | null {
  try {
    const v = Number(localStorage.getItem(PHOTO_MS_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function recordPhotoMs(ms: number): void {
  try {
    localStorage.setItem(PHOTO_MS_KEY, String(Math.round(ms)));
  } catch {
    /* private mode: the estimate stays the round's measurement */
  }
}

const hasWebGpu = (): boolean => typeof navigator !== "undefined" && !!(navigator as Navigator & { gpu?: unknown }).gpu;

export function expectedPhotoMs(): number | null {
  return photoMs() ?? (hasWebGpu() ? null : MEASURED_WASM_PHOTO_MS || null);
}

export function visionTimeHint(t: T): string | null {
  const ms = expectedPhotoMs();
  return ms && ms > HINT_ABOVE_MS ? t("extensions.vision-qwen35.timeHint", { seconds: Math.round(ms / 1000) }) : null;
}
