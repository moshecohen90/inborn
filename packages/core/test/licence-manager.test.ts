import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyAppleJws } from "../src/licence/apple";
import { verifyLicenceKey, signLicenceKey, licencePublicKeyFromPrivate } from "../src/licence/licenceKey";
import { LicenceManager, type CacheStorage, type PurchaseFailure, type PurchaseProvider, type RawPurchase, type StoreProduct } from "../src/licence/manager";
import { PRODUCTS, type ProductId, type Store } from "../src/licence/types";
import { NOW, chain, makeJws, transactionPayload } from "./licence-fixtures";

const DAY = 86_400_000;
const SECRET = "ef".repeat(32);

class FakeProvider implements PurchaseProvider {
  reachable = true;
  owned: RawPurchase[] = [];
  listed: StoreProduct[] = [];
  finished: string[] = [];
  purchaseCalls: ProductId[] = [];
  restoreCalls = 0;
  private purchaseCbs = new Set<(p: RawPurchase) => void>();
  private errorCbs = new Set<(e: PurchaseFailure) => void>();
  constructor(readonly store: Store | null = "app-store") {}
  async connect() {
    if (!this.reachable) throw new Error("no store");
  }
  async disconnect() {}
  async products() {
    if (!this.reachable) throw new Error("no store");
    return this.listed;
  }
  async currentPurchases() {
    if (!this.reachable) throw new Error("no store");
    return this.owned;
  }
  async purchase(id: ProductId) {
    this.purchaseCalls.push(id);
  }
  async restore() {
    this.restoreCalls++;
    if (!this.reachable) throw Object.assign(new Error("offline"), { code: "network" });
  }
  async finish(p: RawPurchase) {
    this.finished.push(p.transactionId);
  }
  onPurchase(cb: (p: RawPurchase) => void) {
    this.purchaseCbs.add(cb);
    return () => this.purchaseCbs.delete(cb);
  }
  onError(cb: (e: PurchaseFailure) => void) {
    this.errorCbs.add(cb);
    return () => this.errorCbs.delete(cb);
  }
  emit(p: RawPurchase) {
    for (const cb of this.purchaseCbs) cb(p);
  }
  fail(e: PurchaseFailure) {
    for (const cb of this.errorCbs) cb(e);
  }
  codeScreens = 0;
  codeScreenError: Error | null = null;
  openCodeRedemption? = async () => {
    this.codeScreens++;
    if (this.codeScreenError) throw this.codeScreenError;
  };
  async redeemLicenceKey(key: string): Promise<RawPurchase> {
    return { productId: "?", transactionId: "?", state: "purchased", proof: { kind: "licence-key", key, deviceId: "dev-1" }, acknowledged: true };
  }
}

class MemoryCache implements CacheStorage {
  bytes: Uint8Array | null = null;
  saves = 0;
  async load() {
    return this.bytes;
  }
  async save(b: Uint8Array) {
    this.bytes = b;
    this.saves++;
  }
  async clear() {
    this.bytes = null;
  }
}

const raw = (over: Partial<RawPurchase> = {}, payload: Record<string, unknown> = {}): RawPurchase => ({
  productId: "inborn.pro",
  transactionId: "2000000123456789",
  state: "purchased",
  proof: { kind: "apple-jws", jws: makeJws({ payload: transactionPayload(payload) }) },
  acknowledged: true,
  ...over,
});

function build(provider: FakeProvider, cache = new MemoryCache(), now = () => NOW, launchAt: number | null = null) {
  const logs: string[] = [];
  const verify = (r: RawPurchase) => (r.proof?.kind === "apple-jws" ? verifyAppleJws(r.proof.jws, { extraRoots: [chain.root], now: now() }) : r.proof?.kind === "licence-key" ? verifyLicenceKey(r.proof.key, { deviceId: r.proof.deviceId, publicKeyHex: PUB, now: now() }) : ({ ok: false, reason: "malformed" } as const));
  const manager = new LicenceManager({ provider, cache, storageSecretHex: SECRET, randomNonce: () => new Uint8Array(randomBytes(24)), verify, now, launchAt, log: (m) => logs.push(m) });
  return { manager, logs, cache };
}

const PRIV = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
const PUB = licencePublicKeyFromPrivate(PRIV);
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("LicenceManager (spec §12.4, §8.7 states, §10.7 #48–#52)", () => {
  it("boots Free, asks the store, verifies what is owned, finishes it, caches it and loads prices", async () => {
    const provider = new FakeProvider();
    provider.owned = [raw()];
    provider.listed = [
      { id: "inborn.pro", displayPrice: "19,99 €", currency: "EUR", price: 19.99, familyShareable: true },
      { id: "inborn.work", displayPrice: "69,99 €", currency: "EUR", price: 69.99 },
      { id: "com.other", displayPrice: "1", currency: "EUR", price: 1 },
    ];
    const { manager, cache } = build(provider);
    const states: string[] = [];
    manager.subscribe(() => states.push(`${manager.state.phase}:${manager.tier}`));
    await manager.start();
    expect(manager.tier).toBe("pro");
    expect(manager.state).toMatchObject({ phase: "ready", storeReachable: true, familyShareable: true, entitlement: { tier: "pro", fromCache: false } });
    expect(manager.can("documents")).toBe(true);
    expect(manager.can("clientVaults")).toBe(false);
    expect(provider.finished).toEqual(["2000000123456789"]);
    expect(cache.saves).toBe(1);
    expect(manager.priceOf(PRODUCTS.pro)).toMatchObject({ display: "19,99 €", fromStore: true });
    expect(manager.priceOf(PRODUCTS.workUpgrade)).toMatchObject({ display: "$49.99", fromStore: false });
    expect(manager.offers().map((o) => o.productId)).toEqual([]);
    expect(states[0]).toBe("loading:free");
    expect(states.at(-1)).toBe("ready:pro");
    await manager.start();
    expect(cache.saves).toBe(1);
  });

  it("works from the sealed cache when the store is unreachable, and drops to Free after 30 days without contact", async () => {
    const provider = new FakeProvider();
    provider.owned = [raw()];
    const cache = new MemoryCache();
    await build(provider, cache).manager.start();

    provider.reachable = false;
    const offline = build(provider, cache, () => NOW + 3 * DAY);
    await offline.manager.start();
    expect(offline.manager.state).toMatchObject({ storeReachable: false, entitlement: { tier: "pro", fromCache: true, graceEndsAt: NOW + 30 * DAY } });
    expect(offline.manager.priceOf(PRODUCTS.pro).fromStore).toBe(false);

    const late = build(provider, cache, () => NOW + 31 * DAY);
    await late.manager.start();
    expect(late.manager.state.entitlement).toMatchObject({ tier: "free", fromCache: true, graceEndsAt: NOW + 30 * DAY });
    expect(late.manager.offers().map((o) => o.productId)).toEqual([PRODUCTS.pro, PRODUCTS.work]);

    /* The store answers again: fresh tier, contact time renewed. */
    provider.reachable = true;
    await late.manager.refresh();
    expect(late.manager.state.entitlement).toMatchObject({ tier: "pro", fromCache: false, graceEndsAt: null });
  });

  it("a cache written under another device's secret is ignored", async () => {
    const provider = new FakeProvider();
    provider.owned = [raw()];
    const cache = new MemoryCache();
    await build(provider, cache).manager.start();
    provider.reachable = false;
    const logs: string[] = [];
    const m = new LicenceManager({ provider, cache, storageSecretHex: "01".repeat(32), randomNonce: () => new Uint8Array(24), verify: () => ({ ok: false, reason: "malformed" }), now: () => NOW, log: (x) => logs.push(x) });
    await m.start();
    expect(m.tier).toBe("free");
    expect(logs.some((l) => l.includes("unreadable"))).toBe(true);
  });

  it("purchase flow: purchasing → done on a verified event; the store handle is finished; a refused proof fails", async () => {
    const provider = new FakeProvider();
    const { manager } = build(provider);
    await manager.start();
    expect(manager.tier).toBe("free");
    await manager.buy(PRODUCTS.pro);
    expect(provider.purchaseCalls).toEqual([PRODUCTS.pro]);
    expect(manager.state.purchase).toEqual({ kind: "purchasing", productId: PRODUCTS.pro });
    await manager.buy(PRODUCTS.work);
    expect(provider.purchaseCalls).toHaveLength(1);
    provider.emit(raw());
    await flush();
    expect(manager.state.purchase).toEqual({ kind: "done", productId: PRODUCTS.pro });
    expect(manager.tier).toBe("pro");
    expect(provider.finished).toEqual(["2000000123456789"]);
    expect(manager.offers()).toEqual([{ productId: PRODUCTS.workUpgrade, tier: "work", variant: "upgrade" }]);
    manager.acknowledgePurchaseUi();
    expect(manager.state.purchase.kind).toBe("idle");

    await manager.buy(PRODUCTS.workUpgrade);
    provider.emit(raw({ productId: "inborn.work.upgrade", transactionId: "bad" }, { productId: "inborn.work.upgrade", bundleId: "com.example.evil" }));
    await flush();
    expect(manager.state.purchase).toEqual({ kind: "failed", productId: PRODUCTS.workUpgrade, code: "verification-failed" });
    expect(manager.state.rejected).toEqual(["wrong-app"]);
    expect(manager.tier).toBe("pro");
  });

  it("pending (Ask to Buy), cancellation and store errors map to the paywall states", async () => {
    const provider = new FakeProvider();
    const { manager } = build(provider);
    await manager.start();
    await manager.buy(PRODUCTS.pro);
    provider.emit({ productId: "inborn.pro", transactionId: "p", state: "pending", proof: null, acknowledged: false });
    await flush();
    expect(manager.state.purchase).toEqual({ kind: "pending", productId: PRODUCTS.pro });
    provider.fail({ code: "user-cancelled", message: "cancelled" });
    expect(manager.state.purchase).toEqual({ kind: "idle" });
    await manager.buy(PRODUCTS.pro);
    provider.fail({ code: "network", message: "offline", productId: "inborn.pro" });
    expect(manager.state.purchase).toEqual({ kind: "failed", productId: PRODUCTS.pro, code: "network" });
    provider.fail({ code: "network", message: "stray error without product" });
    expect(manager.state.purchase.kind).toBe("failed");
    /* A purchase that completes on the next launch (§10.7 #52) is picked up by refresh. */
    provider.owned = [raw()];
    await manager.refresh();
    expect(manager.tier).toBe("pro");
  });

  it("restore re-reads the store; offline it reports failure and keeps the cached tier", async () => {
    const provider = new FakeProvider();
    const { manager } = build(provider);
    await manager.start();
    provider.owned = [raw({}, { inAppOwnershipType: "FAMILY_SHARED" })];
    await manager.restore();
    expect(provider.restoreCalls).toBe(1);
    expect(manager.state.restore).toEqual({ kind: "done", found: 1 });
    expect(manager.state.entitlement.purchase?.familyShared).toBe(true);
    provider.reachable = false;
    await manager.restore();
    expect(manager.state.restore).toEqual({ kind: "failed", code: "network" });
    expect(manager.tier).toBe("pro");
  });

  it("revocation locks features; a later refund appears through the store answer", async () => {
    const provider = new FakeProvider();
    provider.owned = [raw()];
    const { manager } = build(provider);
    await manager.start();
    expect(manager.tier).toBe("pro");
    provider.owned = [raw({}, { revocationDate: NOW - 1000 })];
    await manager.refresh();
    expect(manager.tier).toBe("free");
    expect(manager.state.entitlement.purchase).toBeNull();
  });

  it("wipe clears the sealed cache and the tier; restore brings the purchase back", async () => {
    const provider = new FakeProvider();
    provider.owned = [raw()];
    const { manager, cache } = build(provider);
    await manager.start();
    await manager.wipe();
    expect(cache.bytes).toBeNull();
    expect(manager.tier).toBe("free");
    await manager.restore();
    expect(manager.tier).toBe("pro");
    expect(cache.bytes).not.toBeNull();
  });

  it("desktop: a licence key is verified offline, cached, and counts as this store's purchase", async () => {
    const provider = new FakeProvider("licence-key");
    const { manager } = build(provider);
    await manager.start();
    const bad = await manager.redeem("INBORN-nope");
    expect(bad).toEqual({ ok: false, reason: "malformed" });
    expect(manager.state.rejected).toEqual(["malformed"]);
    const key = signLicenceKey({ v: 1, id: "ORDER-7", sku: "inborn.work", seats: 1, issuedAt: NOW - DAY }, PRIV);
    const good = await manager.redeem(key);
    expect(good.ok).toBe(true);
    expect(manager.tier).toBe("work");
    expect(manager.state.purchase).toEqual({ kind: "done", productId: PRODUCTS.work });
    expect(manager.offers()).toEqual([]);
    const noStore = build(new FakeProvider(null));
    await noStore.manager.start();
    expect(noStore.manager.state.storeReachable).toBe(false);
    expect(await noStore.manager.redeem(key)).toEqual({ ok: false, reason: "wrong-environment" });
  });

  /* F306. The store owns the code, not us: the button only opens the store screen, and the unlock arrives as a purchase. */
  it("the store code screen opens, then the manager re-reads what the account owns", async () => {
    const provider = new FakeProvider();
    const { manager } = build(provider);
    await manager.start();
    expect(manager.canRedeemStoreCode()).toBe(true);
    expect(manager.tier).toBe("free");
    provider.owned = [raw()];
    await manager.redeemStoreCode();
    expect(provider.codeScreens).toBe(1);
    expect(manager.state.code).toEqual({ kind: "idle" });
    expect(manager.tier).toBe("pro");
  });

  it("a store with no code screen offers nothing, and a screen that will not open says so instead of pretending", async () => {
    const none = new FakeProvider("licence-key");
    none.openCodeRedemption = undefined;
    const bare = build(none);
    await bare.manager.start();
    expect(bare.manager.canRedeemStoreCode()).toBe(false);
    await bare.manager.redeemStoreCode();
    expect(bare.manager.state.code).toEqual({ kind: "idle" });

    const provider = new FakeProvider();
    provider.codeScreenError = Object.assign(new Error("no such flow"), { code: "not-supported" });
    const { manager } = build(provider);
    await manager.start();
    await manager.redeemStoreCode();
    expect(manager.state.code).toEqual({ kind: "failed", code: "not-supported" });
    expect(manager.tier).toBe("free");
    manager.acknowledgePurchaseUi();
    expect(manager.state.code).toEqual({ kind: "idle" });
  });

  it("the launch SKU is offered only inside the window and only when the store lists it", async () => {
    const provider = new FakeProvider();
    provider.listed = [{ id: "inborn.pro", displayPrice: "$19.99", currency: "USD", price: 19.99 }, { id: "inborn.work", displayPrice: "$69.99", currency: "USD", price: 69.99 }];
    const withoutLaunch = build(provider, new MemoryCache(), () => NOW, NOW - DAY);
    await withoutLaunch.manager.start();
    expect(withoutLaunch.manager.offers()[0]?.productId).toBe(PRODUCTS.pro);
    provider.listed.push({ id: "inborn.pro.launch", displayPrice: "$14.99", currency: "USD", price: 14.99 });
    const withLaunch = build(provider, new MemoryCache(), () => NOW, NOW - DAY);
    await withLaunch.manager.start();
    expect(withLaunch.manager.offers()[0]).toEqual({ productId: PRODUCTS.proLaunch, tier: "pro", variant: "launch" });
  });
});
