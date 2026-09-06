import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { deriveCacheKey, openCache, sealCache } from "../src/licence/cache";
import { fallbackPrice, launchPriceActive, offersFor, resolveEntitlement, tierOf, updateCache } from "../src/licence/entitlement";
import { FEATURES, FEATURE_LIST, PAYWALL_BULLETS, can, limits, requiredTier } from "../src/licence/gates";
import { GRACE_DAYS, PRODUCTS, USD_PRICES, type EntitlementCache, type VerifiedPurchase } from "../src/licence/types";
import { NOW } from "./licence-fixtures";

const DAY = 86_400_000;
const purchase = (over: Partial<VerifiedPurchase> = {}): VerifiedPurchase => ({
  store: "app-store",
  productId: PRODUCTS.pro,
  tier: "pro",
  transactionId: "t1",
  originalTransactionId: "t1",
  purchasedAt: NOW - 10 * DAY,
  revokedAt: null,
  familyShared: false,
  environment: "production",
  acknowledged: true,
  proof: { kind: "apple-jws", jws: "x.y.z" },
  ...over,
});

describe("tier resolution (spec §12.1, D5)", () => {
  it("the highest granting tier wins; revoked purchases grant nothing; Work implies Pro", () => {
    expect(tierOf([]).tier).toBe("free");
    expect(tierOf([purchase()]).tier).toBe("pro");
    expect(tierOf([purchase(), purchase({ productId: PRODUCTS.workUpgrade, tier: "work", transactionId: "t2" })]).tier).toBe("work");
    expect(tierOf([purchase({ revokedAt: NOW - DAY })]).tier).toBe("free");
    expect(tierOf([purchase({ revokedAt: NOW - DAY }), purchase({ transactionId: "t3" })]).purchase?.transactionId).toBe("t3");
  });

  it("a purchase on another store does not unlock this one (one purchase per store)", () => {
    const play = purchase({ store: "play", proof: { kind: "play", json: "{}", signature: "" } });
    expect(tierOf([play], "app-store").tier).toBe("free");
    expect(tierOf([play], "play").tier).toBe("pro");
    expect(tierOf([play]).tier).toBe("pro");
  });
});

describe("grace and cache (spec §12.4: last known entitlement kept 30 days)", () => {
  const cache: EntitlementCache = { version: 1, purchases: [purchase()], storeContactAt: NOW - 5 * DAY };

  it("a fresh store answer is authoritative and never marked as cached", () => {
    expect(resolveEntitlement({ fresh: [purchase()], cache, now: NOW })).toMatchObject({ tier: "pro", fromCache: false, graceEndsAt: null });
    expect(resolveEntitlement({ fresh: [], cache, now: NOW })).toMatchObject({ tier: "free", fromCache: false });
  });

  it("without the store the cache is honoured until the grace ends, then the tier drops to Free (nothing deleted)", () => {
    const within = resolveEntitlement({ fresh: null, cache, now: NOW });
    expect(within).toMatchObject({ tier: "pro", fromCache: true, graceEndsAt: cache.storeContactAt + GRACE_DAYS * DAY });
    const atEdge = resolveEntitlement({ fresh: null, cache, now: cache.storeContactAt + GRACE_DAYS * DAY });
    expect(atEdge.tier).toBe("pro");
    const after = resolveEntitlement({ fresh: null, cache, now: cache.storeContactAt + GRACE_DAYS * DAY + 1 });
    expect(after).toMatchObject({ tier: "free", fromCache: true, graceEndsAt: cache.storeContactAt + GRACE_DAYS * DAY });
    expect(resolveEntitlement({ fresh: null, cache: null, now: NOW })).toMatchObject({ tier: "free", fromCache: true, graceEndsAt: null });
  });

  it("updateCache replaces this store's purchases, keeps other stores', and stamps the contact time", () => {
    const play = purchase({ store: "play", transactionId: "p1", proof: { kind: "play", json: "{}", signature: "" } });
    const merged = updateCache({ version: 1, purchases: [purchase(), play], storeContactAt: 0 }, [purchase({ transactionId: "t9" })], "app-store", NOW);
    expect(merged.purchases.map((p) => p.transactionId)).toEqual(["p1", "t9"]);
    expect(merged.storeContactAt).toBe(NOW);
    expect(updateCache(null, [], "play", NOW)).toEqual({ version: 1, purchases: [], storeContactAt: NOW });
  });

  it("the sealed cache opens only under the key derived from this device's storage secret and detects tampering", () => {
    const secret = "ab".repeat(32);
    const key = deriveCacheKey(secret);
    const otherKey = deriveCacheKey("cd".repeat(32));
    expect(key).toHaveLength(32);
    expect(Buffer.from(key).toString("hex")).not.toBe(secret);
    const sealed = sealCache(key, cache, new Uint8Array(randomBytes(24)));
    expect(openCache(key, sealed)).toEqual(cache);
    expect(openCache(otherKey, sealed)).toBeNull();
    const tampered = new Uint8Array(sealed);
    tampered[40]! ^= 0x01;
    expect(openCache(key, tampered)).toBeNull();
    expect(openCache(key, sealed.subarray(0, 10))).toBeNull();
    expect(openCache(key, Uint8Array.of(2, ...sealed.subarray(1)))).toBeNull();
    expect(() => sealCache(key, cache, new Uint8Array(12))).toThrow(/24 bytes/);
    /* Two seals of the same content differ (fresh nonce), so the file never reveals whether the entitlement changed. */
    expect(Buffer.from(sealCache(key, cache, new Uint8Array(randomBytes(24)))).equals(Buffer.from(sealed))).toBe(false);
  });
});

describe("offers and prices (spec §12.1, §8.7, §10.7 #50)", () => {
  it("Free sees Pro then Work; the launch SKU replaces Pro inside the 30-day window only", () => {
    expect(offersFor("free", NOW, null).map((o) => o.productId)).toEqual([PRODUCTS.pro, PRODUCTS.work]);
    const launch = NOW - 10 * DAY;
    expect(offersFor("free", NOW, launch)[0]).toEqual({ productId: PRODUCTS.proLaunch, tier: "pro", variant: "launch" });
    expect(offersFor("free", launch + 30 * DAY, launch)[0]?.productId).toBe(PRODUCTS.pro);
    expect(offersFor("free", launch - 1, launch)[0]?.productId).toBe(PRODUCTS.pro);
    expect(launchPriceActive(NOW, undefined)).toBe(false);
    /* The store does not list the launch SKU → the regular one. */
    expect(offersFor("free", NOW, launch, new Set([PRODUCTS.pro, PRODUCTS.work]))[0]?.productId).toBe(PRODUCTS.pro);
  });

  it("Pro owners see only the Work upgrade; Work owners see nothing to buy", () => {
    expect(offersFor("pro", NOW, null)).toEqual([{ productId: PRODUCTS.workUpgrade, tier: "work", variant: "upgrade" }]);
    expect(offersFor("pro", NOW, null, new Set([PRODUCTS.pro]))).toEqual([]);
    expect(offersFor("work", NOW, null)).toEqual([]);
  });

  it("fallback prices are the US list prices from §12.1 and are marked as not from the store", () => {
    expect(fallbackPrice(PRODUCTS.pro)).toEqual({ productId: PRODUCTS.pro, display: "$19.99", currency: "USD", amount: 19.99, fromStore: false });
    expect(USD_PRICES).toEqual({ "inborn.pro": 19.99, "inborn.pro.launch": 14.99, "inborn.work": 69.99, "inborn.work.upgrade": 49.99 });
  });
});

describe("feature gates (spec §7.5–§7.9, §12.3)", () => {
  it("Pro unlocks Pro features, Work unlocks everything, Free unlocks none of the gated ones", () => {
    for (const f of FEATURE_LIST) {
      expect(can("free", f), f).toBe(false);
      expect(can("work", f), f).toBe(true);
      expect(can("pro", f), f).toBe(FEATURES[f] === "pro");
    }
    expect(requiredTier("documents")).toBe("pro");
    expect(requiredTier("clientVaults")).toBe("work");
  });

  it("nothing from the never-paid list is a gate, and the Free limits are the spec's numbers", () => {
    for (const never of ["appLock", "encryptedDb", "incognito", "autoDelete", "panicWipe", "screenshotBlock", "proof", "accessibility", "languages", "report", "unlimitedChat"]) expect(never in FEATURES).toBe(false);
    expect(limits("free")).toEqual({ personas: 3, filesPerChat: 1, quickActions: 6 });
    expect(limits("pro")).toEqual({ personas: Infinity, filesPerChat: Infinity, quickActions: Infinity });
    expect(PAYWALL_BULLETS.pro).toHaveLength(6);
    expect(PAYWALL_BULLETS.work).toHaveLength(6);
  });
});
