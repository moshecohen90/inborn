import * as ed from "@noble/ed25519";
import { describe, expect, it } from "vitest";
import { decodeLicenceKey, encodeLicenceKey, licenceKeyBytes, licencePublicKeyFromPrivate, signLicenceKey, verifyLicenceKey, type LicenceKeyPayload } from "../src/licence/licenceKey";
import { LICENCE_PUBLIC_KEY } from "../src/licence/licencePublicKey";
import { NOW } from "./licence-fixtures";

/* A throw-away seed for these tests; the real seed lives only in the Keychain (scripts/gen-licence-key.mjs). */
const PRIV = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
const PUB = licencePublicKeyFromPrivate(PRIV);
const payload: LicenceKeyPayload = { v: 1, id: "ORDER-42", sku: "inborn.work", seats: 5, issuedAt: NOW - 86_400_000, holder: "ab".repeat(32) };
const device = { deviceId: "mac-0001", publicKeyHex: PUB, now: NOW };

describe("desktop licence keys (spec §12.4 row 4, §14.4)", () => {
  it("a key signed with the seed verifies against its public key and binds to the device", () => {
    const key = signLicenceKey(payload, PRIV);
    expect(key.startsWith("INBORN-")).toBe(true);
    expect(decodeLicenceKey(key)?.payload).toEqual(payload);
    const r = verifyLicenceKey(key, device);
    expect(r.ok && r.purchase).toMatchObject({ store: "licence-key", productId: "inborn.work", tier: "work", transactionId: "ORDER-42", purchasedAt: payload.issuedAt, proof: { kind: "licence-key", key, deviceId: "mac-0001" } });
    expect(verifyLicenceKey(`  ${key}\n`, device).ok).toBe(true);
  });

  it("the committed public key is a real Ed25519 point and rejects keys from any other seed", () => {
    expect(LICENCE_PUBLIC_KEY).toMatch(/^[0-9a-f]{64}$/);
    expect(() => ed.ExtendedPoint.fromHex(LICENCE_PUBLIC_KEY)).not.toThrow();
    expect(verifyLicenceKey(signLicenceKey(payload, PRIV), { deviceId: "x" })).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects tampering, foreign signatures, expiry, unknown SKUs and malformed strings", () => {
    const key = signLicenceKey(payload, PRIV);
    const [p, s] = key.slice("INBORN-".length).split(".");
    const forged = Buffer.from(JSON.stringify({ ...payload, seats: 500 }), "utf8").toString("base64url");
    expect(verifyLicenceKey(`INBORN-${forged}.${s}`, device)).toEqual({ ok: false, reason: "bad-signature" });
    expect(verifyLicenceKey(`INBORN-${p}.${s!.slice(0, -2)}AA`, device)).toEqual({ ok: false, reason: "bad-signature" });
    expect(verifyLicenceKey(signLicenceKey({ ...payload, expiresAt: NOW - 1 }, PRIV), device)).toEqual({ ok: false, reason: "cert-expired" });
    expect(verifyLicenceKey(signLicenceKey({ ...payload, expiresAt: NOW + 1 }, PRIV), device).ok).toBe(true);
    expect(verifyLicenceKey(signLicenceKey({ ...payload, sku: "inborn.gold" as "inborn.pro" }, PRIV), device)).toEqual({ ok: false, reason: "unknown-product" });
    expect(verifyLicenceKey("INBORN-abc", device)).toEqual({ ok: false, reason: "malformed" });
    expect(verifyLicenceKey("not a key", device)).toEqual({ ok: false, reason: "malformed" });
    expect(verifyLicenceKey(`INBORN-${p}.${s}.extra`, device)).toEqual({ ok: false, reason: "malformed" });
    expect(decodeLicenceKey(`INBORN-${Buffer.from("[]").toString("base64url")}.${s}`)).toBeNull();
  });

  it("the signature covers canonical JSON, so field order in the transported payload does not matter", () => {
    const sig = ed.sign(licenceKeyBytes(payload), PRIV);
    const reordered = Object.fromEntries(Object.entries(payload).reverse()) as unknown as LicenceKeyPayload;
    expect(verifyLicenceKey(encodeLicenceKey(reordered, sig), device).ok).toBe(true);
  });
});
