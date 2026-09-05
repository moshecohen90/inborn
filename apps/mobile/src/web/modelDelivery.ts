import type { Tier } from "@inborn/core";
import { tierFits } from "./deviceGate";
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

const MANIFEST_CACHE = "inborn.web.manifest";

/** The manifest from the network, else the last one this browser saw: an offline visit must still know which file it holds. */
export async function fetchManifest(allowedOrigins: string[] = []): Promise<WebModelSource[]> {
  try {
    const res = await fetch(MANIFEST_URL, { cache: "no-cache" });
    if (res.ok) {
      const text = await res.text();
      const models = parseManifest(JSON.parse(text) as { models?: ManifestModel[] }, allowedOrigins);
      try {
        localStorage.setItem(MANIFEST_CACHE, text);
      } catch {
        /* no localStorage: only the live manifest then */
      }
      return models;
    }
  } catch {
    /* offline or no host: fall through to the cached copy */
  }
  try {
    const cached = localStorage.getItem(MANIFEST_CACHE);
    return cached ? parseManifest(JSON.parse(cached) as { models?: ManifestModel[] }, allowedOrigins) : [];
  } catch {
    return [];
  }
}

/** Biggest tier the gate allows; ties go to the smaller file. */
export function pickModel(models: WebModelSource[], maxTier: Tier): WebModelSource | undefined {
  return models
    .filter((m) => tierFits(m.tier, maxTier))
    .sort((a, b) => (a.tier === b.tier ? a.bytes - b.bytes : tierFits(a.tier, b.tier) ? 1 : -1))[0];
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
