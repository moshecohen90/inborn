#!/usr/bin/env node
/**
 * Desktop licence keys (spec §12.4, §14.4). The Ed25519 seed lives only in the macOS Keychain; the public key is
 * committed in packages/core/src/licence/licencePublicKey.ts and the app verifies keys offline against it.
 *
 *   node scripts/gen-licence-key.mjs                                   # create the signing key (refuses to overwrite)
 *   node scripts/gen-licence-key.mjs --rotate                          # new key; keys issued before stop verifying
 *   node scripts/gen-licence-key.mjs --issue --sku inborn.work [--seats 5] [--email a@b.c] [--expires 2027-01-01] [--id ORDER]
 *   node scripts/gen-licence-key.mjs --check INBORN-…                  # verify a key against the committed public key
 */
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const KC_SERVICE = "inborn-licence-signing";
export const KC_ACCOUNT = "ed25519-v1";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicKeyFile = path.join(repoRoot, "packages/core/src/licence/licencePublicKey.ts");
const SKUS = ["inborn.pro", "inborn.work", "inborn.work.upgrade"];

export function kcGet() {
  try {
    return execFileSync("security", ["find-generic-password", "-s", KC_SERVICE, "-a", KC_ACCOUNT, "-w"], { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function kcSet(seedHex) {
  execFileSync("security", ["add-generic-password", "-U", "-s", KC_SERVICE, "-a", KC_ACCOUNT, "-w", seedHex], { stdio: "ignore" });
}

/* Node emits DER; Ed25519 raw keys are the trailing 32 bytes of both PKCS#8 (seed) and SPKI (public key). */
function generate() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return { seedHex: privateKey.export({ type: "pkcs8", format: "der" }).subarray(-32).toString("hex"), publicHex: publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex") };
}

const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const keyFromSeed = (seedHex) => createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, Buffer.from(seedHex, "hex")]), format: "der", type: "pkcs8" });
const keyFromPublic = (pubHex) => createPublicKey({ key: Buffer.concat([SPKI_PREFIX, Buffer.from(pubHex, "hex")]), format: "der", type: "spki" });

/* Must produce the same bytes as packages/core/src/catalog/canonical.ts. */
function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const committedPublicKey = () => /LICENCE_PUBLIC_KEY = "([0-9a-f]{64})"/.exec(readFileSync(publicKeyFile, "utf8"))?.[1];

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv.includes("--check")) {
    const key = arg("--check");
    const pub = committedPublicKey();
    const m = /^INBORN-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(key ?? "");
    if (!m || !pub) {
      console.error("usage: --check INBORN-<payload>.<signature>");
      process.exit(2);
    }
    const payload = JSON.parse(Buffer.from(m[1], "base64url").toString("utf8"));
    const ok = verify(null, Buffer.from(canonicalJson(payload), "utf8"), keyFromPublic(pub), Buffer.from(m[2], "base64url"));
    console.log(ok ? `valid: ${JSON.stringify(payload)}` : "INVALID signature");
    process.exit(ok ? 0 : 1);
  }
  if (argv.includes("--issue")) {
    const seedHex = kcGet();
    const pub = committedPublicKey();
    if (!seedHex || !pub) {
      console.error("no signing key; run scripts/gen-licence-key.mjs first");
      process.exit(1);
    }
    const sku = arg("--sku");
    if (!SKUS.includes(sku)) {
      console.error(`--sku must be one of ${SKUS.join(", ")}`);
      process.exit(2);
    }
    const seats = Number(arg("--seats") ?? 1);
    const email = arg("--email");
    const expires = arg("--expires");
    const payload = {
      v: 1,
      id: arg("--id") ?? randomBytes(6).toString("hex"),
      sku,
      seats: Number.isInteger(seats) && seats > 0 ? seats : 1,
      issuedAt: Date.now(),
      ...(expires ? { expiresAt: Date.parse(expires) } : {}),
      ...(email ? { holder: createHash("sha256").update(email.trim().toLowerCase()).digest("hex") } : {}),
    };
    const message = Buffer.from(canonicalJson(payload), "utf8");
    const signature = sign(null, message, keyFromSeed(seedHex));
    if (!verify(null, message, keyFromPublic(pub), signature)) {
      console.error("the Keychain seed does not match the committed public key; rotate with --rotate");
      process.exit(1);
    }
    /* The key itself is the customer's proof; print only it (no seed, no address). */
    console.log(`INBORN-${b64url(message)}.${b64url(signature)}`);
    process.exit(0);
  }
  const rotate = argv.includes("--rotate");
  if (kcGet() && !rotate) {
    console.error(`a key already exists in the Keychain (${KC_SERVICE}); pass --rotate to replace it`);
    process.exit(1);
  }
  const { seedHex, publicHex } = generate();
  kcSet(seedHex);
  writeFileSync(publicKeyFile, `/** Ed25519 public key for desktop licence keys (generated by scripts/gen-licence-key.mjs; the private seed lives in the macOS Keychain). */\nexport const LICENCE_PUBLIC_KEY = "${publicHex}";\n`);
  console.log(`private seed stored in Keychain ${KC_SERVICE}/${KC_ACCOUNT} (${seedHex.slice(0, 6)}…)`);
  console.log(`public key ${publicHex} -> ${path.relative(repoRoot, publicKeyFile)}`);
}
