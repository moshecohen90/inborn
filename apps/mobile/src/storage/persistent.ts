import { InMemoryChatRepository } from "@inborn/core";
import { isTauri, openTauriRepository } from "../adapters/tauri";
import type { PersistentStorage } from "./types";

/** Web: expo-sqlite's worker needs COOP/COEP headers the static host does not send yet, so chats last as long as the tab. The desktop shell gets SQLCipher through Rust (spec §5.3). */
export async function openPersistentStorage(): Promise<PersistentStorage> {
  if (isTauri()) return { repository: await openTauriRepository(), kind: "sqlcipher" };
  return { repository: new InMemoryChatRepository(), kind: "memory" };
}
