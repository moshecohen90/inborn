import {
  SEARCH_LIMIT,
  matchesTerms,
  newId,
  searchTerms,
  snippetAround,
  sortChats,
  type Chat,
  type ChatMessage,
  type ChatPatch,
  type ChatRepository,
  type MessagePatch,
  type NewChat,
  type NewMessage,
  type SearchHit,
} from "@inborn/core";

export const IDB_NAME = "inborn";
/** v1: chats + messages (byChat, byId). v2: `byChatSeq` on messages for ordered reads and tail deletes; chat rows gained the §5.3 fields. */
export const IDB_VERSION = 2;
const CHATS = "chats";
const MESSAGES = "messages";
const BY_CHAT = "byChat";
const BY_ID = "byId";
const BY_CHAT_SEQ = "byChatSeq";

/** Stored message row: `seq` keeps insertion order for equal timestamps, like the SQLite AUTOINCREMENT column. */
type MessageRow = ChatMessage & { seq?: number };

const request = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("IndexedDB request failed"));
  });

const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });

function upgrade(db: IDBDatabase, tx: IDBTransaction): void {
  if (!db.objectStoreNames.contains(CHATS)) db.createObjectStore(CHATS, { keyPath: "id" });
  const messages = db.objectStoreNames.contains(MESSAGES) ? tx.objectStore(MESSAGES) : db.createObjectStore(MESSAGES, { keyPath: "seq", autoIncrement: true });
  if (!messages.indexNames.contains(BY_CHAT)) messages.createIndex(BY_CHAT, "chatId", { unique: false });
  if (!messages.indexNames.contains(BY_ID)) messages.createIndex(BY_ID, "id", { unique: true });
  if (!messages.indexNames.contains(BY_CHAT_SEQ)) messages.createIndex(BY_CHAT_SEQ, ["chatId", "seq"], { unique: true });
}

export function openIdb(name = IDB_NAME, factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = factory.open(name, IDB_VERSION);
    r.onupgradeneeded = () => upgrade(r.result, r.transaction!);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("IndexedDB open failed"));
    r.onblocked = () => reject(new Error("IndexedDB open blocked by another tab"));
  });
}

const chatRange = (chatId: string, fromSeq = -Infinity) => IDBKeyRange.bound([chatId, fromSeq], [chatId, Infinity]);
const bySeq = (a: MessageRow, b: MessageRow) => a.createdAt - b.createdAt || (a.seq ?? 0) - (b.seq ?? 0);

const OPTIONAL_CHAT = ["personaId", "pinned", "archived", "folderId", "systemPrompt", "thinking", "summary", "summaryUpTo"] as const;
const OPTIONAL_MESSAGE = ["reasoning", "reasoningMs", "modelId", "stopped", "stoppedBy", "usage"] as const;

/** Rows come back without `undefined` keys or stale flags, matching the SQL repositories' `toChat`. */
function toChat(row: Chat): Chat {
  const chat: Chat = { id: row.id, title: row.title, createdAt: row.createdAt, updatedAt: row.updatedAt, modelId: row.modelId, incognito: false };
  for (const key of OPTIONAL_CHAT) {
    const v = row[key];
    // `thinking` is tri-state (undefined = engine default), so false stays; the two flags read as absent when off.
    if (v === undefined || v === null || v === "" || (v === false && key !== "thinking")) continue;
    Object.assign(chat, { [key]: v });
  }
  return chat;
}

function toMessage(row: MessageRow): ChatMessage {
  const message: ChatMessage = { id: row.id, chatId: row.chatId, role: row.role, content: row.content, createdAt: row.createdAt };
  for (const key of OPTIONAL_MESSAGE) {
    const v = row[key];
    if (v === undefined || v === null || v === false) continue;
    Object.assign(message, { [key]: key === "usage" ? { ...(v as ChatMessage["usage"]) } : v });
  }
  return message;
}

function applyChatPatch(chat: Chat, patch: ChatPatch): Chat {
  const next: Chat = { ...chat };
  if (patch.title !== undefined) next.title = patch.title.trim();
  if (patch.pinned !== undefined) next.pinned = patch.pinned;
  if (patch.archived !== undefined) next.archived = patch.archived;
  if (patch.modelId !== undefined) next.modelId = patch.modelId;
  if (patch.thinking !== undefined) next.thinking = patch.thinking;
  for (const key of ["folderId", "personaId", "systemPrompt", "summary", "summaryUpTo"] as const) {
    const v = patch[key];
    if (v === undefined) continue;
    if (v === null) delete next[key];
    else next[key] = v;
  }
  return toChat(next);
}

export interface IdbOptions {
  now?: () => number;
  newId?: () => string;
}

/**
 * Web chats in IndexedDB (spec §5.3 "OPFS/IndexedDB on web"). No SQLCipher here: the rows sit in the browser
 * profile in clear, guarded only by the profile itself; the `webStorageNotice` string says so to the user.
 * Never stores an incognito chat.
 */
export class IdbChatRepository implements ChatRepository {
  private readonly now: () => number;
  private readonly id: () => string;

  private constructor(
    private readonly db: IDBDatabase,
    options: IdbOptions,
  ) {
    this.now = options.now ?? Date.now;
    this.id = options.newId ?? newId;
  }

  static async open(options: IdbOptions & { name?: string; factory?: IDBFactory } = {}): Promise<IdbChatRepository> {
    return new IdbChatRepository(await openIdb(options.name, options.factory), options);
  }

  get version(): number {
    return this.db.version;
  }

  async listChats(): Promise<Chat[]> {
    const tx = this.db.transaction(CHATS, "readonly");
    return sortChats((await request(tx.objectStore(CHATS).getAll() as IDBRequest<Chat[]>)).map(toChat));
  }

  async getChat(id: string): Promise<Chat | undefined> {
    const tx = this.db.transaction(CHATS, "readonly");
    const row = (await request(tx.objectStore(CHATS).get(id) as IDBRequest<Chat | undefined>)) ?? undefined;
    return row ? toChat(row) : undefined;
  }

  async createChat(input: NewChat): Promise<Chat> {
    if (input.incognito) throw new Error("incognito chats are RAM-only and never written to disk");
    const t = this.now();
    const chat = toChat({
      id: this.id(),
      title: (input.title ?? "").trim(),
      createdAt: t,
      updatedAt: t,
      modelId: input.modelId,
      incognito: false,
      ...(input.personaId ? { personaId: input.personaId } : {}),
      ...(input.pinned ? { pinned: true } : {}),
      ...(input.folderId ? { folderId: input.folderId } : {}),
      ...(input.systemPrompt ? { systemPrompt: input.systemPrompt } : {}),
      ...(input.thinking !== undefined ? { thinking: input.thinking } : {}),
    });
    const tx = this.db.transaction(CHATS, "readwrite");
    tx.objectStore(CHATS).add(chat);
    await done(tx);
    return { ...chat };
  }

  async renameChat(id: string, title: string): Promise<void> {
    const tx = this.db.transaction(CHATS, "readwrite");
    const store = tx.objectStore(CHATS);
    const chat = (await request(store.get(id) as IDBRequest<Chat | undefined>)) ?? undefined;
    if (!chat) throw new Error(`unknown chat ${id}`);
    store.put({ ...chat, title: title.trim() });
    await done(tx);
  }

  async updateChat(id: string, patch: ChatPatch): Promise<void> {
    const tx = this.db.transaction(CHATS, "readwrite");
    const store = tx.objectStore(CHATS);
    const chat = (await request(store.get(id) as IDBRequest<Chat | undefined>)) ?? undefined;
    if (chat) store.put(applyChatPatch(chat, patch));
    await done(tx);
  }

  async deleteChat(id: string): Promise<void> {
    await this.deleteChats([id]);
  }

  async deleteChats(ids: string[]): Promise<void> {
    if (!ids.length) return;
    const tx = this.db.transaction([CHATS, MESSAGES], "readwrite");
    const messages = tx.objectStore(MESSAGES);
    for (const id of ids) {
      tx.objectStore(CHATS).delete(id);
      const keys = await request(messages.index(BY_CHAT).getAllKeys(id));
      for (const key of keys) messages.delete(key);
    }
    await done(tx);
  }

  async listMessages(chatId: string): Promise<ChatMessage[]> {
    const tx = this.db.transaction(MESSAGES, "readonly");
    const rows = await request(tx.objectStore(MESSAGES).index(BY_CHAT_SEQ).getAll(chatRange(chatId)) as IDBRequest<MessageRow[]>);
    return rows.sort(bySeq).map(toMessage);
  }

  async appendMessage(input: NewMessage): Promise<ChatMessage> {
    const now = this.now();
    const message = toMessage({
      id: this.id(),
      chatId: input.chatId,
      role: input.role,
      content: input.content,
      createdAt: now,
      ...(input.reasoning !== undefined ? { reasoning: input.reasoning } : {}),
      ...(input.reasoningMs !== undefined ? { reasoningMs: input.reasoningMs } : {}),
      ...(input.modelId ? { modelId: input.modelId } : {}),
      ...(input.stopped ? { stopped: true } : {}),
      ...(input.stoppedBy ? { stoppedBy: input.stoppedBy } : {}),
      ...(input.usage ? { usage: { ...input.usage } } : {}),
    });
    const tx = this.db.transaction([CHATS, MESSAGES], "readwrite");
    const chats = tx.objectStore(CHATS);
    const chat = (await request(chats.get(input.chatId) as IDBRequest<Chat | undefined>)) ?? undefined;
    if (!chat) {
      tx.abort();
      throw new Error(`unknown chat ${input.chatId}`);
    }
    chats.put({ ...chat, updatedAt: now });
    tx.objectStore(MESSAGES).add(message);
    await done(tx);
    return toMessage(message);
  }

  async updateMessage(chatId: string, messageId: string, patch: MessagePatch): Promise<void> {
    const tx = this.db.transaction(MESSAGES, "readwrite");
    const store = tx.objectStore(MESSAGES);
    const row = (await request(store.index(BY_ID).get(messageId) as IDBRequest<MessageRow | undefined>)) ?? undefined;
    if (!row || row.chatId !== chatId) throw new Error(`unknown message ${messageId} in chat ${chatId}`);
    const next: MessageRow = { ...row };
    if (patch.content !== undefined) next.content = patch.content;
    if (patch.reasoning !== undefined) next.reasoning = patch.reasoning;
    if (patch.reasoningMs !== undefined) next.reasoningMs = patch.reasoningMs;
    if (patch.stopped !== undefined) next.stopped = patch.stopped;
    if (patch.stoppedBy !== undefined) next.stoppedBy = patch.stoppedBy;
    if (patch.usage !== undefined) next.usage = { ...patch.usage };
    store.put(next);
    await done(tx);
  }

  async deleteMessagesFrom(chatId: string, messageId: string): Promise<number> {
    const tx = this.db.transaction([CHATS, MESSAGES], "readwrite");
    const messages = tx.objectStore(MESSAGES);
    const row = (await request(messages.index(BY_ID).get(messageId) as IDBRequest<MessageRow | undefined>)) ?? undefined;
    if (!row || row.chatId !== chatId || row.seq === undefined) {
      await done(tx);
      return 0;
    }
    const keys = await request(messages.index(BY_CHAT_SEQ).getAllKeys(chatRange(chatId, row.seq)));
    for (const key of keys) messages.delete(key);
    const chats = tx.objectStore(CHATS);
    const chat = (await request(chats.get(chatId) as IDBRequest<Chat | undefined>)) ?? undefined;
    if (chat?.summaryUpTo) {
      const anchor = (await request(messages.index(BY_ID).get(chat.summaryUpTo) as IDBRequest<MessageRow | undefined>)) ?? undefined;
      if (!anchor || anchor.chatId !== chatId) chats.put(applyChatPatch(chat, { summary: null, summaryUpTo: null }));
    }
    await done(tx);
    return keys.length;
  }

  async search(query: string): Promise<SearchHit[]> {
    const terms = searchTerms(query);
    if (!terms.length) return [];
    const hits: SearchHit[] = [];
    const chats = await this.listChats();
    const tx = this.db.transaction(MESSAGES, "readonly");
    const index = tx.objectStore(MESSAGES).index(BY_CHAT_SEQ);
    for (const chat of chats) {
      if (matchesTerms(chat.title, terms)) hits.push({ chatId: chat.id, title: chat.title, snippet: chat.title });
      const rows = (await request(index.getAll(chatRange(chat.id)) as IDBRequest<MessageRow[]>)).sort(bySeq);
      for (const m of rows) {
        if (matchesTerms(m.content, terms)) hits.push({ chatId: chat.id, title: chat.title, messageId: m.id, snippet: snippetAround(m.content, terms) });
      }
      if (hits.length >= SEARCH_LIMIT) break;
    }
    return hits.slice(0, SEARCH_LIMIT);
  }

  close(): void {
    this.db.close();
  }
}
