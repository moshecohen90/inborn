//! Desktop chrome (spec §8.9): app menu with the keyboard shortcuts, tray icon with the seal
//! state, drag-and-drop import, and the events the web layer listens to.

use std::sync::Mutex;

use serde::Serialize;
use tauri::menu::{Menu, MenuBuilder, MenuItem, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::{App, AppHandle, DragDropEvent, Emitter, Manager, State, WindowEvent};

use crate::engine::{Engine, BACKEND};
use crate::models;
use crate::strings::t;

pub const SHORTCUT: &str = "inborn:shortcut";
pub const SEAL: &str = "inborn:seal";
pub const DOCUMENTS_DROPPED: &str = "inborn:documents-dropped";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SealState {
  pub sealed: bool,
  /// Why the seal is open (only ever the explicit update check); empty while sealed.
  pub note: String,
  pub out_bytes: u64,
}

#[derive(Default)]
pub struct Seal {
  state: Mutex<Option<SealState>>,
  tray: Mutex<Option<(TrayIcon, MenuItem<tauri::Wry>)>>,
}

impl Seal {
  pub fn set(&self, app: &AppHandle, sealed: bool, note: &str) {
    let state = SealState { sealed, note: note.to_string(), out_bytes: 0 };
    let label = if sealed { t("desktop.tray.sealed").replace("{out}", "0 B") } else { t("desktop.tray.unsealed").replace("{note}", note) };
    if let Ok(guard) = self.tray.lock() {
      if let Some((tray, item)) = guard.as_ref() {
        let _ = item.set_text(&label);
        let _ = tray.set_tooltip(Some(format!("Inborn · {label}")));
      }
    }
    if let Ok(mut guard) = self.state.lock() {
      *guard = Some(state.clone());
    }
    let _ = app.emit(SEAL, state);
  }

  pub fn current(&self) -> SealState {
    self.state.lock().ok().and_then(|g| g.clone()).unwrap_or(SealState { sealed: true, note: String::new(), out_bytes: 0 })
  }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DesktopInfo {
  pub version: String,
  pub backend: &'static str,
  pub models_dir: String,
  pub os: &'static str,
}

fn shortcut(app: &AppHandle, id: &str) {
  let _ = app.emit(SHORTCUT, id);
  if let Some(w) = app.get_webview_window("main") {
    let _ = w.show();
    let _ = w.set_focus();
  }
}

fn build_menu(app: &App) -> tauri::Result<Menu<tauri::Wry>> {
  let handle = app.handle();
  let new_chat = MenuItemBuilder::with_id("new-chat", t("desktop.menu.newChat")).accelerator("CmdOrCtrl+N").build(handle)?;
  let new_incognito = MenuItemBuilder::with_id("new-incognito", t("desktop.menu.newIncognito")).accelerator("CmdOrCtrl+Shift+N").build(handle)?;
  let toggle_incognito = MenuItemBuilder::with_id("toggle-incognito", t("desktop.menu.toggleIncognito")).accelerator("CmdOrCtrl+Shift+I").build(handle)?;
  let focus = MenuItemBuilder::with_id("focus-composer", t("desktop.menu.focusComposer")).accelerator("CmdOrCtrl+L").build(handle)?;
  let search = MenuItemBuilder::with_id("search", t("desktop.menu.search")).accelerator("CmdOrCtrl+F").build(handle)?;
  let stop = MenuItemBuilder::with_id("stop", t("desktop.menu.stop")).accelerator("CmdOrCtrl+.").build(handle)?;
  let palette = MenuItemBuilder::with_id("palette", t("desktop.menu.palette")).accelerator("CmdOrCtrl+K").build(handle)?;
  let toggle_sidebar = MenuItemBuilder::with_id("toggle-sidebar", t("desktop.menu.toggleSidebar")).accelerator("CmdOrCtrl+\\").build(handle)?;
  let model_picker = MenuItemBuilder::with_id("model-picker", t("desktop.menu.modelPicker")).accelerator("CmdOrCtrl+M").build(handle)?;
  let import = MenuItemBuilder::with_id("import-gguf", t("desktop.menu.importGguf")).accelerator("CmdOrCtrl+Shift+O").build(handle)?;
  let updates = MenuItemBuilder::with_id("check-updates", t("desktop.menu.checkUpdates")).build(handle)?;

  let file = SubmenuBuilder::new(handle, t("desktop.menu.file"))
    .item(&new_chat)
    .item(&new_incognito)
    .item(&toggle_incognito)
    .separator()
    .item(&import)
    .separator()
    .item(&updates)
    .build()?;
  let edit = SubmenuBuilder::new(handle, t("desktop.menu.edit"))
    .item(&PredefinedMenuItem::undo(handle, None)?)
    .item(&PredefinedMenuItem::redo(handle, None)?)
    .separator()
    .item(&PredefinedMenuItem::cut(handle, None)?)
    .item(&PredefinedMenuItem::copy(handle, None)?)
    .item(&PredefinedMenuItem::paste(handle, None)?)
    .item(&PredefinedMenuItem::select_all(handle, None)?)
    .separator()
    .item(&focus)
    .item(&search)
    .item(&palette)
    .item(&stop)
    .build()?;
  let window = SubmenuBuilder::new(handle, t("desktop.menu.window"))
    .item(&toggle_sidebar)
    .item(&model_picker)
    .separator()
    .item(&PredefinedMenuItem::minimize(handle, None)?)
    .item(&PredefinedMenuItem::maximize(handle, None)?)
    .separator()
    .item(&PredefinedMenuItem::close_window(handle, None)?)
    .build()?;

  let mut menu = MenuBuilder::new(handle);
  #[cfg(target_os = "macos")]
  {
    let app_menu = SubmenuBuilder::new(handle, "Inborn")
      .item(&PredefinedMenuItem::about(handle, None, None)?)
      .separator()
      .item(&PredefinedMenuItem::services(handle, None)?)
      .separator()
      .item(&PredefinedMenuItem::hide(handle, None)?)
      .item(&PredefinedMenuItem::hide_others(handle, None)?)
      .item(&PredefinedMenuItem::show_all(handle, None)?)
      .separator()
      .item(&MenuItemBuilder::with_id("quit", t("desktop.tray.quit")).accelerator("CmdOrCtrl+Q").build(handle)?)
      .build()?;
    menu = menu.item(&app_menu);
  }
  menu.item(&file).item(&edit).item(&window).build()
}

fn build_tray(app: &App) -> tauri::Result<()> {
  let handle = app.handle();
  let status = MenuItemBuilder::with_id("seal", t("desktop.tray.sealed").replace("{out}", "0 B")).enabled(false).build(handle)?;
  let backend = MenuItemBuilder::with_id("backend", t("desktop.tray.backend").replace("{backend}", BACKEND)).enabled(false).build(handle)?;
  let menu = MenuBuilder::new(handle)
    .item(&status)
    .item(&backend)
    .separator()
    .text("open", t("desktop.tray.open"))
    .text("tray-new-chat", t("desktop.tray.newChat"))
    .separator()
    .text("quit", t("desktop.tray.quit"))
    .build()?;
  let mut builder = TrayIconBuilder::with_id("main").menu(&menu).show_menu_on_left_click(true).tooltip(format!("Inborn · {}", status.text()?));
  if let Some(icon) = app.default_window_icon() {
    builder = builder.icon(icon.clone());
  }
  let tray = builder.build(app)?;
  let seal: State<'_, Seal> = app.state();
  if let Ok(mut guard) = seal.tray.lock() {
    *guard = Some((tray, status));
  }
  Ok(())
}

pub fn quit(app: &AppHandle) {
  let engine: State<'_, Engine> = app.state();
  engine.unload_blocking();
  app.exit(0);
}

pub fn install(app: &mut App) -> tauri::Result<()> {
  app.set_menu(build_menu(app)?)?;
  build_tray(app)?;
  app.on_menu_event(|app, event| match event.id().as_ref() {
    "quit" => quit(app),
    "open" => shortcut(app, "open"),
    "tray-new-chat" => shortcut(app, "new-chat"),
    "import-gguf" => models::import_via_dialog(app),
    "check-updates" => crate::updater::check_from_menu(app.clone()),
    id @ ("new-chat" | "new-incognito" | "toggle-incognito" | "focus-composer" | "search" | "stop" | "palette" | "toggle-sidebar" | "model-picker") => shortcut(app, id),
    _ => {}
  });
  if let Some(window) = app.get_webview_window("main") {
    let handle = app.handle().clone();
    window.on_window_event(move |event| {
      if let WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) = event {
        let (ggufs, documents): (Vec<_>, Vec<_>) = paths.iter().cloned().partition(|p| p.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("gguf")));
        if !documents.is_empty() {
          let _ = handle.emit(DOCUMENTS_DROPPED, documents.iter().map(|p| p.to_string_lossy().into_owned()).collect::<Vec<_>>());
        }
        let handle = handle.clone();
        std::thread::spawn(move || {
          for path in ggufs {
            if let Err(e) = models::import(&handle, &path) {
              let _ = handle.emit("inborn:import-failed", e);
            }
          }
        });
      }
    });
  }
  Ok(())
}

#[tauri::command]
pub fn seal_state(seal: State<'_, Seal>) -> SealState {
  seal.current()
}

#[tauri::command]
pub fn desktop_info(app: AppHandle) -> Result<DesktopInfo, String> {
  Ok(DesktopInfo {
    version: app.package_info().version.to_string(),
    backend: BACKEND,
    models_dir: models::vault_dir(&app)?.to_string_lossy().into_owned(),
    os: std::env::consts::OS,
  })
}
