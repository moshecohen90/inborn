//! Measurement channel for headless runs: the Chat screen bundled with `EXPO_PUBLIC_AUTOPROMPT=1`
//! writes its numbers here, the same way the phones write `Documents/dev-run.json`.

use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn dev_write_result(app: AppHandle, result: serde_json::Value) -> Result<String, String> {
  let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
  std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  let path = dir.join("dev-run.json");
  std::fs::write(&path, serde_json::to_vec_pretty(&result).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
  Ok(path.to_string_lossy().into_owned())
}
