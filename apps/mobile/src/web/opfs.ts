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
export function statusFrom(size: number | undefined, meta: ModelMeta | null): ModelStatus {
  if (!size) return { kind: "missing" };
  return meta && meta.bytes === size ? { kind: "ready", meta } : { kind: "partial", have: size };
}

export async function modelStatus(file: string): Promise<ModelStatus> {
  const dir = await modelsDir(false);
  if (!dir) return { kind: "missing" };
  let size: number;
  try {
    size = (await (await dir.getFileHandle(file)).getFile()).size;
  } catch {
    return { kind: "missing" };
  }
  return statusFrom(size, await readJson<ModelMeta>(dir, `${file}.json`));
}

/** Same verdict, but allowing for the moment OPFS needs to publish a file a worker has just closed (QA F22): a verified download must not read as a failure.
 * A gigabyte-scale file on a loaded machine can take many seconds to become visible, and the old two-second budget turned a
 * finished, hash-checked download into "stored file does not match" (seen once in three runs against the real CDN). */
export async function readyModelStatus(file: string, tries = 100, delayMs = 200): Promise<ModelStatus> {
  let status = await modelStatus(file);
  for (let i = 1; i < tries && status.kind !== "ready"; i++) {
    await new Promise((r) => setTimeout(r, delayMs));
    status = await modelStatus(file);
  }
  return status;
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

/* "cache" is wllama's own OPFS cache: the embedder GGUF it fetched by URL. */
const STORED_DIRS = [MODELS_DIR, "cache"];

/** One walk of what the app keeps in OPFS: every file's size, and the verified-download record beside each model. */
export interface OpfsInventory {
  /** Bytes by "<dir>/<name>". */
  files: ReadonlyMap<string, number>;
  /** `<file>.json` records by the model file they describe. */
  metas: ReadonlyMap<string, ModelMeta>;
}

export async function opfsInventory(storage: StorageManager): Promise<OpfsInventory> {
  const root = await storage.getDirectory();
  const files = new Map<string, number>();
  const metas = new Map<string, ModelMeta>();
  for (const name of STORED_DIRS) {
    let dir: FileSystemDirectoryHandle;
    try {
      dir = await root.getDirectoryHandle(name);
    } catch {
      continue;
    }
    for await (const [entry, h] of (dir as FileSystemDirectoryHandle & { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
      if (h.kind !== "file") continue;
      const file = await (h as FileSystemFileHandle).getFile();
      files.set(`${name}/${entry}`, file.size);
      if (name === MODELS_DIR && entry.endsWith(".json") && !entry.endsWith(".state.json")) {
        try {
          metas.set(entry.slice(0, -".json".length), JSON.parse(await file.text()) as ModelMeta);
        } catch {
          /* an unreadable record leaves its model half-downloaded, as modelStatus reads it */
        }
      }
    }
  }
  return { files, metas };
}

export const inventoryBytes = (inv: OpfsInventory): number => [...inv.files.values()].reduce((a, b) => a + b, 0);

/** The same verdict as `modelStatus`, read from the walk instead of a second look at the disk. */
export const inventoryStatus = (inv: OpfsInventory, file: string): ModelStatus => statusFrom(inv.files.get(`${MODELS_DIR}/${file}`), inv.metas.get(file) ?? null);

/** Bytes of every file the app keeps in OPFS; Privacy & storage, the space figures and the vault's model rows read this one walk. */
export async function opfsModelBytes(storage: StorageManager): Promise<number> {
  return inventoryBytes(await opfsInventory(storage));
}

export async function storageEstimate(): Promise<StorageEstimate> {
  const out: StorageEstimate = { usage: null, quota: null, persisted: null };
  try {
    const e = await navigator.storage.estimate();
    out.usage = e.usage ?? null;
    out.quota = e.quota ?? null;
    /* After a browser restart Chromium's usage can omit OPFS files, so what the app stored is the floor. */
    const measured = await opfsModelBytes(navigator.storage).catch(() => 0);
    if (measured > (out.usage ?? 0)) out.usage = measured;
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
