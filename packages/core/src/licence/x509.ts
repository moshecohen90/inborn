import { p256 } from "@noble/curves/p256";
import { p384 } from "@noble/curves/p384";
import { sha256 } from "@noble/hashes/sha256";
import { sha384 } from "@noble/hashes/sha512";
import { bytesEqual } from "./bytes";
import { TAG, bitStringBytes, children, content, decodeOid, expect, integerBytes, readTlv, timeMs, whole, type Tlv } from "./der";
import { rsaVerify, type RsaHash, type RsaPublicKey } from "./rsa";

export type PublicKey = { kind: "ec"; curve: "p256" | "p384"; point: Uint8Array } | { kind: "rsa"; key: RsaPublicKey };

export interface Certificate {
  der: Uint8Array;
  tbs: Uint8Array;
  /** Raw DER of the Name, compared byte-for-byte to link issuer → subject. */
  issuer: Uint8Array;
  subject: Uint8Array;
  notBefore: number;
  notAfter: number;
  publicKey: PublicKey;
  signatureOid: string;
  signature: Uint8Array;
  /** OIDs of every extension present (Apple marks its intermediates and receipt-signing leaves this way). */
  extensionOids: string[];
}

const OID = {
  ecPublicKey: "1.2.840.10045.2.1",
  p256: "1.2.840.10045.3.1.7",
  p384: "1.3.132.0.34",
  rsaEncryption: "1.2.840.113549.1.1.1",
  ecdsaSha256: "1.2.840.10045.4.3.2",
  ecdsaSha384: "1.2.840.10045.4.3.3",
  sha256Rsa: "1.2.840.113549.1.1.11",
  sha1Rsa: "1.2.840.113549.1.1.5",
} as const;

export function parseSubjectPublicKeyInfo(bytes: Uint8Array, spki: Tlv): PublicKey {
  expect(spki, TAG.SEQUENCE, "SubjectPublicKeyInfo");
  const [alg, keyBits] = children(bytes, spki);
  if (!alg || !keyBits) throw new Error("SPKI: malformed");
  const algParts = children(bytes, expect(alg, TAG.SEQUENCE, "AlgorithmIdentifier"));
  const algOid = decodeOid(content(bytes, expect(algParts[0]!, TAG.OID, "algorithm OID")));
  const key = bitStringBytes(bytes, keyBits);
  if (algOid === OID.ecPublicKey) {
    const curveOid = decodeOid(content(bytes, expect(algParts[1]!, TAG.OID, "curve OID")));
    const curve = curveOid === OID.p256 ? "p256" : curveOid === OID.p384 ? "p384" : null;
    if (!curve) throw new Error(`SPKI: unsupported curve ${curveOid}`);
    return { kind: "ec", curve, point: key };
  }
  if (algOid === OID.rsaEncryption) {
    const seq = readTlv(key, 0);
    const [n, e] = children(key, expect(seq, TAG.SEQUENCE, "RSAPublicKey"));
    if (!n || !e) throw new Error("SPKI: malformed RSA key");
    const nBytes = integerBytes(key, n);
    let nBig = 0n;
    for (const b of nBytes) nBig = (nBig << 8n) | BigInt(b);
    let eBig = 0n;
    for (const b of integerBytes(key, e)) eBig = (eBig << 8n) | BigInt(b);
    return { kind: "rsa", key: { n: nBig, e: eBig, k: nBytes.length } };
  }
  throw new Error(`SPKI: unsupported algorithm ${algOid}`);
}

/** Parses a DER X.509 v3 certificate (the only shape the stores emit). */
export function parseCertificate(der: Uint8Array): Certificate {
  const cert = expect(readTlv(der, 0), TAG.SEQUENCE, "Certificate");
  const [tbs, sigAlg, sigBits] = children(der, cert);
  if (!tbs || !sigAlg || !sigBits) throw new Error("X.509: malformed");
  const fields = children(der, expect(tbs, TAG.SEQUENCE, "TBSCertificate"));
  let i = 0;
  if (fields[0]?.tag === 0xa0) i++; // version [0]
  const serial = fields[i++];
  const tbsSigAlg = fields[i++];
  const issuer = fields[i++];
  const validity = fields[i++];
  const subject = fields[i++];
  const spki = fields[i++];
  if (!serial || !tbsSigAlg || !issuer || !validity || !subject || !spki) throw new Error("X.509: missing fields");
  const [nb, na] = children(der, expect(validity, TAG.SEQUENCE, "Validity"));
  if (!nb || !na) throw new Error("X.509: bad validity");
  const extensionOids: string[] = [];
  for (const f of fields.slice(i)) {
    if (f.tag !== 0xa3) continue;
    const seq = children(der, f)[0];
    if (!seq) continue;
    for (const ext of children(der, seq)) {
      const oid = children(der, ext)[0];
      if (oid?.tag === TAG.OID) extensionOids.push(decodeOid(content(der, oid)));
    }
  }
  const sigOid = decodeOid(content(der, expect(children(der, sigAlg)[0]!, TAG.OID, "signature OID")));
  return {
    der,
    tbs: whole(der, tbs),
    issuer: whole(der, issuer),
    subject: whole(der, subject),
    notBefore: timeMs(der, nb),
    notAfter: timeMs(der, na),
    publicKey: parseSubjectPublicKeyInfo(der, spki),
    signatureOid: sigOid,
    signature: bitStringBytes(der, sigBits),
    extensionOids,
  };
}

/** Verifies `child` was signed by `issuer`'s key with the algorithm the certificate names. */
export function verifyCertificateSignature(child: Certificate, issuer: Certificate): boolean {
  if (!bytesEqual(child.issuer, issuer.subject)) return false;
  const pk = issuer.publicKey;
  try {
    switch (child.signatureOid) {
      case OID.ecdsaSha256:
        return pk.kind === "ec" && pk.curve === "p256" && p256.verify(child.signature, sha256(child.tbs), pk.point, { prehash: false, lowS: false, format: "der" });
      case OID.ecdsaSha384:
        return pk.kind === "ec" && pk.curve === "p384" && p384.verify(child.signature, sha384(child.tbs), pk.point, { prehash: false, lowS: false, format: "der" });
      case OID.sha256Rsa:
        return pk.kind === "rsa" && rsaVerify(pk.key, "sha256", child.tbs, child.signature);
      case OID.sha1Rsa:
        return pk.kind === "rsa" && rsaVerify(pk.key, "sha1", child.tbs, child.signature);
      default:
        return false;
    }
  } catch {
    return false;
  }
}

/** JWS signature check with the leaf key: ES256 (raw r‖s) or RS256, over the ASCII signing input. */
export function verifyJwsSignature(alg: string, key: PublicKey, signingInput: Uint8Array, signature: Uint8Array): boolean {
  try {
    if (alg === "ES256" && key.kind === "ec" && key.curve === "p256") return p256.verify(signature, sha256(signingInput), key.point, { prehash: false, lowS: false, format: "compact" });
    if (alg === "RS256" && key.kind === "rsa") return rsaVerify(key.key, "sha256" satisfies RsaHash, signingInput, signature);
    return false;
  } catch {
    return false;
  }
}

export const certificateFingerprint = (cert: Certificate): Uint8Array => sha256(cert.der);
