import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Chat, ChatMessage } from "../src/chat/types";
import { buildRecord, recordHash, renderRecord, signRecord, signingPublicKey, verificationInstructions, verifyRecord } from "../src/work/signedRecord";

const NOW = Date.UTC(2026, 8, 7, 9, 0, 0);
const SEED = randomBytes(32).toString("hex");
const chat: Chat = { id: "c1", title: "Intake call", createdAt: NOW - 86_400_000, updatedAt: NOW - 1000, modelId: "instant", incognito: false };
const messages: ChatMessage[] = [
  { id: "m1", chatId: "c1", role: "user", content: "Summarise the intake notes.", createdAt: NOW - 5000 },
  { id: "m2", chatId: "c1", role: "assistant", content: "Here is the summary…", createdAt: NOW - 4000, modelId: "instant" },
];
const input = { chat, messages, app: { name: "Inborn" as const, version: "0.1.0", platform: "android" }, signer: { algorithm: "Ed25519" as const, publicKeyHex: signingPublicKey(SEED), keyCreatedAt: NOW - 10 }, now: NOW };

describe("signed export (spec §7.5 Work): content hash + Ed25519, verifiable without a server", () => {
  it("builds, signs and verifies a record; the hash covers everything but the signature fields", () => {
    const unsigned = buildRecord({ ...input, vault: { folderId: "f1", name: "Client A", auditHead: "cd".repeat(32) } });
    const record = signRecord(unsigned, SEED);
    expect(record.contentHash).toBe(recordHash(unsigned));
    expect(record.signature).toMatch(/^[0-9a-f]{128}$/);
    expect(verifyRecord(record)).toEqual({ ok: true, publicKeyHex: input.signer.publicKeyHex, exportedAt: NOW, messages: 2 });
    expect(verifyRecord(record, input.signer.publicKeyHex).ok).toBe(true);
    expect(verifyRecord(record, "00".repeat(32))).toEqual({ ok: false, reason: "bad-signature" });
    expect(verifyRecord(JSON.parse(JSON.stringify(record))).ok).toBe(true);
  });

  it("rejects an edited message, an edited timestamp, a swapped signature and malformed input", () => {
    const record = signRecord(buildRecord(input), SEED);
    expect(verifyRecord({ ...record, messages: [{ ...record.messages[0]!, content: "changed" }, record.messages[1]] })).toEqual({ ok: false, reason: "hash-mismatch" });
    expect(verifyRecord({ ...record, exportedAt: NOW + 1 })).toEqual({ ok: false, reason: "hash-mismatch" });
    const other = signRecord(buildRecord({ ...input, now: NOW + 1 }), SEED);
    expect(verifyRecord({ ...record, signature: other.signature })).toEqual({ ok: false, reason: "bad-signature" });
    const foreignKey = signRecord(buildRecord(input), randomBytes(32).toString("hex"));
    expect(verifyRecord({ ...foreignKey, signer: record.signer })).toEqual({ ok: false, reason: "bad-signature" });
    expect(verifyRecord(null)).toEqual({ ok: false, reason: "malformed" });
    expect(verifyRecord({ format: "other" })).toEqual({ ok: false, reason: "malformed" });
    expect(verifyRecord({ ...record, signature: 5 })).toEqual({ ok: false, reason: "malformed" });
  });

  it("the Node snippet in the verification instructions really verifies the file (and fails on a tampered one)", () => {
    const record = signRecord(buildRecord(input), SEED);
    const dir = mkdtempSync(join(tmpdir(), "inborn-record-"));
    try {
      const good = join(dir, "record.json");
      writeFileSync(good, JSON.stringify(record));
      const bad = join(dir, "bad.json");
      writeFileSync(bad, JSON.stringify({ ...record, chat: { ...record.chat, title: "Edited" } }));
      const snippet = verificationInstructions().split("```")[1]!.trim();
      /* The block is `node -e '<script>' record.json`; run the script with node directly against each file. */
      const script = snippet.slice(snippet.indexOf("'") + 1, snippet.lastIndexOf("'"));
      const run = (file: string) => execFileSync(process.execPath, ["-e", script, file], { encoding: "utf8" }).trim();
      expect(run(good)).toBe("VALID");
      expect(run(bad)).toBe("INVALID");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("carries the AI Act Art. 50(2) marking inside the signed bytes (gap 13)", () => {
    const unsigned = buildRecord(input);
    expect(unsigned.aiGenerated).toBe(true);
    expect(unsigned.generator).toBe("Inborn (on-device AI)");
    const record = signRecord(unsigned, SEED);
    expect(JSON.parse(JSON.stringify(record))).toMatchObject({ aiGenerated: true, generator: "Inborn (on-device AI)" });
    /* The marking is inside the hash, so stripping it from the file is detected. */
    const { aiGenerated: _dropped, ...withoutMarking } = record;
    expect(verifyRecord(withoutMarking)).toEqual({ ok: false, reason: "hash-mismatch" });
    expect(verifyRecord({ ...record, generator: "Something else" })).toEqual({ ok: false, reason: "hash-mismatch" });
    expect(renderRecord(record)).toContain("Generated with Inborn (on-device AI). Verify before use.");
  });

  it("renders a readable companion with the signature block and instructions", () => {
    const record = signRecord(buildRecord({ ...input, vault: { folderId: "f1", name: "Client A", auditHead: "cd".repeat(32) } }), SEED);
    const md = renderRecord(record);
    expect(md).toContain("# Signed record · Intake call");
    expect(md).toContain("Generated with Inborn (on-device AI). Verify before use.");
    expect(md).toContain('Vault "Client A"');
    expect(md).toContain(`content sha256  ${record.contentHash}`);
    expect(md).toContain(`public key       ${record.signer.publicKeyHex}`);
    expect(md).toContain("## How to verify this record");
    expect(md).toContain("**User** · 2026-09-07T08:59:55.000Z");
  });
});
