#!/usr/bin/env bash
# Prints the export lines the iOS release steps need for the App Store Connect API, and stages the .p8 where
# xcodebuild -exportArchive and altool look for it.
#   eval "$(scripts/asc-key-env.sh)"      # stage the key, export INBORN_ASC_*
#   scripts/asc-key-env.sh --cleanup      # delete every staged copy when the run is over
# Default entry is the Admin key: an App Manager key is refused by cloud-managed distribution signing (README,
# "iOS release: which App Store Connect key"). Override with INBORN_ASC_KEYCHAIN=<service>:<account>; read-only
# callers that do not sign may point it at the App Manager key `inborn-asc-api`.
set -euo pipefail

entry="${INBORN_ASC_KEYCHAIN:-store-reviews:appstore-analytics-config}"
svc="${entry%%:*}"
acct="${entry#*:}"
dir="$HOME/.appstoreconnect/private_keys"

if [ "${1:-}" = "--cleanup" ]; then
  find "$dir" -name 'AuthKey_*.p8' -delete 2>/dev/null || true
  echo "removed staged .p8 files from $dir" >&2
  exit 0
fi

blob="$(security find-generic-password -s "$svc" -a "$acct" -w)"
# Two shapes live in this Keychain: the ASO tooling's JSON config (key_id/issuer_id/private_key/role) and a bare
# base64 .p8 whose account is the key id.
if printf '%s' "$blob" | head -c 1 | grep -q '{'; then
  eval "$(printf '%s' "$blob" | python3 -c '
import json,sys,shlex
d=json.loads(sys.stdin.read(),strict=False)
for k in ("key_id","issuer_id","role"):
    print("_%s=%s" % (k, shlex.quote(str(d.get(k,"")))))
')"
  pem="$(printf '%s' "$blob" | python3 -c 'import json,sys; print(json.loads(sys.stdin.read(),strict=False)["private_key"])')"
else
  _key_id="$acct"
  _issuer_id="${INBORN_ASC_ISSUER_ID:-69a6de8e-20c8-47e3-e053-5b8c7c11a4d1}"
  _role="App Manager"
  pem="$(printf '%s' "$blob" | base64 --decode)"
fi

if [ "${INBORN_ASC_ALLOW_NON_ADMIN:-0}" != "1" ] && [ "$_role" != "Admin" ]; then
  echo "asc-key-env: $entry is role '$_role'; export and upload need Admin (set INBORN_ASC_ALLOW_NON_ADMIN=1 for read-only use)" >&2
  exit 1
fi

mkdir -p "$dir"
key_path="$dir/AuthKey_${_key_id}.p8"
umask 077
printf '%s\n' "$pem" > "$key_path"

printf 'export INBORN_ASC_KEY_ID=%q\n' "$_key_id"
printf 'export INBORN_ASC_ISSUER_ID=%q\n' "$_issuer_id"
printf 'export INBORN_ASC_KEY_PATH=%q\n' "$key_path"
