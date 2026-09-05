import type { Role, Usage } from "../llm/types";

/** A conversation (spec §5.3). `incognito` chats live in RAM only and never reach a persistent repository (§5.7). */
export interface Chat {
  id: string;
  title: string;
  /** Epoch milliseconds. */
  createdAt: number;
  updatedAt: number;
  modelId: string;
  personaId?: string;
  incognito: boolean;
  pinned?: boolean;
  folderId?: string;
}

/** One stored turn. Distinct from the engine's wire `Message` (role + content only). */
export interface ChatMessage {
  id: string;
  chatId: string;
  role: Role;
  content: string;
  reasoning?: string;
  modelId?: string;
  createdAt: number;
  /** True when the user (or the system) stopped generation before the model finished. */
  stopped?: boolean;
  usage?: Usage;
}

export interface NewChat {
  modelId: string;
  title?: string;
  personaId?: string;
  incognito?: boolean;
  pinned?: boolean;
  folderId?: string;
}

export interface NewMessage {
  chatId: string;
  role: Role;
  content: string;
  reasoning?: string;
  modelId?: string;
  stopped?: boolean;
  usage?: Usage;
}

export type MessagePatch = Partial<Pick<ChatMessage, "content" | "reasoning" | "stopped" | "usage">>;

export interface SearchHit {
  chatId: string;
  title: string;
  /** Undefined when the hit is on the chat title itself. */
  messageId?: string;
  snippet: string;
}
