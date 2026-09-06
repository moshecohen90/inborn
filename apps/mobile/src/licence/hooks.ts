import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { can, type Entitlement, type Feature, type LicenceManager, type LicenceState, type LicenceTier } from "@inborn/core";
import { getLicence, licenceIfStarted } from "./licence";

/** The manager once it has started (null on the very first render before the cache was read). */
export function useLicence(): LicenceManager | null {
  const [manager, setManager] = useState<LicenceManager | null>(licenceIfStarted);
  useEffect(() => {
    let alive = true;
    if (!manager) void getLicence().then((m) => alive && setManager(m));
    return () => {
      alive = false;
    };
  }, [manager]);
  return manager;
}

/** Re-renders on every licence change; Free until the manager has started. */
export function useLicenceState(): { manager: LicenceManager | null; state: LicenceState | null } {
  const manager = useLicence();
  const subscribe = useCallback((cb: () => void) => (manager ? manager.subscribe(cb) : () => undefined), [manager]);
  const state = useSyncExternalStore(
    subscribe,
    () => manager?.state ?? null,
    () => null,
  );
  return { manager, state };
}

export interface EntitlementView {
  tier: LicenceTier;
  entitlement: Entitlement | null;
  /** Still reading the cache / asking the store. */
  loading: boolean;
  can: (feature: Feature) => boolean;
}

/** `const { tier, can } = useEntitlement(); if (!can("documents")) …` */
export function useEntitlement(): EntitlementView {
  const { state } = useLicenceState();
  const tier = state?.entitlement.tier ?? "free";
  return { tier, entitlement: state?.entitlement ?? null, loading: !state || state.phase !== "ready", can: (feature) => can(tier, feature) };
}
