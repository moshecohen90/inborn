import { bytesEqual, fromBase64, fromHex, toHex, utf8Bytes, utf8String } from "./bytes";
import { APPLE_RECEIPT_SIGNING_OID, APPLE_ROOT_CA_G3_DER_B64, APPLE_ROOT_CA_G3_SHA256, APPLE_WWDR_INTERMEDIATE_OID, XCODE_STOREKIT_CN } from "./roots";
import { APP_BUNDLE_ID, PRODUCT_IDS, TIER_OF_PRODUCT, type ProductId, type VerifiedPurchase, type VerifyResult } from "./types";
import { certificateFingerprint, parseCertificate, verifyCertificateSignature, verifyJwsSignature, type Certificate } from "./x509";

/**
 * StoreKit 2 signed transaction (JWS, RFC 7515 compact) verified entirely on the device (spec §12.4, §10.7 #48):
 * x5c chain up to a root pinned in code, extension OIDs, validity at signing time, then the payload's bundle id,
 * product, type, environment and revocation.
 */

export interface AppleVerifyOptions {
  bundleId?: string;
  /** Sandbox / Xcode transactions verify only when set (dev builds); production never trusts the StoreKit test root. */
  allowTestEnvironments?: boolean;
  /** Extra trust anchors (DER) for tests. */
  extraRoots?: Uint8Array[];
  now?: number;
}

interface TransactionPayload {
  bundleId?: string;
  productId?: string;
  transactionId?: string;
  originalTransactionId?: string;
  purchaseDate?: number;
  originalPurchaseDate?: number;
  signedDate?: number;
  revocationDate?: number;
  revocationReason?: number;
  type?: string;
  inAppOwnershipType?: string;
  environment?: string;
}

type Anchor = { cert: Certificate; kind: "apple" | "xcode" | "extra" };

let anchors: Anchor[] | null = null;
function pinnedAnchors(): Anchor[] {
  if (anchors) return anchors;
  const apple = parseCertificate(fromBase64(APPLE_ROOT_CA_G3_DER_B64));
  /* Refuse to run with a tampered constant: the fingerprint is the second copy of the truth. */
  if (!bytesEqual(certificateFingerprint(apple), fromHex(APPLE_ROOT_CA_G3_SHA256))) throw new Error("pinned root mismatch");
  anchors = [{ cert: apple, kind: "apple" }];
  return anchors;
}

/* Xcode's ephemeral signing certificate: self-signed, EC, subject CN "StoreKit Testing in Xcode". */
function isXcodeTestCertificate(cert: Certificate): boolean {
  return bytesEqual(cert.issuer, cert.subject) && cert.publicKey.kind === "ec" && utf8String(cert.subject).includes(XCODE_STOREKIT_CN);
}

function decodeSegment(seg: string): Uint8Array {
  return fromBase64(seg);
}

/** Header + payload as objects, or null. Exposed so callers can show what a JWS says before trusting it. */
export function decodeAppleJws(jws: string): { header: Record<string, unknown>; payload: TransactionPayload; x5c: string[] } | null {
  const parts = jws.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(utf8String(decodeSegment(parts[0]!))) as Record<string, unknown>;
    const payload = JSON.parse(utf8String(decodeSegment(parts[1]!))) as TransactionPayload;
    const x5c = Array.isArray(header.x5c) && header.x5c.every((c) => typeof c === "string") ? (header.x5c as string[]) : [];
    return { header, payload, x5c };
  } catch {
    return null;
  }
}

function environmentOf(env: string | undefined): VerifiedPurchase["environment"] | null {
  switch (env) {
    case "Production":
      return "production";
    case "Sandbox":
      return "sandbox";
    case "Xcode":
    case "LocalTesting":
      return "xcode";
    default:
      return null;
  }
}

export function verifyAppleJws(jws: string, opts: AppleVerifyOptions = {}): VerifyResult {
  const decoded = decodeAppleJws(jws);
  if (!decoded) return { ok: false, reason: "malformed" };
  const { header, payload, x5c } = decoded;
  const alg = typeof header.alg === "string" ? header.alg : "";
  if (x5c.length < 1 || x5c.length > 4) return { ok: false, reason: "malformed" };

  let chain: Certificate[];
  try {
    chain = x5c.map((c) => parseCertificate(fromBase64(c)));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const leaf = chain[0]!;
  const rootCandidate = chain[chain.length - 1]!;

  const environment = environmentOf(payload.environment);
  if (!environment) return { ok: false, reason: "wrong-environment" };
  if (environment !== "production" && !opts.allowTestEnvironments) return { ok: false, reason: "wrong-environment" };

  const fp = toHex(certificateFingerprint(rootCandidate));
  let anchor = [...pinnedAnchors(), ...(opts.extraRoots ?? []).map((der): Anchor => ({ cert: parseCertificate(der), kind: "extra" }))].find((a) => toHex(certificateFingerprint(a.cert)) === fp);
  if (!anchor && environment === "xcode" && chain.length === 1 && isXcodeTestCertificate(leaf)) anchor = { cert: leaf, kind: "xcode" };
  if (!anchor) return { ok: false, reason: "untrusted-root" };
  if (anchor.kind === "xcode" && environment !== "xcode") return { ok: false, reason: "untrusted-root" };
  if (anchor.kind === "apple" && environment === "xcode") return { ok: false, reason: "wrong-environment" };
  if (anchor.kind === "apple" && chain.length < 2) return { ok: false, reason: "bad-chain" };

  /* Every link: issuer name matches, signature verifies, validity covers the signing time. */
  const signedAt = typeof payload.signedDate === "number" ? payload.signedDate : (opts.now ?? Date.now());
  for (let i = 0; i < chain.length; i++) {
    const cert = chain[i]!;
    const issuer = i + 1 < chain.length ? chain[i + 1]! : cert;
    if (!verifyCertificateSignature(cert, issuer)) return { ok: false, reason: "bad-chain" };
    if (signedAt < cert.notBefore || signedAt > cert.notAfter) return { ok: false, reason: "cert-expired" };
  }
  if (anchor.kind === "apple") {
    const intermediate = chain[1]!;
    if (!intermediate.extensionOids.includes(APPLE_WWDR_INTERMEDIATE_OID) || !leaf.extensionOids.includes(APPLE_RECEIPT_SIGNING_OID)) return { ok: false, reason: "bad-chain" };
  }

  const dot1 = jws.indexOf(".");
  const dot2 = jws.indexOf(".", dot1 + 1);
  const signingInput = utf8Bytes(jws.slice(0, dot2));
  let signature: Uint8Array;
  try {
    signature = decodeSegment(jws.slice(dot2 + 1));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!verifyJwsSignature(alg, leaf.publicKey, signingInput, signature)) return { ok: false, reason: "bad-signature" };

  if (payload.bundleId !== (opts.bundleId ?? APP_BUNDLE_ID)) return { ok: false, reason: "wrong-app" };
  if (!PRODUCT_IDS.includes(payload.productId as ProductId)) return { ok: false, reason: "unknown-product" };
  if (payload.type !== "Non-Consumable") return { ok: false, reason: "wrong-type" };
  if (typeof payload.transactionId !== "string" || typeof payload.purchaseDate !== "number") return { ok: false, reason: "malformed" };
  const ownership = payload.inAppOwnershipType ?? "PURCHASED";
  if (ownership !== "PURCHASED" && ownership !== "FAMILY_SHARED") return { ok: false, reason: "not-purchased" };

  const productId = payload.productId as ProductId;
  return {
    ok: true,
    purchase: {
      store: "app-store",
      productId,
      tier: TIER_OF_PRODUCT[productId],
      transactionId: payload.transactionId,
      originalTransactionId: payload.originalTransactionId ?? payload.transactionId,
      purchasedAt: payload.purchaseDate,
      revokedAt: typeof payload.revocationDate === "number" ? payload.revocationDate : null,
      familyShared: ownership === "FAMILY_SHARED",
      environment,
      acknowledged: true,
      proof: { kind: "apple-jws", jws },
    },
  };
}
