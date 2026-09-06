import { File, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";
import type { CacheStorage } from "@inborn/core";
import { databaseKeyHex } from "../storage/sqliteRepository";

/**
 * Sealed entitlement cache on phones: one file in the document directory, encrypted in @inborn/core under a key
 * derived from the SQLCipher secret in the Keychain / Keystore (spec §12.4). A device backup restores the file but
 * not the secret, so on a new device it simply reads as empty and "Restore purchases" refills it.
 */
export const LICENCE_FILE = "licence.bin";
const file = () => new File(Paths.document, LICENCE_FILE);

export const storageSecretHex = (): Promise<string> => databaseKeyHex();

export const randomNonce = (): Uint8Array => Crypto.getRandomBytes(24);

export function cacheStorage(): CacheStorage {
  return {
    async load() {
      const f = file();
      return f.exists ? f.bytesSync() : null;
    },
    async save(sealed) {
      file().write(sealed);
    },
    async clear() {
      const f = file();
      if (f.exists) f.delete();
    },
  };
}

/** Headless proof channel (like dev-run.json): the paywall writes what happened here. */
export function writeLicenceResult(name: string, result: Record<string, unknown>): void {
  try {
    new File(Paths.document, name).write(JSON.stringify(result));
  } catch (e: unknown) {
    console.warn("[licence] result not written", e);
  }
}
