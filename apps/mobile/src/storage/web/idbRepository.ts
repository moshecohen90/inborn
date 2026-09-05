import {
  SEARCH_LIMIT,
  matchesTerms,
  newId,
  searchTerms,
  snippetAround,
  sortChats,
  type Chat,
  type ChatMessage,
  type ChatRepository,
  type MessagePatch,
  type NewChat,
  type NewMessage,
  type SearchHit,
} from "@inborn/core";

export const IDB_NAME = "inborn";
const IDB_VERSION = 1;
const CHATS = "chats";
const MESSAGES = "messages";

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

function upgrade(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(CHATS)) db.createObjectStore(CHATS, { keyPath: "id" });
  if (!db.objectStoreNames.contains(MESSAGES)) {
    const messages = db.createObjectStore(MESSAGES, { keyPath: "seq", autoIncrement: true });
    messages.createIndex("byChat", "chatId", { unique: false });
    messages.createIndex("byId", "id", { unique: true });
  }
}

export function openIdb(name = IDB_NAME, factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = factory.open(name, IDB_VERSION);
    r.onupgradeneeded = () => upgrade(r.result);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("IndexedDB open failed"));
    r.onblocked = () => reject(new Error("IndexedDB open blocked by another tab"));
  });
}

const stripSeq = ({ seq: _seq, ...m }: MessageRow): ChatMessage => ({ ...m, ...(m.usage ? { usage: { ...m.usage } } : {}) });
const bySeq = (a: MessageRow, b: MessageRow) => a.createdAt - b.createdAt || (a.seq ?? 0) - (b.seq ?? 0);

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

  async listChats(): Promise<Chat[]> {
    const tx = this.db.transaction(CHATS, "readonly");
    return sortChats(await request(tx.objectStore(CHATS).getAll() as IDBRequest<Chat[]>));
  }

  async getChat(id: string): Promise<Chat | undefined> {
    const tx = this.db.transaction(CHATS, "readonly");
    return (await request(tx.objectStore(CHATS).get(id) as IDBRequest<Chat | undefined>)) ?? undefined;
  }

  async createChat(input: NewChat): Promise<Chat> {
    if (input.incognito) throw new Error("incognito chats are RAM-only and never written to disk");
    const t = this.now();
    const chat: Chat = {
      id: this.id(),
      title: (input.title ?? "").trim(),
      createdAt: t,
      updatedAt: t,
      modelId: input.modelId,
      incognito: false,
      ...(input.personaId ? { personaId: input.personaId } : {}),
      ...(input.pinned ? { pinned: true } : {}),
      ...(input.folderId ? { folderId: input.folderId } : {}),
    };
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

  async deleteChat(id: string): Promise<void> {
    const tx = this.db.transaction([CHATS, MESSAGES], "readwrite");
    tx.objectStore(CHATS).delete(id);
    const index = tx.objectStore(MESSAGES).index("byChat");
    const keys = await request(index.getAllKeys(id));
    for (const key of keys) tx.objectStore(MESSAGES).delete(key);
    await done(tx);
  }

  async listMessages(chatId: string): Promise<ChatMessage[]> {
    const tx = this.db.transaction(MESSAGES, "readonly");
    const rows = await request(tx.objectStore(MESSAGES).index("byChat").getAll(chatId) as IDBRequest<MessageRow[]>);
    return rows.sort(bySeq).map(stripSeq);
  }

  async appendMessage(input: NewMessage): Promise<ChatMessage> {
    const now = this.now();
    const message: ChatMessage = {
      id: this.id(),
      chatId: input.chatId,
      role: input.role,
      content: input.content,
      createdAt: now,
      ...(input.reasoning !== undefined ? { reasoning: input.reasoning } : {}),
      ...(input.modelId ? { modelId: input.modelId } : {}),
      ...(input.stopped ? { stopped: true } : {}),
      ...(input.usage ? { usage: { ...input.usage } } : {}),
    };
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
    return { ...message, ...(message.usage ? { usage: { ...message.usage } } : {}) };
  }

  async updateMessage(chatId: string, messageId: string, patch: MessagePatch): Promise<void> {
    const tx = this.db.transaction(MESSAGES, "readwrite");
    const store = tx.objectStore(MESSAGES);
    const row = (await request(store.index("byId").get(messageId) as IDBRequest<MessageRow | undefined>)) ?? undefined;
    if (!row || row.chatId !== chatId) throw new Error(`unknown message ${messageId} in chat ${chatId}`);
    const next: MessageRow = { ...row };
    if (patch.content !== undefined) next.content = patch.content;
    if (patch.reasoning !== undefined) next.reasoning = patch.reasoning;
    if (patch.stopped !== undefined) next.stopped = patch.stopped;
    if (patch.usage !== undefined) next.usage = { ...patch.usage };
    store.put(next);
    await done(tx);
  }

  async search(query: string): Promise<SearchHit[]> {
    const terms = searchTerms(query);
    if (!terms.length) return [];
    const hits: SearchHit[] = [];
    const chats = await this.listChats();
    const tx = this.db.transaction(MESSAGES, "readonly");
    const index = tx.objectStore(MESSAGES).index("byChat");
    for (const chat of chats) {
      if (matchesTerms(chat.title, terms)) hits.push({ chatId: chat.id, title: chat.title, snippet: chat.title });
      const rows = (await request(index.getAll(chat.id) as IDBRequest<MessageRow[]>)).sort(bySeq);
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
