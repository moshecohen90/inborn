import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { resolveStoredPath, toStoredPath } from "@inborn/core";

/**
 * Image as input (spec §7.1, S12, §10.4 #35): the picker never touches the network, the picture is scaled down on the
 * device and re-encoded, which drops EXIF (location, device, time) before the copy lands in the app's own directory.
 */
export const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.85;

export interface PickedImage {
  /** file:// URI inside Documents/images; EXIF-free JPEG. */
  uri: string;
  width: number;
  height: number;
  bytes: number;
}

export type PickOutcome = { ok: true; images: PickedImage[] } | { ok: false; reason: "cancelled" | "permission" | "failed" };

export function imagesDir(): Directory {
  const dir = new Directory(Paths.document, "images");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

async function prepare(uri: string, w: number, h: number): Promise<PickedImage> {
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h, 1));
  const ctx = ImageManipulator.manipulate(uri);
  if (scale < 1) ctx.resize({ width: Math.round(w * scale), height: Math.round(h * scale) });
  const rendered = await ctx.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
  rendered.release();
  const dest = new File(imagesDir(), `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.jpg`);
  new File(saved.uri).move(dest);
  return { uri: dest.uri, width: saved.width, height: saved.height, bytes: dest.size ?? 0 };
}

/** A picture that arrived as a file (the file picker, the share sheet) takes the same scale-down and EXIF strip as a picked photo. */
export async function importImageFile(uri: string): Promise<PickedImage | null> {
  try {
    const probe = await ImageManipulator.manipulate(uri).renderAsync();
    const { width, height } = probe;
    probe.release();
    return await prepare(uri, width, height);
  } catch (e: unknown) {
    console.warn("[images] import", e);
    return null;
  }
}

export async function pickImages(source: "library" | "camera", limit: number): Promise<PickOutcome> {
  try {
    if (source === "camera") {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return { ok: false, reason: "permission" };
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1, exif: false, allowsMultipleSelection: limit > 1, selectionLimit: Number.isFinite(limit) ? limit : 0 };
    const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return { ok: false, reason: "cancelled" };
    const images: PickedImage[] = [];
    for (const a of result.assets.slice(0, Number.isFinite(limit) ? limit : undefined)) images.push(await prepare(a.uri, a.width, a.height));
    return { ok: true, images };
  } catch (e: unknown) {
    console.warn("[images] pick", e);
    return { ok: false, reason: "failed" };
  }
}

/* Messages persist photos relative to the document directory (QA F11: iOS moves the container on every update). */
export const storedImagePath = (uri: string): string => toStoredPath(uri, Paths.document.uri);
export const imageUri = (stored: string): string => resolveStoredPath(stored, Paths.document.uri);

export function removeImage(uri: string): void {
  try {
    const f = new File(imageUri(uri));
    if (f.exists) f.delete();
  } catch {
    /* already gone */
  }
}
