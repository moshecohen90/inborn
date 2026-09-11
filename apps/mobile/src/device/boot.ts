import { getDeviceGuard } from "./guard";
import { getEngine, registerModelResolver } from "../engine";
import { installedTiers, resolveTier } from "../vault/tiers";

/* Dev builds can pretend to run a bigger tier (EXPO_PUBLIC_DEVICE_TIER=fast) so every §6.5 row can be driven on an emulator with one model file. */
const DEV_TIER = __DEV__ ? process.env.EXPO_PUBLIC_DEVICE_TIER : undefined;

/** Starts the guard for the whole run, UI or not: the protections (caps, stop, unload, switch) must not depend on a screen being mounted. */
export function startDeviceGuard(): void {
  if (DEV_TIER) {
    const engine = getEngine();
    const uri = engine.model.uri;
    engine.model.id = DEV_TIER;
    registerModelResolver((tier) => ({ id: tier, uri }));
  } else {
    registerModelResolver(resolveTier);
    getDeviceGuard().setAvailableTiers(installedTiers);
  }
  getDeviceGuard().subscribe(() => undefined);
}
