import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { canonicalJson } from "../catalog/canonical";
import { fromBase64, toBase64, toHex, utf8Bytes, utf8String } from "./bytes";
import { LICENCE_PUBLIC_KEY } from "./licencePublicKey";
import { TIER_OF_PRODUCT, type ProductId, type VerifyResult } from "./types";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

/**
 * Desktop licence keys (spec §12.4 row 4, §14.4): sold through Paddle, minted by scripts/gen-licence-key.mjs with the
 * Ed25519 seed from the Keychain, verified offline against the public key compiled into the app. The key is the
 * proof; the app binds it to this device in its sealed cache. Team keys carry `seats`.
 *
 *   INBORN-<base64url(canonical JSON payload)>.<base64url(signature)>
 */

export const LICENCE_KEY_PREFIX = "INBORN-";

export interface LicenceKeyPayload {
  v: 1;
  /** Licence id (also the Paddle order reference). */
  id: string;
  sku: "inborn.pro" | "inborn.work" | "inborn.work.upgrade";
  /** Seats for Team keys; 1 for personal keys. Device limits are enforced at Paddle activation, not here. */
  seats: number;
  issuedAt: number;
  /** Optional hard expiry for trials / replacements; absent = perpetual. */
  expiresAt?: number;
  /** Who the key was issued to, hashed (sha256 hex of the lower-cased email) so a key never carries the address. */
  holder?: string;
}

export function encodeLicenceKey(payload: LicenceKeyPayload, signatureBytes: Uint8Array): string {
  return `${LICENCE_KEY_PREFIX}${toBase64(utf8Bytes(canonicalJson(payload)), true)}.${toBase64(signatureBytes, true)}`;
}

export function licenceKeyBytes(payload: LicenceKeyPayload): Uint8Array {
  return utf8Bytes(canonicalJson(payload));
}

/** Used by scripts/gen-licence-key.mjs and tests; the app never holds the private seed. */
export function signLicenceKey(payload: LicenceKeyPayload, privateKeyHex: string): string {
  return encodeLicenceKey(payload, ed.sign(licenceKeyBytes(payload), privateKeyHex));
}

export function decodeLicenceKey(key: string): { payload: LicenceKeyPayload; signature: Uint8Array } | null {
  const trimmed = key.trim().toUpperCase().startsWith(LICENCE_KEY_PREFIX) ? key.trim().slice(LICENCE_KEY_PREFIX.length) : null;
  if (!trimmed) return null;
  const [p, s, ...rest] = trimmed.split(".");
  if (!p || !s || rest.length) return null;
  try {
    const payload = JSON.parse(utf8String(fromBase64(p))) as LicenceKeyPayload;
    const signature = fromBase64(s);
    if (payload.v !== 1 || typeof payload.id !== "string" || typeof payload.sku !== "string" || typeof payload.issuedAt !== "number" || signature.length !== 64) return null;
    return { payload, signature };
  } catch {
    return null;
  }
}

export interface LicenceKeyVerifyOptions {
  publicKeyHex?: string;
  deviceId: string;
  now?: number;
}

export function verifyLicenceKey(key: string, opts: LicenceKeyVerifyOptions): VerifyResult {
  const decoded = decodeLicenceKey(key);
  if (!decoded) return { ok: false, reason: "malformed" };
  const { payload, signature } = decoded;
  if (!(payload.sku in TIER_OF_PRODUCT)) return { ok: false, reason: "unknown-product" };
  let valid: boolean;
  try {
    /* Re-encoding canonically means a re-ordered payload with the same signature still verifies, and a changed one never does. */
    valid = ed.verify(signature, licenceKeyBytes(payload), opts.publicKeyHex ?? LICENCE_PUBLIC_KEY);
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: "bad-signature" };
  const now = opts.now ?? Date.now();
  if (payload.expiresAt !== undefined && now > payload.expiresAt) return { ok: false, reason: "cert-expired" };
  const productId = payload.sku as ProductId;
  return {
    ok: true,
    purchase: {
      store: "licence-key",
      productId,
      tier: TIER_OF_PRODUCT[productId],
      transactionId: payload.id,
      originalTransactionId: payload.id,
      purchasedAt: payload.issuedAt,
      revokedAt: null,
      familyShared: false,
      environment: "production",
      acknowledged: true,
      proof: { kind: "licence-key", key: key.trim(), deviceId: opts.deviceId },
    },
  };
}

export const licencePublicKeyFromPrivate = (privateKeyHex: string): string => toHex(ed.getPublicKey(privateKeyHex));
