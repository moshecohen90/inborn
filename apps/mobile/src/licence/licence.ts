import { LicenceManager } from "@inborn/core";
import { setEntitlements } from "../lib/entitlements";
import { DEV_TIER, LAUNCH_AT } from "./devFlags";
import { createStoreProvider } from "./provider";
import { cacheStorage, randomNonce, storageSecretHex } from "./storage";
import { verifyProof } from "./verify";

let instance: LicenceManager | null = null;
let starting: Promise<LicenceManager> | null = null;

/** The one licence manager of the process; `start()` runs once, later callers get the same object. */
export function getLicence(): Promise<LicenceManager> {
  if (instance) return Promise.resolve(instance);
  if (!starting) {
    starting = (async () => {
      let secret: string;
      let cache = cacheStorage();
      try {
        secret = await storageSecretHex();
      } catch (e: unknown) {
        /* No Keychain (unsigned simulator build, locked device): the store still answers, only the sealed cache is skipped this run. */
        console.warn("[licence] storage secret unavailable; cache disabled for this run", e);
        secret = Array.from(randomNonce(), (b) => b.toString(16).padStart(2, "0")).join("").padEnd(64, "0").slice(0, 64);
        cache = { load: async () => null, save: async () => undefined, clear: async () => undefined };
      }
      const manager = new LicenceManager({ provider: createStoreProvider(), cache, storageSecretHex: secret, randomNonce, verify: verifyProof, launchAt: LAUNCH_AT, log: (m) => console.info(`[licence] ${m}`) });
      /* The chat/persona screens read the simple `Entitlements` shape; keep it in step with the verified tier. */
      const push = () => setEntitlements({ pro: DEV_TIER !== null || manager.tier !== "free" });
      manager.subscribe(push);
      await manager.start();
      push();
      instance = manager;
      return manager;
    })();
  }
  return starting;
}

/** Synchronous peek for code that runs before or without the hook (null until `getLicence()` resolved once). */
export const licenceIfStarted = (): LicenceManager | null => instance;

/**
 * Emergency wipe hook for the shell stream (spec §7.5): drops the sealed entitlement cache and the desktop licence
 * file. The store still knows the purchase, so "Restore purchases" brings it back; nothing is refunded.
 */
export async function wipeLicence(): Promise<void> {
  if (instance) {
    await instance.wipe();
    return;
  }
  await cacheStorage().clear();
}
