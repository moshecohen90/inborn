import { Directory, File, Paths } from "expo-file-system";
import { excludeFromBackup } from "../../modules/vault-native";

/** Model files live in their own directory under the app's documents, excluded from backup (spec §5.3). */
export function vaultDir(): Directory {
  const dir = new Directory(Paths.document, "models");
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
    excludeFromBackup(dir.uri);
  }
  return dir;
}

export const modelFile = (fileName: string): File => new File(vaultDir(), fileName);
/** Partial downloads keep a suffix so a crash mid-transfer can never be mistaken for a finished model. */
export const partialFile = (fileName: string): File => new File(vaultDir(), `${fileName}.part`);
export const recordFile = (): File => new File(vaultDir(), "vault.json");

/** M1 dev path (README "Run on a phone"): a GGUF pushed by hand into the document directory. */
export const DEV_MODEL_FILE = "instant.gguf";
export const devFallbackFile = (): File => new File(Paths.document, DEV_MODEL_FILE);

export function fileSize(file: File): number {
  try {
    return file.exists ? (file.size ?? 0) : 0;
  } catch {
    return 0;
  }
}

export function safeDelete(file: File): void {
  try {
    if (file.exists) file.delete();
  } catch (e: unknown) {
    console.warn(`[vault] delete ${file.uri}`, e);
  }
}
