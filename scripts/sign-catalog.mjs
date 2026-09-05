#!/usr/bin/env node
/**
 * Signs packages/core/src/catalog/manifest.json with the Ed25519 seed from the macOS Keychain
 * (scripts/gen-catalog-key.mjs). The catalog test verifies the committed signature against the public key,
 * so a manifest edit without a re-sign fails `pnpm test`.
 *
 *   node scripts/sign-catalog.mjs            # sign in place
 *   node scripts/sign-catalog.mjs --check    # exit 1 if the signature is missing or stale
 */
import { Buffer } from "node:buffer";
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { kcGet } from "./gen-catalog-key.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestFile = path.join(repoRoot, "packages/core/src/catalog/manifest.json");
const publicKeyFile = path.join(repoRoot, "packages/core/src/catalog/publicKey.ts");

/* Must produce the same bytes as packages/core/src/catalog/canonical.ts. */
function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const keyFromSeed = (seedHex) => createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, Buffer.from(seedHex, "hex")]), format: "der", type: "pkcs8" });
const keyFromPublic = (pubHex) => createPublicKey({ key: Buffer.concat([SPKI_PREFIX, Buffer.from(pubHex, "hex")]), format: "der", type: "spki" });

const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
const unsigned = { ...manifest };
delete unsigned.signature;
const message = Buffer.from(canonicalJson(unsigned), "utf8");
const publicHex = /CATALOG_PUBLIC_KEY = "([0-9a-f]{64})"/.exec(readFileSync(publicKeyFile, "utf8"))?.[1];
if (!publicHex) {
  console.error("no public key; run scripts/gen-catalog-key.mjs first");
  process.exit(1);
}

if (process.argv.includes("--check")) {
  const ok = typeof manifest.signature === "string" && verify(null, message, keyFromPublic(publicHex), Buffer.from(manifest.signature, "hex"));
  console.log(ok ? "manifest signature OK" : "manifest signature MISSING or STALE; run scripts/sign-catalog.mjs");
  process.exit(ok ? 0 : 1);
}

const seedHex = kcGet();
if (!seedHex) {
  console.error("no signing key in the Keychain; run scripts/gen-catalog-key.mjs");
  process.exit(1);
}
const signature = sign(null, message, keyFromSeed(seedHex)).toString("hex");
if (!verify(null, message, keyFromPublic(publicHex), Buffer.from(signature, "hex"))) {
  console.error("the Keychain seed does not match the committed public key; rotate with gen-catalog-key.mjs --rotate");
  process.exit(1);
}
writeFileSync(manifestFile, JSON.stringify({ ...unsigned, signature }, null, 2) + "\n");
console.log(`signed manifest v${manifest.version} (${manifest.models.length} models): ${signature.slice(0, 16)}…`);
