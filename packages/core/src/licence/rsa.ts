import { sha1 } from "@noble/hashes/sha1";
import { sha256 } from "@noble/hashes/sha256";
import { bigIntToBytes, bytesEqual, bytesToBigInt, concatBytes } from "./bytes";

/* RSASSA-PKCS1-v1_5 verification only (Play purchase signatures are SHA1withRSA; the StoreKit test root is
   sha256WithRSA). No signing, no padding oracle surface: the app only ever holds public keys. */

export interface RsaPublicKey {
  n: bigint;
  e: bigint;
  /** Modulus length in bytes. */
  k: number;
}

export type RsaHash = "sha1" | "sha256";

/* DigestInfo prefixes from RFC 8017 §9.2 note 1. */
const DIGEST_INFO: Record<RsaHash, Uint8Array> = {
  sha1: Uint8Array.from([0x30, 0x21, 0x30, 0x09, 0x06, 0x05, 0x2b, 0x0e, 0x03, 0x02, 0x1a, 0x05, 0x00, 0x04, 0x14]),
  sha256: Uint8Array.from([0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05, 0x00, 0x04, 0x20]),
};

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

export function rsaVerify(key: RsaPublicKey, hash: RsaHash, message: Uint8Array, signature: Uint8Array): boolean {
  if (signature.length !== key.k) return false;
  const s = bytesToBigInt(signature);
  if (s >= key.n) return false;
  let em: Uint8Array;
  try {
    em = bigIntToBytes(modPow(s, key.e, key.n), key.k);
  } catch {
    return false;
  }
  const digest = hash === "sha1" ? sha1(message) : sha256(message);
  const t = concatBytes(DIGEST_INFO[hash], digest);
  if (key.k < t.length + 11) return false;
  const expected = new Uint8Array(key.k);
  expected[0] = 0x00;
  expected[1] = 0x01;
  expected.fill(0xff, 2, key.k - t.length - 1);
  expected[key.k - t.length - 1] = 0x00;
  expected.set(t, key.k - t.length);
  return bytesEqual(em, expected);
}
