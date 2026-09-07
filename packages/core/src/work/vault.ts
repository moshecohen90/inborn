import { sha256 } from "@noble/hashes/sha256";
import { toHex, utf8Bytes } from "../licence/bytes";
import { isValidPasscode } from "../lock/policy";

/**
 * Client vaults (spec §7.5 Work row, §7.9): a folder marked as a vault carries its own passcode. The code is never
 * stored, only a salted hash (like the app lock); the salt is per vault so two vaults with the same code do not
 * share a hash. Everything here is pure; the app keeps the records in the Keychain and the unlocked set in memory.
 */

export interface VaultRecord {
  /** The folder this vault protects (chats inside it). */
  folderId: string;
  saltHex: string;
  hashHex: string;
  createdAt: number;
  /** Hash-chain head of the vault's audit log, mirrored here so a truncated log file is noticed. */
  auditHead?: string;
}

export const VAULT_SALT_BYTES = 16;

export function hashVaultCode(saltHex: string, code: string): string {
  return toHex(sha256(utf8Bytes(`${saltHex}:${code}`)));
}

/** New record, or null when the code does not meet the passcode rule (4–8 digits, same as the app lock). */
export function createVaultRecord(folderId: string, code: string, salt: Uint8Array, now: number): VaultRecord | null {
  if (!isValidPasscode(code) || salt.length < VAULT_SALT_BYTES) return null;
  const saltHex = toHex(salt);
  return { folderId, saltHex, hashHex: hashVaultCode(saltHex, code), createdAt: now };
}

export function verifyVaultCode(record: VaultRecord, code: string): boolean {
  const a = utf8Bytes(hashVaultCode(record.saltHex, code));
  const b = utf8Bytes(record.hashHex);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** Same salt, new hash; the audit head and creation time stay. */
export function changeVaultCode(record: VaultRecord, code: string): VaultRecord | null {
  if (!isValidPasscode(code)) return null;
  return { ...record, hashHex: hashVaultCode(record.saltHex, code) };
}

/** Unlocked vaults of this process: folderId → when it was unlocked. Never persisted (§7.5: the code is asked again after the app lock). */
export type VaultSession = ReadonlyMap<string, number>;

/**
 * A vault asks for its code again whenever the app lock engaged after it was unlocked, and in any case after
 * `maxOpenMs` (default 30 min), so a phone left open does not leave a client file open with it.
 */
export function vaultIsOpen(session: VaultSession, folderId: string, now: number, appLockedAt: number | null, maxOpenMs = 30 * 60_000): boolean {
  const openedAt = session.get(folderId);
  if (openedAt === undefined) return false;
  if (appLockedAt !== null && appLockedAt >= openedAt) return false;
  return now - openedAt <= maxOpenMs;
}

export const openVault = (session: VaultSession, folderId: string, now: number): VaultSession => new Map(session).set(folderId, now);
export function closeVault(session: VaultSession, folderId: string): VaultSession {
  const next = new Map(session);
  next.delete(folderId);
  return next;
}
export const closeAllVaults = (): VaultSession => new Map();
