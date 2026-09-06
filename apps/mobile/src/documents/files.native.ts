import { Directory, File, Paths } from "expo-file-system";

/** The app's own copies of imported documents (spec §5.3: "a copy of the document in the app directory"). */
export function documentsDir(): Directory {
  const dir = new Directory(Paths.document, "documents");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export function readHead(uri: string, n = 16): Uint8Array {
  const f = new File(uri);
  try {
    const handle = f.open();
    try {
      return handle.readBytes(n);
    } finally {
      handle.close();
    }
  } catch {
    return new Uint8Array();
  }
}

export async function readBytes(uri: string): Promise<Uint8Array> {
  return new File(uri).bytes();
}

export function sizeOf(uri: string): number {
  try {
    const f = new File(uri);
    return f.exists ? (f.size ?? 0) : 0;
  } catch {
    return 0;
  }
}

/** Copies the picked file under our directory as `<id>.<ext>`; returns the new URI. */
export function copyIntoLibrary(sourceUri: string, id: string, name: string): string {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
  const dest = new File(documentsDir(), `${id}${ext}`);
  if (dest.exists) dest.delete();
  new File(sourceUri).copy(dest);
  return dest.uri;
}

export function deleteFile(uri: string | undefined): void {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch (e: unknown) {
    console.warn("[documents] delete", e);
  }
}

/** Dev proofs push fixtures into the document directory; this resolves a bare file name there. */
export const devFileUri = (name: string): string => new File(Paths.document, name).uri;
