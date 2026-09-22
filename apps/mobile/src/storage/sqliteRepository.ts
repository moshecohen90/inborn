import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import {
  SEARCH_LIMIT,
  matchesTerms,
  searchExclusions,
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
  type SearchOptions,
  type StoppedBy,
  type RepairOutcome,
  type Usage,
  RAG_SCHEMA_SQL,
  isUnreadableDatabase,
  quickCheckProblems,
  salvage,
} from "@inborn/core";
import { SECURE_ITEMS } from "./secureItems";
import { deleteDatabaseFiles, promoteDatabase, quarantineDatabase, sqlDriverOf } from "./dbFile";
import { reportRepair } from "./repairNotice";
import { DB_NAME, FTS_SQL, MIGRATIONS, PRAGMAS_SQL, SQL, ftsQuery, inList } from "./schema";
import { errorChain } from "./reopen";
import { ReopeningDatabase } from "./reopeningDb";

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
  advice_snoozed: string | null;
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

const describe = errorChain;

/* Dev bundles close the chat handle underneath the repository every N ms (EXPO_PUBLIC_DEAD_DB_AFTER_MS) to drive the reopen path on an
   emulator; with EXPO_PUBLIC_DEAD_DB_MID_STATEMENT=1 each firing waits for a statement to be in flight first, so the close gate is what runs. */
const DEV_DEAD_DB_MS = __DEV__ ? Number(process.env.EXPO_PUBLIC_DEAD_DB_AFTER_MS ?? NaN) : NaN;
const DEV_DEAD_DB_MID_STATEMENT = __DEV__ && process.env.EXPO_PUBLIC_DEAD_DB_MID_STATEMENT === "1";

async function openKeyed(keyHex: string, name: string = DB_NAME): Promise<SQLite.SQLiteDatabase> {
  /* Own native connection: without it Android hands every open of this name the same cached NativeDatabase, and the GC of any
     other JS wrapper of it resets the native binding under a running statement (QA F15). Never let expo-sqlite finalize "unused"
     statements before closing: sqlite3_next_stmt also lists FTS5's internal ones, which FTS5 finalizes again inside sqlite3_close
     (the QA F18 double free). The JS gate keeps our own statements out of a close. */
  const db = await SQLite.openDatabaseAsync(name, { useNewConnection: true, finalizeUnusedStatementsBeforeClosing: false });
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
  ...(r.advice_snoozed ? { adviceSnoozed: JSON.parse(r.advice_snoozed) as string[] } : {}),
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

/** Copied parents first, so a row whose owner did not survive fails the foreign key and is counted, not smuggled in. */
const SALVAGE_TABLES = ["folders", "personas", "chats", "messages", "memory", "settings", "reports", "documents", "chunks", "vectors"] as const;

/** The file a rebuild is assembled in; promoted onto DB_NAME only once the copying is done. */
const REPAIR_DB_NAME = "inborn-repair.db";

/** SQLite's own check for broken pages. A pragma that cannot run is not evidence of damage, so nothing is rebuilt on it. */
async function quickCheck(db: SQLite.SQLiteDatabase): Promise<string[]> {
  try {
    return quickCheckProblems(await db.getAllAsync<Record<string, unknown>>("PRAGMA quick_check(20)"));
  } catch (e) {
    console.warn(`[storage] quick_check did not run: ${describe(e)}`);
    return [];
  }
}

/**
 * Copies every readable row into a fresh database and puts that one in place, keeping the damaged file. What the
 * old code did here was delete the file, which on an app whose whole promise is that chats live only on this
 * device is not a recovery at all.
 */
async function rebuild(damaged: SQLite.SQLiteDatabase, key: string, damage: string[]): Promise<{ db: SQLite.SQLiteDatabase; version: number; outcome: RepairOutcome }> {
  console.warn(`[storage] chat database failed quick_check, rebuilding: ${damage.slice(0, 3).join(" · ")}`);
  deleteDatabaseFiles(REPAIR_DB_NAME);
  const fresh = await openKeyed(key, REPAIR_DB_NAME);
  await migrate(fresh);
  /* The document index shares this file (documents/db.native.ts), and search is rebuilt by its own insert triggers. */
  await fresh.execAsync(RAG_SCHEMA_SQL).catch((e: unknown) => console.warn(`[storage] repair: no document index (${describe(e)})`));
  await fresh.execAsync(FTS_SQL).catch((e: unknown) => console.warn(`[storage] repair: no search index (${describe(e)})`));
  const report = await salvage(sqlDriverOf(damaged), sqlDriverOf(fresh), SALVAGE_TABLES);
  await fresh.closeAsync().catch(() => undefined);
  await damaged.closeAsync().catch(() => undefined);
  const quarantined = quarantineDatabase(DB_NAME);
  promoteDatabase(REPAIR_DB_NAME, DB_NAME);
  const db = await openKeyed(key);
  return { db, version: await migrate(db), outcome: { kind: "rebuilt", copied: report.copied, lost: report.lost, quarantined } };
}

/** SQLCipher-encrypted chats + library (expo-sqlite with `useSQLCipher`). Refuses incognito rows outright. */
export class SqliteChatRepository implements ChatRepository, LibraryRepository {
  private constructor(
    private readonly db: ReopeningDatabase,
    readonly fts: boolean,
    readonly schemaVersion: number,
  ) {}

  static async open(): Promise<SqliteChatRepository> {
    const key = await databaseKeyHex();
    let db: SQLite.SQLiteDatabase;
    let repaired: RepairOutcome | null = null;
    try {
      db = await openKeyed(key);
    } catch (e) {
      if (!isUnreadableDatabase(describe(e))) throw e;
      // Kept, never deleted: this file is the user's only copy, and a key restored later may still open it.
      repaired = { kind: "started-fresh", copied: 0, lost: 0, quarantined: quarantineDatabase(DB_NAME) };
      db = await openKeyed(key);
    }
    let version = await migrate(db);
    if (!repaired) {
      const damage = await quickCheck(db);
      if (damage.length) {
        const rebuilt = await rebuild(db, key, damage);
        db = rebuilt.db;
        version = rebuilt.version;
        repaired = rebuilt.outcome;
      }
    }
    let fts = true;
    try {
      await db.execAsync(FTS_SQL);
    } catch {
      fts = false;
    }
    const reopen = async () => {
      const fresh = await openKeyed(await databaseKeyHex());
      await fresh.execAsync(PRAGMAS_SQL);
      if (fts) await fresh.execAsync(FTS_SQL);
      return fresh;
    };
    const owned = new ReopeningDatabase(db, reopen, (e) => console.warn(`[storage] chat database handle died underneath, reopening: ${describe(e)}`));
    if (Number.isFinite(DEV_DEAD_DB_MS) && DEV_DEAD_DB_MS > 0) {
      let firing = 0;
      let armed = false;
      const fire = () => {
        const n = ++firing;
        armed = false;
        console.log(`[storage] dev: closing the chat handle underneath the repository after ${DEV_DEAD_DB_MS} ms (firing ${n}, in flight ${owned.inFlight})`);
        owned
          .closeUnderneath()
          .then((r) => console.log(`[storage] dev: handle closed (firing ${n}, waited for ${r.waitedFor} in-flight, drained=${r.drained})`))
          .catch((e: unknown) => console.warn("[storage] dev close", describe(e)));
      };
      const timer = setInterval(() => {
        if (owned.closed) return clearInterval(timer);
        if (!DEV_DEAD_DB_MID_STATEMENT) return fire();
        if (armed) return;
        armed = true;
        const poll = setInterval(() => {
          if (!armed) return clearInterval(poll);
          if (owned.inFlight > 0) {
            clearInterval(poll);
            fire();
          }
        }, 5);
      }, DEV_DEAD_DB_MS);
    }
    if (repaired) reportRepair(repaired);
    return new SqliteChatRepository(owned, fts, version);
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
    if (patch.adviceSnoozed !== undefined) columns.push(["advice_snoozed", patch.adviceSnoozed?.length ? JSON.stringify(patch.adviceSnoozed) : null]);
    if (!columns.length) return;
    const sets = columns.map(([name]) => `${name} = ?`).join(", ");
    await this.db.runAsync(`UPDATE chats SET ${sets} WHERE id = ?`, [...columns.map(([, v]) => v), id]);
  }

  async deleteChat(id: string): Promise<void> {
    await this.deleteChats([id]);
  }

  async deleteChats(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.db.withTransactionAsync(async (db) => {
      await db.runAsync(`DELETE FROM messages WHERE chat_id IN (${inList(ids.length)})`, ids);
      await db.runAsync(`DELETE FROM chats WHERE id IN (${inList(ids.length)})`, ids);
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
    await this.db.withTransactionAsync(async (db) => {
      const touched = await db.runAsync(SQL.touchChat, now, input.chatId);
      if (touched.changes === 0) throw new Error(`unknown chat ${input.chatId}`);
      await db.runAsync(
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
    await this.db.withTransactionAsync(async (db) => {
      const row = await db.getFirstAsync<{ seq: number }>(SQL.messageSeq, messageId, chatId);
      if (!row) return;
      removed = (await db.runAsync(SQL.deleteMessagesFromSeq, chatId, row.seq)).changes;
      const chat = await db.getFirstAsync<ChatRow>(SQL.getChat, chatId);
      if (chat?.summary_up_to && !(await db.getFirstAsync(SQL.summaryStillPresent, chatId, chat.summary_up_to))) await db.runAsync(SQL.clearSummary, chatId);
    });
    return removed;
  }

  async search(query: string, options?: SearchOptions): Promise<SearchHit[]> {
    const terms = searchTerms(query);
    const first = terms[0];
    if (!first) return [];
    const chats = await this.listChats();
    const excluded = searchExclusions(chats, options?.hiddenFolderIds);
    const titles = new Map(chats.map((c) => [c.id, c.title]));
    const hits: SearchHit[] = chats.filter((c) => !excluded.has(c.id) && matchesTerms(c.title, terms)).map((c) => ({ chatId: c.id, title: c.title, snippet: c.title }));
    const rows = this.fts
      ? await this.db.getAllAsync<SearchRow>(SQL.searchFts, ftsQuery(terms), SEARCH_LIMIT + excluded.size)
      : (await this.db.getAllAsync<SearchRow>(SQL.searchLike, `%${first}%`, SEARCH_LIMIT * 4)).filter((r) => matchesTerms(r.content, terms));
    for (const r of rows) if (!excluded.has(r.chat_id)) hits.push({ chatId: r.chat_id, title: titles.get(r.chat_id) ?? "", messageId: r.id, snippet: snippetAround(r.content, terms) });
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
    await this.db.withTransactionAsync(async (db) => {
      await db.runAsync(SQL.unfolderChats, id);
      await db.runAsync(SQL.deleteFolder, id);
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
    await this.db.withTransactionAsync(async (db) => {
      await db.runAsync(SQL.unpersonaChats, id);
      await db.runAsync(SQL.unpersonaMemory, id);
      await db.runAsync(SQL.deletePersona, id);
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

  async close(): Promise<void> {
    const r = await this.db.closeAsync();
    if (!r.drained) console.warn(`[storage] closed with ${r.waitedFor} statement(s) still in flight after the drain timeout`);
  }
}
