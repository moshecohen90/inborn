//! Where the QA control channel listens, per platform. No Tauri here, so the Windows branch type-checks on a Mac
//! (`rustc --target x86_64-pc-windows-msvc`).
//!
//! `INBORN_QA_SOCKET` is either a unix socket path (macOS, Linux) or `tcp:127.0.0.1:<port>` (any platform; the
//! only form Windows has). A TCP endpoint must be loopback: the channel evaluates arbitrary script in the webview.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{SocketAddr, TcpListener};
use std::sync::Arc;

#[derive(Debug, PartialEq, Eq)]
pub enum Endpoint {
  #[cfg(unix)]
  Unix(std::path::PathBuf),
  Tcp(SocketAddr),
}

pub fn endpoint(value: &str) -> Result<Endpoint, String> {
  if let Some(addr) = value.strip_prefix("tcp:") {
    let addr: SocketAddr = addr.parse().map_err(|e| format!("{value}: {e}"))?;
    if !addr.ip().is_loopback() {
      return Err(format!("{value}: the QA channel listens on loopback only"));
    }
    return Ok(Endpoint::Tcp(addr));
  }
  #[cfg(unix)]
  {
    Ok(Endpoint::Unix(std::path::PathBuf::from(value)))
  }
  #[cfg(not(unix))]
  {
    Err(format!("{value}: this platform has no unix sockets; use tcp:127.0.0.1:<port>"))
  }
}

/// One JSON line in, one JSON line out, until the client hangs up.
fn serve(reader: impl Read, mut writer: impl Write, handle: &(dyn Fn(&str) -> String + Send + Sync)) {
  for line in BufReader::new(reader).lines().map_while(Result::ok) {
    if line.trim().is_empty() {
      continue;
    }
    let reply = handle(&line);
    if writeln!(writer, "{reply}").is_err() || writer.flush().is_err() {
      return;
    }
  }
}

/// Binds `endpoint` and answers every connection on its own thread. Returns the bound description for the log.
pub fn listen(endpoint: Endpoint, handle: Arc<dyn Fn(&str) -> String + Send + Sync>) -> std::io::Result<String> {
  match endpoint {
    #[cfg(unix)]
    Endpoint::Unix(path) => {
      let _ = std::fs::remove_file(&path);
      let listener = std::os::unix::net::UnixListener::bind(&path)?;
      std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
          let handle = handle.clone();
          std::thread::spawn(move || {
            if let Ok(writer) = stream.try_clone() {
              serve(stream, writer, handle.as_ref());
            }
          });
        }
      });
      Ok(path.display().to_string())
    }
    Endpoint::Tcp(addr) => {
      let listener = TcpListener::bind(addr)?;
      let bound = listener.local_addr()?;
      std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
          let handle = handle.clone();
          std::thread::spawn(move || {
            if let Ok(writer) = stream.try_clone() {
              serve(stream, writer, handle.as_ref());
            }
          });
        }
      });
      Ok(format!("tcp:{bound}"))
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::io::{BufRead, BufReader, Write};
  use std::net::TcpStream;

  #[test]
  fn tcp_endpoint_parses_and_must_be_loopback() {
    assert_eq!(endpoint("tcp:127.0.0.1:47123").unwrap(), Endpoint::Tcp("127.0.0.1:47123".parse().unwrap()));
    assert!(endpoint("tcp:[::1]:47123").is_ok());
    assert!(endpoint("tcp:0.0.0.0:47123").unwrap_err().contains("loopback"));
    assert!(endpoint("tcp:192.168.1.5:47123").is_err());
    assert!(endpoint("tcp:localhost").is_err());
  }

  #[cfg(unix)]
  #[test]
  fn a_path_is_a_unix_socket_on_unix() {
    assert_eq!(endpoint("/tmp/inborn-qa.sock").unwrap(), Endpoint::Unix("/tmp/inborn-qa.sock".into()));
  }

  #[cfg(windows)]
  #[test]
  fn a_path_is_refused_on_windows() {
    assert!(endpoint(r"C:\Temp\inborn-qa.sock").unwrap_err().contains("tcp:127.0.0.1"));
  }

  #[test]
  fn tcp_channel_answers_one_line_per_request() {
    let bound = listen(endpoint("tcp:127.0.0.1:0").unwrap(), Arc::new(|line: &str| format!("echo:{line}"))).unwrap();
    let mut stream = TcpStream::connect(bound.strip_prefix("tcp:").unwrap()).unwrap();
    writeln!(stream, "{{\"op\":\"ping\"}}").unwrap();
    writeln!(stream).unwrap();
    writeln!(stream, "second").unwrap();
    let mut lines = BufReader::new(stream.try_clone().unwrap()).lines();
    assert_eq!(lines.next().unwrap().unwrap(), "echo:{\"op\":\"ping\"}");
    assert_eq!(lines.next().unwrap().unwrap(), "echo:second");
  }
}
