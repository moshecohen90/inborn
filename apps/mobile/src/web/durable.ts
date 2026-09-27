/**
 * F411: the browser keeps the model only if asked. `navigator.storage.persist()` takes the origin out of eviction under
 * storage pressure; Safari additionally deletes a site's data after 7 days without a visit unless the site is installed
 * as an app (Add to Dock / Add to Home Screen), which is the one exemption it offers.
 */

export const PERSIST_KEY = "inborn.storage.persist";

export type PersistReason = "download" | "onboarded";

export interface PersistRecord {
  granted: boolean;
  reason: PersistReason;
  at: number;
}

/** What these checks read from the page; tests hand in fakes. */
export interface DurableEnv {
  storage?: { persist?: () => Promise<boolean>; persisted?: () => Promise<boolean> };
  local?: Pick<Storage, "getItem" | "setItem">;
  userAgent?: string;
  maxTouchPoints?: number;
  standalone?: boolean;
  now?: () => number;
}

function pageEnv(): DurableEnv {
  const safe = <T,>(get: () => T): T | undefined => {
    try {
      return get();
    } catch {
      return undefined;
    }
  };
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  return {
    storage: safe(() => nav?.storage),
    local: safe(() => globalThis.localStorage),
    userAgent: nav?.userAgent ?? "",
    maxTouchPoints: nav?.maxTouchPoints ?? 0,
    standalone:
      safe(() => globalThis.matchMedia?.("(display-mode: standalone)").matches || (nav as Navigator & { standalone?: boolean } | undefined)?.standalone === true) ?? false,
    now: Date.now,
  };
}

/** Whether the browser already keeps this origin's storage; null when it does not say. */
export async function storageProtected(env: DurableEnv = pageEnv()): Promise<boolean | null> {
  if (!env.storage?.persisted) return null;
  try {
    return await env.storage.persisted();
  } catch {
    return null;
  }
}

/** Asks once per call unless already granted, and records the answer so Settings can show it. Null: no API. */
export async function protectStorage(reason: PersistReason, env: DurableEnv = pageEnv()): Promise<boolean | null> {
  let granted = await storageProtected(env);
  if (granted !== true) {
    if (!env.storage?.persist) return null;
    try {
      granted = await env.storage.persist();
    } catch {
      return null;
    }
  }
  const record: PersistRecord = { granted: granted === true, reason, at: (env.now ?? Date.now)() };
  try {
    env.local?.setItem(PERSIST_KEY, JSON.stringify(record));
  } catch {
    /* private mode: the answer is still returned */
  }
  console.log(`[storage] persist after ${reason}: ${record.granted ? "granted" : "refused"}`);
  return record.granted;
}

export function lastProtection(env: DurableEnv = pageEnv()): PersistRecord | null {
  try {
    const raw = env.local?.getItem(PERSIST_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as Partial<PersistRecord>;
    return typeof r.granted === "boolean" && typeof r.at === "number" && (r.reason === "download" || r.reason === "onboarded") ? (r as PersistRecord) : null;
  } catch {
    return null;
  }
}

export function installedAsApp(env: DurableEnv = pageEnv()): boolean {
  return env.standalone === true;
}

/** Safari's 7-day rule applies to WebKit only; on iOS every browser is WebKit. Null when no install is needed. */
export function installHint(env: DurableEnv = pageEnv()): "mac" | "ios" | null {
  if (installedAsApp(env)) return null;
  const ua = env.userAgent ?? "";
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (env.maxTouchPoints ?? 0) > 1);
  if (ios) return "ios";
  const safari = /AppleWebKit/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox|Android/.test(ua);
  return safari ? "mac" : null;
}
