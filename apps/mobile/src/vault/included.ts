import type { CatalogModel, InstallState } from "@inborn/core";

/** A model that comes with the app and cannot be removed: the iOS bundle. Every Play pack is on-demand and removable. */
export function includedWithApp(_model: CatalogModel, state: InstallState): boolean {
  if (state.kind !== "ready" && state.kind !== "quarantined") return false;
  return state.via === "bundled";
}
