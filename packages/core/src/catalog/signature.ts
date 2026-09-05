import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { canonicalJson, utf8 } from "./canonical";
import type { CatalogManifest } from "./types";

/* Hermes has no WebCrypto, so the sync sha512 from @noble/hashes backs both verify() and sign(). */
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

export type UnsignedManifest = Omit<CatalogManifest, "signature">;

/** The manifest without its signature field (what gets signed). */
export function unsignedManifest(manifest: UnsignedManifest | CatalogManifest): UnsignedManifest {
  const rest: Partial<CatalogManifest> = { ...manifest };
  delete rest.signature;
  return rest as UnsignedManifest;
}

/** The bytes the publisher signs: canonical JSON of the manifest without its signature. */
export function manifestBytes(manifest: UnsignedManifest | CatalogManifest): Uint8Array {
  return utf8(canonicalJson(unsignedManifest(manifest)));
}

export function verifyManifest(manifest: CatalogManifest, publicKeyHex: string): boolean {
  if (typeof manifest.signature !== "string" || !/^[0-9a-f]{128}$/.test(manifest.signature)) return false;
  try {
    return ed.verify(manifest.signature, manifestBytes(manifest), publicKeyHex);
  } catch {
    return false;
  }
}

/** Used by scripts/sign-catalog.mjs and tests; the app never holds a private key. */
export function signManifest(manifest: UnsignedManifest, privateKeyHex: string): CatalogManifest {
  const signature = ed.etc.bytesToHex(ed.sign(manifestBytes(manifest), privateKeyHex));
  return { ...manifest, signature };
}

export const publicKeyFromPrivate = (privateKeyHex: string): string => ed.etc.bytesToHex(ed.getPublicKey(privateKeyHex));
