import manifestJson from "./manifest.json";
import { CATALOG_PUBLIC_KEY } from "./publicKey";
import { verifyManifest } from "./signature";
import { hfResolveUrl } from "./huggingface";
import type { CatalogManifest, CatalogModel, ModelPart } from "./types";
import type { DeliverySource } from "./install";
import type { ChipInput } from "./speed";

/** The catalog shipped inside the app (Android gets a new one only with an app update, §5.4). */
export const BUNDLED_MANIFEST = manifestJson as CatalogManifest;

/** Hosts an `https` delivery may ever talk to; any other base URL is rejected at load, not at runtime (§5.1). */
export const ALLOWED_MODEL_HOSTS: readonly string[] = ["models.inbornapp.com"];

export type ManifestProblem = "bad-signature" | "host-not-allowed" | "unsupported-schema";

/** Verifies a manifest before anything trusts it. `extraHosts` exists for a dev build's local server only. */
export function loadManifest(manifest: CatalogManifest, publicKeyHex = CATALOG_PUBLIC_KEY, extraHosts: readonly string[] = []): { ok: true; manifest: CatalogManifest } | { ok: false; problem: ManifestProblem } {
  if (manifest.schema !== 1) return { ok: false, problem: "unsupported-schema" };
  if (!verifyManifest(manifest, publicKeyHex)) return { ok: false, problem: "bad-signature" };
  let host: string;
  try {
    const url = new URL(manifest.baseUrl);
    if (url.protocol !== "https:" && !extraHosts.includes(url.hostname)) return { ok: false, problem: "host-not-allowed" };
    host = url.hostname;
  } catch {
    return { ok: false, problem: "host-not-allowed" };
  }
  if (![...ALLOWED_MODEL_HOSTS, ...extraHosts].includes(host)) return { ok: false, problem: "host-not-allowed" };
  return { ok: true, manifest };
}

export const findModel = (manifest: CatalogManifest, id: string): CatalogModel | undefined => manifest.models.find((m) => m.id === id);

/** Every file to deliver and verify: the shards of a split model, or the single file. */
export const modelParts = (model: CatalogModel): ModelPart[] => model.parts ?? [{ file: model.file, bytes: model.bytes, sha256: model.sha256 }];

/** Absolute download URL of an `https` delivery, or undefined when the model has none. */
export function httpsUrl(manifest: CatalogManifest, model: CatalogModel, part?: ModelPart): string | undefined {
  const hf = model.delivery.find((x) => x.kind === "hf");
  if (hf) return hfResolveUrl(hf.repo, hf.path, hf.revision);
  const d = model.delivery.find((x) => x.kind === "https");
  if (!d) return undefined;
  const base = manifest.baseUrl.replace(/\/$/, "");
  if (!part || part.file === model.file) return `${base}/${d.path}`;
  /* Shards sit next to the first one on the CDN, as they do on disk. */
  const dir = d.path.includes("/") ? d.path.slice(0, d.path.lastIndexOf("/") + 1) : "";
  return `${base}/${dir}${part.file}`;
}

/**
 * The sources a model that is not installed yet could arrive by on this platform, in manifest order and each named
 * once: Play packs exist only on Android and Apple packs only on Apple, and a split model lists one Play pack per
 * shard (QA F46). `DeliverySource` values are the `vault.source.*` keys the Details sheet renders.
 */
export function deliverySources(model: CatalogModel, os: ChipInput["os"]): DeliverySource[] {
  const out: DeliverySource[] = [];
  for (const d of model.delivery) {
    const via: DeliverySource | null =
      d.kind === "bundled" ? "bundled" : d.kind === "play-asset-pack" ? (os === "android" ? "play" : null) : d.kind === "apple-asset-pack" ? (os === "ios" || os === "macos" ? "apple" : null) : d.kind === "hf" ? "hf" : "https";
    if (via && !out.includes(via)) out.push(via);
  }
  return out;
}
