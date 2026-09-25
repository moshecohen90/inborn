import { useSyncExternalStore } from "react";
import { indexModelState, subscribeIndexModel } from "./embedder";
import type { IndexModelState } from "./indexModel";

/* The native state is rebuilt on every read, so the snapshot is its text: equal states compare equal. */
const snapshot = (): string => JSON.stringify(indexModelState());

export function useIndexModel(): IndexModelState {
  return JSON.parse(useSyncExternalStore(subscribeIndexModel, snapshot, snapshot)) as IndexModelState;
}

export const indexModelPercent = (s: IndexModelState): number => (s.kind === "downloading" && s.total > 0 ? Math.floor((s.bytes / s.total) * 100) : 0);
