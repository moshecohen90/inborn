import { requireOptionalNativeModule } from "expo";

interface NativeVault {
  totalMemoryBytes(): number;
  sha256File(path: string): Promise<string>;
  excludeFromBackup(path: string): boolean;
  socModel?(): string | null;
  usableDiskBytes?(): number;
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
