import initSqlJs, { type Database } from "sql.js";

type SqlValue = string | number | null;
type Statement = { sql: string; params: SqlValue[] };

/** Stands in for the Rust side of the desktop shell: `db_*` commands over one sql.js database, transactions included. */
export async function installFakeTauri(): Promise<{ db: Database; uninstall: () => void }> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  const all = (sql: string, params: SqlValue[] = []) => {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows: Record<string, SqlValue>[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as Record<string, SqlValue>);
    stmt.free();
    return rows;
  };
  const run = (sql: string, params: SqlValue[] = []) => {
    db.run(sql, params);
    return db.getRowsModified();
  };
  const invoke = async (cmd: string, args: Record<string, unknown> = {}): Promise<unknown> => {
    switch (cmd) {
      case "db_open":
        return { kind: "sqlcipher", fts: true };
      case "db_all":
        return all(args.sql as string, args.params as SqlValue[]);
      case "db_run":
        return run(args.sql as string, args.params as SqlValue[]);
      case "db_exec":
        db.exec(args.sql as string);
        return undefined;
      case "db_batch": {
        db.exec("BEGIN");
        try {
          const changes = (args.statements as Statement[]).map((s) => run(s.sql, s.params));
          db.exec("COMMIT");
          return changes;
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
      }
      default:
        throw new Error(`fake tauri: unknown command ${cmd}`);
    }
  };
  const g = globalThis as { window?: unknown };
  const previous = g.window;
  g.window = { __TAURI__: { core: { invoke, Channel: class {} }, event: { listen: async () => () => undefined } } };
  return {
    db,
    uninstall: () => {
      g.window = previous;
      db.close();
    },
  };
}
