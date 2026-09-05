import { InMemoryChatRepository, sortChats, type ChatRepository } from "./repository";
import type { Chat, ChatMessage, MessagePatch, NewChat, NewMessage, SearchHit } from "./types";

/**
 * Routes every call by the incognito rule (spec §5.7): incognito chats live in a private RAM repository
 * and never reach the persistent one — not their rows, not their messages, not the search index.
 */
export class ChatStore {
  private readonly memory = new InMemoryChatRepository();
  private readonly incognitoIds = new Set<string>();

  constructor(private readonly persistent: ChatRepository) {}

  isIncognito(chatId: string): boolean {
    return this.incognitoIds.has(chatId);
  }

  async listChats(): Promise<Chat[]> {
    const [saved, ram] = await Promise.all([this.persistent.listChats(), this.memory.listChats()]);
    return sortChats([...ram, ...saved]);
  }

  getChat(id: string): Promise<Chat | undefined> {
    return this.repoFor(id).getChat(id);
  }

  async createChat(input: NewChat): Promise<Chat> {
    if (input.incognito) {
      const chat = await this.memory.createChat({ ...input, incognito: true });
      this.incognitoIds.add(chat.id);
      return chat;
    }
    return this.persistent.createChat({ ...input, incognito: false });
  }

  renameChat(id: string, title: string): Promise<void> {
    return this.repoFor(id).renameChat(id, title);
  }

  async deleteChat(id: string): Promise<void> {
    await this.repoFor(id).deleteChat(id);
    this.incognitoIds.delete(id);
  }

  listMessages(chatId: string): Promise<ChatMessage[]> {
    return this.repoFor(chatId).listMessages(chatId);
  }

  appendMessage(input: NewMessage): Promise<ChatMessage> {
    return this.repoFor(input.chatId).appendMessage(input);
  }

  updateMessage(chatId: string, messageId: string, patch: MessagePatch): Promise<void> {
    return this.repoFor(chatId).updateMessage(chatId, messageId, patch);
  }

  /** Only the persistent side is searchable: incognito chats are not in the index by design. */
  search(query: string): Promise<SearchHit[]> {
    return this.persistent.search(query);
  }

  /** Drops every incognito chat; nothing else changes. */
  endSession(): void {
    this.memory.clear();
    this.incognitoIds.clear();
  }

  private repoFor(chatId: string): ChatRepository {
    return this.incognitoIds.has(chatId) ? this.memory : this.persistent;
  }
}
