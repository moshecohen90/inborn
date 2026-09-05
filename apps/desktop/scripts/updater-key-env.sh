#!/usr/bin/env bash
# `source` this before a signed local build: exports the updater private key from the macOS Keychain
# (service inborn-tauri-updater, generated with `tauri signer generate --ci`; the public key is in tauri.conf.json).
# The key never touches a file or the terminal; only a masked prefix is echoed.
key=$(security find-generic-password -s inborn-tauri-updater -a private-key -w 2>/dev/null) || {
  echo "updater-key-env: no key in the Keychain (service inborn-tauri-updater)"; return 1 2>/dev/null || exit 1; }
export TAURI_SIGNING_PRIVATE_KEY="$key"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
unset key
echo "TAURI_SIGNING_PRIVATE_KEY exported (${TAURI_SIGNING_PRIVATE_KEY:0:8}…)"
