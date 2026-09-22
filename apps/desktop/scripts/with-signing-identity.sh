#!/usr/bin/env bash
# Runs a tauri build under a STABLE macOS code identity.
#
# tauri.conf.json signs dev builds ad-hoc ("-"), and an ad-hoc signature has no designated requirement beyond the
# binary's own code hash: every rebuild is a different application to macOS. The vault key lives in the login
# Keychain (com.inbornapp.desktop / chat-db-key, apps/desktop/src-tauri/src/store.rs) with an ACL naming the app
# that created it, so each freshly built Inborn.app asks for the login password on launch. An Apple Development
# certificate gives the bundle a stable identifier+team requirement, so one "Always Allow" survives every rebuild.
#
#   APPLE_SIGNING_IDENTITY  set it to override; otherwise the first Apple Development identity on this Mac is used.
#   No identity, or not macOS: the ad-hoc "-" from tauri.conf.json applies and the prompt comes back.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${APPLE_SIGNING_IDENTITY:-}" ] && [ "$(uname -s)" = "Darwin" ]; then
  APPLE_SIGNING_IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null | sed -n 's/.*"\(Apple Development: .*\)"$/\1/p' | head -1)"
fi

if [ -n "${APPLE_SIGNING_IDENTITY:-}" ]; then
  export APPLE_SIGNING_IDENTITY
  echo "with-signing-identity: signing as ${APPLE_SIGNING_IDENTITY}"
else
  echo "with-signing-identity: no Apple Development identity here; the ad-hoc signature applies and the Keychain will prompt after every rebuild"
fi

exec "$@"
