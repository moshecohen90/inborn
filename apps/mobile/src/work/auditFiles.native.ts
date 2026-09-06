import { Directory, File, Paths } from "expo-file-system";

/** Sealed audit logs, one file per vault, under the app's documents (the emergency wipe removes the directory with everything else). */
const dir = () => {
  const d = new Directory(Paths.document, "work");
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
};
const file = (folderId: string) => new File(dir(), `audit-${folderId}.bin`);

export async function readAuditFile(folderId: string): Promise<Uint8Array | null> {
  const f = file(folderId);
  return f.exists ? f.bytesSync() : null;
}

export async function writeAuditFile(folderId: string, sealed: Uint8Array): Promise<void> {
  file(folderId).write(sealed);
}

export async function deleteAuditFile(folderId: string): Promise<void> {
  const f = file(folderId);
  if (f.exists) f.delete();
}
