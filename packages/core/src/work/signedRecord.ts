import * as ed from "@noble/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { sha512 } from "@noble/hashes/sha512";
import { canonicalJson } from "../catalog/canonical";
import type { Chat, ChatMessage } from "../chat/types";
import { fromHex, toHex, utf8Bytes } from "../licence/bytes";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

/**
 * Signed export (spec §7.5 Work row: "ייצוא מוחתם בזמן לרשומות"): a chat as canonical JSON, hashed and signed with
 * a per-install Ed25519 key. The public key travels inside the file, so anyone can verify that the record has not
 * changed since it left this device; the app's Verify screen and the instructions below do it without any server.
 */

export interface RecordMessage {
  role: ChatMessage["role"];
  content: string;
  createdAt: number;
  modelId?: string;
}

export interface SignedRecord {
  format: "inborn.signed-record";
  version: 1;
  exportedAt: number;
  /** EU AI Act Art. 50(2) machine-readable marking, same claim the Markdown/JSON/text exports carry. */
  aiGenerated: true;
  generator: string;
  app: { name: "Inborn"; version: string; platform: string };
  signer: { algorithm: "Ed25519"; publicKeyHex: string; keyCreatedAt: number };
  chat: { id: string; title: string; createdAt: number; updatedAt: number; modelId: string };
  vault?: { folderId: string; name: string; auditHead: string };
  messages: RecordMessage[];
  /** sha256 of the canonical JSON of everything above (hex). */
  contentHash: string;
  /** Ed25519 over `contentHash` bytes (hex, 128 chars). */
  signature: string;
}

export type UnsignedRecord = Omit<SignedRecord, "contentHash" | "signature">;

export interface RecordInput {
  chat: Chat;
  messages: readonly ChatMessage[];
  app: SignedRecord["app"];
  signer: SignedRecord["signer"];
  vault?: SignedRecord["vault"];
  now: number;
}

export function buildRecord(input: RecordInput): UnsignedRecord {
  return {
    format: "inborn.signed-record",
    version: 1,
    exportedAt: input.now,
    aiGenerated: true,
    generator: `${input.app.name} (on-device AI)`,
    app: input.app,
    signer: input.signer,
    chat: { id: input.chat.id, title: input.chat.title, createdAt: input.chat.createdAt, updatedAt: input.chat.updatedAt, modelId: input.chat.modelId },
    ...(input.vault ? { vault: input.vault } : {}),
    messages: input.messages.map((m) => ({ role: m.role, content: m.content, createdAt: m.createdAt, ...(m.modelId ? { modelId: m.modelId } : {}) })),
  };
}

export const recordHash = (record: UnsignedRecord): string => toHex(sha256(utf8Bytes(canonicalJson(record))));

export function signRecord(record: UnsignedRecord, privateSeedHex: string): SignedRecord {
  const contentHash = recordHash(record);
  const signature = toHex(ed.sign(fromHex(contentHash), privateSeedHex));
  return { ...record, contentHash, signature };
}

export type RecordVerdict = { ok: true; publicKeyHex: string; exportedAt: number; messages: number } | { ok: false; reason: "malformed" | "hash-mismatch" | "bad-signature" };

/** Verifies with the key inside the file; pass `trustedPublicKeyHex` to also require it to be this device's key. */
export function verifyRecord(value: unknown, trustedPublicKeyHex?: string): RecordVerdict {
  const r = value as Partial<SignedRecord> | null;
  if (!r || typeof r !== "object" || r.format !== "inborn.signed-record" || r.version !== 1 || typeof r.contentHash !== "string" || typeof r.signature !== "string" || !r.signer || typeof r.signer.publicKeyHex !== "string" || !Array.isArray(r.messages)) return { ok: false, reason: "malformed" };
  const { contentHash, signature, ...unsigned } = r as SignedRecord;
  if (recordHash(unsigned) !== contentHash) return { ok: false, reason: "hash-mismatch" };
  if (trustedPublicKeyHex && trustedPublicKeyHex !== r.signer.publicKeyHex) return { ok: false, reason: "bad-signature" };
  try {
    if (!ed.verify(fromHex(signature), fromHex(contentHash), r.signer.publicKeyHex)) return { ok: false, reason: "bad-signature" };
  } catch {
    return { ok: false, reason: "bad-signature" };
  }
  const signed = r as SignedRecord;
  return { ok: true, publicKeyHex: signed.signer.publicKeyHex, exportedAt: signed.exportedAt, messages: signed.messages.length };
}

export const signingPublicKey = (privateSeedHex: string): string => toHex(ed.getPublicKey(privateSeedHex));

const iso = (ms: number) => new Date(ms).toISOString();

/** Human-readable companion (Markdown): the conversation, then the signature block and how to check it. */
export function renderRecord(record: SignedRecord): string {
  const lines: string[] = [];
  lines.push(`# Signed record · ${record.chat.title || "Untitled chat"}`, "");
  lines.push(`Exported ${iso(record.exportedAt)} from Inborn ${record.app.version} (${record.app.platform}). ${record.messages.length} messages, chat created ${iso(record.chat.createdAt)}, model ${record.chat.modelId}.`);
  lines.push("", "Generated with Inborn (on-device AI). Verify before use.");
  if (record.vault) lines.push(`Vault "${record.vault.name}" · audit head ${record.vault.auditHead.slice(0, 16)}…`);
  lines.push("", "---", "");
  for (const m of record.messages) {
    lines.push(`**${m.role === "user" ? "User" : m.role === "assistant" ? "AI" : m.role}** · ${iso(m.createdAt)}${m.modelId ? ` · ${m.modelId}` : ""}`, "", m.content, "");
  }
  lines.push("---", "", "## Signature", "", "```", `content sha256  ${record.contentHash}`, `signature        ${record.signature}`, `public key       ${record.signer.publicKeyHex}`, `algorithm        Ed25519 (RFC 8032) over the content hash`, "```", "", verificationInstructions());
  return lines.join("\n");
}

/** Bundled into the export and shown on the app's Verify screen. */
export function verificationInstructions(): string {
  return [
    "## How to verify this record",
    "",
    "1. In Inborn: Settings → Pro for Work → Verify a signed record, and pick the `.json` file. The app recomputes the hash and checks the Ed25519 signature with the public key printed above; it needs no network.",
    "2. Anywhere else: remove `contentHash` and `signature` from the JSON, serialise the rest as canonical JSON (keys sorted, no whitespace, UTF-8), take its SHA-256, and verify the signature over those 32 bytes with the public key. Node.js:",
    "",
    "```",
    "node -e 'const fs=require(\"fs\"),c=require(\"crypto\");const r=JSON.parse(fs.readFileSync(process.argv[1]));const{contentHash,signature,...u}=r;",
    "const canon=v=>v===null||typeof v!==\"object\"?JSON.stringify(v):Array.isArray(v)?`[${v.map(canon).join(\",\")}]`:`{${Object.entries(v).filter(([,x])=>x!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>`${JSON.stringify(k)}:${canon(x)}`).join(\",\")}}`;",
    "const h=c.createHash(\"sha256\").update(canon(u),\"utf8\").digest(\"hex\");const key=c.createPublicKey({key:Buffer.concat([Buffer.from(\"302a300506032b6570032100\",\"hex\"),Buffer.from(r.signer.publicKeyHex,\"hex\")]),format:\"der\",type:\"spki\"});",
    "console.log(h===contentHash&&c.verify(null,Buffer.from(h,\"hex\"),key,Buffer.from(signature,\"hex\"))?\"VALID\":\"INVALID\")' record.json",
    "```",
    "",
    "The key is generated once per installation and never leaves the device; a record signed by another installation shows a different public key. An emergency wipe deletes the key, so records signed before a wipe still verify with the key printed inside them.",
  ].join("\n");
}
