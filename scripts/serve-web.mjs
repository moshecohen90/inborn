#!/usr/bin/env node
/**
 * Static host for the web export with what the browser tier needs (spec §4.4): COOP/COEP so WASM threads get
 * SharedArrayBuffer, a CSP that allows nothing but this origin, and GGUFs with Range support under /models/.
 *
 *   MODELS_DIR=/path/to/ggufs PORT=8787 node scripts/serve-web.mjs
 *
 * /models/<id>.gguf resolves to $MODELS_DIR/<id>.gguf, else to the dev alias ($INSTANT_GGUF, $FAST_GGUF).
 * /models/manifest.json describes the served models the way the catalog will (id, bytes, sha256, delivery url);
 * MODELS_ORIGIN points those urls at the real catalog host instead of this server, which is how the browser tier
 * is proven against models.inbornapp.com (the same variable already opens connect-src for it).
 * the sha256 is computed once per file and kept in a `<file>.sha256` sidecar next to it.
 * DIST=/path serves another export (default apps/mobile/dist; apps/web/dist is the deployable build with the service worker).
 * ISOLATION=off drops COOP/COEP to exercise the single-thread fallback.
 */
import { createServer } from "node:http";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { closeSync, createReadStream, existsSync, openSync, readFileSync, readSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isolationHeaders, securityHeaders } from "../apps/web/headers.mjs";
import { MANIFEST_REL, readCatalog, webEligible, webModel } from "./web-manifest.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDist = path.join(repoRoot, "apps/web/dist");

export const defaults = {
  /* The deployable build (with sw.js) when it exists, else the raw export. */
  dist: process.env.DIST ?? (existsSync(path.join(webDist, "index.html")) ? webDist : path.join(repoRoot, "apps/mobile/dist")),
  modelsOrigin: process.env.MODELS_ORIGIN ?? "",
  modelsDir: process.env.MODELS_DIR ?? path.join(repoRoot, ".models"),
  /* Every model the deployed catalog offers a browser, or the door's choice (F311) cannot be exercised locally;
     an alias whose file is absent is simply left out of the served catalog. */
  aliases: {
    "instant.gguf": process.env.INSTANT_GGUF ?? "Qwen3.5-0.8B-Q4_K_M.gguf",
    "fast.gguf": process.env.FAST_GGUF ?? "Qwen3.5-2B-Q4_K_M.gguf",
  },
  port: Number(process.env.PORT ?? 8787),
  isolation: process.env.ISOLATION !== "off",
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".gguf": "application/octet-stream",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".map": "application/json",
  ".webmanifest": "application/manifest+json",
};

/** sha256 of a model file, cached in a sidecar so a 2.7 GB file is hashed once. Read in chunks: `readFileSync` throws above 2 GiB, which is every Sharp model. */
export function modelSha256(file) {
  const sidecar = `${file}.sha256`;
  if (existsSync(sidecar) && statSync(sidecar).mtimeMs >= statSync(file).mtimeMs) return readFileSync(sidecar, "utf8").trim();
  const hash = createHash("sha256");
  const fd = openSync(file, "r");
  try {
    const buf = Buffer.allocUnsafe(8 * 1024 * 1024);
    for (let at = 0, read = 0; (read = readSync(fd, buf, 0, buf.length, at)) > 0; at += read) hash.update(buf.subarray(0, read));
  } finally {
    closeSync(fd);
  }
  const digest = hash.digest("hex");
  writeFileSync(sidecar, `${digest}\n`);
  return digest;
}

/**
 * The dev catalog: every alias that resolves to a file, in the one shape the deployed manifest also has
 * (scripts/web-manifest.mjs). The served file's own size and hash win over the catalog's: a dev alias may point at
 * another GGUF, and the manifest must describe what this server actually hands out.
 * With no model on this machine it answers with the built dist's manifest, so the deployed catalog can be read here.
 */
export function modelsManifest({ dist, modelsDir, aliases, modelsOrigin = "" }) {
  const catalog = readCatalog();
  /* The same cut the deployed manifest makes (Pro, split and store-only models are not browser models); a dev alias
     for one of those would put a model on the door that the real origin never offers. */
  const eligible = new Set(webEligible(catalog).map((m) => m.id));
  const models = [];
  for (const name of Object.keys(aliases)) {
    const file = resolveFile(`/models/${name}`, { dist: "", modelsDir, aliases });
    if (!file) continue;
    const id = name.replace(/\.gguf$/, "");
    if (catalog.models.some((m) => m.id === id) && !eligible.has(id)) continue;
    const model = catalog.models.find((m) => m.id === id) ?? { id, tier: "instant", name: id[0].toUpperCase() + id.slice(1) };
    const url = modelsOrigin ? `${modelsOrigin}/v1/${path.basename(file)}` : `/models/${name}`;
    models.push({ ...webModel(model, url), file: name, bytes: statSync(file).size, sha256: modelSha256(file) });
  }
  const built = dist ? path.join(dist, MANIFEST_REL) : "";
  if (models.length === 0 && built && existsSync(built)) return JSON.parse(readFileSync(built, "utf8"));
  return { version: catalog.version, publishedAt: new Date().toISOString(), models, signature: "" };
}

const headersFor = (opts) => ({ ...securityHeaders(opts.modelsOrigin), ...(opts.isolation ? isolationHeaders : {}), "Cache-Control": "no-cache" });

/** Maps a request path to a file, or null. Models come from modelsDir, everything else from dist. */
export function resolveFile(urlPath, { dist, modelsDir, aliases }) {
  const clean = path.posix.normalize(decodeURIComponent(urlPath.split("?")[0]));
  if (clean.startsWith("/models/")) {
    const name = clean.slice("/models/".length);
    if (name.includes("/") || !name.endsWith(".gguf")) return null;
    const direct = path.join(modelsDir, name);
    const aliased = aliases[name] ? path.join(modelsDir, aliases[name]) : null;
    return [direct, aliased].find((p) => p && existsSync(p)) ?? null;
  }
  const file = path.join(dist, clean === "/" ? "index.html" : clean);
  if (file.startsWith(dist + path.sep) && existsSync(file) && statSync(file).isFile()) return file;
  /* The one-document rule the origin gets from the Worker's not_found_handling, so /paywall and friends answer here too. */
  return path.extname(clean) === "" ? path.join(dist, "index.html") : null;
}

function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header ?? "");
  if (!m) return null;
  const [, a, b] = m;
  const start = a === "" ? Math.max(0, size - Number(b)) : Number(a);
  const end = a !== "" && b !== "" ? Math.min(Number(b), size - 1) : size - 1;
  return start <= end && start < size ? { start, end } : "unsatisfiable";
}

function handle(req, res, opts) {
  const headers = headersFor(opts);
  if ((req.url ?? "").split("?")[0] === "/models/manifest.json") {
    const body = JSON.stringify(modelsManifest(opts));
    res.writeHead(200, { ...headers, "Content-Type": MIME[".json"], "Content-Length": Buffer.byteLength(body) }).end(req.method === "HEAD" ? undefined : body);
    return;
  }
  const file = resolveFile(req.url ?? "/", opts);
  if (!file || !["GET", "HEAD"].includes(req.method ?? "")) {
    res.writeHead(file ? 405 : 404, headers).end();
    return;
  }
  const size = statSync(file).size;
  const type = MIME[path.extname(file)] ?? "application/octet-stream";
  const range = parseRange(req.headers.range, size);
  if (range === "unsatisfiable") {
    res.writeHead(416, { ...headers, "Content-Range": `bytes */${size}` }).end();
    return;
  }
  const { start, end } = range ?? { start: 0, end: size - 1 };
  res.writeHead(range ? 206 : 200, {
    ...headers,
    "Content-Type": type,
    "Content-Length": end - start + 1,
    "Accept-Ranges": "bytes",
    ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  const stream = createReadStream(file, { start, end });
  stream.pipe(res);
  res.on("close", () => stream.destroy());
}

/** Starts the host; port 0 picks a free one. Resolves with the bound port and a close() function. */
export function startServer(overrides = {}) {
  const opts = { ...defaults, ...overrides };
  const server = createServer((req, res) => handle(req, res, opts));
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ port, url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!existsSync(path.join(defaults.dist, "index.html"))) {
    console.error(`no web export at ${defaults.dist}; run: corepack pnpm --filter @inborn/mobile export:web`);
    process.exit(1);
  }
  const { url } = await startServer();
  const instant = resolveFile("/models/instant.gguf", defaults);
  console.log(`serving ${defaults.dist} at ${url}${defaults.isolation ? "" : " (ISOLATION=off: single-thread WASM)"}`);
  console.log(instant ? `/models/instant.gguf -> ${instant}` : `/models/instant.gguf not found under ${defaults.modelsDir} (NullLM fallback)`);
}
