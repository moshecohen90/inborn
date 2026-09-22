//! QA control socket — the reason an agent can drive this app with no mouse and no dialogs.
//!
//! Compiled only with `--features qa` and opened only when `INBORN_QA_SOCKET` names a path, so a shipped
//! build contains none of it. A client writes one JSON line and reads one JSON line back:
//!
//! ```text
//! {"op":"ping"}                                  -> {"ok":true,"value":{"pid":123,...}}
//! {"op":"eval","js":"return document.title"}     -> {"ok":true,"value":"Inborn"}
//! {"op":"window","width":1120,"height":720}      -> {"ok":true,"value":{"width":1120,…}}
//! {"op":"quit"}                                  -> {"ok":true,...}  (process exits)
//! ```
//!
//! `eval` runs the script in the webview through `Webview::eval`, which returns nothing; the value comes
//! back the only way the page can talk to Rust, by invoking `qa_result` with the JSON of what it produced.
//! macOS has no WKWebView WebDriver (tauri-driver is Linux/Windows only), so this is the channel.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::{UnixListener, UnixStream};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Condvar, Mutex};
use std::time::Duration;

use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};

const DEFAULT_TIMEOUT_MS: u64 = 20_000;

/// Runs before the app's own bundle, on every load.
///
/// macOS calls a window nobody can see "occluded" — and a QA window is occluded the moment anything else is
/// in front of it. WebKit then stops delivering animation frames, so an animation never ends and the
/// completion callbacks that enable buttons (the seal on onboarding S04, for one) never fire: the app looks
/// frozen to a driver while being perfectly healthy for a human. Timers keep firing, so QA runs the app's own
/// animation code off a timer instead. Replaced here rather than in the app: the shipped bundle keeps real
/// animation frames.
const FRAME_SHIM: &str = r#"(() => {
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
})();"#;

/// The QA plugin: nothing but the frame shim, and only when a driver asked for the control socket.
pub fn plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
  let mut builder = tauri::plugin::Builder::new("qa");
  if std::env::var_os("INBORN_QA_SOCKET").is_some() {
    builder = builder.js_init_script(FRAME_SHIM);
  }
  builder.build()
}

#[derive(Default)]
pub struct Qa {
  replies: Mutex<HashMap<u64, Result<String, String>>>,
  ready: Condvar,
  next: AtomicU64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Request {
  op: String,
  #[serde(default)]
  js: String,
  #[serde(default)]
  timeout_ms: Option<u64>,
  #[serde(default)]
  width: Option<f64>,
  #[serde(default)]
  height: Option<f64>,
  #[serde(default)]
  x: Option<f64>,
  #[serde(default)]
  y: Option<f64>,
}

/// The page hands back what `eval` produced. Only reachable in QA builds.
#[tauri::command]
pub fn qa_result(qa: State<'_, Qa>, id: u64, ok: bool, value: String) {
  if let Ok(mut replies) = qa.replies.lock() {
    replies.insert(id, if ok { Ok(value) } else { Err(value) });
    qa.ready.notify_all();
  }
}

fn wrap(id: u64, js: &str) -> String {
  // No `eval`/`new Function`: the page's CSP has no 'unsafe-eval', and `Webview::eval` itself is not
  // subject to it. Async so the caller can await inside the snippet.
  let template = r#"(async () => {
  const __id = __ID__;
  const __done = (ok, value) => window.__TAURI__.core.invoke('qa_result', { id: __id, ok, value });
  try {
    const __v = await (async () => { __JS__ })();
    __done(true, JSON.stringify(__v === undefined ? null : __v));
  } catch (e) {
    __done(false, String((e && e.stack) || e));
  }
})();"#;
  template.replace("__ID__", &id.to_string()).replace("__JS__", js)
}

fn eval(app: &AppHandle, js: &str, timeout: Duration) -> Result<Value, String> {
  let qa = app.state::<Qa>();
  let id = qa.next.fetch_add(1, Ordering::Relaxed) + 1;
  let window = app.get_webview_window("main").ok_or("no main window")?;
  window.eval(&wrap(id, js)).map_err(|e| e.to_string())?;

  let mut replies = qa.replies.lock().map_err(|e| e.to_string())?;
  let deadline = std::time::Instant::now() + timeout;
  while !replies.contains_key(&id) {
    let left = deadline.saturating_duration_since(std::time::Instant::now());
    if left.is_zero() {
      return Err(format!("eval timed out after {} ms", timeout.as_millis()));
    }
    let (guard, _) = qa.ready.wait_timeout(replies, left).map_err(|e| e.to_string())?;
    replies = guard;
  }
  match replies.remove(&id).expect("present") {
    Ok(raw) => serde_json::from_str(&raw).map_err(|e| e.to_string()),
    Err(message) => Err(message),
  }
}

/// Puts the window at a known size in the middle of the primary monitor. Without this a QA launch with no
/// saved window state lands wherever macOS cascades it, which on a multi-display Mac can be off screen.
fn place(app: &AppHandle, request: &Request) -> Result<Value, String> {
  let window = app.get_webview_window("main").ok_or("no main window")?;
  let scale = window.scale_factor().map_err(|e| e.to_string())?;
  let size = window.outer_size().map_err(|e| e.to_string())?.to_logical::<f64>(scale);
  let width = request.width.unwrap_or(size.width);
  let height = request.height.unwrap_or(size.height);
  window.set_size(tauri::LogicalSize::new(width, height)).map_err(|e| e.to_string())?;

  let monitor = window.primary_monitor().map_err(|e| e.to_string())?.ok_or("no primary monitor")?;
  let area = monitor.size().to_logical::<f64>(monitor.scale_factor());
  let origin = monitor.position().to_logical::<f64>(monitor.scale_factor());
  let x = request.x.unwrap_or(origin.x + (area.width - width).max(0.0) / 2.0);
  let y = request.y.unwrap_or(origin.y + (area.height - height).max(0.0) / 2.0);
  window.set_position(tauri::LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
  window.show().map_err(|e| e.to_string())?;
  Ok(json!({ "width": width, "height": height, "x": x, "y": y, "scaleFactor": scale }))
}

fn handle(app: &AppHandle, line: &str) -> Value {
  let request: Request = match serde_json::from_str(line) {
    Ok(r) => r,
    Err(e) => return json!({ "ok": false, "error": format!("bad request: {e}") }),
  };
  let timeout = Duration::from_millis(request.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS));
  match request.op.as_str() {
    "ping" => json!({ "ok": true, "value": { "pid": std::process::id(), "version": app.package_info().version.to_string() } }),
    "eval" => match eval(app, &request.js, timeout) {
      Ok(value) => json!({ "ok": true, "value": value }),
      Err(error) => json!({ "ok": false, "error": error }),
    },
    "window" => match place(app, &request) {
      Ok(value) => json!({ "ok": true, "value": value }),
      Err(error) => json!({ "ok": false, "error": error }),
    },
    "quit" => {
      let handle = app.clone();
      std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(150));
        handle.exit(0);
      });
      json!({ "ok": true, "value": "quitting" })
    }
    other => json!({ "ok": false, "error": format!("unknown op {other}") }),
  }
}

fn serve(app: AppHandle, stream: UnixStream) {
  let mut writer = match stream.try_clone() {
    Ok(w) => w,
    Err(_) => return,
  };
  for line in BufReader::new(stream).lines().map_while(Result::ok) {
    if line.trim().is_empty() {
      continue;
    }
    let reply = handle(&app, &line).to_string();
    if writeln!(writer, "{reply}").is_err() || writer.flush().is_err() {
      return;
    }
  }
}

/// Binds the socket when `INBORN_QA_SOCKET` is set; a no-op otherwise, so a QA build behaves like a normal
/// one until a driver asks for the channel.
pub fn install(app: &AppHandle) {
  let Some(path) = std::env::var_os("INBORN_QA_SOCKET") else { return };
  let path = std::path::PathBuf::from(path);
  let _ = std::fs::remove_file(&path);
  let listener = match UnixListener::bind(&path) {
    Ok(l) => l,
    Err(e) => {
      eprintln!("[inborn] qa socket {} failed: {e}", path.display());
      return;
    }
  };
  eprintln!("[inborn] qa socket listening on {}", path.display());
  let app = app.clone();
  std::thread::spawn(move || {
    for stream in listener.incoming().flatten() {
      let app = app.clone();
      std::thread::spawn(move || serve(app, stream));
    }
  });
}

#[cfg(test)]
mod tests {
  #[test]
  fn wrap_carries_the_id_and_the_snippet() {
    let script = super::wrap(7, "return 1 + 1");
    assert!(script.contains("const __id = 7;"));
    assert!(script.contains("return 1 + 1"));
    assert!(!script.contains("__JS__"));
    assert!(!script.contains("eval("));
  }
}
