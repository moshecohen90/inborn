//! Desktop chrome (spec §8.9): app menu with the keyboard shortcuts, tray icon with the seal
//! state, drag-and-drop import, and the events the web layer listens to.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::menu::{Menu, MenuBuilder, MenuItem, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::{App, AppHandle, DragDropEvent, Emitter, Manager, State, WebviewWindow, WindowEvent};

use crate::engine::{Engine, BACKEND};
use crate::models;
use crate::strings::t;

pub const SHORTCUT: &str = "inborn:shortcut";
pub const SEAL: &str = "inborn:seal";
pub const DOCUMENTS_DROPPED: &str = "inborn:documents-dropped";

/// A folder dropped by accident (a home directory, a synced drive) must not enqueue a hundred thousand imports.
const MAX_DROPPED_FILES: usize = 64;
/// Deep enough for the "Contracts/2026/Q3" a person actually drops, shallow enough not to walk a source tree.
const MAX_DROP_DEPTH: usize = 4;
/// Same ceiling the importer applies (`MAX_DOCUMENT_BYTES` in packages/core); nothing larger is worth reading into the webview.
const MAX_DOCUMENT_BYTES: u64 = 200 * 1024 * 1024;

/// The document paths this window has handed to the web layer. `documents_read` serves these and nothing else,
/// so the bundle cannot ask the file system for a path the user never dropped.
#[derive(Default)]
pub struct Dropped(Mutex<HashSet<PathBuf>>);

fn is_gguf(path: &Path) -> bool {
  path.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("gguf"))
}

fn hidden(path: &Path) -> bool {
  path.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.starts_with('.'))
}

fn walk(path: &Path, depth: usize, out: &mut Vec<PathBuf>) {
  if out.len() >= MAX_DROPPED_FILES || hidden(path) {
    return;
  }
  if path.is_file() {
    out.push(path.to_path_buf());
    return;
  }
  if !path.is_dir() || depth == 0 {
    return;
  }
  let Ok(entries) = std::fs::read_dir(path) else { return };
  /* read_dir order is the file system's; sorting keeps a dropped folder importing in the order the user sees it. */
  let mut paths: Vec<PathBuf> = entries.flatten().map(|e| e.path()).collect();
  paths.sort();
  for child in paths {
    walk(&child, depth - 1, out);
  }
}

/// Flattens a drop into the models to import and the documents to hand over: a dropped folder is its files (§8.9, gap 30).
pub fn expand_drop(paths: &[PathBuf]) -> (Vec<PathBuf>, Vec<PathBuf>) {
  let mut files = Vec::new();
  for path in paths {
    walk(path, MAX_DROP_DEPTH, &mut files);
  }
  files.into_iter().partition(|p| is_gguf(p))
}

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

/// The size a window must open at: never under the configured minimum.
fn at_least(size: (f64, f64), min: (f64, f64)) -> (f64, f64) {
  (size.0.max(min.0), size.1.max(min.1))
}

/// Hold the window to the §9.7 minimum however it got smaller.
///
/// AppKit's `contentMinSize` stops a *drag* below the minimum, and nothing else: `tauri-plugin-window-state`
/// restores the size the window was last closed at by setting it in code, after both `setup` and
/// `RunEvent::Ready`, so a window saved under an older and smaller minimum reopens under the current one and
/// nothing ever grows it back. Every way down ends in a resize, which is why this hangs off that event.
fn hold_to_configured_minimum(window: &WebviewWindow) -> tauri::Result<()> {
  let app = window.app_handle();
  let Some(configured) = app.config().app.windows.first() else { return Ok(()) };
  let (Some(min_width), Some(min_height)) = (configured.min_width, configured.min_height) else { return Ok(()) };
  let scale = window.scale_factor()?;
  let now = window.inner_size()?.to_logical::<f64>(scale);
  let (width, height) = at_least((now.width, now.height), (min_width, min_height));
  if width > now.width || height > now.height {
    eprintln!("[inborn] window was {}x{}, under the {min_width}x{min_height} minimum; grown", now.width, now.height);
    window.set_size(tauri::LogicalSize::new(width, height))?;
  }
  Ok(())
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
    let minimum = window.clone();
    window.on_window_event(move |event| {
      if let WindowEvent::Resized(_) = event {
        if let Err(e) = hold_to_configured_minimum(&minimum) {
          eprintln!("[inborn] window minimum: {e}");
        }
      }
      if let WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) = event {
        let (ggufs, documents) = expand_drop(paths);
        if !documents.is_empty() {
          if let Ok(mut allowed) = handle.state::<Dropped>().0.lock() {
            allowed.extend(documents.iter().cloned());
          }
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

/// The bytes of one dropped document, for the web layer that has no file system. Only a path this window
/// actually handed over is served, and only up to the importer's own size ceiling.
#[tauri::command]
pub fn documents_read(path: String, dropped: State<'_, Dropped>) -> Result<tauri::ipc::Response, String> {
  let wanted = PathBuf::from(&path);
  let known = dropped.0.lock().map(|a| a.contains(&wanted)).unwrap_or(false);
  if !known {
    return Err(format!("{path} was not dropped on this window"));
  }
  let size = std::fs::metadata(&wanted).map_err(|e| e.to_string())?.len();
  if size > MAX_DOCUMENT_BYTES {
    return Err(format!("{path} is larger than {MAX_DOCUMENT_BYTES} bytes"));
  }
  std::fs::read(&wanted).map(tauri::ipc::Response::new).map_err(|e| e.to_string())
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

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn a_restored_window_under_the_minimum_is_grown_on_both_axes() {
    assert_eq!(at_least((820.0, 528.0), (1040.0, 720.0)), (1040.0, 720.0));
    assert_eq!(at_least((1200.0, 528.0), (1040.0, 720.0)), (1200.0, 720.0));
    assert_eq!(at_least((820.0, 900.0), (1040.0, 720.0)), (1040.0, 900.0));
  }

  #[test]
  fn a_window_at_or_above_the_minimum_is_left_exactly_as_it_was() {
    assert_eq!(at_least((1040.0, 720.0), (1040.0, 720.0)), (1040.0, 720.0));
    assert_eq!(at_least((1600.0, 1000.0), (1040.0, 720.0)), (1600.0, 1000.0));
  }

  fn touch(path: &Path) {
    if let Some(parent) = path.parent() {
      std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(path, b"x").unwrap();
  }

  /// A dropped folder is its files (gap 30): the old code partitioned the drop verbatim, so a folder
  /// reached the web layer as a path with no extension and imported as nothing.
  #[test]
  fn expand_drop_walks_folders_and_keeps_models_apart() {
    let root = std::env::temp_dir().join(format!("inborn-drop-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    touch(&root.join("loose.pdf"));
    touch(&root.join("folder/a.pdf"));
    touch(&root.join("folder/b.docx"));
    touch(&root.join("folder/nested/c.txt"));
    touch(&root.join("folder/.hidden.pdf"));
    touch(&root.join("folder/model.gguf"));

    let (ggufs, documents) = expand_drop(&[root.join("loose.pdf"), root.join("folder")]);
    let names: Vec<String> = documents.iter().map(|p| p.file_name().unwrap().to_string_lossy().into_owned()).collect();
    assert_eq!(names, vec!["loose.pdf", "a.pdf", "b.docx", "c.txt"]);
    assert_eq!(ggufs.len(), 1);
    assert!(ggufs[0].ends_with("model.gguf"));
    std::fs::remove_dir_all(&root).unwrap();
  }

  #[test]
  fn expand_drop_stops_at_the_file_cap_and_ignores_what_is_not_there() {
    let root = std::env::temp_dir().join(format!("inborn-drop-cap-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    for i in 0..MAX_DROPPED_FILES + 20 {
      touch(&root.join(format!("f{i:03}.txt")));
    }
    let (_, documents) = expand_drop(&[root.clone()]);
    assert_eq!(documents.len(), MAX_DROPPED_FILES);
    assert!(expand_drop(&[root.join("gone.pdf")]).1.is_empty());
    std::fs::remove_dir_all(&root).unwrap();
  }

  #[test]
  fn expand_drop_does_not_descend_for_ever() {
    let root = std::env::temp_dir().join(format!("inborn-drop-deep-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    touch(&root.join("a/b/c/deep.txt"));
    touch(&root.join("a/b/c/d/e/too-deep.txt"));
    let (_, documents) = expand_drop(&[root.clone()]);
    let names: Vec<String> = documents.iter().map(|p| p.file_name().unwrap().to_string_lossy().into_owned()).collect();
    assert_eq!(names, vec!["deep.txt"]);
    std::fs::remove_dir_all(&root).unwrap();
  }
}
