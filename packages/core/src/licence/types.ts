/** Entitlement model (spec §12.1, §12.3, §12.4, §7.9). Free is a complete product; Pro and Work are one-time, per store. */

export type LicenceTier = "free" | "pro" | "work";

/** Where a purchase lives. A purchase never crosses stores (decision D5). */
export type Store = "app-store" | "play" | "microsoft-store" | "licence-key";

export const PRODUCTS = {
  pro: "inborn.pro",
  /** Same tier as `pro`, listed only during the 30-day launch window (§12.1). */
  proLaunch: "inborn.pro.launch",
  work: "inborn.work",
  /** Shown only to Pro owners (§10.7 #50): StoreKit gives no discounts on non-consumables. */
  workUpgrade: "inborn.work.upgrade",
} as const;

export type ProductId = (typeof PRODUCTS)[keyof typeof PRODUCTS];
export const PRODUCT_IDS: readonly ProductId[] = Object.values(PRODUCTS);

export const TIER_OF_PRODUCT: Record<ProductId, Exclude<LicenceTier, "free">> = {
  [PRODUCTS.pro]: "pro",
  [PRODUCTS.proLaunch]: "pro",
  [PRODUCTS.work]: "work",
  [PRODUCTS.workUpgrade]: "work",
};

/** US list prices (§12.1); every other market derives from these. Used only when the store returns no price. */
export const USD_PRICES: Record<ProductId, number> = {
  [PRODUCTS.pro]: 19.99,
  [PRODUCTS.proLaunch]: 14.99,
  [PRODUCTS.work]: 69.99,
  [PRODUCTS.workUpgrade]: 49.99,
};

export const LAUNCH_WINDOW_DAYS = 30;
/** Last known entitlement is honoured this long without reaching the store (§12.4). */
export const GRACE_DAYS = 30;
/** Play refunds an unacknowledged one-time purchase after this (§12.4). */
export const PLAY_ACKNOWLEDGE_DAYS = 3;

export const APP_BUNDLE_ID = "com.inbornapp.mobile";

/** A purchase whose proof was verified on this device. `proof` is kept so the cache can be re-verified later. */
export interface VerifiedPurchase {
  store: Store;
  productId: ProductId;
  tier: Exclude<LicenceTier, "free">;
  transactionId: string;
  originalTransactionId: string;
  purchasedAt: number;
  /** Refund or revocation: features lock, data stays (§10.7 #49). */
  revokedAt: number | null;
  familyShared: boolean;
  environment: "production" | "sandbox" | "xcode" | "test";
  /** Play only: a one-time product not acknowledged within 3 days is refunded by Play. */
  acknowledged: boolean;
  proof: PurchaseProof;
}

export type PurchaseProof =
  | { kind: "apple-jws"; jws: string }
  | { kind: "play"; json: string; signature: string }
  | { kind: "licence-key"; key: string; deviceId: string };

export type Rejection =
  | "malformed"
  | "bad-signature"
  | "untrusted-root"
  | "bad-chain"
  | "cert-expired"
  | "wrong-app"
  | "unknown-product"
  | "wrong-environment"
  | "not-purchased"
  | "wrong-type";

export type VerifyResult = { ok: true; purchase: VerifiedPurchase } | { ok: false; reason: Rejection };

export interface Entitlement {
  tier: LicenceTier;
  /** The purchase that grants `tier`, or null on Free. */
  purchase: VerifiedPurchase | null;
  /** True when the tier comes from the 30-day cache rather than a fresh store answer. */
  fromCache: boolean;
  /** When the cached entitlement stops being honoured without store contact; null when the store answered. */
  graceEndsAt: number | null;
}

/** What is written to the sealed cache file. */
export interface EntitlementCache {
  version: 1;
  purchases: VerifiedPurchase[];
  /** Last time the store answered (successfully) on this device. */
  storeContactAt: number;
}
