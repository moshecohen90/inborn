#!/usr/bin/env bash
# Release build for macOS: Developer ID signature, hardened runtime, notarization + stapling, DMG, updater signature.
# Runs the same way on a release Mac and in CI (desktop.yml). Nothing here is ever run with a dev machine's identity:
# every input is an environment variable, and the updater private key comes from the Keychain (see updater-key-env.sh).
#
#   APPLE_SIGNING_IDENTITY   "Developer ID Application: <name> (<TEAMID>)"
#   APPLE_ID / APPLE_PASSWORD / APPLE_TEAM_ID   app-specific password for notarytool (or APPLE_API_ISSUER/KEY/KEY_PATH)
#   TAURI_SIGNING_PRIVATE_KEY (+ _PASSWORD)     updater key; `source apps/desktop/scripts/updater-key-env.sh` on the release Mac
set -euo pipefail
cd "$(dirname "$0")/.."

for v in APPLE_SIGNING_IDENTITY APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID TAURI_SIGNING_PRIVATE_KEY; do
  [ -n "${!v:-}" ] || { echo "release-macos: $v is not set"; exit 1; }
done
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"

# tauri-bundler signs with APPLE_SIGNING_IDENTITY (hardened runtime + entitlements.plist from tauri.conf.json),
# submits to notarytool when APPLE_ID/APPLE_PASSWORD/APPLE_TEAM_ID are set, staples, then builds the DMG.
corepack pnpm tauri build --bundles app,dmg --config src-tauri/tauri.release.conf.json

APP=src-tauri/target/release/bundle/macos/Inborn.app
bash scripts/verify-macos.sh "$APP" --notarized
ls -la src-tauri/target/release/bundle/dmg/*.dmg src-tauri/target/release/bundle/macos/*.tar.gz src-tauri/target/release/bundle/macos/*.sig
echo "Upload the .tar.gz + .sig to https://updates.inbornapp.com/desktop/darwin/aarch64/ and publish the DMG on the site."
