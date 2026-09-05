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
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Opened {
  pub kind: &'static str,
  pub fts: bool,
}

#[derive(Deserialize)]
pub struct Statement {
  pub sql: String,
  #[serde(default)]
  pub params: Vec<Value>,
}

fn key_hex() -> Result<String, String> {
  let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT).map_err(|e| e.to_string())?;
  match entry.get_password() {
    Ok(existing) if existing.len() == 64 => Ok(existing),
    Ok(_) | Err(keyring::Error::NoEntry) => {
      let bytes: [u8; 32] = rand::random();
      let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
      entry.set_password(&hex).map_err(|e| e.to_string())?;
      Ok(hex)
    }
    Err(e) => Err(e.to_string()),
  }
}

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
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
        // A file the current key cannot open is unreadable forever; start fresh rather than never saving again.
        for suffix in ["", "-wal", "-shm"] {
          let _ = std::fs::remove_file(format!("{}{}", path.display(), suffix));
        }
        open_keyed(&path, &hex).map_err(|e| e.to_string())?
      }
      Err(e) => return Err(e.to_string()),
    };
    *guard = Some(conn);
  }
  let conn = guard.as_ref().ok_or("no connection")?;
  let fts: bool = conn.query_row("SELECT count(*) FROM pragma_compile_options WHERE compile_options LIKE 'ENABLE_FTS5'", [], |r| r.get::<_, i64>(0)).map(|n| n > 0).unwrap_or(false);
  Ok(Opened { kind: "sqlcipher", fts })
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

#[tauri::command]
pub fn db_all(store: State<'_, Store>, sql: String, params: Vec<Value>) -> Result<Vec<Map<String, Value>>, String> {
  with_conn(&store, |c| {
    let mut stmt = c.prepare(&sql).map_err(|e| e.to_string())?;
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
  })
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
