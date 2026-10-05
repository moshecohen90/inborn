import { findExtension } from "@inborn/core";
import { Platform } from "react-native";
import { getVault } from "../vault/store";
import { fromInstallState } from "./installState";
import type { ExtensionState } from "./state";

/**
 * Phone side of the extensions (round 105): the vault already installs every catalog file (bundled, Play pack or
 * https), so an extension's state is its vault state, read through one mapping (`fromInstallState`).
 */
export function extensionState(id: string): ExtensionState {
  const vault = getVault();
  const model = vault.model(id);
  if (!model || !findExtension(id)) return { kind: "unavailable" };
  /* The library asks the disk whether the file is there; the card must not say ready when the library cannot load it. */
  vault.forgetMissing(id);
  return fromInstallState(vault.state(id), model.bytes, Platform.OS);
}

export const subscribeExtensions = (listener: () => void): (() => void) => getVault().subscribe(listener);

/** A pack Play or the app bundle owns is removed with the app, and the vault's own card says so (round 90). */
export const canRemoveExtensions = false;

export const refreshExtension = async (id: string): Promise<ExtensionState> => {
  await getVault().ready();
  return extensionState(id);
};

export function extensionUri(id: string): string | null {
  getVault().forgetMissing(id);
  const s = getVault().state(id);
  return s.kind === "ready" ? s.path : null;
}

export async function installExtension(id: string): Promise<ExtensionState> {
  await getVault().install(id);
  return extensionState(id);
}

/** The vault's own rescan after a wipe is the extensions' rescan too. */
export const forgetExtensions = (): void => undefined;

export function cancelExtension(id: string): void {
  void getVault().cancel(id);
}

export async function resumeExtension(id: string): Promise<ExtensionState> {
  await getVault().resume(id);
  return extensionState(id);
}

export async function removeExtension(id: string): Promise<ExtensionState> {
  await getVault().remove(id);
  return extensionState(id);
}
