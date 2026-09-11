import { bootModel, type ModelTier } from "@inborn/core";
import { getDeviceGuard } from "./guard";
import { deviceRamGB } from "./signals";
import { getEngine, registerModelResolver, switchModel } from "../engine";
import { getVault } from "../vault/store";
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

/** Boot-time RAM floor (§6.5, QA F14): decided before the first load, so a too-big default is never mapped and then evicted. */
export async function applyBootFloor(): Promise<void> {
  if (DEV_TIER) return;
  const active = getVault().activeModel();
  if (!active) return;
  const instant = resolveTier("instant");
  const instantState = instant ? getVault().state(instant.id) : null;
  const decision = bootModel(
    { id: active.model.id, tier: active.model.tier ?? null, bytes: active.model.bytes, minRamGB: active.model.minRamGB },
    deviceRamGB(),
    instant && instantState && "bytes" in instantState ? { id: instant.id, tier: "instant", bytes: instantState.bytes, minRamGB: getVault().model(instant.id)?.minRamGB } : null,
  );
  if (!decision.switched) return;
  if (__DEV__) console.log(`[device] boot floor: ${active.model.id} needs more RAM than this device has (${deviceRamGB() ?? "?"} GB), starting on instant`);
  if (await switchModel("instant", false)) getDeviceGuard().noteBootSwitch((decision.from ?? "fast") as ModelTier);
}
