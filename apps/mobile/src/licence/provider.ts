/* Type-check fallback; Metro resolves provider.native.ts (StoreKit 2 / Play Billing) or provider.web.ts (licence key / none). */
export { createStoreProvider } from "./provider.web";
