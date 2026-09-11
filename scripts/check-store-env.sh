#!/usr/bin/env bash
# Release gate: no EXPO_PUBLIC_* dev switch may be set while a store bundle is built. Metro inlines them at bundle time,
# and EXPO_PUBLIC_DEV_MODEL_HOST / EXPO_PUBLIC_MODELS_BASE_URL would turn a Play build's vault onto HTTPS delivery (spec §5.1).
# Usage: scripts/check-store-env.sh   (run before `expo prebuild` / `eas build` / gradle bundleRelease)
set -euo pipefail
bad=()
for v in EXPO_PUBLIC_DEV_MODEL_HOST EXPO_PUBLIC_MODELS_BASE_URL EXPO_PUBLIC_DEV_RAM_GB EXPO_PUBLIC_AUTOINSTALL EXPO_PUBLIC_AUTOIMPORT \
         EXPO_PUBLIC_AUTOPROMPT EXPO_PUBLIC_AUTOINDEX EXPO_PUBLIC_AUTOASK EXPO_PUBLIC_AUTOOCR EXPO_PUBLIC_AUTOVOICE EXPO_PUBLIC_AUTOBUY \
         EXPO_PUBLIC_DEVICE_TIER EXPO_PUBLIC_PRO EXPO_PUBLIC_TIER EXPO_PUBLIC_STORE_OFFLINE EXPO_PUBLIC_ALLOW_TEST_PURCHASES; do
  [ -n "${!v:-}" ] && bad+=("$v=${!v}")
done
if [ "${#bad[@]}" -gt 0 ]; then
  printf 'store build refused: dev switch set in the environment:\n'; printf '  %s\n' "${bad[@]}"; exit 1
fi
echo "store env clean: no EXPO_PUBLIC_* dev switch set"
