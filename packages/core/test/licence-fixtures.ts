import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fromBase64, toBase64, utf8Bytes } from "../src/licence/bytes";

/* Test-only keys and certificates (packages/core/test/fixtures/licence/gen.mjs); nothing here is production material. */
export const FIXTURES = join(__dirname, "fixtures/licence");
export const read = (name: string): string => readFileSync(join(FIXTURES, name), "utf8");
export const readBytes = (name: string): Uint8Array => new Uint8Array(readFileSync(join(FIXTURES, name)));

export const pemToDer = (pem: string): Uint8Array => fromBase64(pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, ""));
export const derToB64 = (der: Uint8Array): string => toBase64(der);

export const chain = {
  root: pemToDer(read("test-root.pem")),
  intermediate: pemToDer(read("test-int.pem")),
  leaf: pemToDer(read("test-leaf.pem")),
  plainLeaf: pemToDer(read("test-plain.pem")),
  /** Shaped like Xcode's StoreKit Testing signer: self-signed P-256, CN "StoreKit Testing in Xcode". */
  xcode: pemToDer(read("test-xcode.pem")),
};

export interface JwsInput {
  payload: Record<string, unknown>;
  x5c?: string[];
  keyPem?: string;
  alg?: string;
}

/** A StoreKit-2-shaped signed transaction: ES256 (raw r‖s) over base64url(header).base64url(payload). */
export function makeJws({ payload, x5c, keyPem, alg = "ES256" }: JwsInput): string {
  const header = { alg, x5c: x5c ?? [derToB64(chain.leaf), derToB64(chain.intermediate), derToB64(chain.root)] };
  const h = toBase64(utf8Bytes(JSON.stringify(header)), true);
  const p = toBase64(utf8Bytes(JSON.stringify(payload)), true);
  const key = createPrivateKey(keyPem ?? read("test-leaf.key"));
  const sig = sign("sha256", Buffer.from(`${h}.${p}`, "utf8"), { key, dsaEncoding: "ieee-p1363" });
  return `${h}.${p}.${toBase64(new Uint8Array(sig), true)}`;
}

export const NOW = Date.UTC(2026, 8, 6, 12, 0, 0);

export function transactionPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    transactionId: "2000000123456789",
    originalTransactionId: "2000000123456789",
    bundleId: "com.inbornapp.mobile",
    productId: "inborn.pro",
    purchaseDate: NOW - 3_600_000,
    originalPurchaseDate: NOW - 3_600_000,
    quantity: 1,
    type: "Non-Consumable",
    inAppOwnershipType: "PURCHASED",
    signedDate: NOW,
    environment: "Production",
    transactionReason: "PURCHASE",
    storefront: "USA",
    ...overrides,
  };
}

/** Play purchase JSON + SHA1withRSA signature, as Play Billing hands them to the app. */
export function makePlayPurchase(overrides: Record<string, unknown> = {}, keyPem = read("test-play.key")): { json: string; signature: string } {
  const data = {
    orderId: "GPA.3333-4444-5555-66666",
    packageName: "com.inbornapp.mobile",
    productId: "inborn.pro",
    purchaseTime: NOW - 60_000,
    purchaseState: 0,
    purchaseToken: "abcdef.token",
    quantity: 1,
    acknowledged: false,
    ...overrides,
  };
  const json = JSON.stringify(data);
  const signature = sign("sha1", Buffer.from(json, "utf8"), createPrivateKey(keyPem)).toString("base64");
  return { json, signature };
}

export const playPublicKeyB64 = (): string => createPublicKey(read("test-play.pub")).export({ type: "spki", format: "der" }).toString("base64");
