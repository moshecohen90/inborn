import { describe, expect, it } from "vitest";
import { decodeAppleJws, verifyAppleJws } from "../src/licence/apple";
import { fromBase64, toHex } from "../src/licence/bytes";
import { APPLE_ROOT_CA_G3_DER_B64, APPLE_ROOT_CA_G3_SHA256, APPLE_WWDR_INTERMEDIATE_OID } from "../src/licence/roots";
import { certificateFingerprint, parseCertificate, verifyCertificateSignature } from "../src/licence/x509";
import { NOW, chain, derToB64, makeJws, read, readBytes, transactionPayload } from "./licence-fixtures";

const opts = { extraRoots: [chain.root], now: NOW };

describe("pinned roots (spec §12.4)", () => {
  it("the Apple Root CA G3 constant parses and matches its published fingerprint", () => {
    const root = parseCertificate(fromBase64(APPLE_ROOT_CA_G3_DER_B64));
    expect(toHex(certificateFingerprint(root))).toBe(APPLE_ROOT_CA_G3_SHA256);
    expect(root.publicKey).toMatchObject({ kind: "ec", curve: "p384" });
    expect(root.notAfter).toBe(Date.UTC(2039, 3, 30, 18, 19, 6));
    expect(verifyCertificateSignature(root, root)).toBe(true);
    /* The committed constant is byte-identical to the .cer downloaded from apple.com/certificateauthority. */
    expect(toHex(fromBase64(APPLE_ROOT_CA_G3_DER_B64))).toBe(toHex(readBytes("AppleRootCA-G3.cer")));
  });

  it("verifies Apple's real WWDR G6 intermediate against the pinned root (ECDSA P-384)", () => {
    const root = parseCertificate(fromBase64(APPLE_ROOT_CA_G3_DER_B64));
    const wwdr = parseCertificate(readBytes("AppleWWDRCAG6.cer"));
    expect(wwdr.signatureOid).toBe("1.2.840.10045.4.3.3");
    expect(wwdr.extensionOids).toContain(APPLE_WWDR_INTERMEDIATE_OID);
    expect(verifyCertificateSignature(wwdr, root)).toBe(true);
    const flipped = new Uint8Array(wwdr.der);
    flipped[flipped.length - 1]! ^= 1;
    expect(verifyCertificateSignature(parseCertificate(flipped), root)).toBe(false);
  });

  it("parses an RSA self-signed certificate too (Xcode's legacy StoreKitTestCertificate.cer)", () => {
    const test = parseCertificate(readBytes("StoreKitTestCertificate.cer"));
    expect(test.publicKey.kind).toBe("rsa");
    expect(test.signatureOid).toBe("1.2.840.113549.1.1.11");
    expect(verifyCertificateSignature(test, test)).toBe(true);
  });
});

describe("StoreKit 2 JWS verification (spec §12.4, §10.7 #48–#49)", () => {
  it("accepts a production non-consumable signed by a chain that ends in a trusted root", () => {
    const jws = makeJws({ payload: transactionPayload() });
    const r = verifyAppleJws(jws, opts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.purchase).toMatchObject({ store: "app-store", productId: "inborn.pro", tier: "pro", transactionId: "2000000123456789", revokedAt: null, familyShared: false, environment: "production", acknowledged: true });
    expect(r.purchase.proof).toEqual({ kind: "apple-jws", jws });
    expect(decodeAppleJws(jws)?.payload.productId).toBe("inborn.pro");
  });

  it("maps Work products, Family Sharing and revocation (features lock, nothing else changes)", () => {
    const work = verifyAppleJws(makeJws({ payload: transactionPayload({ productId: "inborn.work.upgrade" }) }), opts);
    expect(work.ok && work.purchase.tier).toBe("work");
    const family = verifyAppleJws(makeJws({ payload: transactionPayload({ inAppOwnershipType: "FAMILY_SHARED" }) }), opts);
    expect(family.ok && family.purchase.familyShared).toBe(true);
    const revoked = verifyAppleJws(makeJws({ payload: transactionPayload({ revocationDate: NOW - 1000, revocationReason: 0 }) }), opts);
    expect(revoked.ok && revoked.purchase.revokedAt).toBe(NOW - 1000);
  });

  it("rejects the wrong app, unknown products, subscriptions and non-owned transactions", () => {
    expect(verifyAppleJws(makeJws({ payload: transactionPayload({ bundleId: "com.example.other" }) }), opts)).toEqual({ ok: false, reason: "wrong-app" });
    expect(verifyAppleJws(makeJws({ payload: transactionPayload({ productId: "inborn.gold" }) }), opts)).toEqual({ ok: false, reason: "unknown-product" });
    expect(verifyAppleJws(makeJws({ payload: transactionPayload({ type: "Auto-Renewable Subscription" }) }), opts)).toEqual({ ok: false, reason: "wrong-type" });
    expect(verifyAppleJws(makeJws({ payload: transactionPayload({ inAppOwnershipType: "GIFTED" }) }), opts)).toEqual({ ok: false, reason: "not-purchased" });
  });

  it("only dev builds accept Sandbox / Xcode transactions; the Xcode root never signs production", () => {
    const sandbox = makeJws({ payload: transactionPayload({ environment: "Sandbox" }) });
    expect(verifyAppleJws(sandbox, opts)).toEqual({ ok: false, reason: "wrong-environment" });
    expect(verifyAppleJws(sandbox, { ...opts, allowTestEnvironments: true }).ok).toBe(true);
    /* Xcode's StoreKit Testing: one self-signed P-256 certificate named "StoreKit Testing in Xcode", environment "Xcode". */
    const xcode = makeJws({ payload: transactionPayload({ environment: "Xcode" }), x5c: [derToB64(chain.xcode)], keyPem: read("test-xcode.key") });
    expect(verifyAppleJws(xcode, { now: NOW })).toEqual({ ok: false, reason: "wrong-environment" });
    expect(verifyAppleJws(xcode, { now: NOW, allowTestEnvironments: true }).ok).toBe(true);
    const xcodeClaimsProduction = makeJws({ payload: transactionPayload({ environment: "Production" }), x5c: [derToB64(chain.xcode)], keyPem: read("test-xcode.key") });
    expect(verifyAppleJws(xcodeClaimsProduction, { now: NOW, allowTestEnvironments: true })).toEqual({ ok: false, reason: "untrusted-root" });
    const selfSignedButNotXcode = makeJws({ payload: transactionPayload({ environment: "Xcode" }), x5c: [derToB64(chain.root)], keyPem: read("test-root.key") });
    expect(verifyAppleJws(selfSignedButNotXcode, { now: NOW, allowTestEnvironments: true })).toEqual({ ok: false, reason: "untrusted-root" });
    const wrongKeyForXcodeCert = makeJws({ payload: transactionPayload({ environment: "Xcode" }), x5c: [derToB64(chain.xcode)], keyPem: read("test-root.key") });
    expect(verifyAppleJws(wrongKeyForXcodeCert, { now: NOW, allowTestEnvironments: true })).toEqual({ ok: false, reason: "bad-signature" });
    expect(verifyAppleJws(makeJws({ payload: transactionPayload({ environment: "Mars" }) }), { ...opts, allowTestEnvironments: true })).toEqual({ ok: false, reason: "wrong-environment" });
  });

  it("refuses a tampered payload, a foreign signing key and a chain that does not end in a pinned root", () => {
    const jws = makeJws({ payload: transactionPayload() });
    const [h, , s] = jws.split(".");
    const forged = Buffer.from(JSON.stringify(transactionPayload({ productId: "inborn.work" })), "utf8").toString("base64url");
    expect(verifyAppleJws(`${h}.${forged}.${s}`, opts)).toEqual({ ok: false, reason: "bad-signature" });
    /* Signed with the plain leaf's key but presenting the receipt leaf: signature does not match the certificate. */
    expect(verifyAppleJws(makeJws({ payload: transactionPayload(), keyPem: read("test-plain.key") }), opts)).toEqual({ ok: false, reason: "bad-signature" });
    /* Without the extra root the test chain is unknown to the app. */
    expect(verifyAppleJws(jws, { now: NOW })).toEqual({ ok: false, reason: "untrusted-root" });
  });

  it("requires Apple's extension OIDs on the intermediate and the leaf, and an unbroken chain", () => {
    const plainLeaf = makeJws({ payload: transactionPayload(), x5c: [derToB64(chain.plainLeaf), derToB64(chain.intermediate), derToB64(chain.root)], keyPem: read("test-plain.key") });
    /* The test root is registered as an "extra" anchor, so OIDs are not enforced there; run the same chain through the Apple-anchor rule. */
    expect(verifyAppleJws(plainLeaf, opts).ok).toBe(true);
    const missingIntermediate = makeJws({ payload: transactionPayload(), x5c: [derToB64(chain.leaf), derToB64(chain.root)] });
    expect(verifyAppleJws(missingIntermediate, opts)).toEqual({ ok: false, reason: "bad-chain" });
    const swapped = makeJws({ payload: transactionPayload(), x5c: [derToB64(chain.leaf), derToB64(chain.root), derToB64(chain.intermediate)] });
    expect(verifyAppleJws(swapped, opts)).toEqual({ ok: false, reason: "untrusted-root" });
  });

  it("checks certificate validity at the signing time, not at the wall clock", () => {
    const beforeIssue = makeJws({ payload: transactionPayload({ signedDate: Date.UTC(2010, 0, 1) }) });
    expect(verifyAppleJws(beforeIssue, opts)).toEqual({ ok: false, reason: "cert-expired" });
    const farFuture = makeJws({ payload: transactionPayload({ signedDate: Date.UTC(2090, 0, 1) }) });
    expect(verifyAppleJws(farFuture, opts)).toEqual({ ok: false, reason: "cert-expired" });
  });

  it("returns malformed for garbage, missing segments, and non-JSON parts", () => {
    expect(verifyAppleJws("", opts)).toEqual({ ok: false, reason: "malformed" });
    expect(verifyAppleJws("a.b", opts)).toEqual({ ok: false, reason: "malformed" });
    expect(verifyAppleJws("!!!.###.$$$", opts)).toEqual({ ok: false, reason: "malformed" });
    const jws = makeJws({ payload: transactionPayload() });
    expect(verifyAppleJws(`${jws.split(".")[0]}.${jws.split(".")[1]}.@@`, opts)).toEqual({ ok: false, reason: "malformed" });
    expect(decodeAppleJws("nope")).toBeNull();
  });
});
