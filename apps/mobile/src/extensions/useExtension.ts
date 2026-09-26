import { useSyncExternalStore } from "react";
import { extensionState, subscribeExtensions } from "./store";
import type { ExtensionState } from "./state";

/* The native state is rebuilt on every read, so the snapshot is its text: equal states compare equal. */
export function useExtension(id: string): ExtensionState {
  const snapshot = (): string => JSON.stringify(extensionState(id));
  return JSON.parse(useSyncExternalStore(subscribeExtensions, snapshot, snapshot)) as ExtensionState;
}
