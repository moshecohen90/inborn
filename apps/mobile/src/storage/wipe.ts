import { keepOnWipe } from "@inborn/core";
import { IDB_NAME } from "./web/idbRepository";
import { DOCUMENTS_IDB_NAME, forgetRagStore } from "../documents/db";
import { forgetFiles } from "../documents/files";
import { MODEL_KEY } from "../web/prefs";

export interface WipeOptions {
  /** Also delete model files the user imported or the dev path pushed (Play-delivered packs belong to Play). */
  models: boolean;
}

export interface WipeReport {
  deletedFiles: number;
  keptModels: number;
  deletedDatabases?: number;
  deletedCaches?: number;
}

/** What the web wipe touches; tests hand in fakes, the app gets the page's own. */
export interface WebStorageEnv {
  indexedDB?: IDBFactory;
  caches?: CacheStorage;
  storage?: StorageManager;
  local?: Storage;
  session?: Storage;
  /** How long to wait for another tab to let go of a database before moving on; the delete still lands when it does. */
  blockedTimeoutMs?: number;
}

/* Workbox's precache holds the app's own files, the same for every visitor; deleting it would end offline boot, since Workbox only refills it with SRI hashes we do not ship. */
const APP_SHELL_CACHE = /^workbox-precache/;

/* wllama's own OPFS cache holds the GGUFs it fetched by URL (the e5 embedder), so it is model state like "models". */
const WEB_MODEL_DIRECTORIES = ["cache"];
/* Which kept model this browser runs; without it the door offers a fresh download of a model already on disk. */
const KEEP_WITH_MODELS = [MODEL_KEY];

/** Every database this origin holds is ours; the two named ones are listed too for browsers without `databases()`. */
export const WEB_DATABASES: readonly string[] = [IDB_NAME, DOCUMENTS_IDB_NAME];

function pageEnv(): WebStorageEnv {
  const g = globalThis as typeof globalThis & { caches?: CacheStorage };
  const safe = <T,>(get: () => T): T | undefined => {
    try {
      return get();
    } catch {
      return undefined;
    }
  };
  return {
    indexedDB: safe(() => g.indexedDB),
    caches: safe(() => g.caches),
    storage: safe(() => (typeof navigator !== "undefined" ? navigator.storage : undefined)),
    local: safe(() => g.localStorage),
    session: safe(() => g.sessionStorage),
  };
}

function deleteDatabase(factory: IDBFactory, name: string, blockedTimeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (ok: boolean) => {
      if (timer) clearTimeout(timer);
      resolve(ok);
    };
    const req = factory.deleteDatabase(name);
    req.onsuccess = () => finish(true);
    req.onerror = () => finish(false);
    req.onblocked = () => {
      timer ??= setTimeout(() => {
        console.warn(`[wipe] ${name} is held open elsewhere; it is deleted as soon as that tab lets go`);
        finish(false);
      }, blockedTimeoutMs);
    };
  });
}

async function databaseNames(factory: IDBFactory): Promise<string[]> {
  const listed = await factory.databases?.().catch(() => []);
  return [...new Set([...WEB_DATABASES, ...(listed ?? []).map((d) => d.name ?? "").filter(Boolean)])];
}

/** Web (expo-sqlite cannot be bundled here, see persistent.ts): IndexedDB, web storage, Cache Storage and OPFS, models only on request. */
export async function wipe(opts: WipeOptions, env: WebStorageEnv = pageEnv()): Promise<WipeReport> {
  const report: WipeReport = { deletedFiles: 0, keptModels: 0, deletedDatabases: 0, deletedCaches: 0 };
  /* A pending snapshot write would recreate the documents database right after it is deleted. */
  forgetRagStore();
  forgetFiles();
  const kept = opts.models ? [] : KEEP_WITH_MODELS.map((k) => [k, env.local?.getItem(k) ?? null] as const);
  for (const s of [env.local, env.session]) {
    try {
      s?.clear();
    } catch {
      /* storage refused: nothing was stored there */
    }
  }
  for (const [k, v] of kept) if (v !== null) env.local?.setItem(k, v);
  if (env.indexedDB) {
    for (const name of await databaseNames(env.indexedDB)) {
      if (await deleteDatabase(env.indexedDB, name, env.blockedTimeoutMs ?? 5000)) report.deletedDatabases!++;
    }
  }
  if (env.caches) {
    for (const name of await env.caches.keys().catch(() => [] as string[])) {
      if (APP_SHELL_CACHE.test(name)) continue;
      if (await env.caches.delete(name).catch(() => false)) report.deletedCaches!++;
    }
  }
  if (env.storage?.getDirectory) {
    try {
      const root = (await env.storage.getDirectory()) as FileSystemDirectoryHandle & { entries(): AsyncIterable<[string, FileSystemHandle]> };
      for await (const [name, handle] of root.entries()) {
        const directory = handle.kind === "directory";
        if (keepOnWipe({ name, directory }, !opts.models) || (!opts.models && directory && WEB_MODEL_DIRECTORIES.includes(name))) {
          report.keptModels++;
          continue;
        }
        await root.removeEntry(name, { recursive: true }).then(
          () => report.deletedFiles++,
          () => undefined,
        );
      }
    } catch {
      /* no OPFS in this browser */
    }
  }
  return report;
}
