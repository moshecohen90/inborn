import { sha256 } from "@noble/hashes/sha256";
import { canonicalJson } from "../catalog/canonical";
import { toHex, utf8Bytes } from "../licence/bytes";

/**
 * Per-vault audit log (spec §7.5 Work row: "יומן ביקורת"): append-only, each entry hashes the previous one, so a
 * removed or edited line breaks the chain. Entries name what happened, never message content. The app seals the
 * log at rest (licence/cache.ts) and mirrors the head hash into the vault record.
 */

export type AuditAction = "vault.created" | "vault.unlocked" | "vault.locked" | "vault.code-changed" | "chat.moved-in" | "chat.moved-out" | "chat.created" | "document.added" | "export.signed" | "export.plain";

export interface AuditSubject {
  chatId?: string;
  documentId?: string;
  /** Title at the time; a later rename does not rewrite history. */
  title?: string;
  /** For exports: the record hash, so the log and the signed file point at each other. */
  recordHash?: string;
}

export interface AuditEntry {
  seq: number;
  at: number;
  vaultId: string;
  action: AuditAction;
  subject?: AuditSubject;
  /** "device" for actions the user took here; the vault has no accounts, so there is no other actor. */
  actor: "device";
  prevHash: string;
  hash: string;
}

export interface AuditLog {
  version: 1;
  vaultId: string;
  entries: AuditEntry[];
}

export const GENESIS_HASH = "0".repeat(64);

export const emptyAuditLog = (vaultId: string): AuditLog => ({ version: 1, vaultId, entries: [] });

export function entryHash(entry: Omit<AuditEntry, "hash">): string {
  return toHex(sha256(utf8Bytes(canonicalJson(entry))));
}

export const auditHead = (log: AuditLog): string => log.entries[log.entries.length - 1]?.hash ?? GENESIS_HASH;

/** Returns a new log; the input is not mutated (the app persists the result and updates the vault record's head). */
export function appendAudit(log: AuditLog, action: AuditAction, now: number, subject?: AuditSubject): AuditLog {
  const prev = log.entries[log.entries.length - 1];
  const base: Omit<AuditEntry, "hash"> = { seq: (prev?.seq ?? 0) + 1, at: now, vaultId: log.vaultId, action, actor: "device", prevHash: prev?.hash ?? GENESIS_HASH, ...(subject ? { subject } : {}) };
  return { ...log, entries: [...log.entries, { ...base, hash: entryHash(base) }] };
}

export type AuditVerdict = { ok: true; entries: number; head: string } | { ok: false; brokenAt: number; reason: "hash" | "link" | "seq" | "vault" };

/** Walks the chain; `expectedHead` (from the vault record) catches a log truncated to an earlier, still-valid prefix. */
export function verifyAudit(log: AuditLog, expectedHead?: string): AuditVerdict {
  let prevHash = GENESIS_HASH;
  for (let i = 0; i < log.entries.length; i++) {
    const e = log.entries[i]!;
    if (e.vaultId !== log.vaultId) return { ok: false, brokenAt: i, reason: "vault" };
    if (e.seq !== i + 1) return { ok: false, brokenAt: i, reason: "seq" };
    if (e.prevHash !== prevHash) return { ok: false, brokenAt: i, reason: "link" };
    const { hash, ...rest } = e;
    if (entryHash(rest) !== hash) return { ok: false, brokenAt: i, reason: "hash" };
    prevHash = hash;
  }
  if (expectedHead !== undefined && expectedHead !== prevHash) return { ok: false, brokenAt: log.entries.length, reason: "link" };
  return { ok: true, entries: log.entries.length, head: prevHash };
}

/** Plain-text rendering for the share sheet / a compliance file (ISO timestamps, one line per entry). */
export function renderAudit(log: AuditLog, vaultName: string): string {
  const lines = [`Inborn audit log · vault "${vaultName}" · ${log.entries.length} entries · head ${auditHead(log).slice(0, 16)}…`, ""];
  for (const e of log.entries) {
    const what = e.subject?.title ? ` · ${e.subject.title}` : "";
    const ref = e.subject?.recordHash ? ` · record ${e.subject.recordHash.slice(0, 16)}…` : "";
    lines.push(`${String(e.seq).padStart(4, " ")}  ${new Date(e.at).toISOString()}  ${e.action}${what}${ref}  ${e.hash.slice(0, 12)}`);
  }
  return lines.join("\n");
}
