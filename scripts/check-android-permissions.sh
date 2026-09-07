#!/usr/bin/env bash
# Release gate: the Android manifest declares exactly the permissions documented in docs/legal/app-privacy-details.md §4.2
# (spec §5.1, decision D3: never INTERNET). Any permission outside the allowlist fails the build.
# Usage: scripts/check-android-permissions.sh <app.apk | app.aab>
set -euo pipefail
f="${1:-}"; [ -f "$f" ] || { echo "usage: $0 <app.apk|app.aab>"; exit 2; }
sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
aapt2="$(ls -d "$sdk"/build-tools/*/aapt2 2>/dev/null | sort -V | tail -1)"
[ -x "$aapt2" ] || { echo "aapt2 not found under $sdk/build-tools"; exit 2; }

ALLOWED=(
  com.android.vending.BILLING                                   # Play Billing (spec §12.4)
  android.permission.FOREGROUND_SERVICE                         # Play asset-delivery extraction service
  android.permission.FOREGROUND_SERVICE_DATA_SYNC               # same service, Android 14+ type
  android.permission.ACCESS_NETWORK_STATE                       # proof screen S03 reads ConnectivityManager (expo-network)
  android.permission.USE_BIOMETRIC                              # app lock (expo-local-authentication)
  android.permission.VIBRATE                                    # haptics (expo-haptics)
  android.permission.RECORD_AUDIO                               # dictation, asked on the first mic tap (expo-speech-recognition)
  android.permission.CAMERA                                     # attach sheet "Camera", asked on that tap (expo-image-picker)
  com.inbornapp.mobile.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION # androidx.core defines it for the app's own receivers
)

case "$f" in
  *.apk) perms="$("$aapt2" dump permissions "$f")" ;;
  *.aab)
    bt="${BUNDLETOOL:-}"; [ -n "$bt" ] || { echo "AAB needs bundletool: set BUNDLETOOL=/path/bundletool.jar"; exit 2; }
    tmp="$(mktemp -d)"; java -jar "$bt" build-apks --bundle="$f" --output="$tmp/out.apks" --mode=universal >/dev/null
    unzip -q -o "$tmp/out.apks" universal.apk -d "$tmp"; perms="$("$aapt2" dump permissions "$tmp/universal.apk")"; rm -rf "$tmp" ;;
  *) echo "unknown file type: $f"; exit 2 ;;
esac
echo "$perms"

declared="$(echo "$perms" | sed -n "s/^uses-permission: name='\([^']*\)'.*/\1/p" | sort -u)"
bad=()
while IFS= read -r p; do
  [ -z "$p" ] && continue
  ok=0; for a in "${ALLOWED[@]}"; do [ "$p" = "$a" ] && ok=1 && break; done
  [ "$ok" = 1 ] || bad+=("$p")
done <<< "$declared"

if echo "$declared" | grep -qx "android.permission.INTERNET"; then
  echo "FAIL: android.permission.INTERNET is declared. Release builds must not have it."; exit 1
fi
if [ "${#bad[@]}" -gt 0 ]; then
  printf 'FAIL: permission not in the allowlist: %s\n' "${bad[@]}"
  echo "Block it in apps/mobile/app.config.ts (android.blockedPermissions) or add it to ALLOWED here and to docs/legal/app-privacy-details.md §4.2."
  exit 1
fi
echo "OK: no INTERNET permission; every declared permission is in the allowlist ($(echo "$declared" | grep -c .) declared)."
