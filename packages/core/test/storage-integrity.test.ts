import { beforeAll, describe, expect, it } from "vitest";
import initSqlJs, { type Database } from "sql.js";
import { isUnreadableDatabase, quickCheckProblems, salvage, type SqlDriver, type SqlValue } from "../src/index";

/** sql.js behind the driver shape expo-sqlite implements, so the salvage runs against a real SQLite. */
function driverOf(db: Database): SqlDriver {
  const bind = (p?: SqlValue[]) => (p ?? []) as (string | number | null)[];
  return {
    exec: async (sql) => void db.exec(sql),
    run: async (sql, params) => void db.run(sql, bind(params)),
    all: async <T,>(sql: string, params?: SqlValue[]) => {
      const stmt = db.prepare(sql);
      stmt.bind(bind(params));
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      stmt.free();
      return rows;
    },
    batch: async (statements) => {
      db.exec("BEGIN");
      try {
        for (const s of statements) db.run(s.sql, bind(s.params));
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}

/**
 * A corrupt page is exactly this from JS: the read that touches it throws, everything else answers. Wrapping the
 * driver is the only way to put that in a test — sql.js will not hand out a half-broken file.
 */
function withBrokenRows(db: Database, table: string, broken: number[]): SqlDriver {
  const inner = driverOf(db);
  const touches = (sql: string) => sql.includes(table) && broken.some((id) => new RegExp(`\\b${id}\\b`).test(sql.slice(sql.indexOf("rowid"))));
  return {
    ...inner,
    all: async <T,>(sql: string, params?: SqlValue[]) => {
      if (sql.includes("rowid") && !sql.includes("ORDER BY") && touches(sql)) throw new Error("database disk image is malformed");
      return inner.all<T>(sql, params);
    },
  };
}

const SCHEMA = `
CREATE TABLE chats (id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL);
CREATE TABLE messages (id TEXT PRIMARY KEY NOT NULL, chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE, content TEXT NOT NULL);
`;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
beforeAll(async () => {
  SQL = await initSqlJs();
});

/** Two chats of two messages each, ids c1/c2 and m1..m4. */
function damagedFile(): Database {
  const db = new SQL.Database();
  db.exec(SCHEMA);
  for (const [id, title] of [["c1", "first"], ["c2", "second"]]) db.run("INSERT INTO chats (id, title) VALUES (?, ?)", [id!, title!]);
  let n = 0;
  for (const chat of ["c1", "c2"]) for (const text of ["hello", "world"]) db.run("INSERT INTO messages (id, chat_id, content) VALUES (?, ?, ?)", [`m${++n}`, chat, text]);
  return db;
}

function freshFile(): Database {
  const db = new SQL.Database();
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  return db;
}

const titles = (db: Database) => db.exec("SELECT title FROM chats ORDER BY id")[0]?.values.flat() ?? [];
const contents = (db: Database) => db.exec("SELECT content FROM messages ORDER BY id")[0]?.values.flat() ?? [];

describe("corrupt database: what is readable is copied, never deleted (spec §5.3, F58)", () => {
  it("recognises the errors that mean the file itself is unusable, and nothing else", () => {
    for (const text of ["file is not a database", "file is encrypted or is not a database", "database disk image is malformed"]) expect(isUnreadableDatabase(text), text).toBe(true);
    for (const text of ["no such table: chats", "database is locked", "UNIQUE constraint failed"]) expect(isUnreadableDatabase(text), text).toBe(false);
  });

  it("reads quick_check the way SQLite writes it", () => {
    expect(quickCheckProblems([{ quick_check: "ok" }])).toEqual([]);
    expect(quickCheckProblems([{ quick_check: "*** in database main ***" }, { quick_check: "Page 42: btreeInitPage() returns error code 11" }])).toHaveLength(2);
    /* A pragma that answered nothing is not evidence of damage; rebuilding on no evidence is the bug being fixed. */
    expect(quickCheckProblems([])).toEqual([]);
  });

  it("copies a sound file whole", async () => {
    const from = damagedFile();
    const to = freshFile();
    const report = await salvage(driverOf(from), driverOf(to), ["chats", "messages"]);
    expect(report).toMatchObject({ copied: 6, lost: 0 });
    expect(titles(to)).toEqual(["first", "second"]);
    expect(contents(to)).toEqual(["hello", "world", "hello", "world"]);
  });

  it("loses only the broken row: the page fails, the rows around it are still read one by one", async () => {
    const from = damagedFile();
    const to = freshFile();
    const report = await salvage(withBrokenRows(from, "messages", [2]), driverOf(to), ["chats", "messages"], 100);
    expect(report.lost).toBe(1);
    expect(report.tables.find((t) => t.name === "messages")).toMatchObject({ copied: 3, lost: 1, readable: true });
    expect(contents(to)).toEqual(["hello", "hello", "world"]);
    /* And the chats are all there: one unreadable message page is not a reason to lose a conversation. */
    expect(titles(to)).toEqual(["first", "second"]);
  });

  it("a table it cannot even list is reported, and the other tables are still copied", async () => {
    const from = damagedFile();
    from.exec("DROP TABLE messages");
    const to = freshFile();
    const report = await salvage(driverOf(from), driverOf(to), ["chats", "messages"]);
    expect(report.tables.find((t) => t.name === "messages")).toMatchObject({ readable: false, copied: 0 });
    expect(report.copied).toBe(2);
    expect(titles(to)).toEqual(["first", "second"]);
  });

  it("a message whose chat did not survive is counted as lost, not dropped in silence", async () => {
    const from = damagedFile();
    const to = freshFile();
    const report = await salvage(withBrokenRows(from, "chats", [1]), driverOf(to), ["chats", "messages"], 100);
    expect(titles(to)).toEqual(["second"]);
    /* The two orphaned messages fail the foreign key one by one; the surviving chat keeps both of its own. */
    expect(contents(to)).toEqual(["hello", "world"]);
    expect(report.lost).toBe(3);
  });

  it("refuses to build SQL around a name it did not expect", async () => {
    await expect(salvage(driverOf(damagedFile()), driverOf(freshFile()), ["chats; DROP TABLE messages"])).rejects.toThrow(/refusing/);
  });
});
