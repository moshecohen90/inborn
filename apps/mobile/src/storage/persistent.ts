import { InMemoryChatRepository } from "@inborn/core";
import type { PersistentStorage } from "./types";

/** Web: expo-sqlite's worker needs COOP/COEP headers the static host does not send yet, so chats last as long as the tab. */
export async function openPersistentStorage(): Promise<PersistentStorage> {
  return { repository: new InMemoryChatRepository(), kind: "memory" };
}
