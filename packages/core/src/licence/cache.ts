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
const INFO = utf8Bytes("inborn licence cache v1");

/** 32-byte cache key from the 64-hex storage secret; the secret itself never touches the file. */
export function deriveCacheKey(storageSecretHex: string): Uint8Array {
  return hkdf(sha256, fromHex(storageSecretHex), utf8Bytes("inborn"), INFO, 32);
}

export function sealCache(key: Uint8Array, cache: EntitlementCache, nonce: Uint8Array): Uint8Array {
  if (nonce.length !== CACHE_NONCE_BYTES) throw new Error("nonce must be 24 bytes");
  const box = xchacha20poly1305(key, nonce).encrypt(utf8Bytes(JSON.stringify(cache)));
  return concatBytes(Uint8Array.of(VERSION), nonce, box);
}

/** Null for anything that is not a cache sealed under this key (wrong device, tampering, old layout). */
export function openCache(key: Uint8Array, sealed: Uint8Array): EntitlementCache | null {
  if (sealed.length < 1 + CACHE_NONCE_BYTES + 16 || sealed[0] !== VERSION) return null;
  try {
    const nonce = sealed.subarray(1, 1 + CACHE_NONCE_BYTES);
    const plain = xchacha20poly1305(key, nonce).decrypt(sealed.subarray(1 + CACHE_NONCE_BYTES));
    const parsed = JSON.parse(utf8String(plain)) as EntitlementCache;
    if (parsed.version !== 1 || !Array.isArray(parsed.purchases) || typeof parsed.storeContactAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}
