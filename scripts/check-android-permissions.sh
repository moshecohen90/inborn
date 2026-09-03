#!/usr/bin/env bash
# Release gate: the Android app must not declare android.permission.INTERNET (spec §5.1, decision D3).
# Usage: scripts/check-android-permissions.sh <app.apk | app.aab>
set -euo pipefail
f="${1:-}"; [ -f "$f" ] || { echo "usage: $0 <app.apk|app.aab>"; exit 2; }
sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
aapt2="$(ls -d "$sdk"/build-tools/*/aapt2 2>/dev/null | sort -V | tail -1)"
[ -x "$aapt2" ] || { echo "aapt2 not found under $sdk/build-tools"; exit 2; }
case "$f" in
  *.apk) perms="$("$aapt2" dump permissions "$f")" ;;
  *.aab)
    bt="${BUNDLETOOL:-}"; [ -n "$bt" ] || { echo "AAB needs bundletool: set BUNDLETOOL=/path/bundletool.jar"; exit 2; }
    tmp="$(mktemp -d)"; java -jar "$bt" build-apks --bundle="$f" --output="$tmp/out.apks" --mode=universal >/dev/null
    unzip -q -o "$tmp/out.apks" universal.apk -d "$tmp"; perms="$("$aapt2" dump permissions "$tmp/universal.apk")"; rm -rf "$tmp" ;;
  *) echo "unknown file type: $f"; exit 2 ;;
esac
echo "$perms"
if echo "$perms" | grep -q "android.permission.INTERNET"; then
  echo "FAIL: android.permission.INTERNET is declared. Release builds must not have it."; exit 1
fi
echo "OK: no INTERNET permission."
