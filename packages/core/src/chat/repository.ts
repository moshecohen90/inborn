import type { Chat, ChatMessage, MessagePatch, NewChat, NewMessage, SearchHit } from "./types";

/** Storage contract for conversations. Implementations must never touch the network. */
export interface ChatRepository {
  /** Pinned first, then most recently updated. */
  listChats(): Promise<Chat[]>;
  getChat(id: string): Promise<Chat | undefined>;
  createChat(input: NewChat): Promise<Chat>;
  renameChat(id: string, title: string): Promise<void>;
  /** Removes the chat and all of its messages; a missing id is a no-op. */
  deleteChat(id: string): Promise<void>;
  listMessages(chatId: string): Promise<ChatMessage[]>;
  /** Appends and bumps the chat's `updatedAt`. Rejects an unknown chat. */
  appendMessage(input: NewMessage): Promise<ChatMessage>;
  updateMessage(chatId: string, messageId: string, patch: MessagePatch): Promise<void>;
  /** Titles and message text; every whitespace-separated term must match a word prefix (FTS5-like). */
  search(query: string): Promise<SearchHit[]>;
}

export const SEARCH_LIMIT = 50;
const TITLE_MAX_CHARS = 60;

export function sortChats(chats: Chat[]): Chat[] {
  return [...chats].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt);
}

/** Auto title: the first six words of the first message, whitespace-normalised, capped for the list. */
export function titleFromFirstMessage(text: string, maxWords = 6): string {
  const title = text.trim().split(/\s+/).filter(Boolean).slice(0, maxWords).join(" ");
  return title.length > TITLE_MAX_CHARS ? `${title.slice(0, TITLE_MAX_CHARS - 1).trimEnd()}…` : title;
}

export function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

export const searchTerms = tokenize;

export function matchesTerms(text: string, terms: string[]): boolean {
  if (!terms.length) return false;
  const words = tokenize(text);
  return terms.every((term) => words.some((w) => w.startsWith(term)));
}

/** A window of words around the first term hit, with ellipses where it was cut. */
export function snippetAround(text: string, terms: string[], windowWords = 12): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const hit = words.findIndex((w) => terms.some((t) => tokenize(w).some((p) => p.startsWith(t))));
  const start = Math.max(0, (hit < 0 ? 0 : hit) - Math.floor(windowWords / 3));
  const end = Math.min(words.length, start + windowWords);
  return `${start > 0 ? "…" : ""}${words.slice(start, end).join(" ")}${end < words.length ? "…" : ""}`;
}

let counter = 0;
export function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  counter = (counter + 1) % 0xffff;
  return `${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface InMemoryOptions {
  now?: () => number;
  newId?: () => string;
}

const cloneMessage = (m: ChatMessage): ChatMessage => ({ ...m, ...(m.usage ? { usage: { ...m.usage } } : {}) });

/** RAM-only repository: unit tests, the web fallback, and every incognito chat (spec §5.7). */
export class InMemoryChatRepository implements ChatRepository {
  private readonly chats = new Map<string, Chat>();
  private readonly messages = new Map<string, ChatMessage[]>();
  private readonly now: () => number;
  private readonly id: () => string;

  constructor(options: InMemoryOptions = {}) {
    this.now = options.now ?? Date.now;
    this.id = options.newId ?? newId;
  }

  async listChats(): Promise<Chat[]> {
    return sortChats([...this.chats.values()].map((c) => ({ ...c })));
  }

  async getChat(id: string): Promise<Chat | undefined> {
    const chat = this.chats.get(id);
    return chat ? { ...chat } : undefined;
  }

  async createChat(input: NewChat): Promise<Chat> {
    const t = this.now();
    const chat: Chat = {
      id: this.id(),
      title: (input.title ?? "").trim(),
      createdAt: t,
      updatedAt: t,
      modelId: input.modelId,
      incognito: !!input.incognito,
      ...(input.personaId ? { personaId: input.personaId } : {}),
      ...(input.pinned ? { pinned: true } : {}),
      ...(input.folderId ? { folderId: input.folderId } : {}),
    };
    this.chats.set(chat.id, chat);
    this.messages.set(chat.id, []);
    return { ...chat };
  }

  async renameChat(id: string, title: string): Promise<void> {
    const chat = this.require(id);
    chat.title = title.trim();
  }

  async deleteChat(id: string): Promise<void> {
    this.chats.delete(id);
    this.messages.delete(id);
  }

  async listMessages(chatId: string): Promise<ChatMessage[]> {
    return (this.messages.get(chatId) ?? []).map(cloneMessage);
  }

  async appendMessage(input: NewMessage): Promise<ChatMessage> {
    const chat = this.require(input.chatId);
    const message: ChatMessage = {
      id: this.id(),
      chatId: chat.id,
      role: input.role,
      content: input.content,
      createdAt: this.now(),
      ...(input.reasoning !== undefined ? { reasoning: input.reasoning } : {}),
      ...(input.modelId ? { modelId: input.modelId } : {}),
      ...(input.stopped ? { stopped: true } : {}),
      ...(input.usage ? { usage: { ...input.usage } } : {}),
    };
    this.messages.get(chat.id)!.push(message);
    chat.updatedAt = message.createdAt;
    return cloneMessage(message);
  }

  async updateMessage(chatId: string, messageId: string, patch: MessagePatch): Promise<void> {
    const message = (this.messages.get(chatId) ?? []).find((m) => m.id === messageId);
    if (!message) throw new Error(`unknown message ${messageId} in chat ${chatId}`);
    if (patch.content !== undefined) message.content = patch.content;
    if (patch.reasoning !== undefined) message.reasoning = patch.reasoning;
    if (patch.stopped !== undefined) message.stopped = patch.stopped;
    if (patch.usage !== undefined) message.usage = { ...patch.usage };
  }

  async search(query: string): Promise<SearchHit[]> {
    const terms = searchTerms(query);
    if (!terms.length) return [];
    const hits: SearchHit[] = [];
    for (const chat of await this.listChats()) {
      if (matchesTerms(chat.title, terms)) hits.push({ chatId: chat.id, title: chat.title, snippet: chat.title });
      for (const m of this.messages.get(chat.id) ?? []) {
        if (matchesTerms(m.content, terms)) hits.push({ chatId: chat.id, title: chat.title, messageId: m.id, snippet: snippetAround(m.content, terms) });
      }
      if (hits.length >= SEARCH_LIMIT) break;
    }
    return hits.slice(0, SEARCH_LIMIT);
  }

  /** Forgets everything. The ChatStore calls this to end an incognito session. */
  clear(): void {
    this.chats.clear();
    this.messages.clear();
  }

  private require(id: string): Chat {
    const chat = this.chats.get(id);
    if (!chat) throw new Error(`unknown chat ${id}`);
    return chat;
  }
}
