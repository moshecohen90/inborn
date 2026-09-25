import type { Tier } from "@inborn/core";
import { modelStatus, type ModelStatus } from "./opfs";
import type { WorkerMessage } from "../../public/model-worker";

/** One downloadable model as the web sees it: a subset of the catalog's CatalogModel plus the resolved same-origin/CDN URL. */
export interface WebModelSource {
  id: string;
  tier: Tier;
  name: string;
  file: string;
  bytes: number;
  sha256?: string;
  url: string;
  chatTemplate?: string;
}

/** Served next to the models (scripts/serve-web.mjs today; the catalog host later, spec §5.4). */
export const MANIFEST_URL = "/models/manifest.json";
export const WORKER_URL = "/model-worker.js";

export interface ManifestModel {
  id: string;
  tier?: Tier;
  name?: string;
  file: string;
  bytes: number;
  sha256?: string;
  chatTemplate?: string;
  delivery?: { kind: string; url?: string }[];
}

/** Keeps only models delivered by CDN from an allowed origin; other hosts are dropped, not tried (spec §5.1 allowlist). */
export function parseManifest(body: { models?: ManifestModel[] }, allowedOrigins: string[] = [], origin = location.origin): WebModelSource[] {
  const allowed = (url: string): boolean => {
    try {
      const u = new URL(url, origin);
      return u.origin === origin || allowedOrigins.includes(u.origin);
    } catch {
      return false;
    }
  };
  const out: WebModelSource[] = [];
  for (const m of body.models ?? []) {
    const url = m.delivery?.find((d) => d.kind === "cdn" && d.url)?.url;
    if (!url || !m.file || !m.bytes || !allowed(url)) continue;
    out.push({ id: m.id, tier: m.tier ?? "instant", name: m.name ?? m.id, file: m.file, bytes: m.bytes, url, ...(m.sha256 ? { sha256: m.sha256 } : {}), ...(m.chatTemplate ? { chatTemplate: m.chatTemplate } : {}) });
  }
  return out;
}

/**
 * A companion file of the catalog (`companions`: the document index model), under the same allowlist as the models.
 * Null when the manifest does not list it or points it at a host this app may not fetch from.
 */
export function parseCompanion(body: { companions?: ManifestModel[] }, id: string, allowedOrigins: string[] = [], origin = location.origin): WebModelSource | null {
  const entry = body.companions?.find((c) => c.id === id);
  return entry ? (parseManifest({ models: [entry] }, allowedOrigins, origin)[0] ?? null) : null;
}

const MANIFEST_CACHE = "inborn.web.manifest";

/** The companion from the live manifest, else from the last one this browser saw. */
export async function fetchCompanion(id: string, allowedOrigins: string[] = []): Promise<WebModelSource | null> {
  try {
    const res = await fetch(MANIFEST_URL, { cache: "no-cache" });
    const type = res.headers.get("content-type") ?? "";
    if (res.ok && /\bjson\b/i.test(type)) return parseCompanion(JSON.parse(await res.text()) as { companions?: ManifestModel[] }, id, allowedOrigins);
  } catch {
    /* offline or not JSON: the cached copy below */
  }
  try {
    const cached = localStorage.getItem(MANIFEST_CACHE);
    return cached ? parseCompanion(JSON.parse(cached) as { companions?: ManifestModel[] }, id, allowedOrigins) : null;
  } catch {
    return null;
  }
}

/**
 * Why this browser has no catalog. `not-json` is the one B1 (24.9.2026) turned up: the origin answered
 * /models/manifest.json with the SPA shell, 200 and text/html, and an empty catalog reads exactly like a browser no
 * model fits. They need different words on screen, so they are different states here.
 */
export type CatalogError = "unreachable" | "not-json";

export interface CatalogResult {
  models: WebModelSource[];
  error: CatalogError | null;
}

const cachedModels = (allowedOrigins: string[]): WebModelSource[] => {
  try {
    const cached = localStorage.getItem(MANIFEST_CACHE);
    return cached ? parseManifest(JSON.parse(cached) as { models?: ManifestModel[] }, allowedOrigins) : [];
  } catch {
    return [];
  }
};

/** The manifest from the network, else the last one this browser saw: an offline visit must still know which file it holds. */
export async function fetchManifest(allowedOrigins: string[] = []): Promise<CatalogResult> {
  let error: CatalogError = "unreachable";
  try {
    const res = await fetch(MANIFEST_URL, { cache: "no-cache" });
    if (res.ok) {
      const type = res.headers.get("content-type") ?? "";
      const text = await res.text();
      /* An origin that falls back to its one document answers 200 with HTML; parsing it is the bug, not the fix. */
      if (!/\bjson\b/i.test(type) || /^\s*</.test(text)) throw new SyntaxError(`catalog is ${type || "untyped"}, not JSON`);
      const models = parseManifest(JSON.parse(text) as { models?: ManifestModel[] }, allowedOrigins);
      try {
        localStorage.setItem(MANIFEST_CACHE, text);
      } catch {
        /* no localStorage: only the live manifest then */
      }
      return { models, error: null };
    }
  } catch (e) {
    if (e instanceof SyntaxError) error = "not-json";
  }
  const models = cachedModels(allowedOrigins);
  return { models, error: models.length ? null : error };
}

export type DeliveryEvent =
  | { type: "progress"; have: number; total: number | null }
  | { type: "done"; have: number; sha256: string; verified: boolean }
  | { type: "paused"; have: number }
  | { type: "error"; message: string };

/**
 * Web `ModelDelivery`: hands the download to the OPFS worker and relays its events. One job at a time; `cancel()`
 * pauses (the worker saves its hash midstate) so the next `download()` resumes with a Range request.
 */
export class WebModelDelivery {
  private worker: Worker | null = null;

  status(source: WebModelSource): Promise<ModelStatus> {
    return modelStatus(source.file);
  }

  download(source: WebModelSource, onEvent: (e: DeliveryEvent) => void): Promise<DeliveryEvent> {
    if (this.worker) throw new Error("a download is already running");
    const worker = new Worker(WORKER_URL, { type: "module" });
    this.worker = worker;
    return new Promise<DeliveryEvent>((resolve) => {
      const finish = (e: DeliveryEvent) => {
        worker.terminate();
        this.worker = null;
        onEvent(e);
        resolve(e);
      };
      worker.onmessage = (ev: MessageEvent<WorkerMessage>) => {
        const m = ev.data;
        if (m.type === "progress") onEvent(m);
        else finish(m);
      };
      worker.onerror = (ev) => finish({ type: "error", message: ev.message || "model worker failed to start" });
      const job = { type: "download", url: source.url, file: source.file, bytes: source.bytes, ...(source.sha256 ? { sha256: source.sha256 } : {}) };
      worker.postMessage(job);
    });
  }

  cancel(): void {
    this.worker?.postMessage({ type: "abort" });
  }
}
