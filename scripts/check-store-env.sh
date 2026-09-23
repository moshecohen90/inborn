#!/usr/bin/env bash
# Release gate: no EXPO_PUBLIC_* dev switch may be set while a store bundle is built. Metro inlines them at bundle time,
# and EXPO_PUBLIC_DEV_MODEL_HOST / EXPO_PUBLIC_MODELS_BASE_URL would turn a Play build's vault onto HTTPS delivery (spec §5.1).
# Usage: scripts/check-store-env.sh   (run before `expo prebuild` / `eas build` / gradle bundleRelease)
# The same list refuses the build from apps/mobile/app.config.ts, which every build path evaluates (QA F255).
set -euo pipefail
bad=()
list="$(dirname "$0")/dev-switches.txt"
while IFS= read -r v; do
  case "$v" in ""|\#*) continue;; esac
  [ -n "${!v:-}" ] && bad+=("$v=${!v}")
done < "$list"
if [ "${#bad[@]}" -gt 0 ]; then
  printf 'store build refused: dev switch set in the environment:\n'; printf '  %s\n' "${bad[@]}"; exit 1
fi
echo "store env clean: no EXPO_PUBLIC_* dev switch set"
