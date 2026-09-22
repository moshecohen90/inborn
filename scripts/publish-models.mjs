#!/usr/bin/env node
/**
 * Publishes the catalog's `https` model files to the R2 bucket behind models.inbornapp.com (spec §5.4),
 * then verifies each one over the public CDN the way the app will read it.
 *
 *   node scripts/publish-models.mjs                 # upload what is missing or wrong, then verify
 *   node scripts/publish-models.mjs --verify-only   # verify what is already there
 *   node scripts/publish-models.mjs --dry           # print the plan
 *
 * Credentials: macOS Keychain service `inborn-cloudflare-api`, account `token` — a Cloudflare API token with
 * Workers R2 Storage: Edit. R2's S3 API takes that token directly: access key id = the token's id,
 * secret = sha256 of the token string. Nothing is ever written to disk.
 */
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, openSync, readSync, closeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODELS_DIR = process.env.MODELS_DIR ?? path.join(repoRoot, ".models");
const BUCKET = process.env.R2_BUCKET ?? "inborn-models";
const ACCOUNT = process.env.CF_ACCOUNT_ID ?? "9de3aac0325f2ec6294e00714a0772b7";
const PROBE = 1024 * 1024;

const manifest = JSON.parse(execFileSync("cat", [path.join(repoRoot, "packages/core/src/catalog/manifest.json")], { encoding: "utf8" }));
const prefix = manifest.baseUrl.replace(/^https?:\/\/[^/]+\/?/, "").replace(/^\/|\/$/g, "");

/** Every file an `https` delivery resolves to, as { key, file, bytes, sha256 } — shards included (manifest.ts httpsUrl). */
export function publishPlan(m) {
  const out = [];
  for (const model of m.models) {
    const d = model.delivery.find((x) => x.kind === "https");
    if (!d) continue;
    const dir = d.path.includes("/") ? d.path.slice(0, d.path.lastIndexOf("/") + 1) : "";
    const parts = model.parts ?? [{ file: model.file, bytes: model.bytes, sha256: model.sha256 }];
    for (const p of parts) {
      const rel = p.file === model.file ? d.path : `${dir}${p.file}`;
      if (!out.some((x) => x.rel === rel)) out.push({ rel, file: p.file, bytes: p.bytes, sha256: p.sha256 });
    }
  }
  return out;
}

const token = () => execFileSync("security", ["find-generic-password", "-s", "inborn-cloudflare-api", "-a", "token", "-w"], { encoding: "utf8" }).trim();

function s3Creds() {
  const t = token();
  const verify = JSON.parse(run("curl", ["-s", "https://api.cloudflare.com/client/v4/user/tokens/verify", "-H", `Authorization: Bearer ${t}`]));
  if (!verify.success) throw new Error("token did not verify");
  return { keyId: verify.result.id, secret: createHash("sha256").update(t).digest("hex") };
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`${cmd} exited ${r.status}: ${r.stderr?.slice(0, 400)}`);
  return r.stdout;
}

const endpoint = `https://${ACCOUNT}.r2.cloudflarestorage.com`;


/** Does the bucket already hold this object, at the catalog's size? Asked of R2 itself: a HEAD to the CDN
 * before the upload makes Cloudflare cache the 404, and the verification pass then reads that cached miss. */
function headS3(entry) {
  const { keyId, secret } = s3Creds();
  const raw = run("curl", ["-sI", "-X", "HEAD", `${endpoint}/${BUCKET}/${prefix}/${entry.rel}`, "--aws-sigv4", "aws:amz:auto:s3", "--user", `${keyId}:${secret}`, "--max-time", "60"]);
  const len = /content-length:\s*(\d+)/i.exec(raw)?.[1];
  return { status: Number(/HTTP\/[\d.]+ (\d+)/.exec(raw)?.[1] ?? 0), length: Number(len ?? 0) };
}

function put(entry) {
  const local = path.join(MODELS_DIR, entry.file);
  if (!existsSync(local)) throw new Error(`missing local file: ${local}`);
  const { keyId, secret } = s3Creds();
  const out = run("curl", [
    "-s", "-o", "/dev/null", "-w", "%{http_code}", "-X", "PUT", `${endpoint}/${BUCKET}/${prefix}/${entry.rel}`,
    "--aws-sigv4", "aws:amz:auto:s3", "--user", `${keyId}:${secret}`,
    "-H", "Content-Type: application/octet-stream", "-H", `x-amz-meta-sha256: ${entry.sha256}`,
    "-T", local, "--expect100-timeout", "30", "--max-time", "7200",
  ]);
  if (out.trim() !== "200") throw new Error(`PUT ${entry.rel} → HTTP ${out}`);
}

const cdn = (rel) => `${manifest.baseUrl.replace(/\/$/, "")}/${rel}`;

function headCdn(rel) {
  /* The custom domain answers only once its certificate is issued; until then a HEAD is a miss, not a failure. */
  const r = spawnSync("curl", ["-sI", "--max-time", "60", cdn(rel)], { encoding: "utf8", maxBuffer: 1 << 28 });
  if (r.status !== 0) return { status: 0, length: 0, acceptRanges: "", etag: "", type: "" };
  const raw = r.stdout;
  const h = Object.fromEntries(raw.split(/\r?\n/).filter((l) => l.includes(":")).map((l) => [l.slice(0, l.indexOf(":")).toLowerCase().trim(), l.slice(l.indexOf(":") + 1).trim()]));
  return { status: Number(/HTTP\/[\d.]+ (\d+)/.exec(raw)?.[1] ?? 0), length: Number(h["content-length"] ?? 0), acceptRanges: h["accept-ranges"] ?? "", etag: h.etag ?? "", type: h["content-type"] ?? "" };
}

function localSlice(file, start, len) {
  const fd = openSync(path.join(MODELS_DIR, file), "r");
  const buf = Buffer.alloc(len);
  readSync(fd, buf, 0, len, start);
  closeSync(fd);
  return createHash("sha256").update(buf).digest("hex");
}

function rangeCheck(entry, start, len) {
  const tmp = `/tmp/.inborn-range-${process.pid}`;
  const code = run("curl", ["-s", "-o", tmp, "-w", "%{http_code} %{size_download}", "-H", `Range: bytes=${start}-${start + len - 1}`, "--max-time", "300", cdn(entry.rel)]);
  const [status, size] = code.trim().split(/\s+/);
  const got = createHash("sha256").update(execFileSync("cat", [tmp])).digest("hex");
  execFileSync("rm", ["-f", tmp]);
  return { status: Number(status), size: Number(size), match: got === localSlice(entry.file, start, len) };
}

async function main() {
  const args = process.argv.slice(2);
  const plan = publishPlan(manifest);
  console.log(`${plan.length} objects, ${(plan.reduce((a, b) => a + b.bytes, 0) / 1024 ** 3).toFixed(2)} GB → ${BUCKET}/${prefix}/`);
  if (args.includes("--dry")) return plan.forEach((e) => console.log(`  ${prefix}/${e.rel}  ${e.bytes}`));

  if (!args.includes("--verify-only")) {
    for (const e of plan) {
      const head = headS3(e);
      if (head.status === 200 && head.length === e.bytes) {
        console.log(`skip  ${e.rel} (already ${e.bytes} bytes)`);
        continue;
      }
      process.stdout.write(`put   ${e.rel} … `);
      put(e);
      console.log("ok");
    }
  }

  let bad = 0;
  for (const e of plan) {
    const head = headCdn(e.rel);
    const sizeOk = head.status === 200 && head.length === e.bytes;
    const first = rangeCheck(e, 0, PROBE);
    const last = rangeCheck(e, e.bytes - PROBE, PROBE);
    const ok = sizeOk && head.acceptRanges === "bytes" && first.status === 206 && first.match && last.status === 206 && last.match;
    if (!ok) bad++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${e.rel}  size=${head.length}/${e.bytes} ranges=${head.acceptRanges} first=${first.status}/${first.match} last=${last.status}/${last.match} type=${head.type}`);
  }
  if (bad) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
