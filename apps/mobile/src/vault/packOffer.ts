import { BUNDLED_MANIFEST, findExtension, findModel, type CatalogModel, type InstallState } from "@inborn/core";
import { includedWithApp } from "./included";

/** What the vault offers for an extension's card: a download, nothing until its model is here, or its installed state. */
export type PackOffer = "install" | "needs-model" | "busy" | "installed" | "included";

/**
 * The chat model a pack is for, when none of the models it serves is on this device (installed or bundled); null for an
 * extension that serves every model or whose model is here. Moshe, 28.9: never offer a download the reader cannot use.
 */
export function packNeedsModel(packId: string, modelReady: (id: string) => boolean): string | null {
  const ids = findExtension(packId)?.appliesTo.models;
  if (!ids?.length || ids.some(modelReady)) return null;
  return ids[0]!;
}

export function packOffer(pack: CatalogModel, state: InstallState, modelReady: (id: string) => boolean): PackOffer {
  if (includedWithApp(pack, state)) return "included";
  if (state.kind === "ready" || state.kind === "quarantined") return "installed";
  if (state.kind === "delivering" || state.kind === "verifying") return "busy";
  return packNeedsModel(pack.id, modelReady) ? "needs-model" : "install";
}

/** The catalog name ("Sharp") the "Install {model} first" line prints. */
export const chatModelName = (id: string): string => findModel(BUNDLED_MANIFEST, id)?.name ?? id;
