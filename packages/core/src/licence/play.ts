import { fromBase64, utf8Bytes } from "./bytes";
import { readTlv } from "./der";
import { rsaVerify } from "./rsa";
import { APP_BUNDLE_ID, PLAY_ACKNOWLEDGE_DAYS, PRODUCT_IDS, TIER_OF_PRODUCT, type ProductId, type VerifiedPurchase, type VerifyResult } from "./types";
import { parseSubjectPublicKeyInfo, type PublicKey } from "./x509";

/**
 * Google Play one-time purchase: the purchase JSON is signed SHA1withRSA by Play with the app's licence key
 * (spec §12.4). Verified offline against the public key compiled into the app; `queryPurchasesAsync` drops
 * refunded purchases, so no server-side voided-purchase check is needed.
 */

export interface PlayVerifyOptions {
  /** Base64 SPKI from the Play Console. Empty → every real purchase is rejected (`untrusted-root`). */
  publicKey: string;
  packageName?: string;
  /** Static test SKUs (`android.test.purchased`) carry no signature; accepted only in dev builds. */
  allowTestPurchases?: boolean;
  now?: number;
}

interface PlayPurchaseJson {
  orderId?: string;
  packageName?: string;
  productId?: string;
  purchaseTime?: number;
  purchaseState?: number;
  purchaseToken?: string;
  acknowledged?: boolean;
  quantity?: number;
}

const keyCache = new Map<string, PublicKey>();
export function parsePlayPublicKey(base64Spki: string): PublicKey {
  const cached = keyCache.get(base64Spki);
  if (cached) return cached;
  const der = fromBase64(base64Spki);
  const key = parseSubjectPublicKeyInfo(der, readTlv(der, 0));
  keyCache.set(base64Spki, key);
  return key;
}

export const PLAY_TEST_SKU_PREFIX = "android.test.";

export function verifyPlayPurchase(json: string, signature: string, opts: PlayVerifyOptions): VerifyResult {
  let data: PlayPurchaseJson;
  try {
    data = JSON.parse(json) as PlayPurchaseJson;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof data.productId !== "string" || typeof data.purchaseToken !== "string") return { ok: false, reason: "malformed" };

  const isTestSku = data.productId.startsWith(PLAY_TEST_SKU_PREFIX);
  if (isTestSku) {
    if (!opts.allowTestPurchases) return { ok: false, reason: "wrong-environment" };
  } else {
    if (!opts.publicKey) return { ok: false, reason: "untrusted-root" };
    let key: PublicKey;
    try {
      key = parsePlayPublicKey(opts.publicKey);
    } catch {
      return { ok: false, reason: "untrusted-root" };
    }
    if (key.kind !== "rsa") return { ok: false, reason: "untrusted-root" };
    let sig: Uint8Array;
    try {
      sig = fromBase64(signature);
    } catch {
      return { ok: false, reason: "malformed" };
    }
    if (!rsaVerify(key.key, "sha1", utf8Bytes(json), sig)) return { ok: false, reason: "bad-signature" };
    if (data.packageName !== (opts.packageName ?? APP_BUNDLE_ID)) return { ok: false, reason: "wrong-app" };
    if (!PRODUCT_IDS.includes(data.productId as ProductId)) return { ok: false, reason: "unknown-product" };
  }
  if ((data.purchaseState ?? 0) !== 0) return { ok: false, reason: "not-purchased" };

  /* android.test.purchased stands in for Pro on emulators without a Play listing. */
  const productId = isTestSku ? ("inborn.pro" as ProductId) : (data.productId as ProductId);
  return {
    ok: true,
    purchase: {
      store: "play",
      productId,
      tier: TIER_OF_PRODUCT[productId],
      transactionId: data.orderId ?? data.purchaseToken,
      originalTransactionId: data.purchaseToken,
      purchasedAt: typeof data.purchaseTime === "number" ? data.purchaseTime : (opts.now ?? Date.now()),
      revokedAt: null,
      familyShared: false,
      environment: isTestSku ? "test" : "production",
      acknowledged: data.acknowledged === true,
      proof: { kind: "play", json, signature },
    },
  };
}

/** Play refunds a one-time purchase that is not acknowledged within three days; acknowledge as soon as it is verified. */
export function acknowledgeDeadline(purchase: VerifiedPurchase): number {
  return purchase.purchasedAt + PLAY_ACKNOWLEDGE_DAYS * 86_400_000;
}

export const needsAcknowledgement = (purchase: VerifiedPurchase): boolean => purchase.store === "play" && !purchase.acknowledged;
