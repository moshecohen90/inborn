/** SQL for the encrypted chat store (spec §5.3). Pure strings so the schema can be checked with a plain sqlite3. */
export const DB_NAME = "inborn.db";

/** Incognito has no column on purpose: rows never get here (spec §5.7), so the shape itself cannot store one. */
export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
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
`;

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
  insertChat: "INSERT INTO chats (id, title, created_at, updated_at, model_id, persona_id, pinned, folder_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  renameChat: "UPDATE chats SET title = ? WHERE id = ?",
  deleteMessagesOfChat: "DELETE FROM messages WHERE chat_id = ?",
  deleteChat: "DELETE FROM chats WHERE id = ?",
  listMessages: "SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at, seq",
  insertMessage: "INSERT INTO messages (id, chat_id, role, content, reasoning, model_id, created_at, stopped, usage_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  touchChat: "UPDATE chats SET updated_at = ? WHERE id = ?",
  searchFts:
    "SELECT m.chat_id, m.id, m.content FROM messages_fts f JOIN messages m ON m.seq = f.rowid JOIN chats c ON c.id = m.chat_id WHERE messages_fts MATCH ? ORDER BY c.updated_at DESC, m.seq LIMIT ?",
  searchLike:
    "SELECT m.chat_id, m.id, m.content FROM messages m JOIN chats c ON c.id = m.chat_id WHERE m.content LIKE ? ORDER BY c.updated_at DESC, m.seq LIMIT ?",
} as const;

/** Every term as a quoted prefix token; FTS5 ANDs adjacent tokens. */
export function ftsQuery(terms: string[]): string {
  return terms.map((t) => `"${t.replace(/"/g, '""')}"*`).join(" ");
}
