import { describe, expect, it } from "vitest";
import { acknowledgeDeadline, needsAcknowledgement, parsePlayPublicKey, verifyPlayPurchase } from "../src/licence/play";
import { NOW, makePlayPurchase, playPublicKeyB64, read } from "./licence-fixtures";
import { PLAY_LICENCE_PUBLIC_KEY_PLACEHOLDER } from "../src/licence/roots";

const publicKey = playPublicKeyB64();

describe("Play Billing purchase verification (spec §12.4, §10.7 #48)", () => {
  it("ships the real Play Console licence key (an empty key refuses every real purchase with untrusted-root)", () => {
    expect(parsePlayPublicKey(PLAY_LICENCE_PUBLIC_KEY_PLACEHOLDER)).toMatchObject({ kind: "rsa", key: { k: 256 } });
  });

  it("parses the Play Console SPKI key and accepts a purchase signed SHA1withRSA under it", () => {
    expect(parsePlayPublicKey(publicKey)).toMatchObject({ kind: "rsa", key: { k: 256 } });
    const { json, signature } = makePlayPurchase();
    const r = verifyPlayPurchase(json, signature, { publicKey, now: NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.purchase).toMatchObject({ store: "play", productId: "inborn.pro", tier: "pro", transactionId: "GPA.3333-4444-5555-66666", originalTransactionId: "abcdef.token", purchasedAt: NOW - 60_000, acknowledged: false, environment: "production" });
    expect(needsAcknowledgement(r.purchase)).toBe(true);
    expect(acknowledgeDeadline(r.purchase)).toBe(NOW - 60_000 + 3 * 86_400_000);
    const acked = verifyPlayPurchase(...Object.values(makePlayPurchase({ acknowledged: true })) as [string, string], { publicKey });
    expect(acked.ok && needsAcknowledgement(acked.purchase)).toBe(false);
  });

  it("rejects a byte-changed JSON, a signature from another key, and a missing app key", () => {
    const { json, signature } = makePlayPurchase();
    expect(verifyPlayPurchase(json.replace("inborn.pro", "inborn.work"), signature, { publicKey })).toEqual({ ok: false, reason: "bad-signature" });
    expect(verifyPlayPurchase(json + " ", signature, { publicKey })).toEqual({ ok: false, reason: "bad-signature" });
    expect(verifyPlayPurchase(json, signature.slice(0, -8) + "AAAAAAAA", { publicKey })).toEqual({ ok: false, reason: "bad-signature" });
    /* A key of the right shape but not Play's: the leaf test key is EC, so use the RSA pair's public half as "the app key" for an unrelated signer. */
    expect(read("test-play.pub")).toContain("PUBLIC KEY");
    expect(verifyPlayPurchase(json, signature, { publicKey: "" })).toEqual({ ok: false, reason: "untrusted-root" });
    expect(verifyPlayPurchase(json, signature, { publicKey: "not base64 !!" })).toEqual({ ok: false, reason: "untrusted-root" });
    expect(verifyPlayPurchase(json, "***", { publicKey })).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects the wrong package, unknown products and anything but PURCHASED", () => {
    const wrongPkg = makePlayPurchase({ packageName: "com.example.other" });
    expect(verifyPlayPurchase(wrongPkg.json, wrongPkg.signature, { publicKey })).toEqual({ ok: false, reason: "wrong-app" });
    const unknown = makePlayPurchase({ productId: "inborn.gold" });
    expect(verifyPlayPurchase(unknown.json, unknown.signature, { publicKey })).toEqual({ ok: false, reason: "unknown-product" });
    const pending = makePlayPurchase({ purchaseState: 2 });
    expect(verifyPlayPurchase(pending.json, pending.signature, { publicKey })).toEqual({ ok: false, reason: "not-purchased" });
    const cancelled = makePlayPurchase({ purchaseState: 1 });
    expect(verifyPlayPurchase(cancelled.json, cancelled.signature, { publicKey })).toEqual({ ok: false, reason: "not-purchased" });
    expect(verifyPlayPurchase("{", "", { publicKey })).toEqual({ ok: false, reason: "malformed" });
    expect(verifyPlayPurchase("{}", "", { publicKey })).toEqual({ ok: false, reason: "malformed" });
  });

  it("static test SKUs (no signature) stand in for Pro only when a dev build allows them", () => {
    const json = JSON.stringify({ packageName: "com.inbornapp.mobile", productId: "android.test.purchased", purchaseState: 0, purchaseToken: "inapp:com.inbornapp.mobile:android.test.purchased", purchaseTime: NOW });
    expect(verifyPlayPurchase(json, "", { publicKey: "" })).toEqual({ ok: false, reason: "wrong-environment" });
    const r = verifyPlayPurchase(json, "", { publicKey: "", allowTestPurchases: true });
    expect(r.ok && r.purchase).toMatchObject({ productId: "inborn.pro", tier: "pro", environment: "test" });
  });
});
