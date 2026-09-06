import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { deriveSealKey, openJson, sealJson } from "../src/licence/cache";
import { GENESIS_HASH, appendAudit, auditHead, emptyAuditLog, renderAudit, verifyAudit } from "../src/work/audit";

const NOW = Date.UTC(2026, 8, 7, 9, 0, 0);

describe("vault audit log (spec §7.5 Work): append-only, hash-chained, never content", () => {
  it("chains entries from the genesis hash and verifies end to end", () => {
    let log = emptyAuditLog("v1");
    expect(auditHead(log)).toBe(GENESIS_HASH);
    log = appendAudit(log, "vault.created", NOW);
    log = appendAudit(log, "vault.unlocked", NOW + 1000);
    log = appendAudit(log, "chat.moved-in", NOW + 2000, { chatId: "c1", title: "Intake call" });
    log = appendAudit(log, "export.signed", NOW + 3000, { chatId: "c1", recordHash: "ab".repeat(32) });
    expect(log.entries.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    expect(log.entries[0]!.prevHash).toBe(GENESIS_HASH);
    expect(log.entries[1]!.prevHash).toBe(log.entries[0]!.hash);
    expect(verifyAudit(log)).toEqual({ ok: true, entries: 4, head: log.entries[3]!.hash });
    expect(verifyAudit(log, auditHead(log)).ok).toBe(true);
    expect(JSON.stringify(log)).not.toContain("content");
  });

  it("detects an edited entry, a removed entry, a re-ordered entry and a truncated log", () => {
    let log = emptyAuditLog("v1");
    for (let i = 0; i < 4; i++) log = appendAudit(log, "vault.unlocked", NOW + i);
    const head = auditHead(log);
    const edited = { ...log, entries: log.entries.map((e, i) => (i === 1 ? { ...e, action: "vault.locked" as const } : e)) };
    expect(verifyAudit(edited)).toEqual({ ok: false, brokenAt: 1, reason: "hash" });
    const removed = { ...log, entries: log.entries.filter((_, i) => i !== 1) };
    expect(verifyAudit(removed)).toMatchObject({ ok: false, brokenAt: 1 });
    const swapped = { ...log, entries: [log.entries[1]!, log.entries[0]!, ...log.entries.slice(2)] };
    expect(verifyAudit(swapped)).toMatchObject({ ok: false, brokenAt: 0 });
    const truncated = { ...log, entries: log.entries.slice(0, 2) };
    expect(verifyAudit(truncated).ok).toBe(true);
    expect(verifyAudit(truncated, head)).toEqual({ ok: false, brokenAt: 2, reason: "link" });
    const foreign = { ...log, entries: log.entries.map((e, i) => (i === 3 ? { ...e, vaultId: "v2" } : e)) };
    expect(verifyAudit(foreign)).toEqual({ ok: false, brokenAt: 3, reason: "vault" });
  });

  it("the input log is never mutated and the rendering is one line per entry with ISO time", () => {
    const empty = emptyAuditLog("v1");
    const one = appendAudit(empty, "vault.created", NOW);
    expect(empty.entries).toHaveLength(0);
    const text = renderAudit(appendAudit(one, "chat.moved-in", NOW + 5000, { chatId: "c", title: "Case 12" }), "Client A");
    expect(text.split("\n")[0]).toContain('vault "Client A" · 2 entries');
    expect(text).toContain("2026-09-07T09:00:05.000Z  chat.moved-in · Case 12");
  });

  it("seals at rest under a label-specific key: the licence cache key cannot open an audit file", () => {
    const secret = "ab".repeat(32);
    const auditKey = deriveSealKey(secret, "inborn vault audit v1");
    const licenceKey = deriveSealKey(secret, "inborn licence cache v1");
    expect(Buffer.from(auditKey).equals(Buffer.from(licenceKey))).toBe(false);
    const log = appendAudit(emptyAuditLog("v1"), "vault.created", NOW);
    const sealed = sealJson(auditKey, log, new Uint8Array(randomBytes(24)));
    expect(openJson(auditKey, sealed)).toEqual(log);
    expect(openJson(licenceKey, sealed)).toBeNull();
    const tampered = new Uint8Array(sealed);
    tampered[30]! ^= 1;
    expect(openJson(auditKey, tampered)).toBeNull();
  });
});
