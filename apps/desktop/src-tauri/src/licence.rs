//! Desktop licence file (spec §12.4 row 4, §14.4). The webview verifies Paddle licence keys offline
//! (Ed25519, `@inborn/core`); this side only persists: the accepted key + device id in `licence.json`,
//! the sealed entitlement cache in `licence.bin`, and a random 32-byte secret in the OS keychain that keys
//! the cache. The device id is a random value made once, not a hardware serial, so nothing fingerprints the machine.
//! Microsoft Store / Mac App Store receipts would plug in beside `licence_load` with the same shape.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const KEYCHAIN_SERVICE: &str = "com.inbornapp.desktop";
const KEYCHAIN_SECRET: &str = "licence-cache-key";
const KEYCHAIN_DEVICE: &str = "licence-device-id";
const KEY_FILE: &str = "licence.json";
const CACHE_FILE: &str = "licence.bin";

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StoredLicence {
  pub key: String,
  pub device_id: String,
  pub activated_at: u64,
}

fn keychain_hex(account: &str, bytes: usize) -> Result<String, String> {
  crate::secrets::hex(KEYCHAIN_SERVICE, account, bytes)
}

fn data_file(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
  let dir = match crate::secrets::data_dir_override() {
    Some(dir) => dir,
    None => app.path().app_data_dir().map_err(|e| e.to_string())?,
  };
  std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  Ok(dir.join(name))
}

fn remove_if_present(path: PathBuf) -> Result<(), String> {
  match std::fs::remove_file(path) {
    Ok(()) => Ok(()),
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
    Err(e) => Err(e.to_string()),
  }
}

/// 64-hex secret that keys the sealed entitlement cache (created on first use).
#[tauri::command]
pub fn licence_secret() -> Result<String, String> {
  keychain_hex(KEYCHAIN_SECRET, 32)
}

/// Stable random id this licence is bound to on this machine.
#[tauri::command]
pub fn licence_device_id() -> Result<String, String> {
  keychain_hex(KEYCHAIN_DEVICE, 16)
}

#[tauri::command]
pub fn licence_load(app: AppHandle) -> Result<Option<StoredLicence>, String> {
  let path = data_file(&app, KEY_FILE)?;
  match std::fs::read(&path) {
    Ok(bytes) => Ok(serde_json::from_slice(&bytes).ok()),
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
    Err(e) => Err(e.to_string()),
  }
}

#[tauri::command]
pub fn licence_save(app: AppHandle, key: String, device_id: String) -> Result<(), String> {
  let activated_at = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0);
  let stored = StoredLicence { key, device_id, activated_at };
  let bytes = serde_json::to_vec(&stored).map_err(|e| e.to_string())?;
  std::fs::write(data_file(&app, KEY_FILE)?, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn licence_clear(app: AppHandle) -> Result<(), String> {
  remove_if_present(data_file(&app, KEY_FILE)?)
}

#[tauri::command]
pub fn licence_cache_load(app: AppHandle) -> Result<Option<String>, String> {
  let path = data_file(&app, CACHE_FILE)?;
  match std::fs::read(&path) {
    Ok(bytes) => Ok(Some(base64_encode(&bytes))),
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
    Err(e) => Err(e.to_string()),
  }
}

#[tauri::command]
pub fn licence_cache_save(app: AppHandle, data: String) -> Result<(), String> {
  let bytes = base64_decode(&data).ok_or("invalid base64")?;
  std::fs::write(data_file(&app, CACHE_FILE)?, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn licence_cache_clear(app: AppHandle) -> Result<(), String> {
  remove_if_present(data_file(&app, CACHE_FILE)?)
}

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn base64_encode(bytes: &[u8]) -> String {
  let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
  for chunk in bytes.chunks(3) {
    let n = (u32::from(chunk[0]) << 16) | (chunk.get(1).map_or(0, |b| u32::from(*b)) << 8) | chunk.get(2).map_or(0, |b| u32::from(*b));
    out.push(B64[(n >> 18) as usize & 63] as char);
    out.push(B64[(n >> 12) as usize & 63] as char);
    out.push(if chunk.len() > 1 { B64[(n >> 6) as usize & 63] as char } else { '=' });
    out.push(if chunk.len() > 2 { B64[n as usize & 63] as char } else { '=' });
  }
  out
}

fn base64_decode(s: &str) -> Option<Vec<u8>> {
  let mut out = Vec::with_capacity(s.len() * 3 / 4);
  let mut acc: u32 = 0;
  let mut bits = 0;
  for c in s.bytes() {
    let v = match c {
      b'A'..=b'Z' => c - b'A',
      b'a'..=b'z' => c - b'a' + 26,
      b'0'..=b'9' => c - b'0' + 52,
      b'+' | b'-' => 62,
      b'/' | b'_' => 63,
      b'=' | b'\n' | b'\r' | b' ' => continue,
      _ => return None,
    };
    acc = (acc << 6) | u32::from(v);
    bits += 6;
    if bits >= 8 {
      bits -= 8;
      out.push((acc >> bits) as u8);
      acc &= (1 << bits) - 1;
    }
  }
  Some(out)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn base64_round_trips_every_length() {
    for len in 0..64usize {
      let bytes: Vec<u8> = (0..len).map(|i| (i * 37 % 256) as u8).collect();
      assert_eq!(base64_decode(&base64_encode(&bytes)).unwrap(), bytes, "len {len}");
    }
    assert_eq!(base64_encode(b"hi"), "aGk=");
    assert!(base64_decode("***").is_none());
  }
}
