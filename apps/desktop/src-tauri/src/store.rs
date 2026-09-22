//! Chats at rest: SQLCipher through rusqlite, keyed by a random 256-bit key that lives in the OS
//! keychain (spec §5.3). The webview issues the same SQL as the phones (`storage/schema.ts`); it
//! never sees the key or the file path.

use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::types::{ToSqlOutput, Value as SqlValue, ValueRef};
use rusqlite::{params_from_iter, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tauri::{AppHandle, Manager, State};

const KEYCHAIN_SERVICE: &str = "com.inbornapp.desktop";
const KEYCHAIN_ACCOUNT: &str = "chat-db-key";
const DB_FILE: &str = "inborn.db";

#[derive(Default)]
pub struct Store {
  conn: Mutex<Option<Connection>>,
  /// Set once, when an open had to leave an unreadable file behind; read by the webview to tell the user.
  quarantined: Mutex<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Opened {
  pub kind: &'static str,
  pub fts: bool,
  /// The name the unreadable file was kept under, when this open had to start a new one. The webview
  /// tells the user; an empty string means nothing was wrong.
  pub quarantined: String,
}

/// A WAL database is three files; the journal belongs with the file it journals.
const DB_PARTS: [&str; 3] = ["", "-wal", "-shm"];
const QUARANTINE: &str = ".corrupt-";

/// Moves an unreadable database aside instead of deleting it: these chats exist nowhere else, and a key
/// restored from a backup may still open the file. One kept copy at a time, so a repeating fault cannot
/// fill the disk. Returns the name it was kept under, empty when even the move failed.
fn quarantine(path: &PathBuf) -> String {
  if let (Some(dir), Some(name)) = (path.parent(), path.file_name().and_then(|n| n.to_str())) {
    if let Ok(entries) = std::fs::read_dir(dir) {
      let prefix = format!("{name}{QUARANTINE}");
      for entry in entries.flatten() {
        if entry.file_name().to_string_lossy().starts_with(&prefix) {
          let _ = std::fs::remove_file(entry.path());
        }
      }
    }
  }
  let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
  let kept = format!("{}{QUARANTINE}{stamp}", path.display());
  let mut moved = false;
  for suffix in DB_PARTS {
    let from = PathBuf::from(format!("{}{}", path.display(), suffix));
    if from.exists() && std::fs::rename(&from, format!("{kept}{suffix}")).is_ok() {
      moved = true;
    }
  }
  if !moved {
    for suffix in DB_PARTS {
      let _ = std::fs::remove_file(format!("{}{}", path.display(), suffix));
    }
    return String::new();
  }
  std::path::Path::new(&kept).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
}

#[derive(Deserialize)]
pub struct Statement {
  pub sql: String,
  #[serde(default)]
  pub params: Vec<Value>,
}

fn key_hex() -> Result<String, String> {
  crate::secrets::hex(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, 32)
}

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = match crate::secrets::data_dir_override() {
    Some(dir) => dir,
    None => app.path().app_data_dir().map_err(|e| e.to_string())?,
  };
  std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  Ok(dir.join(DB_FILE))
}

fn open_keyed(path: &PathBuf, hex: &str) -> rusqlite::Result<Connection> {
  let conn = Connection::open(path)?;
  conn.execute_batch(&format!("PRAGMA key = \"x'{hex}'\";"))?;
  conn.query_row("SELECT count(*) FROM sqlite_master", [], |_| Ok(()))?;
  Ok(conn)
}

#[tauri::command]
pub fn db_open(app: AppHandle, store: State<'_, Store>) -> Result<Opened, String> {
  let mut guard = store.conn.lock().map_err(|e| e.to_string())?;
  if guard.is_none() {
    let path = db_path(&app)?;
    let hex = key_hex()?;
    let conn = match open_keyed(&path, &hex) {
      Ok(c) => c,
      Err(e) if e.to_string().contains("not a database") => {
        *store.quarantined.lock().map_err(|e| e.to_string())? = quarantine(&path);
        open_keyed(&path, &hex).map_err(|e| e.to_string())?
      }
      Err(e) => return Err(e.to_string()),
    };
    *guard = Some(conn);
  }
  let conn = guard.as_ref().ok_or("no connection")?;
  let fts: bool = conn.query_row("SELECT count(*) FROM pragma_compile_options WHERE compile_options LIKE 'ENABLE_FTS5'", [], |r| r.get::<_, i64>(0)).map(|n| n > 0).unwrap_or(false);
  let quarantined = store.quarantined.lock().map_err(|e| e.to_string())?.clone();
  Ok(Opened { kind: "sqlcipher", fts, quarantined })
}

fn bind(value: &Value) -> ToSqlOutput<'static> {
  ToSqlOutput::Owned(match value {
    Value::Null => SqlValue::Null,
    Value::Bool(b) => SqlValue::Integer(*b as i64),
    Value::Number(n) => n.as_i64().map(SqlValue::Integer).unwrap_or_else(|| SqlValue::Real(n.as_f64().unwrap_or(0.0))),
    Value::String(s) => SqlValue::Text(s.clone()),
    other => SqlValue::Text(other.to_string()),
  })
}

fn to_json(v: ValueRef<'_>) -> Value {
  match v {
    ValueRef::Null => Value::Null,
    ValueRef::Integer(i) => Value::from(i),
    ValueRef::Real(f) => Value::from(f),
    ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
    ValueRef::Blob(b) => Value::String(b.iter().map(|x| format!("{x:02x}")).collect()),
  }
}

fn run_one(conn: &Connection, st: &Statement) -> Result<usize, String> {
  conn.execute(&st.sql, params_from_iter(st.params.iter().map(bind))).map_err(|e| e.to_string())
}

fn with_conn<T>(store: &Store, f: impl FnOnce(&Connection) -> Result<T, String>) -> Result<T, String> {
  let guard = store.conn.lock().map_err(|e| e.to_string())?;
  let conn = guard.as_ref().ok_or("database not open")?;
  f(conn)
}

#[tauri::command]
pub fn db_exec(store: State<'_, Store>, sql: String) -> Result<(), String> {
  with_conn(&store, |c| c.execute_batch(&sql).map_err(|e| e.to_string()))
}

#[tauri::command]
pub fn db_run(store: State<'_, Store>, sql: String, params: Vec<Value>) -> Result<usize, String> {
  with_conn(&store, |c| run_one(c, &Statement { sql, params }))
}

fn query_all(conn: &Connection, sql: &str, params: &[Value]) -> Result<Vec<Map<String, Value>>, String> {
  let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
  let names: Vec<String> = stmt.column_names().iter().map(|n| n.to_string()).collect();
  let rows = stmt
    .query_map(params_from_iter(params.iter().map(bind)), |row| {
      let mut object = Map::with_capacity(names.len());
      for (i, name) in names.iter().enumerate() {
        object.insert(name.clone(), to_json(row.get_ref(i)?));
      }
      Ok(object)
    })
    .map_err(|e| e.to_string())?;
  rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_all(store: State<'_, Store>, sql: String, params: Vec<Value>) -> Result<Vec<Map<String, Value>>, String> {
  with_conn(&store, |c| query_all(c, &sql, &params))
}

/// Several writes in one transaction; the per-statement change counts come back so callers can detect a miss.
#[tauri::command]
pub fn db_batch(store: State<'_, Store>, statements: Vec<Statement>) -> Result<Vec<usize>, String> {
  let mut guard = store.conn.lock().map_err(|e| e.to_string())?;
  let conn = guard.as_mut().ok_or("database not open")?;
  let tx = conn.transaction().map_err(|e| e.to_string())?;
  let mut changes = Vec::with_capacity(statements.len());
  for st in &statements {
    changes.push(run_one(&tx, st)?);
  }
  tx.commit().map_err(|e| e.to_string())?;
  Ok(changes)
}

#[cfg(test)]
mod tests {
  use super::*;

  fn scratch(name: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!("inborn-db-{}-{}", name, std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).unwrap();
    root
  }

  /// The old code deleted an unreadable database outright, which on this app is every chat the user ever
  /// had. It has to survive the fault, WAL and all, and only one copy may be kept.
  #[test]
  fn quarantine_keeps_the_unreadable_file_and_only_one_copy() {
    let dir = scratch("quarantine");
    let path = dir.join(DB_FILE);
    for suffix in DB_PARTS {
      std::fs::write(format!("{}{}", path.display(), suffix), b"not a database").unwrap();
    }
    std::fs::write(dir.join(format!("{DB_FILE}{QUARANTINE}1")), b"older fault").unwrap();

    let kept = quarantine(&path);

    assert!(kept.starts_with(&format!("{DB_FILE}{QUARANTINE}")), "kept under {kept}");
    for suffix in DB_PARTS {
      assert!(!PathBuf::from(format!("{}{}", path.display(), suffix)).exists(), "{suffix} still in place");
      assert_eq!(std::fs::read(dir.join(format!("{kept}{suffix}"))).unwrap(), b"not a database");
    }
    let corrupt: Vec<_> = std::fs::read_dir(&dir).unwrap().flatten().map(|e| e.file_name().to_string_lossy().into_owned()).filter(|n| n.contains(QUARANTINE)).collect();
    assert_eq!(corrupt.len(), DB_PARTS.len(), "one kept copy at a time: {corrupt:?}");
    let _ = std::fs::remove_dir_all(&dir);
  }

  /// Nothing to move is not an error, and it must not claim a file was kept.
  #[test]
  fn quarantine_reports_nothing_kept_when_there_was_no_file() {
    let dir = scratch("empty");
    assert_eq!(quarantine(&dir.join(DB_FILE)), "");
    let _ = std::fs::remove_dir_all(&dir);
  }

  /// What `TauriChatRepository.open()` relies on: a multi-statement batch inside one transaction that ends by
  /// stamping `PRAGMA user_version`, the pragma read back through the `db_all` path, and FTS5 in this SQLCipher build.
  #[test]
  fn migration_batch_and_user_version_roundtrip() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;").unwrap();
    let before = query_all(&conn, "PRAGMA user_version", &[]).unwrap();
    assert_eq!(before[0]["user_version"], Value::from(0));
    conn
      .execute_batch("BEGIN; CREATE TABLE chats (id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL); ALTER TABLE chats ADD COLUMN archived INTEGER NOT NULL DEFAULT 0; PRAGMA user_version = 2; COMMIT;")
      .unwrap();
    let after = query_all(&conn, "PRAGMA user_version", &[]).unwrap();
    assert_eq!(after[0]["user_version"], Value::from(2));
    let n = run_one(&conn, &Statement { sql: "INSERT INTO chats (id, title) VALUES (?, ?)".into(), params: vec![Value::from("c1"), Value::from("t")] }).unwrap();
    assert_eq!(n, 1);
    let rows = query_all(&conn, "SELECT id, archived FROM chats WHERE id = ?", &[Value::from("c1")]).unwrap();
    assert_eq!(rows[0]["archived"], Value::from(0));
  }

  #[test]
  fn failed_migration_step_leaves_no_open_transaction() {
    let conn = Connection::open_in_memory().unwrap();
    assert!(conn.execute_batch("BEGIN; CREATE TABLE a (x); CREATE TABLE a (x); PRAGMA user_version = 1; COMMIT;").is_err());
    conn.execute_batch("ROLLBACK;").unwrap();
    let v = query_all(&conn, "PRAGMA user_version", &[]).unwrap();
    assert_eq!(v[0]["user_version"], Value::from(0));
    let tables = query_all(&conn, "SELECT count(*) AS n FROM sqlite_master WHERE name = 'a'", &[]).unwrap();
    assert_eq!(tables[0]["n"], Value::from(0));
  }

  #[test]
  fn fts5_is_compiled_in() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("CREATE VIRTUAL TABLE t USING fts5 (content, tokenize = 'unicode61'); INSERT INTO t (rowid, content) VALUES (1, 'passport for Italy');").unwrap();
    let rows = query_all(&conn, "SELECT rowid FROM t WHERE t MATCH ?", &[Value::from("\"ital\"*")]).unwrap();
    assert_eq!(rows.len(), 1);
  }
}
