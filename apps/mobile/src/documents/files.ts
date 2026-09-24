import { sha256 } from "@noble/hashes/sha256";

/** Web + desktop: picked files are Blobs kept by object URL for the session; reading one is a same-origin blob read, not a network call. */
const blobs = new Map<string, Blob>();

export function documentsDir(): { uri: string } {
  return { uri: "blob:" };
}

/** Blob URIs are session-scoped already; nothing to re-base. */
export const resolveDocUri = (stored: string): string => stored;
export const storedDocPath = (uri: string): string => uri;

export function registerBlob(blob: Blob, name: string): string {
  const uri = `blob:inborn/${Date.now()}-${Math.random().toString(36).slice(2)}/${encodeURIComponent(name)}`;
  blobs.set(uri, blob);
  return uri;
}

async function blobOf(uri: string): Promise<Blob> {
  const b = blobs.get(uri);
  if (b) return b;
  const r = await fetch(uri);
  return r.blob();
}

export function readHead(uri: string, n = 16): Uint8Array {
  const b = blobs.get(uri);
  const head = (b as Blob & { __head?: Uint8Array })?.__head;
  return head ? head.subarray(0, n) : new Uint8Array();
}

export async function readBytes(uri: string): Promise<Uint8Array> {
  return new Uint8Array(await (await blobOf(uri)).arrayBuffer());
}

export function sizeOf(uri: string): number {
  return blobs.get(uri)?.size ?? 0;
}

/** True when nothing can be opened at this location, which `sizeOf` reports as the same 0 an empty file gives. */
export function missingSource(uri: string): boolean {
  return !uri || !blobs.has(uri);
}

/** Browsers cannot copy into an app directory; the blob simply stays registered under its URI, incognito or not. */
export function copyIntoLibrary(sourceUri: string, _id: string, _name: string, _opts: { incognito?: boolean } = {}): string {
  return sourceUri;
}

/** Nothing of a browser import is on disk, so there is nothing to sweep. */
export const sweepIncognitoFiles = (): number => 0;

export async function sha256Of(uri: string): Promise<string> {
  return Array.from(sha256(await readBytes(uri)), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function deleteFile(uri: string | undefined): void {
  if (uri) blobs.delete(uri);
}

export const devFileUri = (name: string): string => `/fixtures/${name}`;

/** Reads the first bytes once so kind sniffing stays synchronous like on the phone. */
export async function primeHead(uri: string): Promise<void> {
  const b = blobs.get(uri) as (Blob & { __head?: Uint8Array }) | undefined;
  if (b && !b.__head) b.__head = new Uint8Array(await b.slice(0, 16).arrayBuffer());
}
