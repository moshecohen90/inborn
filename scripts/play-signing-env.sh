#!/usr/bin/env bash
# Prints the export lines Gradle needs to sign a release with the Play upload key (plugins/withUploadSigning.js).
# Usage: eval "$(scripts/play-signing-env.sh)"   — passwords come from the macOS Keychain item `inborn-upload-key`.
set -euo pipefail
ks="${INBORN_UPLOAD_KEYSTORE:-$HOME/.inborn/keys/inborn-upload.jks}"
[ -f "$ks" ] || { echo "upload keystore not found: $ks (README: Play internal testing)" >&2; exit 1; }
store_pw="$(security find-generic-password -s inborn-upload-key -a store-password -w)"
key_pw="$(security find-generic-password -s inborn-upload-key -a key-password -w)"
printf 'export INBORN_UPLOAD_KEYSTORE=%q\n' "$ks"
printf 'export INBORN_UPLOAD_KEY_ALIAS=%q\n' "${INBORN_UPLOAD_KEY_ALIAS:-inborn-upload}"
printf 'export INBORN_UPLOAD_STORE_PASSWORD=%q\n' "$store_pw"
printf 'export INBORN_UPLOAD_KEY_PASSWORD=%q\n' "$key_pw"
