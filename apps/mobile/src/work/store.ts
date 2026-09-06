import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import {
  appendAudit,
  auditHead,
  buildRecord,
  changeVaultCode,
  closeAllVaults,
  closeVault,
  createVaultRecord,
  deriveSealKey,
  emptyAuditLog,
  openJson,
  openVault,
  renderRecord,
  sealJson,
  signRecord,
  signingPublicKey,
  vaultIsOpen,
  verifyAudit,
  verifyVaultCode,
  type AuditAction,
  type AuditLog,
  type AuditSubject,
  type AuditVerdict,
  type Chat,
  type ChatMessage,
  type SignedRecord,
  type VaultRecord,
  type VaultSession,
} from "@inborn/core";
import { randomNonce, storageSecretHex } from "../licence/storage";
import { SECURE_ITEMS } from "../storage/secureItems";
import { deleteAuditFile, readAuditFile, writeAuditFile } from "./auditFiles";
import { readSecureJson, writeSecureJson } from "./secureJson";

/**
 * Pro for Work on the device (spec §7.5 Work rows): client vaults (folder + own passcode), their audit logs, and the
 * per-install signing key for signed exports. Vault records and the signing seed live in the Keychain / Keystore
 * (wiped with everything else, see storage/secureItems.ts); audit logs are sealed files; the unlocked set is memory only.
 */

interface VaultsItem {
  version: 1;
  vaults: VaultRecord[];
}

interface SigningItem {
  version: 1;
  seedHex: string;
  createdAt: number;
}

export interface SignedExportFiles {
  record: SignedRecord;
  json: string;
  markdown: string;
  baseName: string;
}

const AUDIT_INFO = "inborn vault audit v1";
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

export class WorkStore {
  private readonly listeners = new Set<() => void>();
  private vaults: VaultRecord[] = [];
  private session: VaultSession = closeAllVaults();
  private appLockedAt: number | null = null;
  private loaded: Promise<void> | null = null;
  private auditKey: Uint8Array | null = null;
  private logs = new Map<string, AuditLog>();
  private version = 0;

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  /** Changes on every mutation; for useSyncExternalStore. */
  snapshot(): number {
    return this.version;
  }

  ready(): Promise<void> {
    if (!this.loaded) {
      this.loaded = (async () => {
        const item = await readSecureJson<VaultsItem>(SECURE_ITEMS.workVaults);
        this.vaults = item?.vaults ?? [];
        this.bump();
      })();
    }
    return this.loaded;
  }

  records(): readonly VaultRecord[] {
    return this.vaults;
  }
  record(folderId: string): VaultRecord | undefined {
    return this.vaults.find((v) => v.folderId === folderId);
  }
  isVault(folderId: string | undefined | null): boolean {
    return !!folderId && this.vaults.some((v) => v.folderId === folderId);
  }
  isOpen(folderId: string, now = Date.now()): boolean {
    return vaultIsOpen(this.session, folderId, now, this.appLockedAt);
  }
  /** A chat is hidden while its folder is a vault that is not open. */
  isHidden(chat: Pick<Chat, "folderId">, now = Date.now()): boolean {
    return this.isVault(chat.folderId) && !this.isOpen(chat.folderId!, now);
  }

  /** The app lock engaged: every vault asks for its code again (§7.5). */
  appLocked(): void {
    this.appLockedAt = Date.now();
    if (this.session.size) {
      for (const id of this.session.keys()) void this.log(id, "vault.locked");
      this.session = closeAllVaults();
      this.bump();
    }
  }

  async createVault(folderId: string, code: string, name: string): Promise<boolean> {
    await this.ready();
    if (this.isVault(folderId)) return false;
    const record = createVaultRecord(folderId, code, await Crypto.getRandomBytesAsync(16), Date.now());
    if (!record) return false;
    this.vaults = [...this.vaults, record];
    this.session = openVault(this.session, folderId, Date.now());
    await this.persistVaults();
    await this.log(folderId, "vault.created", { title: name });
    return true;
  }

  async removeVault(folderId: string): Promise<void> {
    await this.ready();
    this.vaults = this.vaults.filter((v) => v.folderId !== folderId);
    this.session = closeVault(this.session, folderId);
    this.logs.delete(folderId);
    await deleteAuditFile(folderId).catch(() => undefined);
    await this.persistVaults();
  }

  async changeCode(folderId: string, code: string): Promise<boolean> {
    const record = this.record(folderId);
    if (!record) return false;
    const next = changeVaultCode(record, code);
    if (!next) return false;
    this.vaults = this.vaults.map((v) => (v.folderId === folderId ? next : v));
    await this.persistVaults();
    await this.log(folderId, "vault.code-changed");
    return true;
  }

  async unlock(folderId: string, code: string): Promise<boolean> {
    const record = this.record(folderId);
    if (!record || !verifyVaultCode(record, code)) return false;
    this.session = openVault(this.session, folderId, Date.now());
    this.bump();
    await this.log(folderId, "vault.unlocked");
    return true;
  }

  async lock(folderId: string): Promise<void> {
    if (!this.session.has(folderId)) return;
    this.session = closeVault(this.session, folderId);
    this.bump();
    await this.log(folderId, "vault.locked");
  }

  /** Appends to the vault's sealed log and mirrors the new head into the vault record. */
  async log(folderId: string, action: AuditAction, subject?: AuditSubject): Promise<void> {
    if (!this.isVault(folderId)) return;
    const log = appendAudit(await this.readLog(folderId), action, Date.now(), subject);
    this.logs.set(folderId, log);
    const head = auditHead(log);
    this.vaults = this.vaults.map((v) => (v.folderId === folderId ? { ...v, auditHead: head } : v));
    try {
      await writeAuditFile(folderId, sealJson(await this.key(), log, randomNonce()));
      await this.persistVaults();
    } catch (e: unknown) {
      console.warn("[work] audit not written", e);
    }
    this.bump();
  }

  async readLog(folderId: string): Promise<AuditLog> {
    const cached = this.logs.get(folderId);
    if (cached) return cached;
    const sealed = await readAuditFile(folderId).catch(() => null);
    const parsed = sealed ? (openJson(await this.key(), sealed) as AuditLog | null) : null;
    const log = parsed && parsed.version === 1 && parsed.vaultId === folderId && Array.isArray(parsed.entries) ? parsed : emptyAuditLog(folderId);
    this.logs.set(folderId, log);
    return log;
  }

  async verifyLog(folderId: string): Promise<AuditVerdict> {
    return verifyAudit(await this.readLog(folderId), this.record(folderId)?.auditHead);
  }

  async signingKey(): Promise<SigningItem> {
    const existing = await readSecureJson<SigningItem>(SECURE_ITEMS.workSigning);
    if (existing?.seedHex) return existing;
    const fresh: SigningItem = { version: 1, seedHex: hex(await Crypto.getRandomBytesAsync(32)), createdAt: Date.now() };
    await writeSecureJson(SECURE_ITEMS.workSigning, fresh);
    return fresh;
  }

  async publicKeyIfAny(): Promise<string | null> {
    const item = await readSecureJson<SigningItem>(SECURE_ITEMS.workSigning);
    return item?.seedHex ? signingPublicKey(item.seedHex) : null;
  }

  /** Signed record of a chat; logged in the vault's audit log when the chat lives in one. */
  async signedExport(chat: Chat, messages: readonly ChatMessage[], appVersion: string, vaultName?: string): Promise<SignedExportFiles> {
    const key = await this.signingKey();
    const inVault = this.isVault(chat.folderId);
    const vault = inVault ? { folderId: chat.folderId!, name: vaultName ?? chat.folderId!, auditHead: auditHead(await this.readLog(chat.folderId!)) } : undefined;
    const record = signRecord(buildRecord({ chat, messages, app: { name: "Inborn", version: appVersion, platform: Platform.OS }, signer: { algorithm: "Ed25519", publicKeyHex: signingPublicKey(key.seedHex), keyCreatedAt: key.createdAt }, ...(vault ? { vault } : {}), now: Date.now() }), key.seedHex);
    if (inVault) await this.log(chat.folderId!, "export.signed", { chatId: chat.id, title: chat.title, recordHash: record.contentHash });
    const baseName = `inborn-record-${record.contentHash.slice(0, 12)}`;
    return { record, json: JSON.stringify(record, null, 2), markdown: renderRecord(record), baseName };
  }

  /** Emergency wipe: memory state goes; the Keychain items and files are removed by the storage wipe. */
  reset(): void {
    this.vaults = [];
    this.session = closeAllVaults();
    this.logs.clear();
    this.loaded = null;
    this.auditKey = null;
    this.bump();
  }

  private async key(): Promise<Uint8Array> {
    if (!this.auditKey) this.auditKey = deriveSealKey(await storageSecretHex(), AUDIT_INFO);
    return this.auditKey;
  }

  private async persistVaults(): Promise<void> {
    await writeSecureJson(SECURE_ITEMS.workVaults, { version: 1, vaults: this.vaults } satisfies VaultsItem);
    this.bump();
  }

  private bump(): void {
    this.version++;
    for (const l of this.listeners) l();
  }
}

let instance: WorkStore | null = null;
export function getWork(): WorkStore {
  if (!instance) instance = new WorkStore();
  return instance;
}
