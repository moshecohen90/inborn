import { Platform } from "react-native";
import * as iap from "expo-iap";
import type { ProductId, PurchaseFailure, PurchaseProvider, RawPurchase, StoreProduct } from "@inborn/core";
import { DEV_STORE_OFFLINE, devBuild } from "./devFlags";

/**
 * StoreKit 2 (iOS) and Play Billing (Android) through expo-iap. iOS hands over the signed transaction (JWS), Android
 * the purchase JSON + RSA signature; both are verified in @inborn/core before anything unlocks (spec §12.4).
 */

const looksLikeJws = (s: string | null | undefined): s is string => typeof s === "string" && s.split(".").length === 3;

function toRaw(p: iap.Purchase): RawPurchase | null {
  const state: RawPurchase["state"] = p.purchaseState === "pending" ? "pending" : "purchased";
  if (Platform.OS === "ios") {
    const ios = p as iap.PurchaseIOS;
    const jws = looksLikeJws(ios.purchaseToken) ? ios.purchaseToken : null;
    return { productId: ios.productId, transactionId: ios.transactionId ?? ios.id, state, proof: jws ? { kind: "apple-jws", jws } : null, acknowledged: true, handle: p };
  }
  const android = p as iap.PurchaseAndroid;
  const json = android.dataAndroid ?? null;
  return { productId: android.productId, transactionId: android.transactionId ?? android.purchaseToken ?? android.id, state, proof: json ? { kind: "play", json, signature: android.signatureAndroid ?? "" } : null, acknowledged: android.isAcknowledgedAndroid === true, handle: p };
}

export function createStoreProvider(): PurchaseProvider {
  const purchaseCbs = new Set<(p: RawPurchase) => void>();
  const errorCbs = new Set<(e: PurchaseFailure) => void>();
  let connected = false;
  let subs: Array<{ remove: () => void }> = [];
  const offline = devBuild() && DEV_STORE_OFFLINE;
  const gate = () => {
    if (offline) throw Object.assign(new Error("store offline (EXPO_PUBLIC_STORE_OFFLINE)"), { code: "network-error" });
  };

  return {
    store: Platform.OS === "ios" ? "app-store" : "play",

    async connect() {
      gate();
      if (connected) return;
      const ok = await iap.initConnection();
      if (!ok) throw Object.assign(new Error("store connection refused"), { code: "iap-not-available" });
      connected = true;
      subs = [
        iap.purchaseUpdatedListener((p) => {
          const raw = toRaw(p);
          if (raw) for (const cb of purchaseCbs) cb(raw);
        }),
        iap.purchaseErrorListener((e) => {
          /* Ask to Buy / deferred: not an error for the user, a waiting state (§10.7 #52). */
          if (e.code === "deferred-payment" || e.code === "pending") {
            const productId = e.productId ?? e.productIds?.[0];
            if (productId) for (const cb of purchaseCbs) cb({ productId, transactionId: "", state: "pending", proof: null, acknowledged: false });
            return;
          }
          for (const cb of errorCbs) cb({ code: e.code ?? "unknown", message: e.message, ...(e.productId ? { productId: e.productId } : {}) });
        }),
      ];
    },

    async disconnect() {
      for (const s of subs) s.remove();
      subs = [];
      if (connected) await iap.endConnection().catch(() => undefined);
      connected = false;
    },

    async products(ids: readonly ProductId[]): Promise<StoreProduct[]> {
      gate();
      const list = (await iap.fetchProducts({ skus: [...ids], type: "in-app" })) ?? [];
      return list.map((p) => ({ id: p.id, displayPrice: p.displayPrice, currency: p.currency, price: p.price ?? null, ...(p.platform === "ios" ? { familyShareable: (p as iap.ProductIOS).isFamilyShareableIOS } : {}) }));
    },

    async currentPurchases(): Promise<RawPurchase[]> {
      gate();
      const list = await iap.getAvailablePurchases({ onlyIncludeActiveItemsIOS: true, alsoPublishToEventListenerIOS: false });
      const out: RawPurchase[] = [];
      for (const p of list) {
        const raw = toRaw(p);
        if (!raw) continue;
        if (Platform.OS === "ios" && !raw.proof && raw.state === "purchased") {
          const jws = await iap.getTransactionJwsIOS(raw.transactionId).catch(() => null);
          if (looksLikeJws(jws)) raw.proof = { kind: "apple-jws", jws };
        }
        out.push(raw);
      }
      return out;
    },

    async purchase(productId: ProductId) {
      gate();
      await iap.requestPurchase({ type: "in-app", request: { apple: { sku: productId, andDangerouslyFinishTransactionAutomatically: false }, google: { skus: [productId] } } });
    },

    async restore() {
      gate();
      await iap.restorePurchases();
    },

    async finish(raw: RawPurchase) {
      const purchase = raw.handle as iap.Purchase | undefined;
      if (!purchase) return;
      await iap.finishTransaction({ purchase, isConsumable: false });
    },

    onPurchase(cb) {
      purchaseCbs.add(cb);
      return () => purchaseCbs.delete(cb);
    },
    onError(cb) {
      errorCbs.add(cb);
      return () => errorCbs.delete(cb);
    },
  };
}
