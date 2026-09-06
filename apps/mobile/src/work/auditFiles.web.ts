import { fromBase64, toBase64 } from "@inborn/core";

/* Web / desktop shell: the sealed bytes go to the origin's storage (the desktop shell keeps its files in Rust for chats, but the audit log is small). */
const key = (folderId: string) => `inborn.work.audit.${folderId}`;

export async function readAuditFile(folderId: string): Promise<Uint8Array | null> {
  try {
    const b64 = globalThis.localStorage?.getItem(key(folderId));
    return b64 ? fromBase64(b64) : null;
  } catch {
    return null;
  }
}

export async function writeAuditFile(folderId: string, sealed: Uint8Array): Promise<void> {
  try {
    globalThis.localStorage?.setItem(key(folderId), toBase64(sealed));
  } catch {
    /* private mode: the log lives for this session only */
  }
}

export async function deleteAuditFile(folderId: string): Promise<void> {
  try {
    globalThis.localStorage?.removeItem(key(folderId));
  } catch {
    /* nothing stored */
  }
}
