/* Web / desktop: photos are picked with the browser's file input, scaled to 1024 px and kept as data: URLs, so the
   message's thumbnail and the bytes the projector reads survive a reload (round 105). */
import { readBytes, registeredBlob } from "../documents/files";
import { MAX_EDGE, fitWithin } from "./scale";

export { MAX_EDGE };

export interface PickedImage {
  uri: string;
  width: number;
  height: number;
  bytes: number;
}

export type PickOutcome = { ok: true; images: PickedImage[] } | { ok: false; reason: "cancelled" | "permission" | "failed" };

/** A picture as a JPEG data: URL no larger than `max` px on its long edge; null when the browser cannot decode it. */
export async function scaleImage(blob: Blob, max = MAX_EDGE): Promise<PickedImage | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    const { width, height } = fitWithin(bitmap.width, bitmap.height, max);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    /* A transparent PNG turns black in a JPEG; the phones' pickers hand over white, so do the same. */
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const uri = canvas.toDataURL("image/jpeg", 0.9);
    return { uri, width, height, bytes: Math.round(((uri.length - uri.indexOf(",") - 1) * 3) / 4) };
  } catch {
    return null;
  }
}

function chooseFiles(source: "library" | "camera", limit: number): Promise<File[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = limit > 1;
    if (source === "camera") input.setAttribute("capture", "environment");
    input.style.display = "none";
    let settled = false;
    const done = (files: File[] | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener("change", () => done(Array.from(input.files ?? []).slice(0, limit)));
    input.addEventListener("cancel", () => done(null));
    document.body.appendChild(input);
    input.click();
  });
}

export async function pickImages(source: "library" | "camera", limit: number, onPicked?: (count: number) => void): Promise<PickOutcome> {
  if (typeof document === "undefined") return { ok: false, reason: "failed" };
  const files = await chooseFiles(source, limit);
  if (!files?.length) return { ok: false, reason: "cancelled" };
  onPicked?.(files.length);
  const images: PickedImage[] = [];
  for (const f of files) {
    const img = await scaleImage(f);
    if (img) images.push(img);
  }
  return images.length ? { ok: true, images } : { ok: false, reason: "failed" };
}

/* The chooser's `blob:inborn/…` key is not a URL an <img> can load; the scaled copy of the same blob is. */
export async function importImageFile(uri: string): Promise<PickedImage | null> {
  /* A picture already in the library is held in IndexedDB, not as this page's blob (round 128). */
  const blob = registeredBlob(uri) ?? (await readBytes(uri).then((b) => new Blob([b as BlobPart]), () => null));
  if (!blob) return null;
  return scaleImage(blob);
}

export function removeImage(_uri: string): void {}

/** Web keeps the data: URL the picker made; nothing moves. */
export const storedImagePath = (uri: string): string => uri;
export const imageUri = (stored: string): string => stored;
