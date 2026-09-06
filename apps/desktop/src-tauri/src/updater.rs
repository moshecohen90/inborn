//! Signed updates (tauri-plugin-updater). The check is the only network path of the shell and runs
//! only when the user asks for it; the seal shows it (spec §5.1). The webview never reaches the host.

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

use crate::shell::Seal;
use crate::strings::t;

pub const UPDATE_HOST: &str = "updates.inbornapp.com";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
  pub available: bool,
  pub current_version: String,
  pub version: Option<String>,
  pub notes: Option<String>,
}

async fn check(app: &AppHandle) -> Result<UpdateInfo, String> {
  let seal: State<'_, Seal> = app.state();
  seal.set(app, false, &t("desktop.seal.checkingUpdates").replace("{host}", UPDATE_HOST));
  let result = async {
    let updater = app.updater().map_err(|e| e.to_string())?;
    updater.check().await.map_err(|e| e.to_string())
  }
  .await;
  seal.set(app, true, "");
  let current_version = app.package_info().version.to_string();
  match result {
    Ok(Some(update)) => Ok(UpdateInfo { available: true, current_version, version: Some(update.version), notes: update.body }),
    Ok(None) => Ok(UpdateInfo { available: false, current_version, version: None, notes: None }),
    Err(e) => Err(e),
  }
}

#[tauri::command]
pub async fn updater_check(app: AppHandle) -> Result<UpdateInfo, String> {
  let info = check(&app).await?;
  let _ = app.emit("inborn:update", &info);
  Ok(info)
}

/// Download + install only after the user said yes (the check never installs by itself).
#[tauri::command]
pub async fn updater_install(app: AppHandle) -> Result<(), String> {
  let updater = app.updater().map_err(|e| e.to_string())?;
  let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
    return Err(t("desktop.update.none"));
  };
  update.download_and_install(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
  app.restart();
}

pub fn check_from_menu(app: AppHandle) {
  tauri::async_runtime::spawn(async move {
    let (title, body) = match check(&app).await {
      Ok(info) if info.available => (t("desktop.update.availableTitle"), t("desktop.update.available").replace("{version}", info.version.as_deref().unwrap_or("?"))),
      Ok(_) => (t("desktop.update.noneTitle"), t("desktop.update.none")),
      Err(e) => (t("desktop.update.failedTitle"), e),
    };
    app.dialog().message(body).title(title).kind(MessageDialogKind::Info).show(|_| {});
  });
}
