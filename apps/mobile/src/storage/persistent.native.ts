import { SqliteChatRepository } from "./sqliteRepository";
import type { PersistentStorage } from "./types";

export async function openPersistentStorage(): Promise<PersistentStorage> {
  return { repository: await SqliteChatRepository.open(), kind: "sqlcipher" };
}
