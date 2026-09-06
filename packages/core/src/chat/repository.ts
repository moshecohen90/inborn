import type {
  Chat,
  ChatMessage,
  ChatPatch,
  Folder,
  MemoryFact,
  MemoryFactInput,
  MemoryFactPatch,
  MessagePatch,
  NewChat,
  NewMessage,
  Persona,
  PersonaInput,
  Report,
  ReportInput,
  SearchHit,
} from "./types";

/** Storage contract for conversations. Implementations must never touch the network. */
export interface ChatRepository {
  /** Pinned first, then most recently updated. Archived chats are included; callers filter. */
  listChats(): Promise<Chat[]>;
  getChat(id: string): Promise<Chat | undefined>;
  createChat(input: NewChat): Promise<Chat>;
  renameChat(id: string, title: string): Promise<void>;
  /** Pin, archive, move, system prompt, summary… `null` clears an optional field. Unknown id is a no-op. */
  updateChat(id: string, patch: ChatPatch): Promise<void>;
  /** Removes the chat and all of its messages; a missing id is a no-op. */
  deleteChat(id: string): Promise<void>;
  deleteChats(ids: string[]): Promise<void>;
  listMessages(chatId: string): Promise<ChatMessage[]>;
  /** Appends and bumps the chat's `updatedAt`. Rejects an unknown chat. */
  appendMessage(input: NewMessage): Promise<ChatMessage>;
  updateMessage(chatId: string, messageId: string, patch: MessagePatch): Promise<void>;
  /** Deletes `messageId` and every message after it (edit-and-resend, regenerate). Returns how many went. */
  deleteMessagesFrom(chatId: string, messageId: string): Promise<number>;
  /** Titles and message text; every whitespace-separated term must match a word prefix (FTS5-like). */
  search(query: string): Promise<SearchHit[]>;
}

/** Folders, personas, memory and reports (§5.3 row 1). Persistent only: incognito never writes here. */
export interface LibraryRepository {
  listFolders(): Promise<Folder[]>;
  createFolder(name: string): Promise<Folder>;
  renameFolder(id: string, name: string): Promise<void>;
  /** Chats in the folder move back to the root. */
  deleteFolder(id: string): Promise<void>;
  /** Custom personas only; built-ins live in code (`BUILT_IN_PERSONAS`). */
  listPersonas(): Promise<Persona[]>;
  /** Upsert: an existing id updates, otherwise a new persona is created. */
  savePersona(input: PersonaInput): Promise<Persona>;
  deletePersona(id: string): Promise<void>;
  listMemory(): Promise<MemoryFact[]>;
  addMemory(input: MemoryFactInput): Promise<MemoryFact>;
  updateMemory(id: string, patch: MemoryFactPatch): Promise<void>;
  deleteMemory(id: string): Promise<void>;
  clearMemory(): Promise<void>;
  getSetting(key: string): Promise<string | undefined>;
  setSetting(key: string, value: string): Promise<void>;
  saveReport(input: ReportInput): Promise<Report>;
  listReports(): Promise<Report[]>;
  deleteReport(id: string): Promise<void>;
}

export const isLibraryRepository = (r: unknown): r is LibraryRepository =>
  typeof r === "object" && r !== null && typeof (r as LibraryRepository).listFolders === "function" && typeof (r as LibraryRepository).listPersonas === "function";

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

const cloneMessage = (m: ChatMessage): ChatMessage => ({ ...m, ...(m.usage ? { usage: { ...m.usage } } : {}), ...(m.citations ? { citations: m.citations.map((c) => ({ ...c })) } : {}), ...(m.images ? { images: [...m.images] } : {}) });

/** Applies a ChatPatch to a chat object in place; shared by the RAM store and tests. */
export function applyChatPatch(chat: Chat, patch: ChatPatch): void {
  if (patch.title !== undefined) chat.title = patch.title.trim();
  if (patch.pinned !== undefined) chat.pinned = patch.pinned || undefined;
  if (patch.archived !== undefined) chat.archived = patch.archived || undefined;
  if (patch.modelId !== undefined) chat.modelId = patch.modelId;
  if (patch.thinking !== undefined) chat.thinking = patch.thinking;
  const optional = ["folderId", "personaId", "systemPrompt", "summary", "summaryUpTo"] as const;
  for (const key of optional) {
    const v = patch[key];
    if (v === undefined) continue;
    if (v === null) delete chat[key];
    else chat[key] = v;
  }
  for (const key of ["pinned", "archived"] as const) if (!chat[key]) delete chat[key];
}

/** RAM-only repository: unit tests, the web fallback, and every incognito chat (spec §5.7). */
export class InMemoryChatRepository implements ChatRepository, LibraryRepository {
  private readonly chats = new Map<string, Chat>();
  private readonly messages = new Map<string, ChatMessage[]>();
  private readonly folders = new Map<string, Folder>();
  private readonly personas = new Map<string, Persona>();
  private readonly memory = new Map<string, MemoryFact>();
  private readonly settings = new Map<string, string>();
  private readonly reports = new Map<string, Report>();
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
      ...(input.systemPrompt ? { systemPrompt: input.systemPrompt } : {}),
      ...(input.thinking !== undefined ? { thinking: input.thinking } : {}),
    };
    this.chats.set(chat.id, chat);
    this.messages.set(chat.id, []);
    return { ...chat };
  }

  async renameChat(id: string, title: string): Promise<void> {
    const chat = this.require(id);
    chat.title = title.trim();
  }

  async updateChat(id: string, patch: ChatPatch): Promise<void> {
    const chat = this.chats.get(id);
    if (chat) applyChatPatch(chat, patch);
  }

  async deleteChat(id: string): Promise<void> {
    this.chats.delete(id);
    this.messages.delete(id);
  }

  async deleteChats(ids: string[]): Promise<void> {
    for (const id of ids) await this.deleteChat(id);
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
      ...(input.reasoningMs !== undefined ? { reasoningMs: input.reasoningMs } : {}),
      ...(input.modelId ? { modelId: input.modelId } : {}),
      ...(input.stopped ? { stopped: true } : {}),
      ...(input.stoppedBy ? { stoppedBy: input.stoppedBy } : {}),
      ...(input.usage ? { usage: { ...input.usage } } : {}),
      ...(input.citations?.length ? { citations: input.citations.map((c) => ({ ...c })) } : {}),
      ...(input.images?.length ? { images: [...input.images] } : {}),
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
    if (patch.reasoningMs !== undefined) message.reasoningMs = patch.reasoningMs;
    if (patch.stopped !== undefined) message.stopped = patch.stopped;
    if (patch.stoppedBy !== undefined) message.stoppedBy = patch.stoppedBy;
    if (patch.usage !== undefined) message.usage = { ...patch.usage };
    if (patch.images !== undefined) {
      if (patch.images.length) message.images = [...patch.images];
      else delete message.images;
    }
    if (patch.citations !== undefined) {
      if (patch.citations.length) message.citations = patch.citations.map((c) => ({ ...c }));
      else delete message.citations;
    }
  }

  async deleteMessagesFrom(chatId: string, messageId: string): Promise<number> {
    const list = this.messages.get(chatId);
    if (!list) return 0;
    const at = list.findIndex((m) => m.id === messageId);
    if (at < 0) return 0;
    const removed = list.length - at;
    list.splice(at);
    const chat = this.chats.get(chatId);
    if (chat?.summaryUpTo && !list.some((m) => m.id === chat.summaryUpTo)) {
      delete chat.summary;
      delete chat.summaryUpTo;
    }
    return removed;
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

  // Library

  async listFolders(): Promise<Folder[]> {
    return [...this.folders.values()].sort((a, b) => a.name.localeCompare(b.name)).map((f) => ({ ...f }));
  }

  async createFolder(name: string): Promise<Folder> {
    const folder: Folder = { id: this.id(), name: name.trim(), createdAt: this.now() };
    this.folders.set(folder.id, folder);
    return { ...folder };
  }

  async renameFolder(id: string, name: string): Promise<void> {
    const folder = this.folders.get(id);
    if (folder) folder.name = name.trim();
  }

  async deleteFolder(id: string): Promise<void> {
    this.folders.delete(id);
    for (const chat of this.chats.values()) if (chat.folderId === id) delete chat.folderId;
  }

  async listPersonas(): Promise<Persona[]> {
    return [...this.personas.values()].sort((a, b) => a.createdAt - b.createdAt).map((p) => ({ ...p }));
  }

  async savePersona(input: PersonaInput): Promise<Persona> {
    const t = this.now();
    const existing = input.id ? this.personas.get(input.id) : undefined;
    const persona: Persona = {
      id: existing?.id ?? input.id ?? this.id(),
      name: input.name.trim(),
      icon: input.icon,
      systemPrompt: input.systemPrompt,
      builtIn: false,
      createdAt: existing?.createdAt ?? t,
      updatedAt: t,
      ...(input.defaultModelId ? { defaultModelId: input.defaultModelId } : {}),
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      ...(input.disclaimer ? { disclaimer: input.disclaimer } : {}),
    };
    this.personas.set(persona.id, persona);
    return { ...persona };
  }

  async deletePersona(id: string): Promise<void> {
    this.personas.delete(id);
    for (const chat of this.chats.values()) if (chat.personaId === id) delete chat.personaId;
    for (const fact of this.memory.values()) if (fact.personaId === id) delete fact.personaId;
  }

  async listMemory(): Promise<MemoryFact[]> {
    return [...this.memory.values()].sort((a, b) => a.createdAt - b.createdAt).map((f) => ({ ...f }));
  }

  async addMemory(input: MemoryFactInput): Promise<MemoryFact> {
    const fact: MemoryFact = {
      id: this.id(),
      content: input.content.trim(),
      enabled: input.enabled ?? true,
      createdAt: this.now(),
      ...(input.sourceChatId ? { sourceChatId: input.sourceChatId } : {}),
      ...(input.personaId ? { personaId: input.personaId } : {}),
    };
    this.memory.set(fact.id, fact);
    return { ...fact };
  }

  async updateMemory(id: string, patch: MemoryFactPatch): Promise<void> {
    const fact = this.memory.get(id);
    if (!fact) return;
    if (patch.content !== undefined) fact.content = patch.content.trim();
    if (patch.enabled !== undefined) fact.enabled = patch.enabled;
    if (patch.personaId !== undefined) {
      if (patch.personaId) fact.personaId = patch.personaId;
      else delete fact.personaId;
    }
  }

  async deleteMemory(id: string): Promise<void> {
    this.memory.delete(id);
  }

  async clearMemory(): Promise<void> {
    this.memory.clear();
  }

  async getSetting(key: string): Promise<string | undefined> {
    return this.settings.get(key);
  }

  async setSetting(key: string, value: string): Promise<void> {
    this.settings.set(key, value);
  }

  async saveReport(input: ReportInput): Promise<Report> {
    const report: Report = { ...input, id: this.id(), createdAt: this.now() };
    this.reports.set(report.id, report);
    return { ...report };
  }

  async listReports(): Promise<Report[]> {
    return [...this.reports.values()].sort((a, b) => b.createdAt - a.createdAt).map((r) => ({ ...r }));
  }

  async deleteReport(id: string): Promise<void> {
    this.reports.delete(id);
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
