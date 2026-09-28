import { Platform } from "react-native";
import type { CatalogModel } from "@inborn/core";
import { getVault } from "../vault/store";
import { fromInstallState } from "./installState";
import type { ExtensionState } from "./state";

export type SeeingModel = Pick<CatalogModel, "id" | "bytes" | "vision">;

export const subscribeChatModels = (listener: () => void): (() => void) => getVault().subscribe(listener);

/* A Pro model is never the way out for Free. */
export const offeredChatModels = (pro: boolean): SeeingModel[] => getVault().manifest.models.filter((m) => m.role === "chat" && (pro || !m.proOnly));

export function chatModelState(id: string): ExtensionState {
  const vault = getVault();
  const model = vault.model(id);
  return model ? fromInstallState(vault.state(id), model.bytes, Platform.OS) : { kind: "unavailable" };
}

export async function installChatModel(id: string): Promise<ExtensionState> {
  await getVault().install(id);
  return chatModelState(id);
}

export function cancelChatModel(id: string): void {
  void getVault().cancel(id);
}

/* The chat screen's own switch (vault default + engine reset) does the work on the phones. */
export const switchChatModel = async (_id: string): Promise<boolean> => false;
