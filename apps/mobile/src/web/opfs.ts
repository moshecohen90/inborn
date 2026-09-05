/** Origin Private File System side of model delivery (spec §4.4): where the GGUF lives between visits. */
export const MODELS_DIR = "models";
export const OPFS_SCHEME = "opfs://";
/** Keep this much free after a download so the browser never sits at the quota edge (spec §10 row 5: block below headroom). */
export const HEADROOM_BYTES = 256 * 1024 * 1024;

export interface ModelMeta {
  url: string;
  bytes: number;
  sha256: string;
  verified: boolean;
  at: string;
}

export type ModelStatus = { kind: "ready"; meta: ModelMeta } | { kind: "partial"; have: number } | { kind: "missing" };

export interface StorageEstimate {
  usage: number | null;
  quota: number | null;
  persisted: boolean | null;
}

export const opfsSupported = (): boolean => typeof navigator !== "undefined" && !!navigator.storage?.getDirectory && typeof Worker !== "undefined";

export const opfsUri = (file: string): string => `${OPFS_SCHEME}${MODELS_DIR}/${file}`;
export const fileOfUri = (uri: string): string | null => (uri.startsWith(`${OPFS_SCHEME}${MODELS_DIR}/`) ? uri.slice(OPFS_SCHEME.length + MODELS_DIR.length + 1) : null);

async function modelsDir(create: boolean): Promise<FileSystemDirectoryHandle | null> {
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(MODELS_DIR, { create });
  } catch {
    return null;
  }
}

async function readJson<T>(dir: FileSystemDirectoryHandle, name: string): Promise<T | null> {
  try {
    const handle = await dir.getFileHandle(name);
    return JSON.parse(await (await handle.getFile()).text()) as T;
  } catch {
    return null;
  }
}

/** Ready only when the meta written after verification matches the bytes on disk; a size mismatch is a partial file. */
export async function modelStatus(file: string): Promise<ModelStatus> {
  const dir = await modelsDir(false);
  if (!dir) return { kind: "missing" };
  let size: number;
  try {
    size = (await (await dir.getFileHandle(file)).getFile()).size;
  } catch {
    return { kind: "missing" };
  }
  const meta = await readJson<ModelMeta>(dir, `${file}.json`);
  if (meta && meta.bytes === size && size > 0) return { kind: "ready", meta };
  return size > 0 ? { kind: "partial", have: size } : { kind: "missing" };
}

/** The GGUF as a disk-backed File; wllama reads it in slices, so nothing is copied into JS memory here. */
export async function modelFile(file: string): Promise<File> {
  const dir = await modelsDir(false);
  if (!dir) throw new Error("OPFS unavailable");
  return (await dir.getFileHandle(file)).getFile();
}

export async function deleteModel(file: string): Promise<void> {
  const dir = await modelsDir(false);
  if (!dir) return;
  for (const name of [file, `${file}.json`, `${file}.state.json`]) await dir.removeEntry(name).catch(() => undefined);
}

export async function storageEstimate(): Promise<StorageEstimate> {
  const out: StorageEstimate = { usage: null, quota: null, persisted: null };
  try {
    const e = await navigator.storage.estimate();
    out.usage = e.usage ?? null;
    out.quota = e.quota ?? null;
  } catch {
    /* estimate() missing: leave nulls, the UI says "unknown" */
  }
  try {
    out.persisted = await navigator.storage.persisted();
  } catch {
    /* same */
  }
  return out;
}

/** Asks the browser to keep the origin's data out of eviction (Safari's 7-day rule, Chrome's quota pressure). */
export async function requestPersist(): Promise<boolean> {
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export type SpaceVerdict = { ok: true; free: number | null } | { ok: false; free: number; needed: number };

/** Pure check behind the "not enough space" state: needed = what is still missing plus headroom. */
export function spaceCheck(estimate: { usage: number | null; quota: number | null }, bytes: number, have = 0, headroom = HEADROOM_BYTES): SpaceVerdict {
  if (estimate.quota === null) return { ok: true, free: null };
  const free = Math.max(0, estimate.quota - (estimate.usage ?? 0));
  const needed = Math.max(0, bytes - have) + headroom;
  return free >= needed ? { ok: true, free } : { ok: false, free, needed };
}
