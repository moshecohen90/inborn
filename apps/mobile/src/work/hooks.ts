import { useCallback, useEffect, useSyncExternalStore } from "react";
import { paywallFor } from "@inborn/core";
import { useEntitlement } from "../licence";
import { useLicenceState } from "../licence/hooks";
import { useAppServices } from "../services/AppServices";
import { getWork, type WorkStore } from "./store";

/** The Work store, re-rendering on every vault / audit change; relocks every vault when the app lock engages. */
export function useWork(): { work: WorkStore; version: number } {
  const work = getWork();
  const { lock } = useAppServices();
  const subscribe = useCallback((cb: () => void) => work.subscribe(cb), [work]);
  const version = useSyncExternalStore(subscribe, () => work.snapshot(), () => 0);
  useEffect(() => {
    void work.ready();
  }, [work]);
  useEffect(() => {
    if (lock.locked) work.appLocked();
  }, [lock.locked, work]);
  return { work, version };
}

/** Work gates + the one price line the §12.3 value moments show. */
export function useWorkGate(): { work: boolean; vaultsLocked: boolean; templatesLocked: boolean; signedLocked: boolean; statementLocked: boolean; price: string } {
  const { tier } = useEntitlement();
  const { manager } = useLicenceState();
  const price = manager?.priceOf("inborn.work").display ?? "$69.99";
  return {
    work: tier === "work",
    vaultsLocked: paywallFor(tier, { kind: "feature", feature: "clientVaults" }),
    templatesLocked: paywallFor(tier, { kind: "feature", feature: "templates" }),
    signedLocked: paywallFor(tier, { kind: "feature", feature: "signedExport" }),
    statementLocked: paywallFor(tier, { kind: "feature", feature: "architectureStatement" }),
    price,
  };
}
