import { sha256 } from "@noble/hashes/sha256";
import { ExtractError } from "@inborn/core";
import { isTauri } from "../adapters/tauri";
import { FILES_STORE, FILE_META_STORE, withDocumentsDb } from "./idb";

/**
 * Web + desktop. A picked file is a Blob registered under a `blob:inborn/…` URI for this page load. On the web, a file
 * added to the library is also copied into IndexedDB (`inborn-documents`, like the index it feeds) under an
 * `idb:inborn-documents/<id>/<name>` URI, the browser's counterpart of the phone's documents directory, so a later
 * visit can read it again. The desktop keeps the session blob: its index lives in SQLCipher, and plain bytes in the
 * webview's IndexedDB would sit beside it unencrypted.
 */
const blobs = new Map<string, Blob>();
interface HeldFile {
  size: number;
  head: Uint8Array;
  at: number;
}
/* Files known to be in IndexedDB, so `sizeOf` and `missingSource` can answer synchronously like on the phone. */
const held = new Map<string, HeldFile>();
const writes = new Map<string, Promise<boolean>>();
const DURABLE = "idb:inborn-documents/";
/* A copy written a moment ago whose record is not saved yet is not an orphan. */
const ORPHAN_AGE_MS = 60_000;
let generation = 0;

const durable = (uri: string): boolean => uri.startsWith(DURABLE);
const persists = (): boolean => typeof indexedDB !== "undefined" && !isTauri();

export function documentsDir(): { uri: string } {
  return { uri: persists() ? DURABLE : "blob:" };
}

/** Both kinds of URI are origin-scoped already; nothing to re-base. */
export const resolveDocUri = (stored: string): string => stored;
export const storedDocPath = (uri: string): string => uri;

export function registerBlob(blob: Blob, name: string): string {
  const uri = `blob:inborn/${Date.now()}-${Math.random().toString(36).slice(2)}/${encodeURIComponent(name)}`;
  blobs.set(uri, blob);
  return uri;
}

/** The picked file behind an in-app `blob:inborn/…` URI, for callers that need a URL the page itself can render. */
export const registeredBlob = (uri: string): Blob | undefined => blobs.get(uri);

const headOf = (b: Blob | undefined): Uint8Array | undefined => (b as (Blob & { __head?: Uint8Array }) | undefined)?.__head;

async function blobOf(uri: string): Promise<Blob> {
  const b = blobs.get(uri);
  if (b) return b;
  if (durable(uri)) {
    const bytes = await withDocumentsDb<ArrayBuffer>([FILES_STORE], "readonly", (tx) => tx.objectStore(FILES_STORE).get(uri)).catch(() => undefined);
    if (!bytes) throw new ExtractError("missing", `nothing stored at ${uri}`);
    const loaded = new Blob([bytes]) as Blob & { __head?: Uint8Array };
    loaded.__head = held.get(uri)?.head;
    blobs.set(uri, loaded);
    return loaded;
  }
  /* A `blob:inborn/…` key names a file of an earlier page load: it is gone, and fetching it only trips the CSP. */
  if (uri.startsWith("blob:")) throw new ExtractError("missing", `the browser no longer holds ${uri}`);
  const r = await fetch(uri);
  return r.blob();
}

export function readHead(uri: string, n = 16): Uint8Array {
  const head = headOf(blobs.get(uri)) ?? held.get(uri)?.head;
  return head ? head.subarray(0, n) : new Uint8Array();
}

export async function readBytes(uri: string): Promise<Uint8Array> {
  return new Uint8Array(await (await blobOf(uri)).arrayBuffer());
}

export function sizeOf(uri: string): number {
  return blobs.get(uri)?.size ?? held.get(uri)?.size ?? 0;
}

/** True when nothing can be opened at this location, which `sizeOf` reports as the same 0 an empty file gives. */
export function missingSource(uri: string): boolean {
  return !uri || !(blobs.has(uri) || held.has(uri));
}

async function persist(uri: string, blob: Blob, meta: HeldFile, gen: number): Promise<boolean> {
  try {
    const bytes = await blob.arrayBuffer();
    /* Delete everything ran meanwhile: writing now would recreate the database it just removed. */
    if (gen !== generation) return false;
    await withDocumentsDb([FILES_STORE, FILE_META_STORE], "readwrite", (tx) => {
      tx.objectStore(FILES_STORE).put(bytes, uri);
      tx.objectStore(FILE_META_STORE).put(meta, uri);
    });
    return true;
  } catch (e: unknown) {
    console.warn(`[documents] could not keep ${uri} in this browser; it can be read until the page closes`, e);
    held.delete(uri);
    return false;
  }
}

/**
 * The web's copy into the library: the picked bytes go to IndexedDB under the document's id, as the phone copies them
 * into its documents directory. Incognito imports and the desktop keep the session blob (§5.7: nothing on disk).
 */
export function copyIntoLibrary(sourceUri: string, id: string, name: string, opts: { incognito?: boolean } = {}): string {
  const blob = blobs.get(sourceUri);
  if (opts.incognito || !persists() || !blob) return sourceUri;
  const uri = `${DURABLE}${id}/${encodeURIComponent(name)}`;
  const meta: HeldFile = { size: blob.size, head: headOf(blob) ?? new Uint8Array(), at: Date.now() };
  blobs.set(uri, blob);
  held.set(uri, meta);
  writes.set(uri, persist(uri, blob, meta, generation));
  return uri;
}

/** Resolves once the copy made by `copyIntoLibrary` is in IndexedDB (false if the browser refused it). */
export function whenStored(uri: string): Promise<boolean> {
  return writes.get(uri) ?? Promise.resolve(true);
}

/**
 * Called when the library opens: learns which files this browser holds, and deletes the ones no record points to
 * (a reload between the copy and the record's first save).
 */
export async function restoreFiles(keep: ReadonlySet<string>): Promise<void> {
  if (!persists()) return;
  const found: Array<[string, HeldFile]> = [];
  await withDocumentsDb([FILE_META_STORE], "readonly", (tx) => {
    const cursor = tx.objectStore(FILE_META_STORE).openCursor();
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (!c) return;
      found.push([String(c.key), c.value as HeldFile]);
      c.continue();
    };
  }).catch((e: unknown) => console.warn("[documents] stored files unreadable", e));
  const orphans: string[] = [];
  for (const [uri, meta] of found) {
    if (keep.has(uri) || writes.has(uri)) held.set(uri, meta);
    else if (Date.now() - meta.at > ORPHAN_AGE_MS) orphans.push(uri);
  }
  if (orphans.length) {
    await withDocumentsDb([FILES_STORE, FILE_META_STORE], "readwrite", (tx) => {
      for (const uri of orphans) {
        tx.objectStore(FILES_STORE).delete(uri);
        tx.objectStore(FILE_META_STORE).delete(uri);
      }
    }).catch(() => undefined);
    console.log(`[documents] deleted ${orphans.length} stored file(s) no document points to`);
  }
}

/** Delete everything: the database is going away; nothing held in this page may be read or written back. */
export function forgetFiles(): void {
  generation++;
  blobs.clear();
  held.clear();
  writes.clear();
}

/** Browsers never write an incognito import anywhere, so there is nothing to sweep. */
export const sweepIncognitoFiles = (): number => 0;

export async function sha256Of(uri: string): Promise<string> {
  return Array.from(sha256(await readBytes(uri)), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function deleteFile(uri: string | undefined): void {
  if (!uri) return;
  blobs.delete(uri);
  held.delete(uri);
  writes.delete(uri);
  if (!durable(uri) || !persists()) return;
  void withDocumentsDb([FILES_STORE, FILE_META_STORE], "readwrite", (tx) => {
    tx.objectStore(FILES_STORE).delete(uri);
    tx.objectStore(FILE_META_STORE).delete(uri);
  }).catch((e: unknown) => console.warn("[documents] delete", e));
}

export const devFileUri = (name: string): string => `/fixtures/${name}`;

/** Reads the first bytes once so kind sniffing stays synchronous like on the phone. */
export async function primeHead(uri: string): Promise<void> {
  const b = blobs.get(uri) as (Blob & { __head?: Uint8Array }) | undefined;
  if (b && !b.__head) b.__head = new Uint8Array(await b.slice(0, 16).arrayBuffer());
}
