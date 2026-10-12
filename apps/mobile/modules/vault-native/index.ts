import { requireOptionalNativeModule } from "expo";

interface NativeVault {
  totalMemoryBytes(): number;
  sha256File(path: string): Promise<string>;
  excludeFromBackup(path: string): boolean;
  socModel?(): string | null;
  usableDiskBytes?(): number;
  contentHead?(uri: string, n: number): string | null;
  contentSize?(uri: string): number | null;
  copyContent?(uri: string, destPath: string): Promise<number>;
  moveFile?(from: string, to: string): boolean;
}

/** iOS + Android; on the web every call falls back (RAM unknown, hashing done in JS by the caller). */
const native = requireOptionalNativeModule<NativeVault>("VaultNative");

export const hasVaultNative = (): boolean => native !== null;

/** Physical RAM in bytes, or null when the platform cannot say (web). */
export function totalMemoryBytes(): number | null {
  return native?.totalMemoryBytes() ?? null;
}

/** Streaming SHA-256 of a file path (hex). Rejects when the module is missing so callers pick another route. */
export async function sha256File(path: string): Promise<string> {
  if (!native) throw new Error("VaultNative unavailable");
  return native.sha256File(path);
}

/** Android 12+ `Build.SOC_MODEL` ("SM8550"); null elsewhere. */
export function socModel(): string | null {
  return native?.socModel?.() ?? null;
}

/** Android: bytes this app may still write (statvfs f_bavail); null where expo's own number is right. */
export function usableDiskBytes(): number | null {
  return native?.usableDiskBytes?.() ?? null;
}

export function excludeFromBackup(path: string): boolean {
  return native?.excludeFromBackup(path) ?? false;
}

/* Android content:// items (spec §7.2 "open with Inborn", the picker): read through the resolver that holds the grant. */

/** The first `n` bytes of a provider's item, base64; null when the provider gives no stream or the module is missing. */
export function contentHead(uri: string, n: number): string | null {
  try {
    return native?.contentHead?.(uri, n) ?? null;
  } catch {
    return null;
  }
}

/** The provider's byte count for the item, or null when it does not say. */
export function contentSize(uri: string): number | null {
  try {
    return native?.contentSize?.(uri) ?? null;
  } catch {
    return null;
  }
}

/** Streams the item into `destPath`; resolves with the bytes written. */
export async function copyContent(uri: string, destPath: string): Promise<number> {
  if (!native?.copyContent) throw new Error("VaultNative.copyContent unavailable");
  return native.copyContent(uri, destPath);
}

/** Renames `from` onto `to` (same volume), replacing what was there. */
export function moveFile(from: string, to: string): void {
  if (!native?.moveFile) throw new Error("VaultNative.moveFile unavailable");
  native.moveFile(from, to);
}
