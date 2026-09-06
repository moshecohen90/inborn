import type { CacheStorage } from "@inborn/core";
import { fromBase64, toBase64 } from "@inborn/core";
import { isTauri } from "../adapters/tauri";

/**
 * Web / desktop cache. In the Tauri shell the sealed bytes and the 32-byte secret live in Rust (licence.rs: app data
 * dir + OS keychain); in a plain browser nothing is ever bought, so localStorage is enough for the empty cache.
 */

interface TauriInvoke {
  core: { invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> };
}
const invoke = <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => (window as unknown as { __TAURI__: TauriInvoke }).__TAURI__.core.invoke<T>(cmd, args);

const LS_SECRET = "inborn.licence.secret";
const LS_CACHE = "inborn.licence.cache";

function randomHex(bytes: number): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export async function storageSecretHex(): Promise<string> {
  if (isTauri()) return invoke<string>("licence_secret");
  try {
    const existing = localStorage.getItem(LS_SECRET);
    if (existing && /^[0-9a-f]{64}$/.test(existing)) return existing;
    const fresh = randomHex(32);
    localStorage.setItem(LS_SECRET, fresh);
    return fresh;
  } catch {
    return randomHex(32);
  }
}

export function randomNonce(): Uint8Array {
  const n = new Uint8Array(24);
  crypto.getRandomValues(n);
  return n;
}

export function cacheStorage(): CacheStorage {
  if (isTauri()) {
    return {
      async load() {
        const b64 = await invoke<string | null>("licence_cache_load");
        return b64 ? fromBase64(b64) : null;
      },
      async save(sealed) {
        await invoke("licence_cache_save", { data: toBase64(sealed) });
      },
      async clear() {
        await invoke("licence_cache_clear");
        await invoke("licence_clear");
      },
    };
  }
  return {
    async load() {
      try {
        const b64 = localStorage.getItem(LS_CACHE);
        return b64 ? fromBase64(b64) : null;
      } catch {
        return null;
      }
    },
    async save(sealed) {
      try {
        localStorage.setItem(LS_CACHE, toBase64(sealed));
      } catch {
        /* private mode: the cache is per-session then */
      }
    },
    async clear() {
      try {
        localStorage.removeItem(LS_CACHE);
      } catch {
        /* nothing stored */
      }
    },
  };
}

export function writeLicenceResult(name: string, result: Record<string, unknown>): void {
  console.info(`[licence-run] ${name}`, JSON.stringify(result));
}
