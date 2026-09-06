import type { ProductId, PurchaseProvider, RawPurchase, StoreProduct } from "@inborn/core";
import { isTauri } from "../adapters/tauri";

/**
 * Web: a plain browser sells nothing (the paywall says where Pro is sold, spec §4.4). Inside the Tauri desktop shell a
 * Paddle licence key is typed in, verified offline by @inborn/core and kept in the desktop licence file (§12.4 row 4);
 * Microsoft Store / Mac App Store hooks sit behind the same interface and are not wired yet (§14.4).
 */

interface TauriInvoke {
  core: { invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> };
}
const invoke = <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => (window as unknown as { __TAURI__: TauriInvoke }).__TAURI__.core.invoke<T>(cmd, args);

function noStore(): PurchaseProvider {
  return {
    store: null,
    async connect() {},
    async disconnect() {},
    async products(): Promise<StoreProduct[]> {
      return [];
    },
    async currentPurchases(): Promise<RawPurchase[]> {
      return [];
    },
    async purchase() {
      throw Object.assign(new Error("no store on the web"), { code: "iap-not-available" });
    },
    async restore() {},
    async finish() {},
    onPurchase: () => () => undefined,
    onError: () => () => undefined,
  };
}

function licenceKeyProvider(): PurchaseProvider {
  return {
    ...noStore(),
    store: "licence-key",
    /* The licence file holds the last verified key; it is re-verified on every launch like a store answer. */
    async currentPurchases(): Promise<RawPurchase[]> {
      const stored = await invoke<{ key: string; deviceId: string } | null>("licence_load");
      if (!stored) return [];
      return [{ productId: "", transactionId: "", state: "purchased", proof: { kind: "licence-key", key: stored.key, deviceId: stored.deviceId }, acknowledged: true }];
    },
    async redeemLicenceKey(key: string): Promise<RawPurchase> {
      const deviceId = await invoke<string>("licence_device_id");
      await invoke("licence_save", { key: key.trim(), deviceId });
      return { productId: "", transactionId: "", state: "purchased", proof: { kind: "licence-key", key: key.trim(), deviceId }, acknowledged: true };
    },
    async products(_ids: readonly ProductId[]): Promise<StoreProduct[]> {
      return [];
    },
  };
}

export const createStoreProvider = (): PurchaseProvider => (isTauri() ? licenceKeyProvider() : noStore());
