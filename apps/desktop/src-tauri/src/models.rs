//! The model vault: `app_data_dir()/models/<id>.gguf`. Files get here by import (dialog or
//! drag-and-drop) after a magic-bytes and free-space check; nothing downloads (spec §5.1).

use std::io::Read;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

use crate::strings::t;

pub const MODELS_CHANGED: &str = "inborn:models-changed";
/// Room to leave on the disk after an import, so the OS and the chat database keep working.
const FREE_SPACE_MARGIN: u64 = 512 * 1024 * 1024;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModelFile {
  pub id: String,
  pub path: String,
  pub size_bytes: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiskSpace {
  pub free_bytes: u64,
  pub total_bytes: u64,
  pub dir: String,
}

pub fn vault_dir(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("models");
  std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  Ok(dir)
}

fn describe(path: &Path) -> Option<ModelFile> {
  let id = path.file_stem()?.to_str()?.to_string();
  let size_bytes = std::fs::metadata(path).ok()?.len();
  Some(ModelFile { id, path: path.to_string_lossy().into_owned(), size_bytes })
}

pub fn list(app: &AppHandle) -> Result<Vec<ModelFile>, String> {
  let mut files: Vec<ModelFile> = std::fs::read_dir(vault_dir(app)?)
    .map_err(|e| e.to_string())?
    .filter_map(|entry| entry.ok().map(|e| e.path()))
    .filter(|p| p.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("gguf")))
    .filter_map(|p| describe(&p))
    .collect();
  files.sort_by(|a, b| a.id.cmp(&b.id));
  Ok(files)
}

pub fn space(app: &AppHandle) -> Result<DiskSpace, String> {
  let dir = vault_dir(app)?;
  let stats = fs4::statvfs(&dir).map_err(|e| e.to_string())?;
  Ok(DiskSpace { free_bytes: stats.available_space(), total_bytes: stats.total_space(), dir: dir.to_string_lossy().into_owned() })
}

fn is_gguf(path: &Path) -> bool {
  let mut magic = [0u8; 4];
  std::fs::File::open(path).and_then(|mut f| f.read_exact(&mut magic)).map(|_| &magic == b"GGUF").unwrap_or(false)
}

/// Decimal (1000-based), matching `formatModelBytes` in `@inborn/core` (F376): this door quoted a binary
/// MB-only reading, so a GB-sized shortfall printed as a four-digit MB count nowhere else on screen used.
fn mb(bytes: u64) -> String {
  let bytes = bytes as f64;
  if bytes >= 1e9 {
    let gb = bytes / 1e9;
    let digits = if gb >= 10.0 { 0 } else { 2 };
    format!("{:.*} GB", digits, gb)
  } else if bytes >= 1e6 {
    format!("{} MB", (bytes / 1e6).round() as u64)
  } else if bytes >= 1e3 {
    format!("{} kB", (bytes / 1e3).round() as u64)
  } else {
    format!("{} B", bytes.round() as u64)
  }
}

#[cfg(test)]
mod format_tests {
  use super::mb;

  #[test]
  fn decimal_units_match_the_shared_ts_formatter() {
    assert_eq!(mb(532_517_120), "533 MB");
    assert_eq!(mb(1_280_835_840), "1.28 GB");
    assert_eq!(mb(2_740_938_080), "2.74 GB");
    assert_eq!(mb(12_000_000_000), "12 GB");
    assert_eq!(mb(204_987_232), "205 MB");
    assert_eq!(mb(1_280_000_000), "1.28 GB");
  }
}

pub fn import(app: &AppHandle, source: &Path) -> Result<ModelFile, String> {
  if !is_gguf(source) {
    return Err(t("desktop.import.notGguf").replace("{file}", &source.display().to_string()));
  }
  let size = std::fs::metadata(source).map_err(|e| e.to_string())?.len();
  let vault = vault_dir(app)?;
  let free = fs4::statvfs(&vault).map_err(|e| e.to_string())?.available_space();
  if free < size + FREE_SPACE_MARGIN {
    return Err(t("desktop.import.noSpace").replace("{need}", &mb(size + FREE_SPACE_MARGIN)).replace("{free}", &mb(free)));
  }
  let stem = source.file_stem().and_then(|s| s.to_str()).unwrap_or("model");
  let id: String = stem.chars().map(|c| if c.is_alphanumeric() || c == '-' || c == '_' || c == '.' { c } else { '_' }).collect();
  let target = vault.join(format!("{id}.gguf"));
  let partial = vault.join(format!("{id}.gguf.partial"));
  std::fs::copy(source, &partial).map_err(|e| e.to_string())?;
  std::fs::rename(&partial, &target).map_err(|e| e.to_string())?;
  let file = describe(&target).ok_or("imported file vanished")?;
  let _ = app.emit(MODELS_CHANGED, &file);
  Ok(file)
}

/// Native file picker, then import; runs on a background thread because copying can take a while.
pub fn import_via_dialog(app: &AppHandle) {
  let handle = app.clone();
  app.dialog().file().set_title(t("desktop.menu.importGguf")).add_filter("GGUF", &["gguf"]).pick_file(move |picked| {
    let Some(picked) = picked else { return };
    let Ok(path) = picked.into_path() else { return };
    std::thread::spawn(move || {
      if let Err(e) = import(&handle, &path) {
        let _ = handle.emit("inborn:import-failed", e);
      }
    });
  });
}

#[tauri::command]
pub fn models_list(app: AppHandle) -> Result<Vec<ModelFile>, String> {
  list(&app)
}

#[tauri::command]
pub fn models_space(app: AppHandle) -> Result<DiskSpace, String> {
  space(&app)
}

#[tauri::command]
pub async fn models_import(app: AppHandle, source: String) -> Result<ModelFile, String> {
  tauri::async_runtime::spawn_blocking(move || import(&app, Path::new(&source))).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn models_pick(app: AppHandle) {
  import_via_dialog(&app);
}

#[tauri::command]
pub fn models_remove(app: AppHandle, id: String) -> Result<(), String> {
  let vault = vault_dir(&app)?;
  let target = vault.join(format!("{id}.gguf"));
  if target.parent() != Some(vault.as_path()) || !target.exists() {
    return Err(format!("unknown model {id}"));
  }
  std::fs::remove_file(&target).map_err(|e| e.to_string())?;
  let _ = app.emit(MODELS_CHANGED, ());
  Ok(())
}
