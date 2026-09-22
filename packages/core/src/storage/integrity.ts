/**
 * A damaged chat database is the one failure that can take everything the user has: spec §5.3 keeps the chats here
 * and nowhere else, so deleting the file is not a recovery, it is the loss. This is the pure part — what SQLite's
 * complaints mean, and how to copy out of a damaged file every row that can still be read. Quarantining the file,
 * reopening it and telling the user are platform work and live at the call site.
 */
import type { SqlDriver, SqlValue } from "../rag/sql";

/** SQLite's vocabulary for a file it cannot use at all. Every other error is an ordinary failure and must not wipe anything. */
const UNREADABLE = /file is not a database|not a database|file is encrypted|disk image is malformed/i;

export const isUnreadableDatabase = (text: string): boolean => UNREADABLE.test(text);

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

const identifier = (name: string): string => {
  if (!IDENTIFIER.test(name)) throw new Error(`refusing to build SQL around ${JSON.stringify(name)}`);
  return `"${name}"`;
};

/** `PRAGMA quick_check` answers with the single row "ok" when the file is sound; anything else names broken pages. */
export function quickCheckProblems(rows: Array<Record<string, unknown>>): string[] {
  const lines = rows.map((r) => String(Object.values(r)[0] ?? "").trim()).filter((l) => l.length > 0);
  // A pragma that answered nothing at all is not evidence of damage, and a rebuild on no evidence is the bug we are fixing.
  if (lines.length === 0) return [];
  if (lines.length === 1 && lines[0]!.toLowerCase() === "ok") return [];
  return lines;
}

export interface TableSalvage {
  name: string;
  copied: number;
  /** Rows the damaged file would not give back, or the fresh one would not take. */
  lost: number;
  /** False when not even the row ids could be listed: the whole table is gone. */
  readable: boolean;
}

export interface SalvageReport {
  copied: number;
  lost: number;
  tables: TableSalvage[];
}

/** What the user is told after a repair, and what the banner needs to say it (spec §8.8). */
export interface RepairOutcome {
  /** `rebuilt`: rows were copied into a fresh file. `started-fresh`: the old file could not be opened at all. */
  kind: "rebuilt" | "started-fresh";
  copied: number;
  lost: number;
  /** Where the damaged file was kept, so it is never the delete it used to be; empty when even the move failed. */
  quarantined: string;
}

type Row = Record<string, unknown>;

const cell = (v: unknown): SqlValue => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "bigint") return Number(v);
  return String(v);
};

/** Reads one page; a page that hits a broken row is retried row by row so only that row is lost. */
async function readPage(from: SqlDriver, table: string, ids: number[]): Promise<{ rows: Row[]; lost: number }> {
  const list = ids.join(",");
  try {
    return { rows: await from.all<Row>(`SELECT * FROM ${identifier(table)} WHERE rowid IN (${list})`), lost: 0 };
  } catch {
    const rows: Row[] = [];
    let lost = 0;
    for (const id of ids) {
      try {
        const [row] = await from.all<Row>(`SELECT * FROM ${identifier(table)} WHERE rowid = ${id}`);
        if (row) rows.push(row);
        else lost++;
      } catch {
        lost++;
      }
    }
    return { rows, lost };
  }
}

/** Writes one page; a batch the fresh file rejects (a row whose parent was lost, say) is retried row by row. */
async function writePage(to: SqlDriver, table: string, rows: Row[]): Promise<{ copied: number; lost: number }> {
  const statements = rows.map((row) => {
    const columns = Object.keys(row);
    return {
      sql: `INSERT OR IGNORE INTO ${identifier(table)} (${columns.map(identifier).join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
      params: columns.map((c) => cell(row[c])),
    };
  });
  try {
    await to.batch(statements);
    return { copied: rows.length, lost: 0 };
  } catch {
    let copied = 0;
    let lost = 0;
    for (const s of statements) {
      try {
        await to.run(s.sql, s.params);
        copied++;
      } catch {
        lost++;
      }
    }
    return { copied, lost };
  }
}

/**
 * Copies what is still readable from a damaged database into a fresh one that already has the schema. Tables are
 * copied in the order given, so parents come before the rows that point at them; a row whose parent did not survive
 * is counted as lost rather than dropped in silence.
 */
export async function salvage(from: SqlDriver, to: SqlDriver, tables: readonly string[], pageSize = 200): Promise<SalvageReport> {
  // Up front, so a name the code did not expect is a crash and not a table quietly reported as unreadable.
  for (const name of tables) identifier(name);
  const report: SalvageReport = { copied: 0, lost: 0, tables: [] };
  for (const name of tables) {
    const table: TableSalvage = { name, copied: 0, lost: 0, readable: true };
    report.tables.push(table);
    let ids: number[];
    try {
      ids = (await from.all<{ rid: number }>(`SELECT rowid AS rid FROM ${identifier(name)} ORDER BY rowid`)).map((r) => Number(r.rid)).filter((n) => Number.isInteger(n));
    } catch {
      table.readable = false;
      continue;
    }
    for (let at = 0; at < ids.length; at += pageSize) {
      const page = await readPage(from, name, ids.slice(at, at + pageSize));
      table.lost += page.lost;
      if (page.rows.length) {
        const written = await writePage(to, name, page.rows);
        table.copied += written.copied;
        table.lost += written.lost;
      }
    }
    report.copied += table.copied;
    report.lost += table.lost;
  }
  return report;
}
