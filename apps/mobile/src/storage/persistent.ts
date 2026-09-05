import { InMemoryChatRepository } from "@inborn/core";
import { IdbChatRepository } from "./web/idbRepository";
import type { PersistentStorage } from "./types";

/** Web: IndexedDB in the browser profile (no SQLCipher; see the `webStorageNotice` string). Falls back to RAM when the browser refuses storage. */
export async function openPersistentStorage(): Promise<PersistentStorage> {
  if (typeof indexedDB === "undefined") return { repository: new InMemoryChatRepository(), kind: "memory" };
  try {
    return { repository: await IdbChatRepository.open(), kind: "indexeddb" };
  } catch (e: unknown) {
    console.warn("IndexedDB unavailable; chats stay in memory for this tab.", e);
    return { repository: new InMemoryChatRepository(), kind: "memory" };
  }
}
