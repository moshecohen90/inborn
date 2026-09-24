import { deriveCacheKey, openCache, sealCache } from "./cache";
import { fallbackPrice, offersFor, resolveEntitlement, updateCache, type Offer, type Price } from "./entitlement";
import { can, type Feature } from "./gates";
import { needsAcknowledgement } from "./play";
import { PRODUCT_IDS, type Entitlement, type EntitlementCache, type ProductId, type PurchaseProof, type Rejection, type Store, type LicenceTier, type VerifiedPurchase, type VerifyResult } from "./types";

/**
 * Platform-independent purchase state machine (spec §12.4, §8.7 states, §10.7 #48–#52). The app plugs in a
 * `PurchaseProvider` (StoreKit 2 / Play Billing / licence keys), a sealed-file `CacheStorage` and a verifier; this
 * class owns ordering, grace, pending purchases, acknowledgement and the "You own Pro" / "store unreachable" states.
 */

export interface RawPurchase {
  productId: string;
  transactionId: string;
  state: "purchased" | "pending";
  /** Null while pending (Ask to Buy, deferred) — nothing to verify yet. */
  proof: PurchaseProof | null;
  acknowledged: boolean;
  /** Provider handle handed back to `finish()`. */
  handle?: unknown;
}

export interface StoreProduct {
  id: string;
  displayPrice: string;
  currency: string;
  price: number | null;
  familyShareable?: boolean;
}

export interface PurchaseFailure {
  code: string;
  message: string;
  productId?: string;
}

export interface PurchaseProvider {
  /** Null when this platform sells nothing (plain browser): the paywall says where to buy. */
  readonly store: Store | null;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  products(ids: readonly ProductId[]): Promise<StoreProduct[]>;
  /** What the store says this account owns right now (currentEntitlements / queryPurchasesAsync). */
  currentPurchases(): Promise<RawPurchase[]>;
  /** Starts the store sheet; the result arrives through `onPurchase` / `onError`. */
  purchase(productId: ProductId): Promise<void>;
  /** AppStore.sync() / queryPurchases; results arrive through `onPurchase` or the next `currentPurchases()`. */
  restore(): Promise<void>;
  /** finishTransaction / acknowledgePurchase. */
  finish(purchase: RawPurchase): Promise<void>;
  onPurchase(cb: (purchase: RawPurchase) => void): () => void;
  onError(cb: (error: PurchaseFailure) => void): () => void;
  /** Desktop licence keys only. */
  redeemLicenceKey?(key: string): Promise<RawPurchase>;
  /** Opens the store's own redemption screen (App Store offer codes, Play promo codes). Absent where no store has one. */
  openCodeRedemption?(): Promise<void>;
}

export interface CacheStorage {
  load(): Promise<Uint8Array | null>;
  save(sealed: Uint8Array): Promise<void>;
  clear(): Promise<void>;
}

export interface LicenceManagerOptions {
  provider: PurchaseProvider;
  cache: CacheStorage;
  /** The app's storage secret (64 hex); the cache key is derived, never the secret itself. */
  storageSecretHex: string;
  randomNonce: () => Uint8Array;
  verify: (raw: RawPurchase) => VerifyResult;
  now?: () => number;
  /** Launch day (epoch ms) for the 30-day launch price; null keeps `inborn.pro.launch` hidden. */
  launchAt?: number | null;
  log?: (message: string) => void;
}

export type PurchasePhase = { kind: "idle" } | { kind: "purchasing"; productId: ProductId } | { kind: "pending"; productId: ProductId } | { kind: "failed"; productId: ProductId; code: string } | { kind: "done"; productId: ProductId };
export type RestorePhase = { kind: "idle" } | { kind: "running" } | { kind: "done"; found: number } | { kind: "failed"; code: string };
export type CodePhase = { kind: "idle" } | { kind: "opening" } | { kind: "failed"; code: string };

export interface LicenceState {
  phase: "idle" | "loading" | "ready";
  entitlement: Entitlement;
  /** Null until the first attempt; false = "Purchases need a connection once" (§8.7 states). */
  storeReachable: boolean | null;
  prices: Partial<Record<ProductId, Price>>;
  /** iOS: the product is enabled for Family Sharing in App Store Connect (read-only here; activation is a one-way door). */
  familyShareable: boolean;
  purchase: PurchasePhase;
  restore: RestorePhase;
  /** The store's code screen: only "failed" is ever shown, because success arrives as a purchase. */
  code: CodePhase;
  /** Proofs the store handed over that this device refused (diagnostics, never shown as an error to the user). */
  rejected: Rejection[];
}

const FREE: Entitlement = { tier: "free", purchase: null, fromCache: false, graceEndsAt: null };

export class LicenceManager {
  private readonly listeners = new Set<() => void>();
  private readonly key: Uint8Array;
  private cache: EntitlementCache | null = null;
  private unsubscribe: Array<() => void> = [];
  private readonly now: () => number;
  private readonly log: (m: string) => void;
  private pretend: LicenceTier | null = null;
  private _state: LicenceState = { phase: "idle", entitlement: FREE, storeReachable: null, prices: {}, familyShareable: false, purchase: { kind: "idle" }, restore: { kind: "idle" }, code: { kind: "idle" }, rejected: [] };

  constructor(private readonly opts: LicenceManagerOptions) {
    this.key = deriveCacheKey(opts.storageSecretHex);
    this.now = opts.now ?? (() => Date.now());
    this.log = opts.log ?? (() => undefined);
  }

  get state(): LicenceState {
    return this._state;
  }
  get tier(): LicenceTier {
    return this._state.entitlement.tier;
  }
  get store(): Store | null {
    return this.opts.provider.store;
  }

  can(feature: Feature): boolean {
    return can(this.tier, feature);
  }

  /** Products to show on the paywall, given what is owned and what the store lists. */
  offers(): Offer[] {
    const listed = Object.keys(this._state.prices) as ProductId[];
    const available = listed.length && this._state.storeReachable ? new Set(listed) : null;
    return offersFor(this.tier, this.now(), this.opts.launchAt ?? null, available);
  }

  priceOf(productId: ProductId): Price {
    return this._state.prices[productId] ?? fallbackPrice(productId);
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Boot: cache first (instant answer offline), then the store. Idempotent. */
  async start(): Promise<void> {
    if (this._state.phase !== "idle") return;
    this.set({ phase: "loading" });
    const sealed = await this.opts.cache.load().catch(() => null);
    this.cache = sealed ? openCache(this.key, sealed) : null;
    if (sealed && !this.cache) this.log("licence cache unreadable; ignoring it");
    this.set({ entitlement: resolveEntitlement({ fresh: null, cache: this.cache, store: this.store ?? undefined, now: this.now() }) });
    const p = this.opts.provider;
    this.unsubscribe.push(
      p.onPurchase((raw) => void this.onPurchase(raw)),
      p.onError((e) => this.onError(e)),
    );
    await this.refresh();
    this.set({ phase: "ready" });
  }

  async stop(): Promise<void> {
    for (const u of this.unsubscribe) u();
    this.unsubscribe = [];
    await this.opts.provider.disconnect().catch(() => undefined);
  }

  /** Ask the store what is owned and what things cost; falls back to the cache with the 30-day grace. */
  async refresh(): Promise<void> {
    const p = this.opts.provider;
    if (!p.store) {
      this.set({ storeReachable: false, entitlement: resolveEntitlement({ fresh: null, cache: this.cache, now: this.now() }) });
      return;
    }
    let fresh: VerifiedPurchase[] | null = null;
    try {
      await p.connect();
      fresh = await this.verifyAll(await p.currentPurchases());
      this.cache = updateCache(this.cache, fresh, p.store, this.now());
      await this.persist();
      this.set({ storeReachable: true });
    } catch (e) {
      this.log(`store unreachable: ${String(e)}`);
      this.set({ storeReachable: false });
    }
    this.set({ entitlement: resolveEntitlement({ fresh, cache: this.cache, store: p.store, now: this.now() }) });
    if (fresh) await this.loadPrices();
  }

  async buy(productId: ProductId): Promise<void> {
    if (this._state.purchase.kind === "purchasing") return;
    this.set({ purchase: { kind: "purchasing", productId } });
    try {
      await this.opts.provider.purchase(productId);
    } catch (e) {
      this.set({ purchase: { kind: "failed", productId, code: errorCode(e) } });
    }
  }

  async restore(): Promise<void> {
    if (this._state.restore.kind === "running") return;
    this.set({ restore: { kind: "running" } });
    try {
      await this.opts.provider.restore();
      await this.refresh();
      const found = this._state.storeReachable ? (this.cache?.purchases.filter((x) => x.store === this.store).length ?? 0) : 0;
      this.set({ restore: this._state.storeReachable ? { kind: "done", found } : { kind: "failed", code: "store-unreachable" } });
    } catch (e) {
      this.set({ restore: { kind: "failed", code: errorCode(e) } });
    }
  }

  /** True when this store has a code screen of its own, so the paywall can offer "Have a code?". */
  canRedeemStoreCode(): boolean {
    return typeof this.opts.provider.openCodeRedemption === "function";
  }

  /**
   * Hands the user to the store's own redemption screen (App Store offer codes, Play promo codes). We never
   * see or validate the code; the unlock arrives as an ordinary purchase, so refresh once the screen closes.
   */
  async redeemStoreCode(): Promise<void> {
    const open = this.opts.provider.openCodeRedemption;
    if (!open || this._state.code.kind === "opening") return;
    this.set({ code: { kind: "opening" } });
    try {
      await open.call(this.opts.provider);
      this.set({ code: { kind: "idle" } });
      await this.refresh();
    } catch (e) {
      this.log(`code redemption could not open: ${String(e)}`);
      this.set({ code: { kind: "failed", code: errorCode(e) } });
    }
  }

  /** Desktop: a Paddle licence key typed in; verified offline, bound to this device in the cache. */
  async redeem(key: string): Promise<VerifyResult> {
    const p = this.opts.provider;
    if (!p.redeemLicenceKey || !p.store) return { ok: false, reason: "wrong-environment" };
    const raw = await p.redeemLicenceKey(key);
    const result = this.opts.verify(raw);
    if (!result.ok) {
      this.set({ rejected: [...this._state.rejected, result.reason] });
      return result;
    }
    this.cache = updateCache(this.cache, [result.purchase], p.store, this.now());
    await this.persist();
    this.set({ storeReachable: true, entitlement: resolveEntitlement({ fresh: [result.purchase], cache: this.cache, store: p.store, now: this.now() }), purchase: { kind: "done", productId: result.purchase.productId } });
    return result;
  }

  /** Emergency wipe hook (§7.5): the sealed cache goes; the store still knows the purchase, so Restore brings it back. */
  async wipe(): Promise<void> {
    this.cache = null;
    await this.opts.cache.clear().catch(() => undefined);
    this.set({ entitlement: FREE, purchase: { kind: "idle" }, restore: { kind: "idle" }, code: { kind: "idle" }, rejected: [] });
  }

  acknowledgePurchaseUi(): void {
    if (this._state.purchase.kind === "done" || this._state.purchase.kind === "failed") this.set({ purchase: { kind: "idle" } });
    if (this._state.restore.kind !== "running") this.set({ restore: { kind: "idle" } });
    if (this._state.code.kind === "failed") this.set({ code: { kind: "idle" } });
  }

  private async onPurchase(raw: RawPurchase): Promise<void> {
    const productId = raw.productId as ProductId;
    if (raw.state === "pending") {
      this.set({ purchase: { kind: "pending", productId } });
      return;
    }
    const verified = await this.verifyAll([raw]);
    if (!verified.length) {
      this.set({ purchase: { kind: "failed", productId, code: "verification-failed" } });
      return;
    }
    const store = this.opts.provider.store!;
    const merged = [...(this.cache?.purchases.filter((x) => x.store === store && x.transactionId !== raw.transactionId) ?? []), ...verified];
    this.cache = updateCache(this.cache, merged, store, this.now());
    await this.persist();
    this.set({ storeReachable: true, entitlement: resolveEntitlement({ fresh: merged, cache: this.cache, store, now: this.now() }), purchase: { kind: "done", productId } });
  }

  private onError(e: PurchaseFailure): void {
    const current = this._state.purchase;
    const productId = (e.productId as ProductId | undefined) ?? (current.kind === "purchasing" || current.kind === "pending" ? current.productId : undefined);
    if (!productId) return;
    this.set({ purchase: e.code === "user-cancelled" ? { kind: "idle" } : { kind: "failed", productId, code: e.code } });
  }

  /** Verifies each proof, finishes/acknowledges what verified, records what was refused. */
  private async verifyAll(raws: RawPurchase[]): Promise<VerifiedPurchase[]> {
    const out: VerifiedPurchase[] = [];
    const rejected: Rejection[] = [];
    for (const raw of raws) {
      if (raw.state !== "purchased" || !raw.proof) continue;
      const r = this.opts.verify(raw);
      if (!r.ok) {
        rejected.push(r.reason);
        this.log(`refused ${raw.productId}/${raw.transactionId}: ${r.reason}`);
        continue;
      }
      let purchase = r.purchase;
      if (needsAcknowledgement(purchase) || purchase.store === "app-store") {
        try {
          await this.opts.provider.finish(raw);
          purchase = { ...purchase, acknowledged: true };
        } catch (e) {
          this.log(`finish failed for ${raw.transactionId}: ${String(e)}`);
        }
      }
      out.push(purchase);
    }
    if (rejected.length) this.set({ rejected: [...this._state.rejected, ...rejected] });
    return out;
  }

  private async loadPrices(): Promise<void> {
    try {
      const products = await this.opts.provider.products(PRODUCT_IDS);
      const prices: Partial<Record<ProductId, Price>> = {};
      let familyShareable = false;
      for (const sp of products) {
        if (!PRODUCT_IDS.includes(sp.id as ProductId)) continue;
        prices[sp.id as ProductId] = { productId: sp.id as ProductId, display: sp.displayPrice, currency: sp.currency, amount: sp.price ?? fallbackPrice(sp.id as ProductId).amount, fromStore: true };
        if (sp.id === "inborn.pro" && sp.familyShareable) familyShareable = true;
      }
      this.set({ prices, familyShareable });
    } catch (e) {
      this.log(`products unavailable: ${String(e)}`);
    }
  }

  private async persist(): Promise<void> {
    if (!this.cache) return;
    try {
      await this.opts.cache.save(sealCache(this.key, this.cache, this.opts.randomNonce()));
    } catch (e) {
      this.log(`cache save failed: ${String(e)}`);
    }
  }

  /** Dev bundles only: walk the Pro / Work screens without a purchase. The app never calls this in release builds. */
  pretendTier(tier: LicenceTier | null): void {
    this.pretend = tier;
    this.set({});
  }

  private set(patch: Partial<LicenceState>): void {
    this._state = { ...this._state, ...patch };
    if (this.pretend) this._state = { ...this._state, entitlement: { ...this._state.entitlement, tier: this.pretend }, storeReachable: this._state.storeReachable ?? true };
    for (const l of this.listeners) l();
  }
}

function errorCode(e: unknown): string {
  if (e && typeof e === "object" && "code" in e && typeof (e as { code: unknown }).code === "string") return (e as { code: string }).code;
  return "unknown";
}
