import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { changeVaultCode, closeAllVaults, closeVault, createVaultRecord, hashVaultCode, openVault, verifyVaultCode, vaultIsOpen, type VaultSession } from "../src/work/vault";

const NOW = Date.UTC(2026, 8, 7, 9, 0, 0);
const salt = () => new Uint8Array(randomBytes(16));

describe("client vaults (spec §7.5 Work): per-folder passcode, salted hash, session rules", () => {
  it("creates a record with its own salt, verifies the code and rejects others; the code is never stored", () => {
    const r = createVaultRecord("folder-1", "2468", salt(), NOW)!;
    expect(r).toMatchObject({ folderId: "folder-1", createdAt: NOW });
    expect(r.saltHex).toMatch(/^[0-9a-f]{32}$/);
    expect(r.hashHex).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(r)).not.toContain("2468");
    expect(verifyVaultCode(r, "2468")).toBe(true);
    expect(verifyVaultCode(r, "2469")).toBe(false);
    expect(verifyVaultCode(r, "")).toBe(false);
    expect(hashVaultCode(r.saltHex, "2468")).toBe(r.hashHex);
  });

  it("two vaults with the same code have different hashes (per-vault salt) and the app-lock passcode rule applies", () => {
    const a = createVaultRecord("a", "1234", salt(), NOW)!;
    const b = createVaultRecord("b", "1234", salt(), NOW)!;
    expect(a.hashHex).not.toBe(b.hashHex);
    expect(createVaultRecord("c", "12", salt(), NOW)).toBeNull();
    expect(createVaultRecord("c", "123456789", salt(), NOW)).toBeNull();
    expect(createVaultRecord("c", "12a4", salt(), NOW)).toBeNull();
    expect(createVaultRecord("c", "1234", new Uint8Array(4), NOW)).toBeNull();
  });

  it("changing the code keeps the salt, creation time and audit head", () => {
    const r = { ...createVaultRecord("a", "1234", salt(), NOW)!, auditHead: "ab".repeat(32) };
    const changed = changeVaultCode(r, "8765")!;
    expect(changed.saltHex).toBe(r.saltHex);
    expect(changed.createdAt).toBe(NOW);
    expect(changed.auditHead).toBe(r.auditHead);
    expect(verifyVaultCode(changed, "8765")).toBe(true);
    expect(verifyVaultCode(changed, "1234")).toBe(false);
    expect(changeVaultCode(r, "x")).toBeNull();
  });

  it("an opened vault closes when the app lock engages afterwards, after 30 minutes, or explicitly", () => {
    let s: VaultSession = closeAllVaults();
    expect(vaultIsOpen(s, "a", NOW, null)).toBe(false);
    s = openVault(s, "a", NOW);
    expect(vaultIsOpen(s, "a", NOW + 60_000, null)).toBe(true);
    expect(vaultIsOpen(s, "a", NOW + 60_000, NOW - 1)).toBe(true);
    expect(vaultIsOpen(s, "a", NOW + 60_000, NOW + 30_000)).toBe(false);
    expect(vaultIsOpen(s, "a", NOW + 30 * 60_000, null)).toBe(true);
    expect(vaultIsOpen(s, "a", NOW + 30 * 60_000 + 1, null)).toBe(false);
    expect(vaultIsOpen(s, "b", NOW, null)).toBe(false);
    expect(vaultIsOpen(closeVault(s, "a"), "a", NOW, null)).toBe(false);
    expect(vaultIsOpen(closeAllVaults(), "a", NOW, null)).toBe(false);
  });
});
