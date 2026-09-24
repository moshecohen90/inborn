import type { CatalogModel, InstallState } from "@inborn/core";

/**
 * A model that comes with the app and cannot be removed: the iOS bundle, and a Play fast-follow pack, which Play
 * delivers again on every app update whatever the app removed (F374).
 */
export function includedWithApp(model: CatalogModel, state: InstallState): boolean {
  if (state.kind !== "ready" && state.kind !== "quarantined") return false;
  if (state.via === "bundled") return true;
  return state.via === "play" && model.delivery.some((d) => d.kind === "play-asset-pack" && d.mode === "fast-follow");
}
