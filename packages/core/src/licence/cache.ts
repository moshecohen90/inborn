import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { concatBytes, fromHex, utf8Bytes, utf8String } from "./bytes";
import type { EntitlementCache } from "./types";

/**
 * The entitlement cache at rest: XChaCha20-Poly1305 under a key derived from the app's existing storage secret
 * (the SQLCipher key in the Keychain / Keystore), so a copied file is useless on another device and a tampered one
 * fails to open. Layout: 1 byte version · 24 byte nonce · ciphertext+tag.
 */

const VERSION = 1;
export const CACHE_NONCE_BYTES = 24;
const LICENCE_INFO = "inborn licence cache v1";

/** 32-byte key from the 64-hex storage secret and a domain label; the secret itself never touches a file. Different labels give unrelated keys. */
export function deriveSealKey(storageSecretHex: string, info: string): Uint8Array {
  return hkdf(sha256, fromHex(storageSecretHex), utf8Bytes("inborn"), utf8Bytes(info), 32);
}

export const deriveCacheKey = (storageSecretHex: string): Uint8Array => deriveSealKey(storageSecretHex, LICENCE_INFO);

/** Any JSON value, sealed: 1 byte version · 24 byte nonce · ciphertext+tag. Used for the entitlement cache and the vault audit logs. */
export function sealJson(key: Uint8Array, value: unknown, nonce: Uint8Array): Uint8Array {
  if (nonce.length !== CACHE_NONCE_BYTES) throw new Error("nonce must be 24 bytes");
  const box = xchacha20poly1305(key, nonce).encrypt(utf8Bytes(JSON.stringify(value)));
  return concatBytes(Uint8Array.of(VERSION), nonce, box);
}

/** Null for anything not sealed under this key (wrong device, tampering, old layout) or not JSON. */
export function openJson(key: Uint8Array, sealed: Uint8Array): unknown {
  if (sealed.length < 1 + CACHE_NONCE_BYTES + 16 || sealed[0] !== VERSION) return null;
  try {
    const nonce = sealed.subarray(1, 1 + CACHE_NONCE_BYTES);
    return JSON.parse(utf8String(xchacha20poly1305(key, nonce).decrypt(sealed.subarray(1 + CACHE_NONCE_BYTES))));
  } catch {
    return null;
  }
}

export const sealCache = (key: Uint8Array, cache: EntitlementCache, nonce: Uint8Array): Uint8Array => sealJson(key, cache, nonce);

export function openCache(key: Uint8Array, sealed: Uint8Array): EntitlementCache | null {
  const parsed = openJson(key, sealed) as EntitlementCache | null;
  if (!parsed || typeof parsed !== "object" || parsed.version !== 1 || !Array.isArray(parsed.purchases) || typeof parsed.storeContactAt !== "number") return null;
  return parsed;
}
