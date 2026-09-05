//! Native menu/tray strings come from the same `en.json` the app uses (`@inborn/i18n`, single source).

use std::collections::HashMap;
use std::sync::OnceLock;

const EN: &str = include_str!("../../../../packages/i18n/locales/en.json");

fn table() -> &'static HashMap<String, String> {
  static TABLE: OnceLock<HashMap<String, String>> = OnceLock::new();
  TABLE.get_or_init(|| serde_json::from_str(EN).expect("packages/i18n/locales/en.json is valid JSON"))
}

/// Missing keys surface as the key itself, so a typo is visible instead of silent.
pub fn t(key: &str) -> String {
  table().get(key).cloned().unwrap_or_else(|| key.to_string())
}

#[cfg(test)]
mod tests {
  use super::t;

  #[test]
  fn desktop_keys_exist() {
    for key in ["desktop.menu.newChat", "desktop.tray.sealed", "desktop.tray.quit", "desktop.import.noSpace", "desktop.update.none"] {
      assert_ne!(t(key), key, "{key} missing from en.json");
    }
  }
}
