//! Where the at-rest secrets come from.
//!
//! Production: the OS keychain (macOS login Keychain, Windows Credential Manager). A keychain item's ACL
//! names the code identity that created it, so an unsigned rebuild is a stranger to the item and macOS
//! asks for the login password — which is why an agent cannot QA a freshly built desktop app unattended.
//! QA builds (`--features qa`, and only when `INBORN_QA_KEY_FILE` names a file) read the same secrets from
//! that file instead and never touch the keychain at all. The feature is off in every shipped build, so
//! there is no file path in production.

#[cfg(feature = "qa")]
use std::collections::BTreeMap;

/// Where a QA build keeps the chat database and the licence files: beside its key file, never in the shared
/// app data dir. Two different keys over one `inborn.db` would wipe each other's chats on every run. The model
/// vault stays shared — a QA run should not have to copy half a gigabyte of GGUF.
pub fn data_dir_override() -> Option<std::path::PathBuf> {
  #[cfg(feature = "qa")]
  {
    if let Some(dir) = std::env::var_os("INBORN_QA_DATA_DIR") {
      return Some(std::path::PathBuf::from(dir));
    }
    if let Some(file) = std::env::var_os("INBORN_QA_KEY_FILE") {
      return std::path::Path::new(&file).parent().map(|p| p.to_path_buf());
    }
  }
  None
}

fn random_hex(bytes: usize) -> String {
  (0..bytes).map(|_| format!("{:02x}", rand::random::<u8>())).collect()
}

/// `bytes * 2` hex characters for `account`, created on first use and stable afterwards.
pub fn hex(service: &str, account: &str, bytes: usize) -> Result<String, String> {
  #[cfg(feature = "qa")]
  if let Some(path) = std::env::var_os("INBORN_QA_KEY_FILE") {
    return qa_file_hex(std::path::Path::new(&path), account, bytes);
  }
  keychain_hex(service, account, bytes)
}

fn keychain_hex(service: &str, account: &str, bytes: usize) -> Result<String, String> {
  let entry = keyring::Entry::new(service, account).map_err(|e| e.to_string())?;
  match entry.get_password() {
    Ok(existing) if existing.len() == bytes * 2 => Ok(existing),
    Ok(_) | Err(keyring::Error::NoEntry) => {
      let hex = random_hex(bytes);
      entry.set_password(&hex).map_err(|e| e.to_string())?;
      Ok(hex)
    }
    Err(e) => Err(e.to_string()),
  }
}

#[cfg(feature = "qa")]
fn qa_file_hex(path: &std::path::Path, account: &str, bytes: usize) -> Result<String, String> {
  let mut map: BTreeMap<String, String> = std::fs::read(path)
    .ok()
    .and_then(|raw| serde_json::from_slice(&raw).ok())
    .unwrap_or_default();
  if map.get(account).map(|v| v.len()) == Some(bytes * 2) {
    return Ok(map[account].clone());
  }
  let hex = random_hex(bytes);
  map.insert(account.to_string(), hex.clone());
  if let Some(dir) = path.parent() {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
  }
  std::fs::write(path, serde_json::to_vec_pretty(&map).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
  }
  Ok(hex)
}

#[cfg(test)]
mod tests {
  #[test]
  fn random_hex_has_two_characters_per_byte() {
    assert_eq!(super::random_hex(32).len(), 64);
    assert_eq!(super::random_hex(16).len(), 32);
    assert!(super::random_hex(8).chars().all(|c| c.is_ascii_hexdigit()));
  }

  #[cfg(feature = "qa")]
  #[test]
  fn qa_key_file_keeps_a_secret_stable_across_calls() {
    let path = std::env::temp_dir().join(format!("inborn-qa-key-{}.json", std::process::id()));
    let _ = std::fs::remove_file(&path);
    let first = super::qa_file_hex(&path, "chat-db-key", 32).unwrap();
    let again = super::qa_file_hex(&path, "chat-db-key", 32).unwrap();
    let other = super::qa_file_hex(&path, "licence-cache-key", 32).unwrap();
    assert_eq!(first, again);
    assert_ne!(first, other);
    assert_eq!(first.len(), 64);
    let _ = std::fs::remove_file(&path);
  }
}
