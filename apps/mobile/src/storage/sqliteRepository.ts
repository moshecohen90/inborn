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
  type Citation,
  type ChatPatch,
  type ChatRepository,
  type Folder,
  type LibraryRepository,
  type MemoryFact,
  type MemoryFactInput,
  type MemoryFactPatch,
  type MessagePatch,
  type NewChat,
  type NewMessage,
  type Persona,
  type PersonaIcon,
  type PersonaInput,
  type Report,
  type ReportInput,
  type ReportReason,
  type SearchHit,
  type StoppedBy,
  type Usage,
} from "@inborn/core";
import { SECURE_ITEMS } from "./secureItems";
import { DB_NAME, FTS_SQL, MIGRATIONS, PRAGMAS_SQL, SQL, ftsQuery, inList } from "./schema";

const KEY_ITEM = SECURE_ITEMS.dbKey;
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
  archived: number;
  system_prompt: string | null;
  thinking: number | null;
  summary: string | null;
  summary_up_to: string | null;
};

type MessageRow = {
  id: string;
  chat_id: string;
  role: ChatMessage["role"];
  content: string;
  reasoning: string | null;
  reasoning_ms: number | null;
  model_id: string | null;
  created_at: number;
  stopped: number;
  stopped_by: StoppedBy | null;
  usage_json: string | null;
  citations_json: string | null;
  images_json: string | null;
};

type SearchRow = { chat_id: string; id: string; content: string };
type FolderRow = { id: string; name: string; created_at: number };
type PersonaRow = { id: string; name: string; icon: PersonaIcon; system_prompt: string; default_model_id: string | null; temperature: number | null; disclaimer: string | null; created_at: number; updated_at: number };
type MemoryRow = { id: string; content: string; source_chat_id: string | null; persona_id: string | null; enabled: number; created_at: number };
type ReportRow = { id: string; reason: ReportReason; note: string; chat_id: string | null; message_id: string | null; message_text: string | null; model_id: string | null; created_at: number };

/** Random 256-bit raw key, generated once and kept in the Keychain / Android Keystore (spec §5.3). */
export async function databaseKeyHex(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_ITEM, KEY_OPTIONS);
  if (existing) return existing;
  const bytes = await Crypto.getRandomBytesAsync(32);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  await SecureStore.setItemAsync(KEY_ITEM, hex, KEY_OPTIONS);
  return hex;
}

/** Message plus the cause chain: expo-sqlite wraps the SQLite text one level down. */
function describe(e: unknown): string {
  const parts: string[] = [];
  for (let cur: unknown = e, i = 0; cur && i < 5; cur = (cur as { cause?: unknown }).cause, i++) parts.push(cur instanceof Error ? cur.message : String(cur));
  return parts.join(" | ");
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

/** Runs every migration newer than the file's user_version, each in its own transaction (§10.3 #22: atomic). */
export async function migrate(db: SQLite.SQLiteDatabase): Promise<number> {
  await db.execAsync(PRAGMAS_SQL);
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  let current = row?.user_version ?? 0;
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    // Same connection on purpose: an exclusive transaction opens a second handle that has no SQLCipher key.
    await db.withTransactionAsync(async () => {
      await db.execAsync(m.sql);
      await db.execAsync(`PRAGMA user_version = ${m.version}`);
    });
    current = m.version;
  }
  return current;
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
  ...(r.archived ? { archived: true } : {}),
  ...(r.folder_id ? { folderId: r.folder_id } : {}),
  ...(r.system_prompt ? { systemPrompt: r.system_prompt } : {}),
  ...(r.thinking !== null && r.thinking !== undefined ? { thinking: !!r.thinking } : {}),
  ...(r.summary ? { summary: r.summary } : {}),
  ...(r.summary_up_to ? { summaryUpTo: r.summary_up_to } : {}),
});

const toMessage = (r: MessageRow): ChatMessage => ({
  id: r.id,
  chatId: r.chat_id,
  role: r.role,
  content: r.content,
  createdAt: r.created_at,
  ...(r.reasoning !== null ? { reasoning: r.reasoning } : {}),
  ...(r.reasoning_ms !== null ? { reasoningMs: r.reasoning_ms } : {}),
  ...(r.model_id ? { modelId: r.model_id } : {}),
  ...(r.stopped ? { stopped: true } : {}),
  ...(r.stopped_by ? { stoppedBy: r.stopped_by } : {}),
  ...(r.usage_json ? { usage: JSON.parse(r.usage_json) as Usage } : {}),
  ...(r.citations_json ? { citations: JSON.parse(r.citations_json) as Citation[] } : {}),
  ...(r.images_json ? { images: JSON.parse(r.images_json) as string[] } : {}),
});

const toFolder = (r: FolderRow): Folder => ({ id: r.id, name: r.name, createdAt: r.created_at });

const toPersona = (r: PersonaRow): Persona => ({
  id: r.id,
  name: r.name,
  icon: r.icon,
  systemPrompt: r.system_prompt,
  builtIn: false,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  ...(r.default_model_id ? { defaultModelId: r.default_model_id } : {}),
  ...(r.temperature !== null ? { temperature: r.temperature } : {}),
  ...(r.disclaimer ? { disclaimer: r.disclaimer } : {}),
});

const toMemory = (r: MemoryRow): MemoryFact => ({
  id: r.id,
  content: r.content,
  enabled: !!r.enabled,
  createdAt: r.created_at,
  ...(r.source_chat_id ? { sourceChatId: r.source_chat_id } : {}),
  ...(r.persona_id ? { personaId: r.persona_id } : {}),
});

const toReport = (r: ReportRow): Report => ({
  id: r.id,
  reason: r.reason,
  note: r.note,
  createdAt: r.created_at,
  ...(r.chat_id ? { chatId: r.chat_id } : {}),
  ...(r.message_id ? { messageId: r.message_id } : {}),
  ...(r.message_text ? { messageText: r.message_text } : {}),
  ...(r.model_id ? { modelId: r.model_id } : {}),
});

/** SQLCipher-encrypted chats + library (expo-sqlite with `useSQLCipher`). Refuses incognito rows outright. */
export class SqliteChatRepository implements ChatRepository, LibraryRepository {
  private constructor(
    private readonly db: SQLite.SQLiteDatabase,
    readonly fts: boolean,
    readonly schemaVersion: number,
  ) {}

  static async open(): Promise<SqliteChatRepository> {
    const key = await databaseKeyHex();
    let db: SQLite.SQLiteDatabase;
    try {
      db = await openKeyed(key);
    } catch (e) {
      // A file the current key cannot open is unreadable forever; start fresh rather than never saving again.
      if (!/not a database/i.test(describe(e))) throw e;
      await SQLite.deleteDatabaseAsync(DB_NAME);
      db = await openKeyed(key);
    }
    const version = await migrate(db);
    let fts = true;
    try {
      await db.execAsync(FTS_SQL);
    } catch {
      fts = false;
    }
    return new SqliteChatRepository(db, fts, version);
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
      ...(input.systemPrompt ? { systemPrompt: input.systemPrompt } : {}),
      ...(input.thinking !== undefined ? { thinking: input.thinking } : {}),
    };
    await this.db.runAsync(
      SQL.insertChat,
      chat.id,
      chat.title,
      now,
      now,
      chat.modelId,
      input.personaId ?? null,
      input.pinned ? 1 : 0,
      input.folderId ?? null,
      input.systemPrompt ?? null,
      input.thinking === undefined ? null : input.thinking ? 1 : 0,
    );
    return chat;
  }

  async renameChat(id: string, title: string): Promise<void> {
    await this.db.runAsync(SQL.renameChat, title.trim(), id);
  }

  async updateChat(id: string, patch: ChatPatch): Promise<void> {
    const columns: [string, SQLite.SQLiteBindValue][] = [];
    if (patch.title !== undefined) columns.push(["title", patch.title.trim()]);
    if (patch.pinned !== undefined) columns.push(["pinned", patch.pinned ? 1 : 0]);
    if (patch.archived !== undefined) columns.push(["archived", patch.archived ? 1 : 0]);
    if (patch.modelId !== undefined) columns.push(["model_id", patch.modelId]);
    if (patch.thinking !== undefined) columns.push(["thinking", patch.thinking ? 1 : 0]);
    if (patch.folderId !== undefined) columns.push(["folder_id", patch.folderId]);
    if (patch.personaId !== undefined) columns.push(["persona_id", patch.personaId]);
    if (patch.systemPrompt !== undefined) columns.push(["system_prompt", patch.systemPrompt]);
    if (patch.summary !== undefined) columns.push(["summary", patch.summary]);
    if (patch.summaryUpTo !== undefined) columns.push(["summary_up_to", patch.summaryUpTo]);
    if (!columns.length) return;
    const sets = columns.map(([name]) => `${name} = ?`).join(", ");
    await this.db.runAsync(`UPDATE chats SET ${sets} WHERE id = ?`, [...columns.map(([, v]) => v), id]);
  }

  async deleteChat(id: string): Promise<void> {
    await this.deleteChats([id]);
  }

  async deleteChats(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(`DELETE FROM messages WHERE chat_id IN (${inList(ids.length)})`, ids);
      await this.db.runAsync(`DELETE FROM chats WHERE id IN (${inList(ids.length)})`, ids);
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
      ...(input.reasoningMs !== undefined ? { reasoningMs: input.reasoningMs } : {}),
      ...(input.modelId ? { modelId: input.modelId } : {}),
      ...(input.stopped ? { stopped: true } : {}),
      ...(input.stoppedBy ? { stoppedBy: input.stoppedBy } : {}),
      ...(input.usage ? { usage: { ...input.usage } } : {}),
      ...(input.citations?.length ? { citations: input.citations.map((c) => ({ ...c })) } : {}),
      ...(input.images?.length ? { images: [...input.images] } : {}),
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
        input.reasoningMs ?? null,
        input.modelId ?? null,
        now,
        input.stopped ? 1 : 0,
        input.stoppedBy ?? null,
        input.usage ? JSON.stringify(input.usage) : null,
        message.citations ? JSON.stringify(message.citations) : null,
        message.images ? JSON.stringify(message.images) : null,
      );
    });
    return message;
  }

  async updateMessage(chatId: string, messageId: string, patch: MessagePatch): Promise<void> {
    const columns: [string, SQLite.SQLiteBindValue][] = [];
    if (patch.content !== undefined) columns.push(["content", patch.content]);
    if (patch.reasoning !== undefined) columns.push(["reasoning", patch.reasoning]);
    if (patch.reasoningMs !== undefined) columns.push(["reasoning_ms", patch.reasoningMs]);
    if (patch.stopped !== undefined) columns.push(["stopped", patch.stopped ? 1 : 0]);
    if (patch.stoppedBy !== undefined) columns.push(["stopped_by", patch.stoppedBy]);
    if (patch.usage !== undefined) columns.push(["usage_json", JSON.stringify(patch.usage)]);
    if (patch.citations !== undefined) columns.push(["citations_json", patch.citations.length ? JSON.stringify(patch.citations) : null]);
    if (patch.images !== undefined) columns.push(["images_json", patch.images.length ? JSON.stringify(patch.images) : null]);
    if (!columns.length) return;
    const sets = columns.map(([name]) => `${name} = ?`).join(", ");
    const result = await this.db.runAsync(`UPDATE messages SET ${sets} WHERE id = ? AND chat_id = ?`, [...columns.map(([, v]) => v), messageId, chatId]);
    if (result.changes === 0) throw new Error(`unknown message ${messageId} in chat ${chatId}`);
  }

  async deleteMessagesFrom(chatId: string, messageId: string): Promise<number> {
    let removed = 0;
    await this.db.withTransactionAsync(async () => {
      const row = await this.db.getFirstAsync<{ seq: number }>(SQL.messageSeq, messageId, chatId);
      if (!row) return;
      removed = (await this.db.runAsync(SQL.deleteMessagesFromSeq, chatId, row.seq)).changes;
      const chat = await this.db.getFirstAsync<ChatRow>(SQL.getChat, chatId);
      if (chat?.summary_up_to && !(await this.db.getFirstAsync(SQL.summaryStillPresent, chatId, chat.summary_up_to))) await this.db.runAsync(SQL.clearSummary, chatId);
    });
    return removed;
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

  // Library

  async listFolders(): Promise<Folder[]> {
    return (await this.db.getAllAsync<FolderRow>(SQL.listFolders)).map(toFolder);
  }

  async createFolder(name: string): Promise<Folder> {
    const folder: Folder = { id: Crypto.randomUUID(), name: name.trim(), createdAt: Date.now() };
    await this.db.runAsync(SQL.insertFolder, folder.id, folder.name, folder.createdAt);
    return folder;
  }

  async renameFolder(id: string, name: string): Promise<void> {
    await this.db.runAsync(SQL.renameFolder, name.trim(), id);
  }

  async deleteFolder(id: string): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(SQL.unfolderChats, id);
      await this.db.runAsync(SQL.deleteFolder, id);
    });
  }

  async listPersonas(): Promise<Persona[]> {
    return (await this.db.getAllAsync<PersonaRow>(SQL.listPersonas)).map(toPersona);
  }

  async savePersona(input: PersonaInput): Promise<Persona> {
    const now = Date.now();
    const existing = input.id ? await this.db.getFirstAsync<PersonaRow>(SQL.getPersona, input.id) : null;
    const persona: Persona = {
      id: existing?.id ?? input.id ?? Crypto.randomUUID(),
      name: input.name.trim(),
      icon: input.icon,
      systemPrompt: input.systemPrompt,
      builtIn: false,
      createdAt: existing?.created_at ?? now,
      updatedAt: now,
      ...(input.defaultModelId ? { defaultModelId: input.defaultModelId } : {}),
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      ...(input.disclaimer ? { disclaimer: input.disclaimer } : {}),
    };
    await this.db.runAsync(SQL.upsertPersona, persona.id, persona.name, persona.icon, persona.systemPrompt, persona.defaultModelId ?? null, persona.temperature ?? null, persona.disclaimer ?? null, persona.createdAt, persona.updatedAt);
    return persona;
  }

  async deletePersona(id: string): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(SQL.unpersonaChats, id);
      await this.db.runAsync(SQL.unpersonaMemory, id);
      await this.db.runAsync(SQL.deletePersona, id);
    });
  }

  async listMemory(): Promise<MemoryFact[]> {
    return (await this.db.getAllAsync<MemoryRow>(SQL.listMemory)).map(toMemory);
  }

  async addMemory(input: MemoryFactInput): Promise<MemoryFact> {
    const fact: MemoryFact = {
      id: Crypto.randomUUID(),
      content: input.content.trim(),
      enabled: input.enabled ?? true,
      createdAt: Date.now(),
      ...(input.sourceChatId ? { sourceChatId: input.sourceChatId } : {}),
      ...(input.personaId ? { personaId: input.personaId } : {}),
    };
    await this.db.runAsync(SQL.insertMemory, fact.id, fact.content, fact.sourceChatId ?? null, fact.personaId ?? null, fact.enabled ? 1 : 0, fact.createdAt);
    return fact;
  }

  async updateMemory(id: string, patch: MemoryFactPatch): Promise<void> {
    const columns: [string, SQLite.SQLiteBindValue][] = [];
    if (patch.content !== undefined) columns.push(["content", patch.content.trim()]);
    if (patch.enabled !== undefined) columns.push(["enabled", patch.enabled ? 1 : 0]);
    if (patch.personaId !== undefined) columns.push(["persona_id", patch.personaId || null]);
    if (!columns.length) return;
    const sets = columns.map(([name]) => `${name} = ?`).join(", ");
    await this.db.runAsync(`UPDATE memory SET ${sets} WHERE id = ?`, [...columns.map(([, v]) => v), id]);
  }

  async deleteMemory(id: string): Promise<void> {
    await this.db.runAsync(SQL.deleteMemory, id);
  }

  async clearMemory(): Promise<void> {
    await this.db.runAsync(SQL.clearMemory);
  }

  async getSetting(key: string): Promise<string | undefined> {
    return (await this.db.getFirstAsync<{ value: string }>(SQL.getSetting, key))?.value;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.db.runAsync(SQL.setSetting, key, value);
  }

  async saveReport(input: ReportInput): Promise<Report> {
    const report: Report = { ...input, id: Crypto.randomUUID(), createdAt: Date.now() };
    await this.db.runAsync(SQL.insertReport, report.id, report.reason, report.note, report.chatId ?? null, report.messageId ?? null, report.messageText ?? null, report.modelId ?? null, report.createdAt);
    return report;
  }

  async listReports(): Promise<Report[]> {
    return (await this.db.getAllAsync<ReportRow>(SQL.listReports)).map(toReport);
  }

  async deleteReport(id: string): Promise<void> {
    await this.db.runAsync(SQL.deleteReport, id);
  }

  close(): Promise<void> {
    return this.db.closeAsync();
  }
}
