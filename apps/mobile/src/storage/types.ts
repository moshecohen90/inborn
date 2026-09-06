import type { ChatRepository } from "@inborn/core";

export type PersistenceKind = "sqlcipher" | "indexeddb" | "memory";

export interface PersistentStorage {
  repository: ChatRepository;
  kind: PersistenceKind;
}
