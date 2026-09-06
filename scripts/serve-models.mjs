#!/usr/bin/env node
/**
 * Stand-in for models.inbornapp.com (spec §5.4) for simulator/emulator runs: serves the files in .models/ by
 * name with HEAD, ETag, Accept-Ranges and 206 partial content, plus the signed manifest at /v1/manifest.json.
 *
 *   MODELS_DIR=/path PORT=8790 node scripts/serve-models.mjs
 *   DROP_AFTER=20000000 node scripts/serve-models.mjs   # first full GET is cut after N bytes to exercise resume
 *
 * Nothing here is used by the app in production; the app's host allowlist only admits this host in dev builds.
 */
import { createServer } from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modelsDir = process.env.MODELS_DIR ?? path.join(repoRoot, ".models");
const port = Number(process.env.PORT ?? 8790);
const dropAfter = Number(process.env.DROP_AFTER ?? 0);
const manifestFile = path.join(repoRoot, "packages/core/src/catalog/manifest.json");

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let dropped = false;

function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header ?? "");
  if (!m) return null;
  const [, a, b] = m;
  const start = a === "" ? Math.max(0, size - Number(b)) : Number(a);
  const end = a !== "" && b !== "" ? Math.min(Number(b), size - 1) : size - 1;
  return start <= end && start < size ? { start, end } : "unsatisfiable";
}

function resolve(urlPath) {
  const clean = path.posix.normalize(decodeURIComponent(urlPath.split("?")[0]));
  if (clean === "/v1/manifest.json") return { file: manifestFile, type: "application/json" };
  const name = clean.replace(/^\/v1\//, "/").slice(1);
  if (!name || name.includes("/") || name.startsWith(".")) return null;
  const file = path.join(modelsDir, name);
  return existsSync(file) && statSync(file).isFile() ? { file, type: "application/octet-stream" } : null;
}

const server = createServer((req, res) => {
  const hit = resolve(req.url ?? "/");
  if (!hit || !["GET", "HEAD"].includes(req.method ?? "")) {
    res.writeHead(hit ? 405 : 404).end();
    log(req.method, req.url, hit ? 405 : 404);
    return;
  }
  const st = statSync(hit.file);
  const etag = `"${st.size}-${Math.floor(st.mtimeMs)}"`;
  const range = parseRange(req.headers.range, st.size);
  if (range === "unsatisfiable") {
    res.writeHead(416, { "Content-Range": `bytes */${st.size}` }).end();
    return;
  }
  const ifRange = req.headers["if-range"];
  const useRange = range && (!ifRange || ifRange === etag);
  const { start, end } = useRange ? range : { start: 0, end: st.size - 1 };
  res.writeHead(useRange ? 206 : 200, {
    "Content-Type": hit.type,
    "Content-Length": end - start + 1,
    "Accept-Ranges": "bytes",
    ETag: etag,
    "Cache-Control": "no-cache",
    ...(useRange ? { "Content-Range": `bytes ${start}-${end}/${st.size}` } : {}),
  });
  log(req.method, req.url, useRange ? `206 ${start}-${end}` : 200, req.headers.range ?? "");
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  const cut = dropAfter && !dropped && start === 0 && st.size > dropAfter;
  const stream = createReadStream(hit.file, { start, end: cut ? start + dropAfter - 1 : end });
  stream.pipe(res, { end: !cut });
  if (cut) {
    dropped = true;
    stream.on("end", () => {
      log(`dropping connection after ${dropAfter} bytes (DROP_AFTER)`);
      res.destroy();
    });
  }
  res.on("close", () => stream.destroy());
});

server.listen(port, "0.0.0.0", () => {
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  log(`serving ${modelsDir} at http://127.0.0.1:${port}/v1/ (manifest v${manifest.version}, ${manifest.models.length} models)${dropAfter ? `, DROP_AFTER=${dropAfter}` : ""}`);
  for (const m of manifest.models) {
    const d = m.delivery.find((x) => x.kind === "https");
    if (d) log(`  ${m.id}: /v1/${d.path} ${existsSync(path.join(modelsDir, d.path)) ? "OK" : "missing"}`);
  }
});
