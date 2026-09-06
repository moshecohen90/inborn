import { GRACE_DAYS, LAUNCH_WINDOW_DAYS, PRODUCTS, USD_PRICES, type Entitlement, type EntitlementCache, type ProductId, type Store, type LicenceTier, type VerifiedPurchase } from "./types";

const DAY_MS = 86_400_000;

export const TIER_RANK: Record<LicenceTier, number> = { free: 0, pro: 1, work: 2 };
export const tierAtLeast = (have: LicenceTier, want: LicenceTier): boolean => TIER_RANK[have] >= TIER_RANK[want];

/** A purchase grants nothing once revoked or (Play) once the un-acknowledged window has produced a refund. */
export const isGranting = (p: VerifiedPurchase): boolean => p.revokedAt === null;

/** The highest tier among granting purchases, restricted to one store (decision D5: purchases never cross stores). */
export function tierOf(purchases: readonly VerifiedPurchase[], store?: Store): { tier: LicenceTier; purchase: VerifiedPurchase | null } {
  let best: VerifiedPurchase | null = null;
  for (const p of purchases) {
    if (!isGranting(p) || (store && p.store !== store)) continue;
    if (!best || TIER_RANK[p.tier] > TIER_RANK[best.tier] || (TIER_RANK[p.tier] === TIER_RANK[best.tier] && p.purchasedAt < best.purchasedAt)) best = p;
  }
  return { tier: best?.tier ?? "free", purchase: best };
}

/**
 * Entitlement from what the store said now (`fresh`) or from the sealed cache when the store could not be reached.
 * The cached answer is honoured GRACE_DAYS after the last store contact (spec §12.4), then the tier drops to Free
 * until a store answer or a Restore; nothing is deleted.
 */
export function resolveEntitlement(input: { fresh: readonly VerifiedPurchase[] | null; cache: EntitlementCache | null; store?: Store; now: number }): Entitlement {
  if (input.fresh) {
    const { tier, purchase } = tierOf(input.fresh, input.store);
    return { tier, purchase, fromCache: false, graceEndsAt: null };
  }
  if (!input.cache) return { tier: "free", purchase: null, fromCache: true, graceEndsAt: null };
  const graceEndsAt = input.cache.storeContactAt + GRACE_DAYS * DAY_MS;
  if (input.now > graceEndsAt) return { tier: "free", purchase: null, fromCache: true, graceEndsAt };
  const { tier, purchase } = tierOf(input.cache.purchases, input.store);
  return { tier, purchase, fromCache: true, graceEndsAt: tier === "free" ? null : graceEndsAt };
}

/** Merge a store answer into the cache: fresh purchases replace same-store entries, other stores' entries are kept. */
export function updateCache(cache: EntitlementCache | null, fresh: readonly VerifiedPurchase[], store: Store, now: number): EntitlementCache {
  const others = (cache?.purchases ?? []).filter((p) => p.store !== store);
  return { version: 1, purchases: [...others, ...fresh], storeContactAt: now };
}

/** Launch window (§12.1): 30 days from `launchAt`; null/undefined launch date = window closed. */
export function launchPriceActive(now: number, launchAt: number | null | undefined): boolean {
  return typeof launchAt === "number" && now >= launchAt && now < launchAt + LAUNCH_WINDOW_DAYS * DAY_MS;
}

export interface Offer {
  productId: ProductId;
  tier: "pro" | "work";
  /** True for `inborn.pro.launch` / `inborn.work.upgrade`, which the paywall labels. */
  variant: "regular" | "launch" | "upgrade";
}

/**
 * Which products the paywall shows for the current tier (§10.7 #50): Free sees Pro (launch price inside the window) and
 * Work; Pro owners see only the Work upgrade; Work owners see nothing to buy.
 */
export function offersFor(tier: LicenceTier, now: number, launchAt: number | null | undefined, available: ReadonlySet<ProductId> | null = null): Offer[] {
  const has = (id: ProductId) => available === null || available.has(id);
  if (tier === "work") return [];
  if (tier === "pro") return has(PRODUCTS.workUpgrade) ? [{ productId: PRODUCTS.workUpgrade, tier: "work", variant: "upgrade" }] : [];
  const pro: Offer = launchPriceActive(now, launchAt) && has(PRODUCTS.proLaunch) ? { productId: PRODUCTS.proLaunch, tier: "pro", variant: "launch" } : { productId: PRODUCTS.pro, tier: "pro", variant: "regular" };
  return [pro, { productId: PRODUCTS.work, tier: "work", variant: "regular" }];
}

export interface Price {
  productId: ProductId;
  /** Localized, as the store formats it ("$19.99", "19,99 €"). */
  display: string;
  currency: string;
  amount: number;
  /** False when the store gave no answer and the US list price is shown instead. */
  fromStore: boolean;
}

export function fallbackPrice(productId: ProductId): Price {
  return { productId, display: `$${USD_PRICES[productId].toFixed(2)}`, currency: "USD", amount: USD_PRICES[productId], fromStore: false };
}
