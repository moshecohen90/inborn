#!/usr/bin/env node
/**
 * The browser tier's catalog (`/models/manifest.json`), in the shape apps/mobile/src/web/modelDelivery.ts reads.
 *
 * One builder for both origins: apps/web/build.mjs writes it into the deployable dist (CDN urls) and
 * scripts/serve-web.mjs answers with the same shape for the models on this machine. B1 (MosheAI, 24.9.2026): the
 * file existed only in the dev server, so the deployed app asked for it, got the SPA shell and saw an empty catalog.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const CATALOG_PATH = path.join(repoRoot, "packages/core/src/catalog/manifest.json");
/** Where the file sits inside the dist, and the path the app fetches (modelDelivery.MANIFEST_URL). */
export const MANIFEST_REL = "models/manifest.json";

export const readCatalog = () => JSON.parse(readFileSync(CATALOG_PATH, "utf8"));

/**
 * The catalog models a browser can actually install: a chat model, in one file, reachable over https and free.
 * A split model has no downloader here (the OPFS worker fetches one file), an embedding/speech/vision file is not a
 * chat engine, and a Pro model would be offered to a reader the browser tier cannot sell to.
 */
export function webEligible(catalog = readCatalog()) {
  return catalog.models.filter((m) => m.role === "chat" && !m.proOnly && !m.parts && m.delivery.some((d) => d.kind === "https"));
}

/** One catalog model as the web manifest states it; `url` is where that file is fetched from on this origin. */
export function webModel(model, url) {
  return {
    id: model.id,
    tier: model.tier ?? "instant",
    name: model.name,
    file: model.file,
    bytes: model.bytes,
    sha256: model.sha256,
    delivery: [{ kind: "cdn", url }],
  };
}

/** The deployed catalog: every eligible model, fetched from `baseUrl` (the CDN that holds the GGUFs). */
export function webManifest(baseUrl, catalog = readCatalog()) {
  const base = baseUrl.replace(/\/$/, "");
  const models = webEligible(catalog).map((m) => webModel(m, `${base}/${m.delivery.find((d) => d.kind === "https").path}`));
  return { version: catalog.version, publishedAt: catalog.publishedAt, models, signature: "" };
}

/**
 * Why a live `/models/manifest.json` response is not a catalog, or null when it is one. The failure this exists for
 * answers 200: an origin with `not_found_handling: single-page-application` hands out index.html for a missing file,
 * so "did the deploy publish the catalog" cannot be read off the status code.
 */
export function catalogProblem({ status = 200, contentType = "", body = "" } = {}) {
  if (status !== 200) return `${status}`;
  if (/^\s*</.test(body)) return `${status} ${contentType || "untyped"} (the SPA shell, not the catalog)`;
  if (!/\bjson\b/i.test(contentType)) return `${status} ${contentType || "untyped"}, not JSON`;
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    return `${status} ${contentType} but unparsable: ${e.message}`;
  }
  if (!Array.isArray(parsed.models) || parsed.models.length === 0) return `${status} ${contentType}, but the catalog lists no model`;
  return null;
}
