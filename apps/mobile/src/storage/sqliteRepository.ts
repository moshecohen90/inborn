import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import {
  SEARCH_LIMIT,
  matchesTerms,
  searchTerms,
  snippetAround,
  type Chat,
  type ChatMessage,
  type ChatRepository,
  type MessagePatch,
  type NewChat,
  type NewMessage,
  type SearchHit,
  type Usage,
} from "@inborn/core";
import { DB_NAME, FTS_SQL, SCHEMA_SQL, SQL, ftsQuery } from "./schema";

const KEY_ITEM = "inborn.db.key";
const KEY_OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

type ChatRow = {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  model_id: string;
  persona_id: string | null;
  pinned: number;
  folder_id: string | null;
};

type MessageRow = {
  id: string;
  chat_id: string;
  role: ChatMessage["role"];
  content: string;
  reasoning: string | null;
  model_id: string | null;
  created_at: number;
  stopped: number;
  usage_json: string | null;
};

type SearchRow = { chat_id: string; id: string; content: string };

/** Random 256-bit raw key, generated once and kept in the Keychain / Android Keystore (spec §5.3). */
export async function databaseKeyHex(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_ITEM, KEY_OPTIONS);
  if (existing) return existing;
  const bytes = await Crypto.getRandomBytesAsync(32);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  await SecureStore.setItemAsync(KEY_ITEM, hex, KEY_OPTIONS);
  return hex;
}

async function openKeyed(keyHex: string): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  try {
    await db.execAsync(`PRAGMA key = "x'${keyHex}'";`);
    await db.getFirstAsync("SELECT count(*) AS n FROM sqlite_master");
    return db;
  } catch (e) {
    await db.closeAsync().catch(() => undefined);
    throw e;
  }
}

const toChat = (r: ChatRow): Chat => ({
  id: r.id,
  title: r.title,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  modelId: r.model_id,
  incognito: false,
  ...(r.persona_id ? { personaId: r.persona_id } : {}),
  ...(r.pinned ? { pinned: true } : {}),
  ...(r.folder_id ? { folderId: r.folder_id } : {}),
});

const toMessage = (r: MessageRow): ChatMessage => ({
  id: r.id,
  chatId: r.chat_id,
  role: r.role,
  content: r.content,
  createdAt: r.created_at,
  ...(r.reasoning !== null ? { reasoning: r.reasoning } : {}),
  ...(r.model_id ? { modelId: r.model_id } : {}),
  ...(r.stopped ? { stopped: true } : {}),
  ...(r.usage_json ? { usage: JSON.parse(r.usage_json) as Usage } : {}),
});

/** SQLCipher-encrypted chats (expo-sqlite with `useSQLCipher`). Refuses incognito rows outright. */
export class SqliteChatRepository implements ChatRepository {
  private constructor(
    private readonly db: SQLite.SQLiteDatabase,
    readonly fts: boolean,
  ) {}

  static async open(): Promise<SqliteChatRepository> {
    const key = await databaseKeyHex();
    let db: SQLite.SQLiteDatabase;
    try {
      db = await openKeyed(key);
    } catch (e) {
      // A file the current key cannot open is unreadable forever; start fresh rather than never saving again.
      if (!/not a database/i.test(String(e))) throw e;
      await SQLite.deleteDatabaseAsync(DB_NAME);
      db = await openKeyed(key);
    }
    await db.execAsync(SCHEMA_SQL);
    let fts = true;
    try {
      await db.execAsync(FTS_SQL);
    } catch {
      fts = false;
    }
    return new SqliteChatRepository(db, fts);
  }

  async listChats(): Promise<Chat[]> {
    return (await this.db.getAllAsync<ChatRow>(SQL.listChats)).map(toChat);
  }

  async getChat(id: string): Promise<Chat | undefined> {
    const row = await this.db.getFirstAsync<ChatRow>(SQL.getChat, id);
    return row ? toChat(row) : undefined;
  }

  async createChat(input: NewChat): Promise<Chat> {
    if (input.incognito) throw new Error("incognito chats are RAM-only and never written to disk");
    const now = Date.now();
    const chat: Chat = {
      id: Crypto.randomUUID(),
      title: (input.title ?? "").trim(),
      createdAt: now,
      updatedAt: now,
      modelId: input.modelId,
      incognito: false,
      ...(input.personaId ? { personaId: input.personaId } : {}),
      ...(input.pinned ? { pinned: true } : {}),
      ...(input.folderId ? { folderId: input.folderId } : {}),
    };
    await this.db.runAsync(SQL.insertChat, chat.id, chat.title, now, now, chat.modelId, input.personaId ?? null, input.pinned ? 1 : 0, input.folderId ?? null);
    return chat;
  }

  async renameChat(id: string, title: string): Promise<void> {
    await this.db.runAsync(SQL.renameChat, title.trim(), id);
  }

  async deleteChat(id: string): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(SQL.deleteMessagesOfChat, id);
      await this.db.runAsync(SQL.deleteChat, id);
    });
  }

  async listMessages(chatId: string): Promise<ChatMessage[]> {
    return (await this.db.getAllAsync<MessageRow>(SQL.listMessages, chatId)).map(toMessage);
  }

  async appendMessage(input: NewMessage): Promise<ChatMessage> {
    const now = Date.now();
    const message: ChatMessage = {
      id: Crypto.randomUUID(),
      chatId: input.chatId,
      role: input.role,
      content: input.content,
      createdAt: now,
      ...(input.reasoning !== undefined ? { reasoning: input.reasoning } : {}),
      ...(input.modelId ? { modelId: input.modelId } : {}),
      ...(input.stopped ? { stopped: true } : {}),
      ...(input.usage ? { usage: { ...input.usage } } : {}),
    };
    await this.db.withTransactionAsync(async () => {
      const touched = await this.db.runAsync(SQL.touchChat, now, input.chatId);
      if (touched.changes === 0) throw new Error(`unknown chat ${input.chatId}`);
      await this.db.runAsync(
        SQL.insertMessage,
        message.id,
        message.chatId,
        message.role,
        message.content,
        input.reasoning ?? null,
        input.modelId ?? null,
        now,
        input.stopped ? 1 : 0,
        input.usage ? JSON.stringify(input.usage) : null,
      );
    });
    return message;
  }

  async updateMessage(chatId: string, messageId: string, patch: MessagePatch): Promise<void> {
    const columns: [string, SQLite.SQLiteBindValue][] = [];
    if (patch.content !== undefined) columns.push(["content", patch.content]);
    if (patch.reasoning !== undefined) columns.push(["reasoning", patch.reasoning]);
    if (patch.stopped !== undefined) columns.push(["stopped", patch.stopped ? 1 : 0]);
    if (patch.usage !== undefined) columns.push(["usage_json", JSON.stringify(patch.usage)]);
    if (!columns.length) return;
    const sets = columns.map(([name]) => `${name} = ?`).join(", ");
    await this.db.runAsync(`UPDATE messages SET ${sets} WHERE id = ? AND chat_id = ?`, [...columns.map(([, v]) => v), messageId, chatId]);
  }

  async search(query: string): Promise<SearchHit[]> {
    const terms = searchTerms(query);
    const first = terms[0];
    if (!first) return [];
    const chats = await this.listChats();
    const titles = new Map(chats.map((c) => [c.id, c.title]));
    const hits: SearchHit[] = chats.filter((c) => matchesTerms(c.title, terms)).map((c) => ({ chatId: c.id, title: c.title, snippet: c.title }));
    const rows = this.fts
      ? await this.db.getAllAsync<SearchRow>(SQL.searchFts, ftsQuery(terms), SEARCH_LIMIT)
      : (await this.db.getAllAsync<SearchRow>(SQL.searchLike, `%${first}%`, SEARCH_LIMIT * 4)).filter((r) => matchesTerms(r.content, terms));
    for (const r of rows) hits.push({ chatId: r.chat_id, title: titles.get(r.chat_id) ?? "", messageId: r.id, snippet: snippetAround(r.content, terms) });
    return hits.slice(0, SEARCH_LIMIT);
  }

  close(): Promise<void> {
    return this.db.closeAsync();
  }
}
