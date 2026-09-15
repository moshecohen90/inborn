/** SQL for the encrypted chat store (spec §5.3). Pure strings so the schema can be checked with a plain sqlite3. */
export const DB_NAME = "inborn.db";

export const PRAGMAS_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
`;

export interface Migration {
  version: number;
  sql: string;
}

/**
 * Versioned, append-only (PRAGMA user_version). Each step runs once inside one transaction; never edit a shipped step.
 * Incognito has no column on purpose: rows never get here (spec §5.7), so the shape itself cannot store one.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    sql: `
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  model_id TEXT NOT NULL,
  persona_id TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  folder_id TEXT
);
CREATE INDEX IF NOT EXISTS chats_order ON chats (pinned DESC, updated_at DESC);
CREATE TABLE IF NOT EXISTS messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  chat_id TEXT NOT NULL REFERENCES chats (id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  reasoning TEXT,
  model_id TEXT,
  created_at INTEGER NOT NULL,
  stopped INTEGER NOT NULL DEFAULT 0,
  usage_json TEXT
);
CREATE INDEX IF NOT EXISTS messages_by_chat ON messages (chat_id, created_at, seq);
`,
  },
  {
    version: 2,
    sql: `
ALTER TABLE chats ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chats ADD COLUMN system_prompt TEXT;
ALTER TABLE chats ADD COLUMN thinking INTEGER;
ALTER TABLE chats ADD COLUMN summary TEXT;
ALTER TABLE chats ADD COLUMN summary_up_to TEXT;
ALTER TABLE messages ADD COLUMN reasoning_ms INTEGER;
ALTER TABLE messages ADD COLUMN stopped_by TEXT;
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS personas (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  default_model_id TEXT,
  temperature REAL,
  disclaimer TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS memory (
  id TEXT PRIMARY KEY NOT NULL,
  content TEXT NOT NULL,
  source_chat_id TEXT,
  persona_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY NOT NULL,
  reason TEXT NOT NULL,
  note TEXT NOT NULL,
  chat_id TEXT,
  message_id TEXT,
  message_text TEXT,
  model_id TEXT,
  created_at INTEGER NOT NULL
);
`,
  },
  {
    version: 3,
    sql: `
ALTER TABLE messages ADD COLUMN citations_json TEXT;
`,
  },
  {
    version: 4,
    sql: `
ALTER TABLE messages ADD COLUMN images_json TEXT;
`,
  },
  {
    version: 5,
    sql: `
ALTER TABLE chats ADD COLUMN advice_snoozed TEXT;
`,
  },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;

/** FTS5 index kept in sync by triggers; applied separately so a build without FTS5 degrades to LIKE. */
export const FTS_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5 (content, tokenize = 'unicode61');
CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts (rowid, content) VALUES (new.seq, new.content);
END;
CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE OF content ON messages BEGIN
  UPDATE messages_fts SET content = new.content WHERE rowid = new.seq;
END;
CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  DELETE FROM messages_fts WHERE rowid = old.seq;
END;
`;

export const SQL = {
  listChats: "SELECT * FROM chats ORDER BY pinned DESC, updated_at DESC",
  getChat: "SELECT * FROM chats WHERE id = ?",
  insertChat:
    "INSERT INTO chats (id, title, created_at, updated_at, model_id, persona_id, pinned, folder_id, system_prompt, thinking) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  renameChat: "UPDATE chats SET title = ? WHERE id = ?",
  deleteMessagesOfChat: "DELETE FROM messages WHERE chat_id = ?",
  deleteChat: "DELETE FROM chats WHERE id = ?",
  listMessages: "SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at, seq",
  insertMessage:
    "INSERT INTO messages (id, chat_id, role, content, reasoning, reasoning_ms, model_id, created_at, stopped, stopped_by, usage_json, citations_json, images_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  touchChat: "UPDATE chats SET updated_at = ? WHERE id = ?",
  messageSeq: "SELECT seq FROM messages WHERE id = ? AND chat_id = ?",
  deleteMessagesFromSeq: "DELETE FROM messages WHERE chat_id = ? AND seq >= ?",
  summaryStillPresent: "SELECT 1 FROM messages WHERE chat_id = ? AND id = ?",
  clearSummary: "UPDATE chats SET summary = NULL, summary_up_to = NULL WHERE id = ?",
  searchFts:
    "SELECT m.chat_id, m.id, m.content FROM messages_fts f JOIN messages m ON m.seq = f.rowid JOIN chats c ON c.id = m.chat_id WHERE messages_fts MATCH ? ORDER BY c.updated_at DESC, m.seq LIMIT ?",
  searchLike:
    "SELECT m.chat_id, m.id, m.content FROM messages m JOIN chats c ON c.id = m.chat_id WHERE m.content LIKE ? ORDER BY c.updated_at DESC, m.seq LIMIT ?",
  listFolders: "SELECT * FROM folders ORDER BY name COLLATE NOCASE",
  insertFolder: "INSERT INTO folders (id, name, created_at) VALUES (?, ?, ?)",
  renameFolder: "UPDATE folders SET name = ? WHERE id = ?",
  deleteFolder: "DELETE FROM folders WHERE id = ?",
  unfolderChats: "UPDATE chats SET folder_id = NULL WHERE folder_id = ?",
  listPersonas: "SELECT * FROM personas ORDER BY created_at",
  getPersona: "SELECT * FROM personas WHERE id = ?",
  upsertPersona:
    "INSERT INTO personas (id, name, icon, system_prompt, default_model_id, temperature, disclaimer, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET name = excluded.name, icon = excluded.icon, system_prompt = excluded.system_prompt, default_model_id = excluded.default_model_id, temperature = excluded.temperature, disclaimer = excluded.disclaimer, updated_at = excluded.updated_at",
  deletePersona: "DELETE FROM personas WHERE id = ?",
  unpersonaChats: "UPDATE chats SET persona_id = NULL WHERE persona_id = ?",
  unpersonaMemory: "UPDATE memory SET persona_id = NULL WHERE persona_id = ?",
  listMemory: "SELECT * FROM memory ORDER BY created_at",
  insertMemory: "INSERT INTO memory (id, content, source_chat_id, persona_id, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  deleteMemory: "DELETE FROM memory WHERE id = ?",
  clearMemory: "DELETE FROM memory",
  getSetting: "SELECT value FROM settings WHERE key = ?",
  setSetting: "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
  listReports: "SELECT * FROM reports ORDER BY created_at DESC",
  insertReport: "INSERT INTO reports (id, reason, note, chat_id, message_id, message_text, model_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  deleteReport: "DELETE FROM reports WHERE id = ?",
} as const;

/** Every term as a quoted prefix token; FTS5 ANDs adjacent tokens. */
export function ftsQuery(terms: string[]): string {
  return terms.map((t) => `"${t.replace(/"/g, '""')}"*`).join(" ");
}

/** Placeholders for a bulk delete. */
export const inList = (n: number): string => Array.from({ length: n }, () => "?").join(", ");
