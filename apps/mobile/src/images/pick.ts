/* Web / desktop: image input waits for a vision-capable browser engine (wllama has no mmproj path yet). */
export const MAX_EDGE = 1024;

export interface PickedImage {
  uri: string;
  width: number;
  height: number;
  bytes: number;
}

export type PickOutcome = { ok: true; images: PickedImage[] } | { ok: false; reason: "cancelled" | "permission" | "failed" };

export async function pickImages(_source: "library" | "camera", _limit: number): Promise<PickOutcome> {
  return { ok: false, reason: "failed" };
}

export async function importImageFile(uri: string): Promise<PickedImage | null> {
  return { uri, width: 0, height: 0, bytes: 0 };
}

export function removeImage(_uri: string): void {}

/** Web keeps whatever URI the picker gave; nothing moves. */
export const storedImagePath = (uri: string): string => uri;
export const imageUri = (stored: string): string => stored;
