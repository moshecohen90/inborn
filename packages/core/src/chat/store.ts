import { InMemoryChatRepository, isLibraryRepository, sortChats, type ChatRepository, type LibraryRepository, type SearchOptions } from "./repository";
import type { Chat, ChatMessage, ChatPatch, MemoryFact, MessagePatch, NewChat, NewMessage, SearchHit } from "./types";

export const MEMORY_ENABLED_KEY = "memory.enabled";
export const MEMORY_PERSONA_KEY_PREFIX = "memory.persona.";

/**
 * Routes every call by the incognito rule (spec §5.7): incognito chats live in a private RAM repository
 * and never reach the persistent one — not their rows, not their messages, not the search index, not memory.
 */
export class ChatStore {
  private readonly memory = new InMemoryChatRepository();
  private readonly incognitoIds = new Set<string>();
  readonly library: LibraryRepository;

  constructor(
    private readonly persistent: ChatRepository,
    library?: LibraryRepository,
  ) {
    this.library = library ?? (isLibraryRepository(persistent) ? persistent : new InMemoryChatRepository());
  }

  isIncognito(chatId: string): boolean {
    return this.incognitoIds.has(chatId);
  }

  async close(): Promise<void> {
    await this.persistent.close?.();
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

  updateChat(id: string, patch: ChatPatch): Promise<void> {
    return this.repoFor(id).updateChat(id, patch);
  }

  async deleteChat(id: string): Promise<void> {
    await this.repoFor(id).deleteChat(id);
    this.incognitoIds.delete(id);
  }

  async deleteChats(ids: string[]): Promise<void> {
    const ram = ids.filter((id) => this.incognitoIds.has(id));
    const saved = ids.filter((id) => !this.incognitoIds.has(id));
    if (ram.length) await this.memory.deleteChats(ram);
    if (saved.length) await this.persistent.deleteChats(saved);
    for (const id of ram) this.incognitoIds.delete(id);
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

  deleteMessagesFrom(chatId: string, messageId: string): Promise<number> {
    return this.repoFor(chatId).deleteMessagesFrom(chatId, messageId);
  }

  /** Only the persistent side is searchable: incognito chats are not in the index by design. */
  search(query: string, options?: SearchOptions): Promise<SearchHit[]> {
    return this.persistent.search(query, options);
  }

  /** Facts the model may see for this chat: none in incognito, none when memory is off, persona-scoped otherwise. */
  async memoryFor(chatId: string, personaId?: string): Promise<MemoryFact[]> {
    if (this.incognitoIds.has(chatId)) return [];
    if (!(await this.memoryEnabled())) return [];
    if (personaId && !(await this.memoryEnabledFor(personaId))) return [];
    const facts = await this.library.listMemory();
    return facts.filter((f) => f.enabled && (!f.personaId || f.personaId === personaId));
  }

  /** Remembering from an incognito chat is refused, not skipped silently: the caller should never ask. */
  async remember(chatId: string, content: string, personaId?: string): Promise<MemoryFact> {
    if (this.incognitoIds.has(chatId)) throw new Error("memory does not read or write in incognito");
    return this.library.addMemory({ content, sourceChatId: chatId, ...(personaId ? { personaId } : {}) });
  }

  async memoryEnabled(): Promise<boolean> {
    return (await this.library.getSetting(MEMORY_ENABLED_KEY)) !== "0";
  }

  setMemoryEnabled(on: boolean): Promise<void> {
    return this.library.setSetting(MEMORY_ENABLED_KEY, on ? "1" : "0");
  }

  async memoryEnabledFor(personaId: string): Promise<boolean> {
    return (await this.library.getSetting(MEMORY_PERSONA_KEY_PREFIX + personaId)) !== "0";
  }

  setMemoryEnabledFor(personaId: string, on: boolean): Promise<void> {
    return this.library.setSetting(MEMORY_PERSONA_KEY_PREFIX + personaId, on ? "1" : "0");
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
