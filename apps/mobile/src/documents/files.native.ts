import { Directory, File, Paths } from "expo-file-system";
import { resolveStoredPath, toStoredPath } from "@inborn/core";
import { fileSha256 } from "../vault/hash";

/** The app's own copies of imported documents (spec §5.3: "a copy of the document in the app directory"). */
export function documentsDir(): Directory {
  const dir = new Directory(Paths.document, "documents");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/* iOS moves the data container on every update (QA F11): records keep paths relative to the document directory and resolve them here. */
const root = (): string => Paths.document.uri;
export const resolveDocUri = (stored: string): string => resolveStoredPath(stored, root());
export const storedDocPath = (uri: string): string => toStoredPath(uri, root());
const fileOf = (uri: string): File => new File(resolveDocUri(uri));

export function readHead(uri: string, n = 16): Uint8Array {
  const f = fileOf(uri);
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
  return fileOf(uri).bytes();
}

export function sizeOf(uri: string): number {
  try {
    const f = fileOf(uri);
    return f.exists ? (f.size ?? 0) : 0;
  } catch {
    return 0;
  }
}

/** True when nothing can be opened at this location, which `sizeOf` reports as the same 0 an empty file gives. */
export function missingSource(uri: string): boolean {
  if (!uri) return true;
  try {
    return !fileOf(uri).exists;
  } catch {
    return true;
  }
}

/** Incognito attachments (spec §5.7): a cache directory the OS may reclaim, outside the document library and outside any backup. */
export function incognitoDir(): Directory {
  const dir = new Directory(Paths.cache, "incognito");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/**
 * Copies the picked file as `<id>.<ext>` and returns where it went: the stored (root-relative) location in the
 * library, or, for an incognito import, the absolute cache path, which `endSession` deletes and `sweepIncognitoFiles`
 * clears if the app died first.
 */
export function copyIntoLibrary(sourceUri: string, id: string, name: string, opts: { incognito?: boolean } = {}): string {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
  const dest = new File(opts.incognito ? incognitoDir() : documentsDir(), `${id}${ext}`);
  if (dest.exists) dest.delete();
  fileOf(sourceUri).copy(dest);
  return opts.incognito ? dest.uri : storedDocPath(dest.uri);
}

/** A crash inside an incognito session leaves its copy behind; the next launch deletes it before the library opens. */
export function sweepIncognitoFiles(): number {
  try {
    const dir = incognitoDir();
    const orphans = dir.list();
    for (const entry of orphans) entry.delete();
    return orphans.length;
  } catch (e: unknown) {
    console.warn("[documents] incognito sweep", e);
    return 0;
  }
}

export const sha256Of = (uri: string): Promise<string> => fileSha256(fileOf(uri));

export function deleteFile(uri: string | undefined): void {
  if (!uri) return;
  try {
    const f = fileOf(uri);
    if (f.exists) f.delete();
  } catch (e: unknown) {
    console.warn("[documents] delete", e);
  }
}

/** Dev proofs push fixtures into the document directory; this resolves a bare file name there. */
export const devFileUri = (name: string): string => new File(Paths.document, name).uri;

/** The copy is on disk when `copyIntoLibrary` returns; only the browser writes it later. */
export const whenStored = (_uri: string): Promise<boolean> => Promise.resolve(true);

/** The documents directory is the record of what is held; only the browser has to learn it at start. */
export const restoreFiles = (_keep: ReadonlySet<string>): Promise<void> => Promise.resolve();

export const forgetFiles = (): void => undefined;
